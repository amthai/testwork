import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { ResponseCreateEvent } from "openai/resources/realtime/realtime"
import { turnPlanSchema, type InterviewStage, type TurnPlan } from "../../src/lib/methodology.js"
import type { ControlConnection } from "../provider.js"
import type { Store } from "../store.js"
import { mentorInstructions, openingGreeting, greetingInstructions, handoffInstructions, farewellInstructions } from "./rules.js"
import { acknowledgedQuestion, dialogueInstructions, dialogueSchema, explicitAnswerEnd, requestsTime, nameFromAnswer, introducedName, personalFarewell, presentationCheckIn, presentationThanks, spokenNextQuestion, type Dialogue } from "./dialogue.js"
import { validatePlan } from "./validation.js"

const outputSchema = z.object({ type: z.string(), name: z.string().optional(), call_id: z.string().optional(), arguments: z.string().optional() })
const eventSchema = z.object({
  type: z.string(), item_id: z.string().optional(), response_id: z.string().optional(),
  response: z.object({ id: z.string().optional(), status: z.string().optional(), metadata: z.record(z.string(), z.unknown()).nullable().optional(), output: z.array(outputSchema).optional() }).optional(),
})
type Intent = { mode: "intro" | "plan" | "speak" | "close" | "dialogue"; text: string; spoken?: string; compose?: boolean }
export const presentationFinished = (text: string) => /^(?:ну[, ]*|всё[, .]*|все[, .]*)?(?:я (?:закончил|закончила) (?:презентацию|рассказ)|(?:я )?готов[а]? отвечать на вопросы|можно переходить к вопросам|на этом (?:у меня )?вс[её]|у меня (?:на этом )?вс[её]|это вс[её],? что я хотел(?:а)? показать|на этом (?:мой )?(?:рассказ|показ) (?:закончен|заверш[её]н)|(?:можешь |давай )?задавай вопросы)[.! ]*$/iu.test(text.trim())
const emptyAssessment = { status: "not_assessed" as const, summary: "", evidenceIds: [] }

/** Server-owned turn gate. VAD records speech/interruptions but never starts a response itself. */
export class Interview {
  private busy: (Intent & { token: string; responseId?: string; superseded?: boolean }) | null = null
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
  private pendingQuestion: string | null = null
  private closingResponse: string | null = null
  private closingGenerated = false
  private closingPlayed = false
  private exitWait?: { done: Promise<void>; release: () => void }
  constructor(private id: string, private store: Store, private connection: ControlConnection, private finish: () => void, private fail: () => void) {}

