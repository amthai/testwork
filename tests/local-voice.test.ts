import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { buildApp } from "../server/app.js"
import { readConfig } from "../server/config.js"
import { LocalVoiceCall } from "../server/local-voice.js"
import { DeepSeekProvider } from "../server/deepseek.js"
import { Store } from "../server/store.js"
import { brief, briefText, exampleSession, plan, report } from "./fixtures.js"

const config = readConfig({ PROOF_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "fixture-only" })
function modelReply(output: unknown, plain = false) {
  return Response.json({ id: "resp_test", object: "response", status: "completed", output: [{
    id: "msg_test", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: plain ? String(output) : JSON.stringify(output), annotations: [] }],
  }] })
}

test("DeepSeek mode accepts photos and uses a grounded structured report without an OpenAI key", async t => {
  const jpeg = "data:image/jpeg;base64,/9j/2Q=="
  const analysis = { ...brief.analysis, imageSources: [{ id: "img_1", text: briefText, description: "Страница задания" }] }
  let calls = 0
  t.mock.method(globalThis, "fetch", async (url: URL | string, init: RequestInit) => {
    assert.equal(String(url), "https://api.deepseek.com/responses")
    const body = JSON.parse(String(init.body))
    assert.equal(body.model, "deepseek-flash")
    assert.equal(body.reasoning.effort, "none")
    assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    assert.ok(body.input[0].content.some((part: { image_url?: string }) => part.image_url === jpeg))
    if (body.text.format.name === "defense_feedback") {
      const { observedEvidenceIds } = JSON.parse(body.input[0].content[0].text)
      assert.deepEqual(observedEvidenceIds, ["u1", "u2", "f1"])
      assert.match(body.instructions, /observedEvidenceIds/)
    }
    return modelReply(++calls === 1 ? { images: analysis.imageSources } : structuredClone(report))
  })
  const provider = new DeepSeekProvider(config)
  assert.deepEqual(await provider.readBriefImages([{ id: "img_1", name: "screen.jpg", dataUrl: jpeg }]), analysis.imageSources)
  assert.equal((await provider.feedback(exampleSession, [{ id: "frm_a", at: 1, image: jpeg }])).title, report.title)
  assert.equal(calls, 2)
})

