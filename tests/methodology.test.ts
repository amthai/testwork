import { test, type TestContext } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"
import { generatedBriefAnalysisSchema, turnPlanSchema } from "../src/lib/methodology.js"
import { generatedFeedbackSchema, sessionSchema } from "../src/lib/session.js"
import { reportMarkdown } from "../src/lib/report-export.js"
import { validateBrief, validateFeedback, validatePlan } from "../server/methodology/validation.js"
import { Interview, presentationFinished } from "../server/methodology/interview.js"
import { acknowledgedQuestion, explicitAnswerEnd, requestsTime, presentationThanks, spokenNextQuestion } from "../server/methodology/dialogue.js"
import { greetingInstructions, openingGreeting } from "../server/methodology/rules.js"
import { reportSources, transcriptFeedback } from "../server/methodology/report-sources.js"
import { Store } from "../server/store.js"
import { brief, briefText, exampleSession, plan, report } from "./fixtures.js"

test("brief extraction requires exact source quotes and unique requirement IDs", () => {
  assert.deepEqual(validateBrief(briefText, brief.analysis), brief.analysis)
  assert.throws(() => validateBrief(briefText, { ...brief.analysis, requirements: [{ ...brief.analysis.requirements[0], quote: "Сделайте компоненты" }] }))
  assert.throws(() => validateBrief(briefText, { ...brief.analysis, requirements: [brief.analysis.requirements[0], brief.analysis.requirements[0]] }))
  assert.throws(() => validateBrief(briefText, { ...brief.analysis, requirements: [] }))
})
test("old saved sessions remain readable without inventing brief, questions or detailed feedback", () => {
  const { brief: _brief, stage: _stage, questions: _questions, ...legacy } = exampleSession
  const { details: _details, ...feedback } = report
  const migrated = sessionSchema.parse({ ...legacy, feedback })
  assert.equal(migrated.brief, null)
  assert.deepEqual(migrated.questions, [])
  assert.equal(migrated.feedback?.details, null)
})
test("generation schemas produce strict API JSON schemas without optional fields", () => {
  for (const schema of [generatedFeedbackSchema, generatedBriefAnalysisSchema]) {
    const result = zodTextFormat(schema, "test_schema")
    assert.equal(result.strict, true)
    assert.ok(result.schema)
  }
  assert.equal(z.toJSONSchema(turnPlanSchema).type, "object")
})
test("two followups is a hard server limit; substantive and unknown answers move on", () => {
  const session = structuredClone(exampleSession)
  const follow = { ...plan, action: "follow_up" as const, assessment: { status: "vague" as const, summary: "Нет конкретики", evidenceIds: ["u2"] } }
  assert.equal(validatePlan(session, follow), null)
  session.questions[0].followUp = 2
  assert.match(validatePlan(session, follow)!, /исчерпаны/)
  session.questions[0].followUp = 0
  for (const status of ["substantive", "unknown"] as const) assert.ok(validatePlan(session, { ...follow, assessment: { ...follow.assessment, status } }))
})
test("tool plans cannot assess an unspoken question or cite AI speech as a user answer", () => {
  const session = structuredClone(exampleSession)
  assert.ok(validatePlan(session, { ...plan, assessment: { status: "vague", summary: "", evidenceIds: ["a1"] } }))
  session.questions[0].spokenEntryId = null
  assert.ok(validatePlan(session, { ...plan, assessment: { status: "vague", summary: "", evidenceIds: ["u2"] } }))
  assert.ok(validatePlan(session, { ...plan, requirementId: "invented" }))
})
test("only an explicit presentation ending switches phase, not ordinary pauses or quoted phrases", () => {
  for (const text of ["Я закончил презентацию.", "Я закончила презентацию", "Готов отвечать на вопросы!", "Ну, я закончил презентацию."]) assert.equal(presentationFinished(text), true, text)
  for (const text of ["", "На этом экране всё", "Например, человек говорит: я закончил презентацию", "Я не закончил презентацию", "Сейчас расскажу про сценарий."]) assert.equal(presentationFinished(text), false, text)
})
test("report accepts grounded observations and includes honest limits", () => {
  const validated = validateFeedback(exampleSession, [], structuredClone(report))
  assert.equal(validated.details?.findings.length, 1)
  assert.ok(validated.limitations.some(l => l.includes("Эстетика UI")))
})
test("report fails closed on invented quotes, missing evidence and unasked-question criticism", () => {
  for (const mutate of [
    (r: typeof report) => { r.details!.findings[0].evidence[1].quote = "Я вообще ничего не умею" },
    (r: typeof report) => { r.details!.findings[0].evidence = [] },
    (r: typeof report) => { r.strengths[0].evidenceIds = ["a1"] },
    (r: typeof report) => { r.details!.findings[0].requirementId = "req_99" },
  ]) {
    const result = structuredClone(report); mutate(result)
    assert.throws(() => validateFeedback(exampleSession, [], result))
  }
  assert.throws(() => validateFeedback({ ...exampleSession, questions: [] }, [], structuredClone(report)))
})
test("not discussed is never silently promoted to a requirement violation", () => {
  const result = structuredClone(report)
  result.details!.findings[0].kind = "omission"
  result.details!.findings[0].basis = "requirement"
  assert.throws(() => validateFeedback(exampleSession, [], result))
})
test("rewrites require an exact user quote and cannot cite an interviewer", () => {
  const result = structuredClone(report)
  result.details!.rewrites = [{ sourceId: "a1", before: plan.question, after: "Пример", note: "" }]
  assert.throws(() => validateFeedback(exampleSession, [], result))
})
test("interrupted questions cannot support a negative answer assessment", () => {
  const session = structuredClone(exampleSession)
  session.transcript[1].interrupted = true
  assert.throws(() => validateFeedback(session, [], structuredClone(report)))
  assert.ok(validatePlan(session, { ...plan, assessment: { status: "vague", summary: "", evidenceIds: ["u2"] } }))
})
test("markdown export includes source assignment, findings, actions and transcript", () => {
  const session = structuredClone(exampleSession)
  const details = session.feedback!.details!
  const answer = session.transcript[2]
  const rewrite = { sourceId: answer.id, before: "этот случай не продумал", after: "Предложенный вариант ответа", note: "Уточни следующий шаг." }
  assert.ok(answer.text.includes(rewrite.before))
  details.rewrites.push(rewrite)
  const requirement = brief.analysis.requirements[0]
  details.findings[0].evidence.push({ id: requirement.id, quote: requirement.quote }, { id: "frame-1", quote: "" })
  session.feedback!.strengths[0].evidenceIds.push("frame-1")
  const [analysis, transcript] = reportMarkdown(session).split("## Расшифровка\n")
  assert.ok(analysis.includes(briefText))
  assert.ok(analysis.includes(details.findings[0].prepareForDefense!))
  assert.ok(analysis.includes(`## Формулировки\n\nБыло: ${rewrite.before}\n\nВариант: ${rewrite.after}\n\n${rewrite.note}`))
  assert.ok(analysis.includes(`Из задания: «${requirement.quote}»`))
  assert.ok(!analysis.includes("Основание: кадр экрана"))
  for (const turn of session.transcript) {
    assert.ok(!analysis.includes(turn.text))
    assert.ok(transcript.includes(turn.text))
  }
})

