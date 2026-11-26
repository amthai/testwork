import { test, type TestContext } from "node:test"
import assert from "node:assert/strict"
import { buildApp } from "../server/app.js"
import { readConfig } from "../server/config.js"
import { Store } from "../server/store.js"
import { AppError, providerError } from "../server/errors.js"
import type { Provider, ControlConnection } from "../server/provider.js"
import type { DefenseSession, Feedback } from "../src/lib/session.js"
import { brief, briefText } from "./fixtures.js"
import type { BriefAnalysis, BriefImage } from "../src/lib/methodology.js"
import { SERVICE_UNAVAILABLE } from "../src/lib/service-errors.js"

const sdp = "v=0\r\no=controlled-test 0 0 IN IP4 127.0.0.1\r\n"
const image = "data:image/jpeg;base64,/9j/2Q=="
// Minimal bounded JPEG header for route validation; no real provider sees this fixture.
const assignmentImage: BriefImage = { id: "00000000-0000-4000-8000-000000000003", name: "Задание.jpg", dataUrl: "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0, 255, 217]).toString("base64") }
const transcript = "Мы проектировали оформление заказа для покупателей с мобильного телефона. Сократили форму до адреса и способа оплаты, потому что основная проблема заключалась в количестве обязательных полей."
const report: Feedback = { title: "Понятный контекст", summary: "Рассказ об оформлении заказа.", strengths: [{ title: "Задача", detail: "Задача объяснена.", evidenceIds: ["user-1"] }], improvements: [], nextSteps: ["Расскажи о проверке решения."], limitations: [], details: null }

class TestProvider implements Provider {
  analyses = 0
  failBrief = false
  history = ""
  sent: object[] = []
  briefImages: BriefImage[] = []
  reads = 0
  async readBriefImages(images: BriefImage[]) {
    this.reads++; this.briefImages = images
    if (this.failBrief) throw providerError(429, "insufficient_quota")
    return images.map(image => ({ id: image.id, text: briefText, description: "Фото задания" }))
  }
  async analyzeBrief(_text: string, imageSources: BriefAnalysis["imageSources"]) {
    this.analyses++
    if (this.failBrief) throw providerError(429, "insufficient_quota")
    return { ...structuredClone(brief.analysis), imageSources }
  }
  listener: (event: unknown) => void = () => undefined
  calls = 0
  hangups: string[] = []
  reports = 0
  failConnect = false
  failReport = false
  rejectImages = false
  async connect(_sdp: string, _owner: string, _history: string, onEvent: (event: unknown) => void): Promise<ControlConnection> {
    this.calls++; this.listener = onEvent; this.history = _history
    if (this.failConnect) throw new AppError(503, "quota", "Провайдер недоступен.")
    return { callId: `rtc_test${this.calls}`, sdp, send: event => {
      this.sent.push(event)
      const parsed = event as { type: string; event_id?: string; item?: { id: string } }
      if (parsed.type === "conversation.item.create" && parsed.item?.id) queueMicrotask(() => this.listener(this.rejectImages ? { type: "error", error: { code: "invalid_image", event_id: parsed.event_id } } : { type: "conversation.item.added", item: { id: parsed.item!.id, role: "user" } }))
    }, close: () => undefined }
  }
  async hangup(id: string) { this.hangups.push(id) }
  async feedback() { this.reports++; if (this.failReport) throw new AppError(502, "provider", "Временно недоступно."); return report }
}
async function setup(t: TestContext, overrides: Record<string, string> = {}) {
  const store = new Store(":memory:")
  const provider = new TestProvider()
  const config = readConfig({ NODE_ENV: "test", OPENAI_API_KEY: "test-only-not-a-credential", ...overrides })
  const built = await buildApp(config, { store, provider, serveStatic: false })
  const { app, sessions } = built
  t.after(async () => { await app.close(); store.close() })
  const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" })
  const cookie = String(bootstrap.headers["set-cookie"]).split(";")[0]
  const headers = { cookie, "x-proof-client": "1", origin: "http://localhost:5173" }
  let briefId: string | undefined
  const create = async () => {
    if (!briefId) {
      const prepared = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { text: briefText } })
      if (prepared.statusCode !== 200) return prepared
      briefId = prepared.json().id as string
    }
    return app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, briefId } })
  }
  return { app, sessions, store, provider, headers, create, bootstrap }
}