test("local voice routes isolate calls, transcribe audio, deliver and interrupt playback", async t => {
  const recognized = "Я показал основной сценарий покупки и проверил его на пользователях."
  let transcript = ""
  let dialogue = { action: "listen", reply: "" }
  let planned = 0
  let fallbackPlans = 0
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    const target = new URL(url)
    if (target.origin === "https://api.deepseek.com") {
      const body = JSON.parse(String(init?.body))
      if (!body.text) return modelReply("Привет! Я Денис. Как тебя зовут?", true)
      if (body.text.format.name === "assignment_requirements") return modelReply(brief.analysis)
      if (body.text.format.name === "dialogue") {
        const { assessment: _unused, ...opening } = { ...plan, requirementId: null }
        if (dialogue.action === "questions") planned++
        return modelReply({ ...dialogue, participantName: null, plan: dialogue.action === "questions" ? opening : null })
      }
      if (body.text.format.name === "turn_plan") {
        fallbackPlans++
        return modelReply({ ...plan, requirementId: null, question: "Почему ты выбрал именно такой сценарий?" })
      }
      assert.fail("Unexpected model request")
    }
    assert.equal(target.origin, config.SPEECH_URL)
    if (target.pathname === "/ready") return new Response()
    if (target.pathname === "/synthesize") return new Response(Buffer.from("RIFF" + "0".repeat(100)))
    assert.equal(target.pathname, "/transcribe")
    return Response.json({ text: transcript })
  })
  const store = new Store(":memory:")
  const { app } = await buildApp(config, { store, serveStatic: false })
  t.after(async () => { await app.close(); store.close() })
  const bootstrap = await app.inject("/api/bootstrap")
  assert.equal(bootstrap.json().provider, "deepseek")
  const headers = { cookie: String(bootstrap.headers["set-cookie"]).split(";")[0], "x-proof-client": "1", "x-proof-voice": "" }
  const post = (url: string, payload?: object) => app.inject({ method: "POST", url, headers, payload })
  const prepared = await post("/api/briefs", { text: briefText })
  const created = await post("/api/sessions", { briefId: prepared.json().id })
  assert.equal(created.statusCode, 200, created.body)
  const path = "/api/sessions/" + created.json().session.id
  assert.equal((await app.inject({ url: path + "/voice?after=-1", headers })).statusCode, 409)
  headers["x-proof-voice"] = created.json().voiceId
  assert.equal((await app.inject({ url: path + "/voice?after=-1", headers: { ...headers, cookie: "" } })).statusCode, 401)
  const snapshot = async () => (await app.inject({ url: path + "/voice?after=-1", headers })).json()
  await post(path + "/ready")
  const intro = await snapshot()
  assert.ok(intro.audioId)
  assert.equal((await app.inject({ url: path + "/voice/" + intro.audioId, headers })).headers["content-type"], "audio/wav")
  const noise = path + "/voice/" + randomUUID()
  await post(noise + "/start")
  assert.equal((await snapshot()).audioId, intro.audioId, "noise before playback must not cancel the greeting")
  await post(path + "/voice/" + intro.audioId + "/playback", { state: "started" })
  assert.equal(store.get(created.json().session.id)?.stage, "intro")
  assert.equal((await app.inject({ method: "POST", url: noise + "/speech", headers: { ...headers, "content-type": "application/octet-stream" }, payload: Buffer.alloc(16000) })).statusCode, 200)
  assert.equal(store.get(created.json().session.id)?.transcript.filter(t => t.role === "user").length, 0)
  await post(path + "/voice/" + intro.audioId + "/playback", { state: "ended" })
  assert.equal(store.get(created.json().session.id)?.stage, "meeting")
  transcript = recognized
  const utterance = path + "/voice/" + randomUUID()
  await post(utterance + "/start")
  const sendSpeech = () => app.inject({ method: "POST", url: utterance + "/speech", headers: { ...headers, "content-type": "application/octet-stream" }, payload: Buffer.alloc(16000) })
  assert.equal((await sendSpeech()).statusCode, 200)
  assert.equal((await sendSpeech()).statusCode, 200)
  const session = store.get(created.json().session.id)!
  assert.equal(session.transcript.filter(t => t.role === "user").length, 1)
  assert.equal(Boolean(session.transcript.find(t => t.role === "assistant")?.interrupted), false)
  async function speak(text: string) {
    transcript = text
    const turn = path + "/voice/" + randomUUID()
    await post(turn + "/start")
    return app.inject({ method: "POST", url: turn + "/speech", headers: { ...headers, "content-type": "application/octet-stream" }, payload: Buffer.alloc(24000) })
  }
  for (const [input, expected] of [
    ["О'кей, я открыл. Могу начинать", /начинай/u],
    ["Я открыл фигму. Могу начинать рассказ.", /начинай/u],
    ["Денис, ты тут", /я здесь/iu],
    ["Денис", /я здесь/iu],
    ["Я могу начинать", /начинай/u],
  ] as const) {
    await speak(input)
    const { audioId } = await snapshot()
    assert.ok(audioId, input)
    await post(path + "/voice/" + audioId + "/playback", { state: "started" })
    assert.match(store.get(session.id)!.transcript.at(-1)!.text, expected)
    await post(path + "/voice/" + audioId + "/playback", { state: "ended" })
    assert.equal(store.get(session.id)!.stage, "presentation")
  }
  for (const narration of ["Я открыл фигму", "Я начинаю с главного экрана.", "Пользователь спрашивает: могу начинать?", "Я могу начинать рассказ с любого экрана"]) {
    await speak(narration)
    assert.equal((await snapshot()).audioId, null, narration)
  }
  dialogue = { action: "reply", reply: "На работу отводится четыре часа." }
  await speak("А сколько времени можно потратить на задание?")
  const answer = await snapshot()
  assert.ok(answer.audioId)
  await post(path + "/voice/" + answer.audioId + "/playback", { state: "started" })
  assert.equal(store.get(session.id)?.stage, "presentation")
  dialogue = { action: "questions", reply: "" }
  await speak("Вроде всё, что хотел показать, теперь твоя очередь спрашивать.")
  assert.equal(store.get(session.id)?.transcript.find(t => t.id === answer.audioId)?.interrupted, true)
  await new Promise(resolve => setTimeout(resolve, 750))
  const question = await snapshot()
  assert.ok(question.audioId)
  assert.equal(planned, 1)
  await post(path + "/voice/" + question.audioId + "/playback", { state: "started" })
  assert.match(store.get(session.id)!.transcript.find(t => t.id === question.audioId)!.text, /^Спасибо за рассказ!/)
  await post(path + "/voice/" + question.audioId + "/playback", { state: "ended" })
  dialogue = { action: "listen", reply: "" }
  await speak("Открывается карточка ближайшей аптеки.")
  await speak("Подожди, дай мне подумать.")
  await new Promise(resolve => setTimeout(resolve, 1750))
  assert.equal(fallbackPlans, 0)
  dialogue = { action: "answer", reply: "" }
  await speak("Можно выбрать другую аптеку в списке.")
  for (let i = 0; i < 30 && !fallbackPlans; i++) await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(fallbackPlans, 1)
  const second = await snapshot()
  assert.ok(second.audioId)
  await post(path + "/voice/" + second.audioId + "/playback", { state: "started" })
  assert.match(store.get(session.id)!.transcript.find(t => t.id === second.audioId)!.text, /^Спасибо за ответ\./)
  dialogue = { action: "reply", reply: "Я спрашиваю про следующий шаг покупателя." }
  await speak("Подожди, поясни, что ты имеешь в виду?")
  assert.equal(store.get(session.id)?.questions[0].spokenEntryId, question.audioId)
  assert.equal(store.get(session.id)?.transcript.find(t => t.id === second.audioId)?.interrupted, true)
  await post(path + "/finish")
  assert.notEqual(store.get(session.id)?.status, "live")
})

