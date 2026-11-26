import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { ResponseCreateEvent } from "openai/resources/realtime/realtime"
import { turnPlanSchema, type InterviewStage, type TurnPlan } from "../../src/lib/methodology.js"
import type { InterviewerId } from "../../src/lib/interviewers.js"
import { introduceSpeaker, returnToLead, speakerStyle, teamDialogueInstructions, teamMentorInstructions, teamPlanCorrections } from "../../src/lib/roles/team.js"
import type { ControlConnection } from "../provider.js"
import type { Store } from "../store.js"
import {
  acknowledgedQuestion, callScript, farewellInstructions, greetingInstructions, handoffInstructions,
  openingGreeting, personalFarewell, silenceDelayMs,
} from "../../src/lib/roles/design-lead.js"
import { dialogueSchema, explicitAnswerEnd, requestsTime, nameFromAnswer, introducedName, presentationCheckIn, presentationThanks, spokenNextQuestion, type Dialogue } from "./dialogue.js"
import { validatePlan } from "./validation.js"

const outputSchema = z.object({ type: z.string(), name: z.string().optional(), call_id: z.string().optional(), arguments: z.string().optional() })
const eventSchema = z.object({
  type: z.string(), item_id: z.string().optional(), response_id: z.string().optional(),
  response: z.object({ id: z.string().optional(), status: z.string().optional(), metadata: z.record(z.string(), z.unknown()).nullable().optional(), output: z.array(outputSchema).optional() }).optional(),
})
type Intent = {
  mode: "intro" | "plan" | "speak" | "close" | "dialogue"
  text: string
  spoken?: string
  compose?: boolean
  speaker?: InterviewerId
  questionId?: string
  afterPlayback?: Intent
}
export const presentationFinished = (text: string) => /^(?:ну[, ]*|всё[, .]*|все[, .]*)?(?:я (?:закончил|закончила) (?:презентацию|рассказ)|(?:я )?готов[а]? отвечать на вопросы|можно переходить к вопросам|на этом (?:у меня )?вс[её]|у меня (?:на этом )?вс[её]|это вс[её],? что я хотел(?:а)? показать|на этом (?:мой )?(?:рассказ|показ) (?:закончен|заверш[её]н)|(?:можешь |давай )?задавай вопросы)[.! ]*$/iu.test(text.trim())
const emptyAssessment = { status: "not_assessed" as const, summary: "", evidenceIds: [] }

/** Server-owned turn gate. VAD records speech/interruptions but never starts a response itself. */
export class Interview {
  private busy: (Intent & { token: string; responseId?: string; superseded?: boolean; generated?: boolean; played?: boolean }) | null = null
  private queued: Intent | null = null
  private timer?: ReturnType<typeof setTimeout>
  private answerGrace?: ReturnType<typeof setTimeout>
  private fromPresentation = false
  private watchdog?: ReturnType<typeof setTimeout>
  private closingTimer?: ReturnType<typeof setTimeout>
  private speaking = false
  private closed = false
  private attempts = 0
  private seenUsers = new Set<string>()
  private seenResponses = new Set<string>()
  private questionSpeaker: InterviewerId = "design_lead"
  private closingResponse: string | null = null
  private closingGenerated = false
  private closingPlayed = false
  private exitWait?: { done: Promise<void>; release: () => void }
  constructor(private id: string, private store: Store, private connection: ControlConnection, private finish: () => void, private fail: () => void) {}