test("bootstrap does not disclose credentials and sets an HttpOnly owner cookie", async t => {
  const { bootstrap } = await setup(t)
  assert.equal(bootstrap.statusCode, 200)
  assert.match(String(bootstrap.headers["set-cookie"]), /HttpOnly/)
  assert.equal(bootstrap.body.includes("test-only-not-a-credential"), false)
})
test("access code protects paid session creation", async t => {
  const { app, headers, create, provider } = await setup(t, { PROOF_ACCESS_CODE: "test-access-only" })
  assert.equal((await create()).statusCode, 403)
  assert.equal(provider.calls, 0)
  assert.equal((await app.inject({ method: "POST", url: "/api/access", headers, payload: { code: "wrong" } })).statusCode, 403)
  assert.equal((await app.inject({ method: "POST", url: "/api/access", headers, payload: { code: "test-access-only" } })).statusCode, 200)
  assert.equal((await create()).statusCode, 200)
})
test("cross-origin and missing custom header requests cannot create paid calls", async t => {
  const { app, headers, provider } = await setup(t)
  for (const input of [{ ...headers, origin: "https://foreign.invalid" }, { cookie: headers.cookie }]) {
    const result = await app.inject({ method: "POST", url: "/api/sessions", headers: input, payload: { sdp } })
    assert.equal(result.statusCode, 403)
  }
  assert.equal(provider.calls, 0)
})
test("session IDs do not grant another browser read, mutate, or delete access", async t => {
  const { app, create, store } = await setup(t)
  const session = (await create()).json().session as DefenseSession
  const other = await app.inject({ method: "GET", url: "/api/bootstrap" })
  const cookie = String(other.headers["set-cookie"]).split(";")[0]
  for (const [method, suffix] of [["GET", ""], ["POST", "/finish"], ["POST", "/frames"], ["DELETE", ""]] as const) {
    const result = await app.inject({ method, url: `/api/sessions/${session.id}${suffix}`, headers: { cookie, "x-proof-client": "1" }, ...(suffix === "/frames" ? { payload: { image } } : {}) })
    assert.equal(result.statusCode, 404)
  }
  assert.ok(store.get(session.id))
})
test("invalid SDP never reaches OpenAI", async t => {
  const { app, headers, provider } = await setup(t)
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp: "invalid" } })).statusCode, 400)
  assert.equal(provider.calls, 0)
})
test("daily budget and concurrent slot checks reserve before provider call", async t => {
  const { app, create, headers, provider } = await setup(t, { MAX_DAILY_SESSIONS: "1" })
  const result = await create()
  assert.equal(result.statusCode, 200)
  await app.inject({ method: "POST", url: `/api/sessions/${result.json().session.id}/interrupt`, headers })
  assert.equal((await create()).statusCode, 429)
  assert.equal(provider.calls, 1)
})
test("completed provider transcripts are deduplicated and ordered by speech start", async t => {
  const { create, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "input_audio_buffer.speech_started", item_id: "user-1" })
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  assert.equal(store.get(id)?.transcript.length, 1)
  assert.equal(store.get(id)?.transcript[0].role, "user")
})
test("empty call returns insufficient evidence without an AI report or canned praise", async t => {
  const { app, create, headers, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers })
  assert.equal(store.get(id)?.status, "insufficient")
  assert.equal(store.get(id)?.feedback, null)
  assert.equal(provider.reports, 0)
  assert.equal(provider.hangups.length, 1)
})
test("finish is idempotent and the persisted report uses provider content", async t => {
  const { app, create, headers, provider, sessions, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers })))
  await sessions.settled()
  assert.equal(provider.analyses, 1)
  assert.equal(provider.reports, 1)
  assert.deepEqual(store.get(id)?.feedback, report)
})
test("the saved defense still gets feedback when no quoted assignment requirements can be extracted", async t => {
  const { app, create, headers, provider, sessions, store } = await setup(t)
  provider.failBrief = true
  const id = (await create()).json().session.id as string
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers })
  await sessions.settled()
  assert.equal(provider.analyses, 1)
  assert.equal(store.get(id)?.brief?.text, briefText)
  assert.deepEqual(store.get(id)?.feedback, report)
})
test("provider failure preserves evidence and a retry can recover the report", async t => {
  const { app, create, headers, provider, sessions, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  provider.failReport = true
  await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers })
  await sessions.settled()
  assert.equal(store.get(id)?.status, "failed")
  assert.equal(store.get(id)?.transcript.length, 1)
  provider.failReport = false
  await app.inject({ method: "POST", url: `/api/sessions/${id}/feedback`, headers })
  await sessions.settled()
  assert.equal(store.get(id)?.status, "complete")
})
test("frames must be confirmed by the provider before the UI counts them", async t => {
  const { app, create, headers, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.rejectImages = true
  const result = await app.inject({ method: "POST", url: `/api/sessions/${id}/frames`, headers, payload: { image } })
  assert.equal(result.statusCode, 502)
  assert.equal(store.get(id)?.frameCount, 0)
})
test("deleting a session removes its transcript, report and stored frames", async t => {
  const { app, create, headers, store } = await setup(t)
  const id = (await create()).json().session.id as string
  store.addFrame(id, { id: "frame-test", image, at: Date.now() })
  assert.equal((await app.inject({ method: "DELETE", url: `/api/sessions/${id}`, headers })).statusCode, 200)
  assert.equal(store.get(id), null)
  assert.deepEqual(store.frames(id), [])
})
test("frame sample remains bounded and retains the first and last moments", () => {
  const store = new Store(":memory:")
  const session = store.create("test-owner")
  for (let i = 0; i < 200; i++) store.addFrame(session.id, { id: `frame-${i}`, image, at: i * 5000 })
  assert.equal(store.frames(session.id).length, 24)
  assert.equal(store.frames(session.id)[0].id, "frame-0")
  assert.equal(store.frames(session.id).at(-1)?.id, "frame-199")
  assert.equal(store.get(session.id)?.frameCount, 200)
  store.close()
})
test("production refuses an unprotected paid API", () => {
  assert.throws(() => readConfig({ NODE_ENV: "production" }))
  assert.doesNotThrow(() => readConfig({ NODE_ENV: "production", APP_ORIGIN: "https://proof.example", PROOF_ACCESS_CODE: "test-access-only" }))
})
test("credit exhaustion is distinct from temporary rate limiting", () => {
  assert.equal(providerError(429, "credit_balance_exhausted", "insufficient_quota").code, "quota")
  assert.equal(providerError(429, "rate_limit_exceeded").code, "provider_busy")
})
test("remote call registry is cleared only after confirmed hangup", async t => {
  const { create, sessions, store, provider } = await setup(t)
  const id = (await create()).json().session.id as string
  assert.equal(store.calls().length, 1)
  const originalHangup = provider.hangup.bind(provider)
  provider.hangup = async () => { throw new Error("network failure") }
  await sessions.interrupt(id, "network failure")
  assert.equal(store.calls().length, 1)
  provider.hangup = originalHangup
  await sessions.recover()
  assert.equal(store.calls().length, 0)
})
test("confirmed image delivery is persisted and excessive sampling is rejected", async t => {
  const { app, create, headers, store } = await setup(t)
  const id = (await create()).json().session.id as string
  assert.equal((await app.inject({ method: "POST", url: `/api/sessions/${id}/frames`, headers, payload: { image } })).statusCode, 200)
  assert.equal(store.get(id)?.frameCount, 1)
  assert.equal((await app.inject({ method: "POST", url: `/api/sessions/${id}/frames`, headers, payload: { image } })).statusCode, 429)
  assert.equal(store.get(id)?.frameCount, 1)
})
test("heartbeat expiry closes the remote call and preserves an interrupted session", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.now() })
  const { create, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  t.mock.timers.tick(61_000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(store.get(id)?.status, "interrupted")
  assert.equal(provider.hangups.length, 1)
})
test("server duration limit ends a call without relying on the browser timer", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.now() })
  const { create, provider, store } = await setup(t, { MAX_SESSION_SECONDS: "30" })
  const id = (await create()).json().session.id as string
  t.mock.timers.tick(31_000)
  await new Promise(resolve => setTimeout(resolve, 950))
  assert.equal(store.get(id)?.status, "insufficient")
  assert.equal(provider.hangups.length, 1)
})
test("reconnecting preserves existing transcript without creating another session", async t => {
  const { app, create, headers, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  await app.inject({ method: "POST", url: `/api/sessions/${id}/interrupt`, headers })
  const resumed = await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, resumeId: id } })
  assert.equal(resumed.statusCode, 200)
  assert.equal(resumed.json().session.id, id)
  assert.equal(store.get(id)?.transcript.length, 1)
})
test("pending final audio must finish before a report can be requested", async t => {
  const { app, create, headers, provider, sessions } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "conversation.item.input_audio_transcription.completed", item_id: "user-1", transcript })
  const finish = app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers }).then(result => result)
  await new Promise(resolve => setImmediate(resolve))
  await app.inject({ method: "POST", url: `/api/sessions/${id}/feedback`, headers })
  assert.equal(provider.reports, 0)
  await finish
  await sessions.settled()
  assert.equal(provider.reports, 1)
})
test("quota exhaustion during a call stops it and preserves an actionable error", async t => {
  const { create, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "response.done", response: { status: "failed", status_details: { error: { code: "credit_balance_exhausted", type: "insufficient_quota" } } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(store.get(id)?.status, "interrupted")
  assert.equal(store.get(id)?.error, SERVICE_UNAVAILABLE)
  assert.equal(provider.hangups.length, 1)
})
test("failed connection freezes elapsed time instead of counting time spent in history", async t => {
  const { create, provider, store } = await setup(t)
  provider.failConnect = true
  assert.equal((await create()).statusCode, 503)
  const session = store.all()[0]
  assert.equal(session.status, "interrupted")
  assert.ok(session.endedAt)
  assert.ok(session.endedAt - session.createdAt < 1000)
})

test("a new voice call requires an owned, prepared brief", async t => {
  const { app, headers, provider } = await setup(t)
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp } })).statusCode, 400)
  const prepared = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { text: briefText } })
  assert.equal(prepared.statusCode, 200)
  const other = await app.inject({ method: "GET", url: "/api/bootstrap" })
  const otherHeaders = { ...headers, cookie: String(other.headers["set-cookie"]).split(";")[0] }
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers: otherHeaders, payload: { sdp, briefId: prepared.json().id } })).statusCode, 400)
  assert.equal(provider.calls, 0)
})
test("brief source survives reconnect and cannot be replaced by client-supplied analysis", async t => {
  const { create, app, headers, store, provider } = await setup(t)
  const id = (await create()).json().session.id as string
  store.update(id, { stage: "questions" })
  await app.inject({ method: "POST", url: `/api/sessions/${id}/interrupt`, headers })
  await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, resumeId: id, brief: { analysis: "invented" } } })
  assert.equal(store.get(id)?.brief?.text, briefText)
  assert.equal(store.get(id)?.stage, "questions")
  assert.equal(JSON.parse(provider.history).brief.text, briefText)
  assert.deepEqual(JSON.parse(provider.history).brief.analysis.requirements, [])
  assert.equal(provider.analyses + provider.reads, 0)
})
test("expired and explicitly deleted brief drafts cannot start paid calls", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() })
  const { app, headers, provider } = await setup(t)
  const prepared = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { text: briefText } })
  await app.inject({ method: "DELETE", url: "/api/briefs", headers })
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, briefId: prepared.json().id } })).statusCode, 400)
  const again = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { text: briefText } })
  t.mock.timers.tick(86_400_001)
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, briefId: again.json().id } })).statusCode, 400)
  assert.equal(provider.calls, 0)
})
test("text is saved even if the model is unavailable, and photo OCR errors leave the draft intact", async t => {
  const { app, headers, provider, store } = await setup(t)
  provider.failBrief = true
  const save = (payload: object) => app.inject({ method: "POST", url: "/api/briefs", headers, payload })
  const saved = await save({ text: briefText })
  assert.equal(saved.statusCode, 200)
  assert.equal(provider.reads + provider.analyses, 0)
  const failed = await save({ images: [assignmentImage] })
  assert.equal(failed.statusCode, 503)
  assert.equal(failed.json().error, SERVICE_UNAVAILABLE)
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, briefId: saved.json().id } })).statusCode, 200)
  assert.equal(store.all()[0].brief?.text, briefText)
})
test("only photo OCR spends the draft model allowance", async t => {
  const { app, headers, provider } = await setup(t, { MAX_OWNER_DAILY_SESSIONS: "1" })
  const save = (payload: object) => app.inject({ method: "POST", url: "/api/briefs", headers, payload })
  assert.equal((await save({ text: "Коротко" })).statusCode, 400)
  for (let i = 0; i < 2; i++) assert.equal((await save({ images: [assignmentImage] })).statusCode, 200)
  assert.equal((await save({ images: [assignmentImage] })).statusCode, 429)
  assert.equal((await save({ text: briefText })).statusCode, 200)
  assert.equal(provider.reads, 2)
  assert.equal(provider.analyses, 0)
})
test("photo-only brief reaches the provider and persists text context, not raw files", async t => {
  const { app, headers, provider, store } = await setup(t)
  const result = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { images: [assignmentImage] } })
  assert.equal(result.statusCode, 200)
  assert.equal(provider.briefImages[0].dataUrl, assignmentImage.dataUrl)
  assert.equal(result.json().analysis.imageSources[0].text, briefText)
  assert.equal(result.body.includes("base64"), false)
  const created = await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { sdp, briefId: result.json().id } })
  assert.equal(created.statusCode, 200)
  assert.ok(provider.history.includes(briefText)); assert.equal(provider.history.includes("base64"), false)
  const persisted = JSON.stringify(store.get(created.json().session.id as string))
  assert.ok(persisted.includes(assignmentImage.name)); assert.equal(persisted.includes("base64"), false)
})
test("invalid photo content, duplicate IDs, oversized payloads and excess photos never call AI", async t => {
  const { app, headers, provider } = await setup(t)
  const bad = [
    [assignmentImage, assignmentImage], Array(4).fill(assignmentImage),
    [{ ...assignmentImage, dataUrl: image }], [{ ...assignmentImage, dataUrl: "data:image/jpeg;base64," + "A".repeat(1_200_000) }],
    [{ ...assignmentImage, dataUrl: "https://example.com/image.jpg" }],
  ]
  for (const images of bad) assert.equal((await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { text: briefText, images } })).statusCode, 400)
  const large = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { text: "a".repeat(3_700_001) } })
  assert.equal(large.statusCode, 413); assert.match(large.json().error as string, /Файлы слишком большие/)
  assert.equal(provider.analyses + provider.reads, 0)
})
test("photo analysis still requires authorization and CSRF headers", async t => {
  const { app, headers, provider } = await setup(t, { PROOF_ACCESS_CODE: "test-access-only" })
  const payload = { images: [assignmentImage] }
  assert.equal((await app.inject({ method: "POST", url: "/api/briefs", headers, payload })).statusCode, 403)
  assert.equal((await app.inject({ method: "POST", url: "/api/briefs", headers: { cookie: headers.cookie }, payload })).statusCode, 403)
  assert.equal(provider.analyses, 0)
})
test("large bounded photo batches work while the larger body limit stays scoped to briefs", async t => {
  const { app, headers, provider } = await setup(t)
  const header = Buffer.from(assignmentImage.dataUrl.split(",")[1], "base64")
  const dataUrl = "data:image/jpeg;base64," + Buffer.concat([header.subarray(0, -2), Buffer.alloc(400_000), header.subarray(-2)]).toString("base64")
  const images = [3, 4, 5].map(n => ({ ...assignmentImage, id: `00000000-0000-4000-8000-00000000000${n}`, dataUrl }))
  const response = await app.inject({ method: "POST", url: "/api/briefs", headers, payload: { images } })
  assert.equal(response.statusCode, 200); assert.equal(provider.briefImages.length, 3)
  assert.equal((await app.inject({ method: "POST", url: "/api/sessions", headers, payload: { images } })).statusCode, 413)
  assert.equal(provider.calls, 0)
})
test("stage API rejects skipping intro and allows an explicit presentation completion", async t => {
  const { create, app, headers, store } = await setup(t)
  const id = (await create()).json().session.id as string
  assert.equal((await app.inject({ method: "POST", url: `/api/sessions/${id}/stage`, headers, payload: { stage: "questions" } })).statusCode, 409)
  store.update(id, { stage: "presentation" })
  const result = await app.inject({ method: "POST", url: `/api/sessions/${id}/stage`, headers, payload: { stage: "questions" } })
  assert.equal(result.statusCode, 200)
  assert.equal(result.json().stage, "questions")
  assert.equal((await app.inject({ method: "POST", url: `/api/sessions/${id}/stage`, headers, payload: { stage: "closing" } })).statusCode, 400)
})
test("interrupted AI speech is marked and remains visibly distinct from a fully asked question", async t => {
  const { create, provider, store } = await setup(t)
  const id = (await create()).json().session.id as string
  provider.listener({ type: "response.output_audio_transcript.done", item_id: "ai-1", transcript: "Почему ты выбрал такой сценарий?" })
  provider.listener({ type: "conversation.item.truncated", item_id: "ai-1" })
  assert.equal(store.get(id)?.transcript[0].interrupted, true)
})