test("explicit DeepSeek selection stays unavailable with only an OpenAI key", async t => {
  const store = new Store(":memory:")
  const { app } = await buildApp(readConfig({ PROOF_PROVIDER: "deepseek", OPENAI_API_KEY: "fixture-only" }), { store, serveStatic: false })
  t.after(async () => { await app.close(); store.close() })
  assert.equal((await app.inject("/api/bootstrap")).json().configured, false)
  assert.equal((await app.inject("/health/ready")).statusCode, 503)
})


test("malformed model JSON is reported as a recoverable response format error", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: "resp_invalid", object: "response", status: "completed", output: [{
    id: "msg_invalid", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: '{"summary":"обзор":""}', annotations: [] }],
  }] }))
  const provider = new DeepSeekProvider(config)
  await assert.rejects(provider.feedback(exampleSession, []), { code: "model_format", statusCode: 422 })
})

test("a misplaced rewrites array preserves its entries and still requires verbatim evidence", async t => {
  const rewrites = [{ sourceId: "u1", before: exampleSession.transcript[0].text, after: "Я показал основной сценарий.", note: "Краткая формулировка." }]
  const { rewrites: _nested, ...details } = report.details!
  t.mock.method(globalThis, "fetch", async () => modelReply({ ...report, details, rewrites }))
  const provider = new DeepSeekProvider(config)
  assert.deepEqual((await provider.feedback(exampleSession, [])).details?.rewrites, rewrites)
  rewrites[0].before = "Слова, которых нет в реплике."
  const partial = await provider.feedback(exampleSession, [])
  assert.deepEqual(partial.details?.rewrites, [])
  assert.ok(partial.details?.findings.length)
  assert.notEqual(partial.summary, report.summary)
})

test("a draft cannot advance the interview until committed and resumed speech replaces it", async t => {
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => Response.json({ text: "Реплика " + ++calls }))
  const events: object[] = []
  const voice = new LocalVoiceCall(config.SPEECH_URL, e => events.push(e), async () => plan, async () => ({ action: "listen", reply: "" }))
  voice.start("one")
  voice.draft("one", Buffer.alloc(4))
  assert.equal(events.length, 0)
  await voice.transcribe("one")
  await voice.transcribe("one")
  assert.equal(calls, 1)
  voice.start("two")
  voice.draft("two", Buffer.alloc(4))
  await voice.transcribe("two", Buffer.alloc(8))
  assert.equal(calls, 3)
  assert.match(JSON.stringify(events.at(-1)), /Реплика 3/)
  voice.close()
})

test("a transient connection failure before the first model byte retries the conversation turn", async t => {
  let attempts = 0
  t.mock.method(globalThis, "fetch", async (url: URL | string) => {
    if (String(url).endsWith("/ready")) return new Response()
    if (++attempts === 1) throw new TypeError("fetch failed")
    return modelReply({ action: "listen", reply: "", plan: null })
  })
  const done = Promise.withResolvers<string>()
  const provider = new DeepSeekProvider(config)
  const call = await provider.connect("", "", "", event => {
    if (typeof event !== "object" || !event || !("type" in event) || event.type !== "response.done") return
    if ("response" in event && event.response && typeof event.response === "object" && "status" in event.response && typeof event.response.status === "string") done.resolve(event.response.status)
  })
  t.after(() => call.close())
  call.voice.turn("retry-test", { ...exampleSession, remainingSeconds: 300 }, "", undefined, true)
  assert.equal(await done.promise, "completed")
  assert.equal(attempts, 2)
})