const requestSchema = z.object({ type: z.literal("response.create"), response: z.object({ metadata: z.object({ proof_turn: z.string(), mode: z.string() }), tools: z.array(z.unknown()), output_modalities: z.array(z.string()) }).passthrough() })
function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 })
  const store = new Store(":memory:")
  const session = store.create("synthetic-owner")
  store.update(session.id, { status: "live", brief })
  const sent: object[] = []
  let finished = 0; let failed = 0; let serial = 0
  const interview = new Interview(session.id, store, { callId: "rtc_test", sdp: "", send: event => sent.push(event), close() {} }, () => { finished++; interview.close() }, () => { failed++; interview.close() })
  t.after(() => { interview.close(); store.close() })
  const requests = () => sent.flatMap(e => { const p = requestSchema.safeParse(e); return p.success ? [p.data] : [] })
  const begin = () => {
    const request = requests().at(-1)!
    const response = { id: `resp_${++serial}`, metadata: request.response.metadata }
    interview.event({ type: "response.created", response })
    return response
  }
  const complete = (args?: unknown, spoken = "Пример реплики", status = "completed") => {
    const response = begin()
    if (response.metadata.mode !== "plan" && response.metadata.mode !== "dialogue") {
      const id = `a_${serial}`
      store.transcript(session.id, { id, at: Date.now(), role: "assistant", text: spoken })
      interview.event({ type: "response.output_audio_transcript.done", item_id: id, response_id: response.id })
    }
    const event = { type: "response.done", response: { ...response, status, output: args ? [{ type: "function_call", name: response.metadata.mode === "dialogue" ? "dialogue" : "plan_turn", call_id: `call_${serial}`, arguments: JSON.stringify(args) }] : [] } }
    interview.event(event)
    return event
  }
  const user = (text: string, id = `u_${++serial}`) => {
    interview.event({ type: "input_audio_buffer.speech_started", item_id: id })
    t.mock.timers.tick(1)
    store.transcript(session.id, { id, at: Date.now(), role: "user", text })
    interview.event({ type: "input_audio_buffer.speech_stopped", item_id: id })
    interview.event({ type: "conversation.item.input_audio_transcription.completed", item_id: id })
    return id
  }
  return { store, id: session.id, interview, sent, requests, complete, user, finished: () => finished, failed: () => failed }
}
test("intro hands off to silent presentation; ordinary completed turns do not generate replies", t => {
  const h = harness(t)
  h.interview.ready(); assert.equal(h.requests().length, 1)
  assert.ok(String(h.requests()[0].response.instructions).endsWith(greetingInstructions))
  h.complete()
  assert.equal(h.store.get(h.id)?.stage, "meeting")
  h.user("Меня зовут Анна."); h.complete({ action: "introduce", participantName: "Анна", reply: "Анна, покажи работу." }); h.complete()
  assert.equal(h.store.get(h.id)?.participantName, "Анна")
  assert.equal(h.store.get(h.id)?.stage, "presentation")
  h.user("Я начал с изучения задачи. Теперь покажу основной сценарий.")
  h.complete({ action: "listen", reply: "" })
  t.mock.timers.tick(5000)
  assert.equal(h.requests().filter(r => r.response.output_modalities.includes("audio")).length, 2)
  h.user("Я закончил презентацию.")
  t.mock.timers.tick(601)
  assert.equal(h.store.get(h.id)?.stage, "questions")
  assert.deepEqual(h.requests().at(-1)?.response.output_modalities, ["text"])
})
test("rejoining a presentation returns the floor without replaying the welcome", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "presentation" })
  h.interview.ready()
  const instructions = String(h.requests()[0].response.instructions)
  assert.ok(!instructions.includes(openingGreeting))
  assert.match(instructions, /продолжить презентацию/u)
})
test("a portfolio answer stays in the assessment and the next spoken question moves on", t => {
  const h = harness(t)
  const first = "Как пересчитывается цена портфеля?"
  const answer = "Я изменяю набор бумаг, и стоимость портфеля пересчитывается автоматически."
  const next = "Что увидит человек, если на покупку не хватит денег?"
  h.store.update(h.id, { stage: "presentation" })
  h.interview.advance("questions"); t.mock.timers.tick(601)
  h.complete({ ...plan, question: first }); h.complete(undefined, first)
  const answerId = h.user(answer); t.mock.timers.tick(601)
  const assessment = { status: "substantive", summary: "Стоимость портфеля пересчитывается автоматически.", evidenceIds: [answerId] }
  h.complete({ action: "answer", reply: "", plan: { ...plan, assessment, question: `Понял. ${assessment.summary} ${next}` } })
  assert.deepEqual(h.store.get(h.id)?.questions[0].assessment, assessment)
  assert.equal(h.store.get(h.id)?.questions[1].question, "Понял. " + next)
  assert.ok(String(h.requests().at(-1)?.response.instructions).endsWith(JSON.stringify("Понял. " + next)))
})
test("removing a recap keeps the new scenario, a direct question and genuine clarification", () => {
  const answer = "Стоимость портфеля пересчитывается автоматически."
  const question = "Как человек об этом узнает?"
  const scenario = "Представь, что данные о стоимости портфеля опоздали. " + question
  assert.equal(spokenNextQuestion("То есть стоимость меняется сама. " + scenario, answer), scenario)
  for (const keep of [question, "Понял. " + scenario, "То есть ты говоришь о цене одной бумаги или о сумме портфеля?", "Покажи, где на экране меняется сумма."]) {
    assert.equal(spokenNextQuestion(keep, answer), keep)
  }
})
test("question is persisted before speech but not marked asked until audio transcript arrives", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "presentation" }); h.interview.advance("questions"); t.mock.timers.tick(601)
  const event = h.complete(plan)
  assert.equal(h.store.get(h.id)?.questions[0].spokenEntryId, null)
  assert.deepEqual(h.requests().at(-1)?.response.output_modalities, ["audio"])
  h.interview.event(event)
  assert.equal(h.store.get(h.id)?.questions.length, 1)
  h.complete(undefined, plan.question)
  assert.ok(h.store.get(h.id)?.questions[0].spokenEntryId)
})
test("invalid tool plans get one bounded correction then return the floor without recording a question", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "presentation" }); h.interview.advance("questions"); t.mock.timers.tick(601)
  h.complete({ ...plan, requirementId: "req_99" })
  assert.equal(h.failed(), 0)
  h.complete({ ...plan, requirementId: "req_99" })
  assert.equal(h.failed(), 0)
  assert.match(String(h.requests().at(-1)?.response.instructions), /Повтори, пожалуйста/)
  assert.equal(h.store.get(h.id)?.questions.length, 0)
})
test("wrap-up allows an addition, and closing waits for playback before finishing", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "questions" }); h.interview.advance("wrap_up")
  h.complete()
  h.user("Добавить нечего, спасибо.")
  h.complete({ action: "finish", reply: "" })
  const farewell = h.complete()
  assert.equal(h.store.get(h.id)?.stage, "closing")
  assert.equal(h.finished(), 0)
  h.interview.event({ type: "output_audio_buffer.stopped", response_id: farewell.response.id })
  assert.equal(h.finished(), 1)
  t.mock.timers.tick(30000)
  assert.equal(h.finished(), 1)
})
test("out-of-order or foreign response events do not advance the server-owned phase", t => {
  const h = harness(t); h.interview.ready()
  h.interview.event({ type: "response.done", response: { id: "other", status: "completed", metadata: { proof_turn: "unknown" } } })
  assert.equal(h.store.get(h.id)?.stage, "intro")
  assert.throws(() => h.interview.advance("questions"))
})
test("clarifying a question does not consume another followup and returning to presentation is allowed", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "questions", questions: exampleSession.questions })
  h.interview.ready(); h.complete()
  h.user("Что ты имеешь в виду?"); t.mock.timers.tick(601)
  h.complete({ action: "reply", reply: "Я спрашивал про выбор аптеки." })
  h.complete()
  assert.equal(h.store.get(h.id)?.questions.length, 1)
  assert.equal(h.store.get(h.id)?.questions[0].followUp, 0)
  h.user("Хочу продолжить показ работы."); t.mock.timers.tick(601)
  h.complete({ action: "presentation", reply: "" })
  assert.equal(h.store.get(h.id)?.stage, "presentation")
})

