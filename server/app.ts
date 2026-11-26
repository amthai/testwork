import { streamType } from "./speech-stream.js"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import Fastify, { type FastifyRequest } from "fastify"
import cookie from "@fastify/cookie"
import staticFiles from "@fastify/static"
import rateLimit from "@fastify/rate-limit"
import { z } from "zod"
import { hasCallCredentials, type Config } from "./config.js"
import { Store } from "./store.js"
import { Sessions } from "./sessions.js"
import { createProvider } from "./deepseek.js"
import { speechReady } from "./local-voice.js"
import type { Provider } from "./provider.js"
import { AppError } from "./errors.js"
import { publicServiceMessage } from "../src/lib/service-errors.js"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const idSchema = z.object({ id: z.string().uuid() })
const offerSchema = z.object({ sdp: z.string().min(30).max(65_000).startsWith("v=0"), resumeId: z.string().uuid().optional(), briefId: z.string().uuid().optional() })

export async function buildApp(config: Config, options: { store?: Store; provider?: Provider; serveStatic?: boolean } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 400_000, trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS, requestTimeout: 40_000 })
  const store = options.store ?? new Store(resolve(config.DATA_DIR, "proof.sqlite"))
  const sessions = new Sessions(store, options.provider ?? createProvider(config), config)
  await sessions.recover()
  await app.register(cookie)
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" })

  const owner = (request: FastifyRequest) => {
    const token = request.cookies.proof_owner
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, "no_session", "Обнови страницу, чтобы начать сессию.")
    const id = hash(token)
    const record = store.owner(id)
    if (!record) throw new AppError(401, "expired", "Сессия устройства истекла. Обнови страницу.")
    return { id, authorized: !config.PROOF_ACCESS_CODE || record.authorized === 1 }
  }
  const authorized = (request: FastifyRequest) => {
    const identity = owner(request)
    if (!identity.authorized) throw new AppError(403, "access_required", "Введи код доступа перед началом защиты.")
    return identity.id
  }
  const ownedSession = (request: FastifyRequest) => {
    const identity = owner(request)
    const { id } = idSchema.parse(request.params)
    const session = store.get(id, identity.id)
    if (!session) throw new AppError(404, "not_found", "Сессия не найдена или срок хранения истёк.")
    return session
  }
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff")
    reply.header("Referrer-Policy", "same-origin")
    reply.header("Permissions-Policy", "camera=(), microphone=(self), display-capture=(self), geolocation=()")
    reply.header("X-Frame-Options", "DENY")
    if (config.NODE_ENV === "production") reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store")
      const origin = request.headers.origin
      if (origin && origin !== new URL(config.APP_ORIGIN).origin) throw new AppError(403, "origin", "Запрос с другого сайта запрещён.")
      if (!["GET", "HEAD"].includes(request.method) && request.headers["x-proof-client"] !== "1") throw new AppError(403, "client", "Обнови страницу и повтори действие.")
    }
  })
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ code: "validation", error: "Некорректные данные запроса. Обнови страницу и повтори действие." })
    if (error instanceof AppError) return reply.code(error.statusCode).send({ code: error.code, error: publicServiceMessage(error.message, error.code) })
    const status = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500
    // Only operational metadata; no request bodies, cookies, transcripts, SDP, or credentials.
    if (status >= 500) process.stderr.write(JSON.stringify({ event: "request_failed", requestId: request.id, status }) + "\n")
    return reply.code(status).send({ code: "request_failed", error: status === 429 ? "Слишком много запросов. Подожди немного и попробуй снова." : status === 413 ? "Файлы слишком большие. Уменьши размер фото и попробуй снова." : "Не удалось выполнить действие. Попробуй снова." })
  })
  app.get("/health", async () => ({ status: "ok" }))
  app.get("/health/ready", async (_request, reply) => {
    const ready = hasCallCredentials(config) && (config.PROOF_PROVIDER === "openai" || await speechReady(config.SPEECH_URL))
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "unconfigured", database: "ok" })
  })
  app.get("/api/bootstrap", async (request, reply) => {
    let identity: { id: string; authorized: boolean }
    try { identity = owner(request) } catch {
      const token = randomBytes(32).toString("hex")
      const id = hash(token)
      store.addOwner(id)
      reply.setCookie("proof_owner", token, { httpOnly: true, secure: config.APP_ORIGIN.startsWith("https://"), sameSite: "strict", path: "/", maxAge: config.RETENTION_DAYS * 86400 })
      identity = { id, authorized: !config.PROOF_ACCESS_CODE }
    }
    return { configured: hasCallCredentials(config), provider: config.PROOF_PROVIDER, ttsProvider: config.PROOF_PROVIDER === "openai" ? "openai" : config.PROOF_TTS_PROVIDER, accessRequired: Boolean(config.PROOF_ACCESS_CODE), authorized: identity.authorized, maxDurationSeconds: config.MAX_SESSION_SECONDS, retentionDays: config.RETENTION_DAYS }
  })
  app.post("/api/access", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async request => {
    const identity = owner(request)
    const { code } = z.object({ code: z.string().max(200) }).parse(request.body)
    if (!timingSafeEqual(Buffer.from(hash(code)), Buffer.from(hash(config.PROOF_ACCESS_CODE)))) throw new AppError(403, "invalid_code", "Код не подошёл. Проверь его и попробуй снова.")
    store.authorize(identity.id)
    return { authorized: true }
  })
  app.get("/api/sessions", async request => ({ sessions: store.list(owner(request).id) }))
  app.post("/api/briefs", { bodyLimit: 3_700_000, config: { rateLimit: { max: 8, timeWindow: "1 hour" } } }, async request => {
    const identity = authorized(request)
    return sessions.prepare(identity, request.body)
  })
  app.delete("/api/briefs", async request => { store.deleteBrief(owner(request).id); return { ok: true } })
  app.post("/api/sessions", { config: { rateLimit: { max: 8, timeWindow: "1 hour" } } }, async request => {
    const identity = authorized(request)
    const offer = (config.PROOF_PROVIDER === "deepseek" ? offerSchema.extend({ sdp: z.literal("").default("") }) : offerSchema).parse(request.body)
    return sessions.create(identity, offer.sdp, offer.resumeId, offer.briefId)
  })
  app.get("/api/sessions/:id", async request => ownedSession(request))
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 960_000 }, (_request, body, done) => done(null, body))
  const voice = (request: FastifyRequest) => sessions.voice(ownedSession(request).id, request.headers["x-proof-voice"])
  const voiceTurn = z.object({ turn: z.string().uuid() })
  app.get("/api/sessions/:id/voice", async (request, reply) => {
    const { after, known } = z.object({ after: z.coerce.number().int().min(-1), known: z.string().uuid().optional() }).parse(request.query)
    const call = voice(request)
    const update = await call.poll(after)
    if (call.format && update.audioId && update.audioId !== known) {
      const stream = call.stream(update.audioId)
      if (stream) return reply.type(streamType).header("X-Accel-Buffering", "no").header("X-Proof-Revision", update.revision).header("X-Proof-Audio", update.audioId).header("X-Proof-Speaker", update.speaker ?? "design_lead").send(stream)
    }
    return update
  })
  const expertTurn = z.object({ turn: z.string().regex(/^expert_[a-f0-9]{24}$/) })
  app.get("/api/sessions/:id/expert-audio/:turn", async (request, reply) => {
    const { turn } = expertTurn.parse(request.params)
    const speech = sessions.expertSpeech(ownedSession(request).id).audio(turn)
    return reply.type("audio/mpeg").header("X-Proof-Speaker", speech.speaker).send(speech.audio)
  })
  app.post("/api/sessions/:id/expert-audio/:turn/playback", async request => {
    const { turn } = expertTurn.parse(request.params)
    const { state } = z.object({ state: z.enum(["started", "ended", "interrupted", "failed"]) }).strict().parse(request.body)
    sessions.expertSpeech(ownedSession(request).id).playback(turn, state)
    return { ok: true }
  })
  app.get("/api/sessions/:id/voice/:turn", async (request, reply) => {
    const { turn } = voiceTurn.parse(request.params)
    return reply.type("audio/wav").send(voice(request).audio(turn))
  })
  app.post("/api/sessions/:id/voice/:turn/start", async request => {
    const { turn } = voiceTurn.parse(request.params)
    voice(request).start(turn)
    return { ok: true }
  })
  app.post("/api/sessions/:id/voice/:turn/playback", async request => {
    const { turn } = voiceTurn.parse(request.params)
    const { state } = z.object({ state: z.enum(["started", "ended", "interrupted"]) }).parse(request.body)
    voice(request).playback(turn, state)
    return { ok: true }
  })
  app.post("/api/sessions/:id/voice/:turn/probe", { bodyLimit: 64000 }, async request => {
    const { turn } = voiceTurn.parse(request.params)
    if (!Buffer.isBuffer(request.body) || !request.body.length || request.body.length % 2) throw new AppError(400, "audio_format", "Не удалось прочитать начало реплики.")
    await voice(request).probe(turn, request.body)
    return { ok: true }
  })
  app.post("/api/sessions/:id/voice/:turn/draft", { bodyLimit: 960_000 }, async request => {
    const { turn } = voiceTurn.parse(request.params)
    if (!Buffer.isBuffer(request.body) || !request.body.length || request.body.length % 2) throw new AppError(400, "audio_format", "Некорректный звук.")
    return { shortQuestion: await voice(request).draft(turn, request.body) }
  })
  app.post("/api/sessions/:id/voice/:turn/commit", async request => {
    const { turn } = voiceTurn.parse(request.params)
    await voice(request).transcribe(turn)
    return { ok: true }
  })
  app.post("/api/sessions/:id/voice/:turn/speech", { bodyLimit: 960_000 }, async request => {
    const { turn } = voiceTurn.parse(request.params)
    const pcm = request.body
    if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length % 2) throw new AppError(400, "audio_format", "Не удалось прочитать звук микрофона.")
    await voice(request).transcribe(turn, pcm)
    return { ok: true }
  })
  app.post("/api/sessions/:id/ready", async request => {
    const session = ownedSession(request)
    if (request.body) {
      const { format } = z.object({ format: z.enum(["opus", "wav"]) }).parse(request.body)
      voice(request).format = format
    }
    sessions.ready(session.id)
    return { ok: true }
  })
  app.post("/api/sessions/:id/stage", async request => {
    const session = ownedSession(request)
    const { stage } = z.object({ stage: z.enum(["questions", "wrap_up"]) }).parse(request.body)
    return sessions.advance(session.id, stage)
  })
  app.post("/api/sessions/:id/heartbeat", async request => { const session = ownedSession(request); sessions.heartbeat(session.id); return { status: session.status } })
  app.post("/api/sessions/:id/frames", async request => {
    const session = ownedSession(request)
    const { image } = z.object({ image: z.string().max(360_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/) }).parse(request.body)
    const bytes = Buffer.from(image.slice("data:image/jpeg;base64,".length), "base64")
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new AppError(400, "invalid_image", "Не удалось прочитать кадр экрана.")
    return sessions.frame(session.id, image)
  })
  app.post("/api/sessions/:id/screen-stopped", async request => { sessions.screenStopped(ownedSession(request).id); return { ok: true } })
  app.post("/api/sessions/:id/interrupt", async request => { await sessions.interrupt(ownedSession(request).id, "Соединение прервано. Можно продолжить защиту или получить разбор."); return { ok: true } })
  app.post("/api/sessions/:id/finish", async request => {
    const session = ownedSession(request)
    const options = z.object({ farewell: z.boolean().optional() }).parse(request.body ?? {})
    await sessions.finish(session.id, options.farewell)
    return store.get(session.id)
  })
  app.post("/api/sessions/:id/feedback", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async request => {
    const session = ownedSession(request)
    if (!["failed", "interrupted", "finishing", "complete", "insufficient"].includes(session.status)) throw new AppError(409, "in_call", "Сначала заверши созвон.")
    sessions.generate(session.id)
    return store.get(session.id)
  })
  app.delete("/api/sessions/:id", async request => { const session = ownedSession(request); await sessions.interrupt(session.id, "Сессия удалена."); store.delete(session.id); return { ok: true } })
  if (options.serveStatic !== false && existsSync(resolve("dist/index.html"))) {
    await app.register(staticFiles, {
      root: resolve("dist"), wildcard: false, cacheControl: true, maxAge: "1d",
      setHeaders(reply, path) {
        if (path.endsWith("index.html")) reply.header("Cache-Control", "no-cache")
      },
    })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.method !== "GET" || request.url.includes(".")) return reply.code(404).send({ error: "Не найдено" })
      return reply.header("Cache-Control", "no-cache").sendFile("index.html")
    })
  }
  app.addHook("onClose", async () => { await sessions.close(); if (!options.store) store.close() })
  return { app, store, sessions }
}