for (const ending of ["requested", "voice"] as const) {
  test(`Denis learns a spoken name, personalizes the ${ending} farewell and waits for playback`, async t => {
    let candidate = "Анна"
    let closingRequests = 0
    const closing = "Анна, рад был с тобой пообщаться! Удачи на защите, до встречи!"
    t.mock.method(globalThis, "fetch", async (url: URL | string, options: RequestInit) => {
      const target = new URL(String(url))
      if (target.origin === config.SPEECH_URL) {
        if (target.pathname === "/transcribe") return Response.json({ text: candidate })
        if (target.pathname === "/synthesize") return new Response(Buffer.from("RIFF" + "0".repeat(100)))
        return new Response()
      }
      const body = JSON.parse(String(options.body))
      if (body.text?.format.name === "assignment_requirements") return modelReply(brief.analysis)
      if (body.text?.format.name === "dialogue") {
        const context = JSON.parse(body.input[0].content[0].text)
        if (context.stage === "meeting") return modelReply({ action: "introduce", participantName: "Анна", reply: "Анна, приятно познакомиться! Покажешь работу?", plan: null })
        assert.equal(context.participantName, "Анна")
        return modelReply({ action: "finish", reply: closing, plan: null })
      }
      if (body.instructions.includes("Попрощайся своими словами")) {
        closingRequests++
        assert.equal(JSON.parse(body.input).participantName, "Анна")
        return modelReply(closing, true)
      }
      return modelReply("Привет, я Денис! Как тебя зовут?", true)
    })
    const store = new Store(":memory:")
    const { app } = await buildApp(config, { store, serveStatic: false })
    t.after(async () => { await app.close(); store.close() })
    const boot = await app.inject("/api/bootstrap")
    const headers = { cookie: String(boot.headers["set-cookie"]).split(";")[0], "x-proof-client": "1", "x-proof-voice": "" }
    const post = (url: string, payload?: object) => app.inject({ method: "POST", url, headers, payload }).then(r => { assert.equal(r.statusCode, 200); return r })
    const briefId = (await post("/api/briefs", { text: briefText })).json().id
    const created = (await post("/api/sessions", { briefId })).json()
    const id = created.session.id, path = "/api/sessions/" + id
    headers["x-proof-voice"] = created.voiceId
    const audio = async () => {
      for (let i = 0; i < 40; i++) {
        const current = (await app.inject({ url: path + "/voice?after=-1", headers })).json().audioId
        if (current) return current as string
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.fail("Expected playable speech")
    }
    const play = (turn: string, state: "started" | "ended") => post(path + "/voice/" + turn + "/playback", { state })
    const speak = async () => {
      const turn = path + "/voice/" + randomUUID()
      await post(turn + "/start")
      const r = await app.inject({ method: "POST", url: turn + "/speech", headers: { ...headers, "content-type": "application/octet-stream" }, payload: Buffer.alloc(16000) })
      assert.equal(r.statusCode, 200)
    }
    await post(path + "/ready")
    const hello = await audio()
    await play(hello, "started"); await play(hello, "ended")
    assert.equal(store.get(id)?.stage, "meeting")
    await speak()
    const handoff = await audio()
    await play(handoff, "started")
    assert.equal(store.get(id)?.participantName, "Анна")
    assert.equal(store.get(id)?.stage, "presentation")
    let request
    if (ending === "requested") {
      // Press End during the handoff. Its delayed playback ACK must not end the farewell.
      request = post(path + "/finish", { farewell: true })
      await new Promise(resolve => setTimeout(resolve, 35))
      await play(handoff, "ended")
    } else {
      await play(handoff, "ended"); candidate = "Спасибо, давай закончим созвон."; await speak()
    }
    const goodbye = await audio()
    assert.notEqual(goodbye, handoff)
    await play(goodbye, "started")
    assert.equal(store.get(id)?.transcript.at(-1)?.text, closing)
    assert.equal(store.get(id)?.status, "live")
    await play(goodbye, "ended")
    if (request) await request
    assert.notEqual(store.get(id)?.status, "live")
    assert.equal(closingRequests, ending === "requested" ? 1 : 0)
  })
}

test("one ASR failure permits retrying speech in the same voice connection", async t => {
  let attempts = 0
  t.mock.method(globalThis, "fetch", async () => ++attempts === 1 ? new Response(null, { status: 503 }) : Response.json({ text: "Я хотел спросить про карту." }))
  const events: object[] = []
  const voice = new LocalVoiceCall(config.SPEECH_URL, event => events.push(event), async () => plan, async () => ({ action: "listen", reply: "" }))
  t.after(() => voice.close())
  voice.start("one")
  await voice.transcribe("one", Buffer.alloc(8))
  await voice.transcribe("one", Buffer.alloc(8))
  voice.start("two")
  await voice.transcribe("two", Buffer.alloc(8))
  assert.equal(attempts, 2)
  assert.ok(events.some(event => "type" in event && event.type === "conversation.item.input_audio_transcription.failed"))
  assert.match(JSON.stringify(events.at(-1)), /Я хотел спросить про карту/)
})