test("incomplete model generation asks the participant to resume in the same call", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "presentation" }); h.interview.advance("questions"); t.mock.timers.tick(601)
  h.complete(undefined, "", "incomplete")
  assert.equal(h.failed(), 0)
  assert.match(String(h.requests().at(-1)?.response.instructions), /Повтори, пожалуйста/)
})
test("interrupting farewell cancels the fallback hangup while the user adds context", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "wrap_up" }); h.user("Добавить нечего.")
  h.complete({ action: "finish", reply: "" }); h.complete()
  h.interview.event({ type: "input_audio_buffer.speech_started", item_id: "last-addition" })
  t.mock.timers.tick(21000)
  assert.equal(h.finished(), 0)
  assert.equal(h.store.get(h.id)?.stage, "wrap_up")
})

test("damaged model citations cannot survive in the verdict, summary or action list", () => {
  const output = structuredClone(report)
  output.summary = output.title = "Неподтверждённый вывод"
  output.nextSteps = [output.title]
  output.details!.findings[0].evidence[0].quote = "чужая фраза"
  const result = validateFeedback(exampleSession, [], output, "recover")
  assert.equal(result.strengths.length, 1)
  assert.equal(result.details?.findings.length, 0)
  assert.ok(!JSON.stringify(result).includes("Неподтверждённый вывод"))
})