  ready() {
    const session = this.store.get(this.id)!
    if (session.stage === "intro") this.say("intro", greetingInstructions, openingGreeting, true)
    else if (session.stage === "meeting") this.sayPrepared(callScript.reconnectMeeting)
    else if (session.stage === "presentation") this.sayPrepared(callScript.reconnectPresentation)
    else if (session.stage === "questions") {
      const last = session.questions.at(-1)
      this.questionSpeaker = last?.interviewerId ?? "design_lead"
      if (last && (!last.spokenEntryId || !session.transcript.some(t => t.role === "user" && t.at >= last.at))) {
        this.enqueue({ mode: "speak", text: callScript.reconnectQuestion(last.question), spoken: last.question, speaker: last.interviewerId, questionId: last.id })
      } else this.plan()
    } else {
      this.stage("wrap_up")
      this.sayPrepared(callScript.reconnectWrapUp)
    }
  }
  advance(target: "questions" | "wrap_up") {
    const stage = this.store.get(this.id)?.stage
    if (stage === target) return
    if (target === "questions" && stage !== "presentation" || target === "wrap_up" && stage !== "questions") throw new Error("invalid_stage")
    this.stage(target)
    if (target === "questions") this.plan()
    else this.sayPrepared(callScript.inviteAdditions)
  }
  private stage(stage: InterviewStage) {
    clearTimeout(this.answerGrace)
    if (this.busy?.mode === "dialogue" || this.busy?.mode === "plan") this.busy.superseded = true
    this.dropHandoff()
    if (stage !== "questions") this.questionSpeaker = "design_lead"
    this.fromPresentation = stage === "questions" && this.store.get(this.id)?.stage === "presentation"
    this.store.update(this.id, { stage })
  }
  private enqueue(intent: Intent) {
    clearTimeout(this.answerGrace)
    this.queued = intent
    this.flush()
  }
  private say(mode: Intent["mode"], text: string, spoken: string, compose = false, speaker: InterviewerId = "design_lead") {
    this.enqueue({ mode, text, spoken, compose, speaker })
  }
  // A handoff has two distinct audio turns. The question can start only after
  // the host's audio has actually played, including on the WebRTC transport.
  private finishHandoff() {
    if (!this.busy?.afterPlayback || !this.busy.generated || !this.busy.played) return
    const next = this.busy.afterPlayback
    this.busy = null
    clearTimeout(this.watchdog)
    this.enqueue(next)
  }
  private dropHandoff() {
    if (!this.busy?.afterPlayback) return
    const pending = this.busy.afterPlayback.questionId
    this.busy.afterPlayback = undefined
    if (pending) {
      const session = this.store.get(this.id)
      if (session) this.store.update(this.id, { questions: session.questions.filter(q => q.id !== pending || q.spokenEntryId !== null) })
    }
    if (this.busy.generated) {
      this.busy = null
      clearTimeout(this.watchdog)
    }
  }
  private sayPrepared(line: { instructions: string; fallback: string }) {
    this.say("speak", line.instructions, line.fallback)
  }
  private plan(correction = "") {
    clearTimeout(this.answerGrace)
    this.queued = { mode: "plan", text: correction }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 600)
  }
  private flush() {
    if (this.closed || this.busy || this.speaking || !this.queued) return
    const session = this.store.get(this.id)
    if (!session || session.status !== "live") return
    const intent = this.queued
    this.queued = null
    const token = randomUUID()
    this.busy = { ...intent, token }
    const speaker = intent.speaker ?? (session.stage === "questions" ? this.questionSpeaker : "design_lead")
    const context = { interviewerId: speaker, participantName: session.participantName ?? introducedName(session.transcript.filter(t => t.role === "user").map(t => t.text)), stage: session.stage, brief: session.brief, questions: session.questions, transcript: session.transcript.slice(-60), remainingSeconds: Math.max(0, Math.round((this.deadline - Date.now()) / 1000)) }
    try {
      const dialogue = intent.mode === "dialogue"
      if (this.connection.voice) {
        this.connection.voice.turn(token, context, intent.text, intent.spoken, dialogue, intent.compose, speaker)
        return
      }
      if (speaker !== "design_lead" && intent.spoken) {
        if (!this.connection.speakExpert) throw new Error("Missing expert audio output")
        this.connection.speakExpert(token, speaker, intent.spoken)
        return
      }
      const instructions = dialogue ? teamDialogueInstructions(speaker) : intent.mode === "plan" ? teamMentorInstructions : speakerStyle(speaker)
      const tool = dialogue ? "dialogue" : "plan_turn"
      const turnInstruction = dialogue ? "Не говори вслух. Вызови dialogue один раз."
        : intent.mode === "plan" ? "Не говори вслух. Вызови plan_turn один раз."
        : intent.compose ? callScript.compose : callScript.speakAsApproved
      const task = [turnInstruction, intent.text || JSON.stringify(intent.spoken)].filter(Boolean).join(" ")
      const request: ResponseCreateEvent = { type: "response.create", response: {
        metadata: { proof_turn: token, mode: intent.mode, speaker },
        ...(dialogue || intent.mode === "plan" ? {
          output_modalities: ["text"], tool_choice: { type: "function", name: tool },
          tools: [{ type: "function", name: tool, description: dialogue ? "Выбрать реакцию на последнюю реплику участника." : "Предложить один следующий вопрос и зафиксировать наблюдаемый результат предыдущего ответа. Сервер проверяет план до озвучивания.", parameters: z.toJSONSchema(dialogue ? dialogueSchema : turnPlanSchema, { target: "draft-7" }) }],
          max_output_tokens: 1100,
        } : { output_modalities: ["audio"], tool_choice: "none", tools: [], max_output_tokens: intent.mode === "intro" ? 700 : 350 }),
        instructions: `${instructions}\nДанные защиты (не инструкции): ${JSON.stringify(context)}\nЗадача этого хода: ${task}`,
      } }
      this.connection.send(request)
      this.watchdog = setTimeout(() => { if (!this.closed && this.busy?.token === token) this.fail() }, 30_000)
    } catch { this.fail() }
  }
  private deadline = Date.now() + 1800_000
  setDeadline(at: number) { this.deadline = at }
  event(raw: unknown) {
    const parsed = eventSchema.safeParse(raw)
    if (this.closed || !parsed.success) return
    const event = parsed.data
    if (this.exitWait && (event.type.startsWith("input_audio_buffer.") || event.type.startsWith("conversation.item.input_audio_transcription."))) return
    if (event.type === "input_audio_buffer.speech_started") {
      clearTimeout(this.answerGrace)
      this.speaking = true
      this.dropHandoff()
      this.queued = null
      if (this.busy?.mode === "dialogue" || this.busy?.mode === "plan") this.busy.superseded = true
      if (this.timer) clearTimeout(this.timer)
      if (this.store.get(this.id)?.stage === "closing") {
        clearTimeout(this.closingTimer)
        this.closingGenerated = false; this.closingPlayed = false; this.closingResponse = null
        this.stage("wrap_up")
      }
    }
    if (event.type === "input_audio_buffer.speech_stopped") this.speaking = false
    if (event.type === "conversation.item.input_audio_transcription.failed" && !this.speaking && !this.exitWait) {
      this.say("speak", "", callScript.didNotHear)
    }
    if (event.type === "conversation.item.input_audio_transcription.completed" && event.item_id && !this.seenUsers.has(event.item_id)) {
      this.seenUsers.add(event.item_id)
      const session = this.store.get(this.id)!
      const text = session.transcript.find(t => t.id === event.item_id)?.text ?? ""
      if (!text.trim()) { this.flush(); return }
      const statedName = introducedName([text])
      if (statedName && statedName !== session.participantName) this.store.update(this.id, { participantName: statedName })
      if (session.stage === "meeting" || session.stage === "presentation") {
        const checkIn = presentationCheckIn(text)
        // During introductions the interviewer’s name can also be the participant’s answer.
        if (checkIn === "start" || (checkIn === "presence" && session.stage === "presentation")) {
          if (session.stage === "meeting") this.stage("presentation")
          const reply = checkIn === "start" ? callScript.readyToStart : callScript.present
          this.say("speak", reply, reply)
          return
        }
      }
      if (/^(?:(?:давай|хочу) (?:закончим|закончить|завершим|завершить) (?:звонок|созвон|разговор)|на этом закончим|до свидания)[.! ]*$/iu.test(text.trim())) this.farewell()
      else if (session.stage === "questions" && /^(?:давай подвед[её]м итоги|перейд[её]м к (?:итогам|завершению))[.!? ]*$/iu.test(text.trim())) this.advance("wrap_up")
      else if (session.stage === "meeting" && /^(?:давай(?:те)? |можно )?без имени[.!? ]*$/iu.test(text.trim())) this.introduce(null)
      else if (session.stage === "presentation" && presentationFinished(text)) this.advance("questions")
      else if (session.stage === "questions" && session.questions.at(-1)?.spokenEntryId && explicitAnswerEnd(text)) {
        this.attempts = 0
        this.plan()
      } else {
        clearTimeout(this.answerGrace)
        this.queued = { mode: "dialogue", text: "" }
        this.flush()
      }
    }
    const own = event.response?.metadata?.proof_turn === this.busy?.token && Boolean(this.busy)
    if (event.type === "response.created" && own && this.busy) {
      this.busy.responseId = event.response?.id
      if (this.busy.mode === "close") { this.closingResponse = event.response?.id ?? null; this.closingGenerated = false; this.closingPlayed = false }
    }
    if (event.type === "response.output_audio_transcript.done" && event.item_id && this.busy?.questionId && event.response_id === this.busy.responseId) {
      const questionId = this.busy.questionId
      this.questionSpeaker = this.busy.speaker ?? "design_lead"
      const spokenEntryId = event.item_id
      const session = this.store.get(this.id)!
      this.store.update(this.id, { questions: session.questions.map(q => q.id === questionId ? { ...q, spokenEntryId } : q) })
    }
    if (this.busy?.afterPlayback && event.response_id === this.busy.responseId) {
      if (event.type === "output_audio_buffer.cleared") this.dropHandoff()
      if (event.type === "output_audio_buffer.stopped" && this.busy) {
        this.busy.played = true
        this.finishHandoff()
      }
    }
    if (event.type === "output_audio_buffer.stopped" && event.response_id === this.closingResponse) { this.closingPlayed = true; this.finishIfPlayed() }
    if (event.type !== "response.done" || !own || !this.busy || !event.response?.id || this.seenResponses.has(event.response.id)) return
    this.seenResponses.add(event.response.id)
    const completed = this.busy
    if (completed.afterPlayback && event.response.status === "completed" && !completed.superseded) {
      completed.generated = true
      this.finishHandoff()
      return
    }
    this.busy = null
    clearTimeout(this.watchdog)
    if (completed.superseded) {
      if (!this.connection.voice) for (const call of event.response.output ?? []) {
        if (call.type === "function_call" && call.call_id) this.connection.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: '{"superseded":true}' } })
      }
      this.flush()
      return
    }
    if (["failed", "incomplete"].includes(event.response.status ?? "")) {
      if (completed.mode === "close") this.endClosing()
      else if (completed.mode === "dialogue" || completed.mode === "plan") this.recoverTurn()
      else this.fail()
      return
    }
    if (completed.mode === "intro" && this.store.get(this.id)?.stage === "intro" && (event.response.status === "completed" || this.speaking || !this.connection.voice)) this.stage("meeting")
    if (completed.mode === "intro" && event.response.status === "completed" && !this.speaking && !this.queued) this.checkAfterSilence(silenceDelayMs.greeting)
    if (completed.mode === "dialogue" && event.response.status === "completed") {
      const call = event.response.output?.find(o => o.type === "function_call" && o.name === "dialogue")
      // The local adapter can have already streamed and played the answer.
      if (!(this.connection.voice && event.response.output?.some(o => o.type === "message"))) {
        let turn: Dialogue | undefined
        try { turn = dialogueSchema.parse(JSON.parse(call?.arguments ?? "")) } catch { /* Ask for clarification below. */ }
        if (!this.connection.voice && call?.call_id) this.connection.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ accepted: Boolean(turn) }) } })
        if (turn) this.respondToUser(turn)
        else this.recoverTurn()
      }
    }
    if (completed.mode === "close" && event.response.status === "completed" && event.response.id === this.closingResponse && this.store.get(this.id)?.stage === "closing") {
      this.closingGenerated = true
      this.finishIfPlayed()
      // A missing playback event must not keep a paid remote call open indefinitely.
      if (!this.closed && !this.exitWait) this.closingTimer = setTimeout(() => this.endClosing(), 20_000)
    }
    if (completed.mode === "plan" && event.response.status === "completed") {
      const calls = event.response.output?.filter(o => o.type === "function_call") ?? []
      let plan: TurnPlan | undefined
      let problem = "Вызови plan_turn ровно один раз с валидными аргументами."
      if (calls.length === 1 && calls[0].name === "plan_turn" && calls[0].call_id) {
        try { plan = turnPlanSchema.parse(JSON.parse(calls[0].arguments ?? "")); problem = validatePlan(this.store.get(this.id)!, plan) ?? "" } catch { /* Invalid tool output is never trusted. */ }
      }
      for (const call of calls) if (call.call_id) this.connection.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ accepted: !problem, error: problem || null }) } })
      if (problem || !plan) {
        if (++this.attempts > 1) {
          if (problem === teamPlanCorrections.missingBasis) this.advance("wrap_up")
          else this.recoverTurn()
          return
        }
        this.plan(problem)
      } else { this.attempts = 0; this.accept(plan) }
    }
    this.flush()
  }
  private recoverTurn() {
    this.attempts = 0
    this.say("speak", "", callScript.recoverTurn)
  }
  private checkAfterSilence(delay: number) {
    clearTimeout(this.answerGrace)
    const stage = this.store.get(this.id)?.stage
    const check = () => {
      if (this.closed || this.exitWait || this.speaking || this.busy || this.queued || this.store.get(this.id)?.stage !== stage) return
      if (this.connection.voice?.capturing) { this.answerGrace = setTimeout(check, 200); return }
      this.say("speak", callScript.afterSilenceInstructions, callScript.afterSilence(stage), true, this.questionSpeaker)
    }
    this.answerGrace = setTimeout(check, delay)
  }
  private respondToUser(turn: Dialogue) {
    const stage = this.store.get(this.id)?.stage
    switch (turn.action) {
      case "introduce": {
        if (stage !== "meeting") { this.recoverTurn(); return }
        const text = this.store.get(this.id)!.transcript.findLast(t => t.role === "user")?.text ?? ""
        const name = nameFromAnswer(text, turn.participantName)
        this.introduce(name ?? this.store.get(this.id)?.participantName ?? null, !turn.participantName || name ? turn.reply : "")
        return
      }
      case "wait":
        this.say("speak", "", callScript.wait, false, this.questionSpeaker)
        return
      case "pause":
      case "listen":
        if (requestsTime(this.store.get(this.id)!.transcript.findLast(t => t.role === "user")?.text ?? "")) {
          this.say("speak", "", callScript.wait, false, this.questionSpeaker)
          return
        }
        if (stage === "meeting" && turn.action === "listen") this.stage("presentation")
        this.checkAfterSilence(turn.action === "pause" ? silenceDelayMs.thinking : silenceDelayMs.presentation)
        return
      case "reply":
        this.say("speak", "", turn.reply.trim().slice(0, 1400) || callScript.clarifyRequest, false, this.questionSpeaker)
        return
      case "answer":
        if (stage !== "questions") { this.recoverTurn(); return }
        this.useDialoguePlan(turn)
        return
      case "questions":
        if (stage !== "questions") this.stage("questions")
        this.useDialoguePlan(turn)
        return
      case "presentation":
        this.stage("presentation")
        this.say("speak", "", callScript.returnToPresentation)
        return
      case "wrap_up":
        this.stage("wrap_up")
        this.say("speak", "", callScript.wrapUp)
        return
      case "finish":
        this.farewell(turn.reply)
        return
    }
  }
  private useDialoguePlan(turn: Dialogue) {
    this.attempts = 0
    const plan = turn.plan
    const problem = plan ? validatePlan(this.store.get(this.id)!, plan) : "Составь план следующего вопроса."
    if (plan && !problem) this.accept(plan)
    else this.plan(problem ?? "")
  }
  private accept(plan: TurnPlan) {
    const session = this.store.get(this.id)!
    if (session.stage !== "questions") { this.flush(); return }
    const questions = [...session.questions]
    const last = questions.at(-1)
    if (plan.action === "clarify" && last) {
      this.enqueue({ mode: "speak", text: callScript.clarifyQuestion(plan.question), spoken: plan.question, speaker: last.interviewerId, questionId: last.id })
      return
    }
    if (plan.action === "resume_presentation") {
      this.stage("presentation")
      this.sayPrepared(callScript.resumePresentation)
      return
    }
    if (last) questions[questions.length - 1] = { ...last, assessment: plan.assessment }
    if (plan.action === "wrap_up") {
      this.stage("wrap_up")
      this.store.update(this.id, { questions })
      const wrap = last ? callScript.wrapUpAfterAnswers : callScript.wrapUpAfterPresentation
      this.say("speak", `Произнеси дословно: ${JSON.stringify(wrap)}`, wrap)
      return
    }
    // Only question actions reach here. validatePlan requires an author.
    const speaker = plan.interviewerId
    if (!speaker) { this.recoverTurn(); return }
    const id = `q_${randomUUID()}`
    const answer = last && session.transcript.findLast(entry => entry.role === "user" && entry.at >= last.at)
    const question = answer ? spokenNextQuestion(plan.question, answer.text) : plan.question
    questions.push({ id, interviewerId: speaker, basisQuote: plan.action === "follow_up" && last ? last.basisQuote : plan.basisQuote,
      rootId: plan.action === "follow_up" && last ? last.rootId : id, at: Date.now(),
      question, topic: plan.action === "follow_up" && last ? last.topic : plan.topic,
      area: plan.action === "follow_up" && last ? last.area : plan.area,
      requirementId: plan.action === "follow_up" && last ? last.requirementId : plan.requirementId,
      followUp: plan.action === "follow_up" && last ? last.followUp + 1 : 0, spokenEntryId: null, assessment: emptyAssessment })
    this.store.update(this.id, { questions })
    const first = this.fromPresentation || !last
    this.fromPresentation = false
    const changesSpeaker = speaker !== this.questionSpeaker
    let spoken = question
    if (first && speaker === "design_lead") {
      spoken = presentationThanks(session.transcript.filter(t => t.role === "user").map(t => t.text), session.participantName) + " " + question
    } else if (changesSpeaker && speaker === "design_lead") {
      spoken = returnToLead + " " + question
    } else if (answer && !changesSpeaker) {
      spoken = acknowledgedQuestion(question, questions.length - 2, plan.action === "follow_up")
    }
    const next: Intent = { mode: "speak", text: `Произнеси утверждённую реплику дословно: ${JSON.stringify(spoken)}`, spoken, speaker, questionId: id }
    if (changesSpeaker && speaker !== "design_lead") {
      const handoff = introduceSpeaker(speaker, first)
      this.enqueue({ mode: "speak", text: "", spoken: handoff, speaker: "design_lead", afterPlayback: next })
    } else this.enqueue(next)
  }
  private introduce(name: string | null, reply = "") {
    this.store.update(this.id, { participantName: name })
    this.stage("presentation")
    const fallback = callScript.handoff(name)
    this.say("speak", handoffInstructions, reply.trim() || fallback, !reply.trim())
  }
  private farewell(reply = "") {
    this.stage("closing")
    const name = this.store.get(this.id)?.participantName
    const fallback = callScript.farewell(name)
    this.say("close", farewellInstructions, personalFarewell(reply, name) || fallback, !reply.trim())
  }
  async farewellBeforeExit() {
    if (this.closed) return
    if (this.exitWait) return this.exitWait.done
    let release = () => {}
    const done = new Promise<void>(resolve => { release = resolve })
    this.exitWait = { done, release }
    this.connection.voice?.endInput()
    clearTimeout(this.closingTimer)
    this.closingTimer = setTimeout(release, 27_000)
    if (this.store.get(this.id)?.stage !== "closing") {
      this.queued = null
      this.dropHandoff()
      this.speaking = false
      clearTimeout(this.timer)
      if (!this.connection.voice) this.connection.send({ type: "session.update", session: { type: "realtime", audio: { input: { turn_detection: null } } } })
      if (this.busy) this.connection.send({ type: "response.cancel" })
      if (!this.connection.voice) this.connection.send({ type: "output_audio_buffer.clear" })
      this.farewell()
    }
    return done
  }
  private endClosing() { if (this.exitWait) this.exitWait.release(); else this.finish() }
  private finishIfPlayed() { if (this.closingGenerated && this.closingPlayed && !this.closed) this.endClosing() }
  close() { this.closed = true; this.exitWait?.release(); clearTimeout(this.answerGrace); clearTimeout(this.timer); clearTimeout(this.watchdog); clearTimeout(this.closingTimer); this.queued = null }
}