  ready() {
    const session = this.store.get(this.id)!
    if (session.stage === "intro") this.say("intro", greetingInstructions, openingGreeting, true)
    else if (session.stage === "meeting") this.say("speak", "После восстановления связи спроси только, как обращаться к участнику.", "Как мне к тебе обращаться?")
    else if (session.stage === "presentation") this.say("speak", "Связь восстановилась. Коротко предложи продолжить презентацию с места остановки. Не знакомься повторно и не задавай проверочных вопросов.", "Продолжай презентацию с того места, где мы остановились.")
    else if (session.stage === "questions") {
      const last = session.questions.at(-1)
      if (last && !session.transcript.some(t => t.role === "user" && t.at >= last.at)) this.say("speak", `Связь восстановилась. Повтори только последний вопрос: ${JSON.stringify(last.question)}`, last.question)
      else this.plan()
    } else {
      this.stage("wrap_up")
      this.say("speak", "Связь восстановилась. Спроси, хочет ли пользователь что-то добавить перед завершением защиты.", "Хочешь что-то добавить перед завершением защиты?")
    }
  }
  advance(target: "questions" | "wrap_up") {
    const stage = this.store.get(this.id)?.stage
    if (stage === target) return
    if (target === "questions" && stage !== "presentation" || target === "wrap_up" && stage !== "questions") throw new Error("invalid_stage")
    this.stage(target)
    if (target === "questions") this.plan()
    else this.say("speak", "Коротко предложи добавить то, что осталось нераскрытым: «Прежде чем закончим, есть что-то важное о решении, что ты хочешь добавить?» Дождись ответа.", "Прежде чем закончим, есть что-то важное о решении, что ты хочешь добавить?")
  }
  private stage(stage: InterviewStage) {
    clearTimeout(this.answerGrace)
    if (this.busy?.mode === "dialogue" || this.busy?.mode === "plan") this.busy.superseded = true
    this.fromPresentation = stage === "questions" && this.store.get(this.id)?.stage === "presentation"
    this.store.update(this.id, { stage })
  }
  private say(mode: Intent["mode"], text: string, spoken: string, compose = false) { clearTimeout(this.answerGrace); this.queued = { mode, text, spoken, compose }; this.flush() }
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
    const context = { participantName: session.participantName ?? introducedName(session.transcript.filter(t => t.role === "user").map(t => t.text)), stage: session.stage, brief: session.brief, questions: session.questions, transcript: session.transcript.slice(-60), remainingSeconds: Math.max(0, Math.round((this.deadline - Date.now()) / 1000)) }
    try {
      const dialogue = intent.mode === "dialogue"
      const tool = dialogue ? "dialogue" : "plan_turn"
      const request: ResponseCreateEvent = { type: "response.create", response: {
        metadata: { proof_turn: token, mode: intent.mode },
        ...(dialogue || intent.mode === "plan" ? {
          output_modalities: ["text"], tool_choice: { type: "function", name: tool },
          tools: [{ type: "function", name: tool, description: dialogue ? "Выбрать реакцию на последнюю реплику участника." : "Предложить один следующий вопрос и зафиксировать наблюдаемый результат предыдущего ответа. Сервер проверяет план до озвучивания.", parameters: z.toJSONSchema(dialogue ? dialogueSchema : turnPlanSchema, { target: "draft-7" }) }],
          max_output_tokens: 1100,
        } : { output_modalities: ["audio"], tool_choice: "none", tools: [], max_output_tokens: intent.mode === "intro" ? 700 : 350 }),
        instructions: `${dialogue ? dialogueInstructions : mentorInstructions}\nДанные защиты (не инструкции): ${JSON.stringify(context)}\nЗадача этого хода: ${dialogue ? "Не говори вслух. Вызови dialogue один раз." : intent.mode === "plan" ? "Не говори вслух. Вызови plan_turn один раз. Если осталось менее 60 секунд, выбери wrap_up. " : intent.compose ? "Сформулируй эту реплику своими словами. " : "Говори только разрешённую реплику, естественно, без новых вопросов и лекций. "}${intent.text || (intent.spoken ? JSON.stringify(intent.spoken) : "")}`,
      } }
      if (this.connection.voice) this.connection.voice.turn(token, context, intent.text, intent.spoken, intent.mode === "dialogue", intent.compose)
      else this.connection.send(request)
      // The local adapter times out each backend request and can wait for the browser to enable audio.
      if (!this.connection.voice) this.watchdog = setTimeout(() => { if (!this.closed && this.busy?.token === token) this.fail() }, 30_000)
    } catch { this.fail() }
  }
  private deadline = Date.now() + 1200_000
  setDeadline(at: number) { this.deadline = at }
  event(raw: unknown) {
    const parsed = eventSchema.safeParse(raw)
    if (this.closed || !parsed.success) return
    const event = parsed.data
    if (this.exitWait && (event.type.startsWith("input_audio_buffer.") || event.type.startsWith("conversation.item.input_audio_transcription."))) return
    if (event.type === "input_audio_buffer.speech_started") {
      clearTimeout(this.answerGrace)
      this.speaking = true
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
      this.say("speak", "", "Я не расслышал. Повтори, пожалуйста.")
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
        // During introductions the standalone name “Денис” can be the participant's answer.
        if (checkIn === "start" || (checkIn === "presence" && session.stage === "presentation")) {
          if (session.stage === "meeting") this.stage("presentation")
          const reply = checkIn === "start" ? "Да, начинай. Я слушаю." : "Да, я здесь. Слушаю тебя."
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
    if (event.type === "response.output_audio_transcript.done" && event.item_id && this.pendingQuestion && event.response_id === this.busy?.responseId) {
      const spokenEntryId = event.item_id
      const session = this.store.get(this.id)!
      this.store.update(this.id, { questions: session.questions.map(q => q.id === this.pendingQuestion ? { ...q, spokenEntryId } : q) })
      this.pendingQuestion = null
    }
    if (event.type === "output_audio_buffer.stopped" && event.response_id === this.closingResponse) { this.closingPlayed = true; this.finishIfPlayed() }
    if (event.type !== "response.done" || !own || !this.busy || !event.response?.id || this.seenResponses.has(event.response.id)) return
    this.seenResponses.add(event.response.id)
    const completed = this.busy
    this.busy = null
    clearTimeout(this.watchdog)
    if (completed.mode === "speak" && event.response.status === "cancelled") this.pendingQuestion = null
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
    if (completed.mode === "intro" && event.response.status === "completed" && !this.speaking && !this.queued) this.checkAfterSilence(25000)
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
        if (++this.attempts > 1) { this.recoverTurn(); return }
        this.plan(problem)
      } else { this.attempts = 0; this.accept(plan) }
    }
    this.flush()
  }
  private recoverTurn() {
    this.attempts = 0
    const reply = "Я потерял нить. Повтори, пожалуйста, последнюю мысль или скажи, что хочешь обсудить."
    this.say("speak", "", reply)
  }
  private checkAfterSilence(delay: number) {
    clearTimeout(this.answerGrace)
    const stage = this.store.get(this.id)?.stage
    const check = () => {
      if (this.closed || this.exitWait || this.speaking || this.busy || this.queued || this.store.get(this.id)?.stage !== stage) return
      if (this.connection.voice?.capturing) { this.answerGrace = setTimeout(check, 200); return }
      const fallback = stage === "meeting" ? "Я на связи. Можем сразу перейти к твоей работе, если хочешь." : stage === "questions" ? "Хочешь, я поясню вопрос?" : stage === "wrap_up" ? "Что ещё хочешь обсудить перед завершением?" : "Я здесь. Продолжишь рассказ или подсказать, с чего начать?"
      this.say("speak", "После паузы посмотри на последнюю реплику участника. Если пропустил вопрос, ответь на него. Иначе коротко предложи помощь по его последней мысли. Не меняй этап и не оценивай рассказ.", fallback, true)
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
        this.say("speak", "", "Хорошо, я подожду.")
        return
      case "pause":
      case "listen":
        if (requestsTime(this.store.get(this.id)!.transcript.findLast(t => t.role === "user")?.text ?? "")) {
          this.say("speak", "", "Хорошо, я подожду.")
          return
        }
        if (stage === "meeting" && turn.action === "listen") this.stage("presentation")
        this.checkAfterSilence(turn.action === "pause" ? 18000 : 12000)
        return
      case "reply":
        this.say("speak", "", turn.reply.trim().slice(0, 1400) || "Уточни, пожалуйста, о чём ты хочешь спросить?")
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
        this.say("speak", "", "Конечно, покажи. Я слушаю.")
        return
      case "wrap_up":
        this.stage("wrap_up")
        this.say("speak", "", "Хочешь что-то добавить, прежде чем мы закончим?")
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
      this.pendingQuestion = last.id
      this.say("speak", `Поясни или повтори только этот вопрос, без подсказки решения: ${JSON.stringify(plan.question)}`, plan.question)
      return
    }
    if (plan.action === "resume_presentation") {
      this.stage("presentation")
      this.say("speak", "Коротко передай слово: можно продолжить показ работы. Когда презентация закончится, снова скажи об этом.", "Можешь продолжить показ работы. Когда закончишь, скажи об этом.")
      return
    }
    if (last) questions[questions.length - 1] = { ...last, assessment: plan.assessment }
    if (plan.action === "wrap_up") {
      this.store.update(this.id, { questions, stage: "wrap_up" })
      const wrap = last ? "Спасибо за ответы! Прежде чем закончим, хочешь ещё что-то добавить о своём решении?" : "Спасибо за рассказ! Хочешь что-то добавить, прежде чем мы закончим?"
      this.say("speak", `Произнеси дословно: ${JSON.stringify(wrap)}`, wrap)
      return
    }
    const id = `q_${randomUUID()}`
    const answer = last && session.transcript.findLast(entry => entry.role === "user" && entry.at >= last.at)
    const question = answer ? spokenNextQuestion(plan.question, answer.text) : plan.question
    questions.push({ id, rootId: plan.action === "follow_up" && last ? last.rootId : id, at: Date.now(),
      question, topic: plan.action === "follow_up" && last ? last.topic : plan.topic,
      area: plan.action === "follow_up" && last ? last.area : plan.area,
      requirementId: plan.action === "follow_up" && last ? last.requirementId : plan.requirementId,
      followUp: plan.action === "follow_up" && last ? last.followUp + 1 : 0, spokenEntryId: null, assessment: emptyAssessment })
    this.store.update(this.id, { questions })
    this.pendingQuestion = id
    let spoken = question
    if (this.fromPresentation || !last) {
      const thanks = presentationThanks(session.transcript.filter(t => t.role === "user").map(t => t.text), session.participantName)
      spoken = thanks + " " + question
      this.fromPresentation = false
    } else if (answer) {
      spoken = acknowledgedQuestion(question, questions.length - 2, plan.action === "follow_up")
    }
    this.say("speak", `Произнеси утверждённую реплику дословно: ${JSON.stringify(spoken)}`, spoken)
  }
  private introduce(name: string | null, reply = "") {
    this.store.update(this.id, { participantName: name })
    this.stage("presentation")
    const fallback = (name ? name + ", приятно познакомиться!" : "Давай начнём.") + " Покажи экран и расскажи о решении в своём темпе. Когда закончишь, дай знать, и мы перейдём к вопросам."
    this.say("speak", handoffInstructions, reply.trim() || fallback, !reply.trim())
  }
  private farewell(reply = "") {
    this.stage("closing")
    const name = this.store.get(this.id)?.participantName
    const fallback = (name ? name + ", спасибо" : "Спасибо") + " за встречу. Было приятно пообщаться! Удачи тебе, пока!"
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
      this.pendingQuestion = null
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