test("short citations resolve to real transcript IDs on export; invented sources get rejected", () => {
  const session = structuredClone(exampleSession)
  session.transcript[0].id = "real-uuid-long"
  const sources = reportSources(session, [])
  const output = structuredClone(report)
  output.details!.findings[0].evidence[0].id = "wrong-id"
  assert.equal(sources.restore(output).strengths[0].evidenceIds[0], "real-uuid-long")
  assert.throws(() => validateFeedback(session, [], output))
})

test("transcript review uses only answers to a fully spoken question in its own time window", () => {
  const session = structuredClone(exampleSession)
  assert.deepEqual(transcriptFeedback(session).improvements[0].evidenceIds, ["u2"])
  session.transcript[1].interrupted = true
  assert.ok(!JSON.stringify(transcriptFeedback(session)).includes(session.questions[0].assessment.summary))
  const blank = { ...structuredClone(report), strengths: [], improvements: [], details: null, summary: "invented", limitations: [] }
  assert.deepEqual(validateFeedback(session, [], blank, "recover"), transcriptFeedback(session))
})

test("turn transitions respect named introductions, thinking pauses and explicit handoffs", () => {
  assert.match(presentationThanks(["Привет! Меня зовут Анна. Сейчас покажу работу."]), /^Анна, спасибо/)
  assert.match(presentationThanks(["В моём примере пользователя зовут Анна."]), /^Спасибо/)
  assert.equal(explicitAnswerEnd("Всё, это мой ответ."), true)
  assert.equal(explicitAnswerEnd("Я ещё не закончила."), false)
  assert.equal(requestsTime("Погоди, я ещё не закончил."), true)
  assert.equal(requestsTime("Не знаю."), false)
  assert.notEqual(acknowledgedQuestion("Что увидит клиент?", 0, false), acknowledgedQuestion("Что увидит клиент?", 1, false))
})

test("a participant can ask an unrelated question at every conversational stage", t => {
  const h = harness(t)
  for (const stage of ["meeting", "presentation", "questions", "wrap_up"] as const) {
    h.store.update(h.id, { stage })
    h.user("Слушай, я совсем сбился. Что мы сейчас обсуждали")
    assert.equal(h.requests().at(-1)?.response.metadata.mode, "dialogue")
    const reply = "Мы обсуждали поиск аптеки. Хочешь вернуться к карте?"
    h.complete({ action: "reply", reply })
    assert.ok(String(h.requests().at(-1)?.response.instructions).endsWith(JSON.stringify(reply)))
    h.complete(undefined, reply)
    assert.equal(h.store.get(h.id)?.stage, stage)
    assert.equal(h.store.get(h.id)?.questions.length, 0)
  }
})

test("silence produces a single check-in, and new speech or an explicit wait cancels it", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "presentation" })
  h.user("Сначала я открыл карту."); h.complete({ action: "listen", reply: "" })
  t.mock.timers.tick(10000)
  h.user("Секундочку, я пока поищу нужный экран."); h.complete({ action: "wait", reply: "" })
  assert.match(String(h.requests().at(-1)?.response.instructions), /подожду/u)
  h.complete()
  const waiting = h.requests().length
  t.mock.timers.tick(60000)
  assert.equal(h.requests().length, waiting)
  h.user("Так, вот он, экран карты."); h.complete({ action: "listen", reply: "" })
  t.mock.timers.tick(12000)
  assert.equal(h.requests().at(-1)?.response.metadata.mode, "speak")
  h.complete()
  const checked = h.requests().length
  t.mock.timers.tick(60000)
  assert.equal(h.requests().length, checked)
  assert.equal(h.store.get(h.id)?.stage, "presentation")
})

test("a late decision cannot close the call over new speech; a malformed turn can be retried", t => {
  const h = harness(t)
  h.store.update(h.id, { stage: "wrap_up" })
  h.user("Вроде всё.")
  h.user("Погоди, забыл спросить про карту.")
  h.complete({ action: "finish", reply: "" })
  assert.equal(h.store.get(h.id)?.stage, "wrap_up")
  assert.equal(h.requests().at(-1)?.response.metadata.mode, "dialogue")
  h.complete({ action: "invalid", reply: "" })
  assert.equal(h.failed(), 0)
  assert.match(String(h.requests().at(-1)?.response.instructions), /Повтори, пожалуйста/)
  h.complete()
  h.user("Что нужно показать на карте")
  h.complete({ action: "reply", reply: "Покажи, как пользователь найдёт аптеку." })
  assert.equal(h.requests().at(-1)?.response.metadata.mode, "speak")
  assert.equal(h.store.get(h.id)?.questions.length, 0)
})
