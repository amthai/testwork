import { interviewerIdSchema } from "../src/lib/interviewers.js"
import type { DefenseSession } from "../src/lib/session.js"
import { minimumFeedbackWords, screenFrameContext, screenStoppedContext } from "../src/lib/roles/design-lead.js"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { hasCallCredentials, hasModelKey, type Config } from "./config.js"
import { AppError, providerError } from "./errors.js"
import type { Provider, ControlConnection } from "./provider.js"
import { Store } from "./store.js"
import { Interview } from "./methodology/interview.js"
import { briefInputSchema, type Brief, type BriefImage } from "../src/lib/methodology.js"
import { validateBriefImages } from "./brief-images.js"

const eventSchema = z.object({
  type: z.string(), speaker: interviewerIdSchema.optional(), item_id: z.string().optional(), transcript: z.string().optional(),
  item: z.object({ id: z.string(), role: z.string().optional() }).passthrough().optional(),
  error: z.object({ code: z.string().optional(), event_id: z.string().optional() }).optional(),
  response: z.object({ status: z.string().optional(), status_details: z.object({ error: z.object({ code: z.string().optional(), type: z.string().optional() }).nullable().optional() }).nullable().optional() }).optional(),
}).passthrough()
type ActiveCall = {
  interview?: Interview;
  connection?: ControlConnection; heartbeat: number; lastFrame: number;
  pending: Set<string>; starts: Map<string, number>; truncated: Set<string>; imageItems: string[]; finishing: boolean; greeted: boolean;
  frameAcks: Map<string, { resolve: () => void; reject: (error: Error) => void }>
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export class Sessions {
  private active = new Map<string, ActiveCall>()
  private finishes = new Map<string, Promise<void>>()
  private reports = new Map<string, Promise<void>>()
  private preparing = new Set<string>()
  private cleanupTimer: ReturnType<typeof setInterval>
  constructor(private store: Store, private provider: Provider, private config: Config) {
    for (const session of store.all()) {
      if (["live", "connecting", "finishing"].includes(session.status)) store.update(session.id, { status: "interrupted", endedAt: session.endedAt ?? Math.min(Date.now(), session.createdAt + config.MAX_SESSION_SECONDS * 1000), error: "Соединение было прервано. Сохранённые реплики доступны для разбора." })
    }
    store.cleanup(config.RETENTION_DAYS)
    this.cleanupTimer = setInterval(() => { void this.sweep().catch(() => process.stderr.write('{"event":"session_cleanup_failed"}\n')) }, 10_000)
    this.cleanupTimer.unref()
  }
  async prepare(owner: string, input: unknown): Promise<Brief> {
    const { text, images } = briefInputSchema.parse(input)
    validateBriefImages(images)
    if (this.preparing.has(owner)) throw new AppError(409, "brief_busy", "Задание уже сохраняется. Дождись результата.")
    this.preparing.add(owner)
    try {
      const imageSources = images.length ? await this.readBriefImages(owner, images) : []
      const brief = { id: randomUUID(), text, images: images.map(({ id, name }) => ({ id, name })), preparedAt: Date.now(),
        analysis: { task: "", requirements: [], constraints: [], ambiguities: [], imageSources } }
      this.store.saveBrief(owner, brief)
      return brief
    } finally { this.preparing.delete(owner) }
  }
  private async readBriefImages(owner: string, images: BriefImage[]) {
    if (!hasModelKey(this.config)) throw new AppError(503, "not_configured", "Распознавание фото временно недоступно.")
    if (this.preparing.size > this.config.MAX_CONCURRENT_SESSIONS) throw new AppError(409, "brief_busy", "Сервис занят. Попробуй загрузить фото ещё раз.")
    if (this.store.briefAttempts(owner) >= this.config.MAX_OWNER_DAILY_SESSIONS * 2 || this.store.briefAttempts() >= this.config.MAX_DAILY_SESSIONS * 2) throw new AppError(429, "brief_limit", "Достигнут дневной лимит распознавания фото. Можно вставить текст задания.")
    this.store.briefAttempt(owner)
    const sources = await this.provider.readBriefImages(images)
    if (sources.length !== images.length || !images.every(image => sources.some(s => s.id === image.id && (s.text.trim() || s.description.trim())))) {
      throw new AppError(422, "brief_sources", "Не удалось прочитать все фото. Замени нечёткое фото или вставь текст задания.")
    }
    return sources
  }
  async create(owner: string, sdp: string, resumeId?: string, briefId?: string) {
    if (!hasCallCredentials(this.config)) throw new AppError(503, "not_configured", "AI пока недоступен. Попробуй позже.")
    if (new Set([...this.active.keys(), ...this.store.calls().map(call => call.session_id)]).size >= this.config.MAX_CONCURRENT_SESSIONS) throw new AppError(429, "busy", "Все интервьюеры сейчас заняты. Попробуй через несколько минут.")
    if (this.config.DAILY_CALL_LIMIT_ENABLED && (this.store.attempts() >= this.config.MAX_DAILY_SESSIONS || this.store.attempts(owner) >= this.config.MAX_OWNER_DAILY_SESSIONS)) {
      throw new AppError(429, "daily_limit", "Достигнут лимит созвонов за 24 часа. Сохранённые разборы по-прежнему доступны.")
    }
    if (this.store.list(owner).some(s => this.active.has(s.id))) throw new AppError(409, "already_active", "На этом устройстве уже открыт созвон. Заверши его перед новой защитой.")
    let session = resumeId ? this.store.get(resumeId, owner) : null
    if (resumeId && (!session || session.status !== "interrupted" || Date.now() - session.createdAt >= this.config.MAX_SESSION_SECONDS * 1000)) throw new AppError(409, "cannot_resume", "Эту сессию уже нельзя продолжить. Открой разбор или начни новую защиту.")
    const brief = briefId ? this.store.brief(owner, briefId) : null
    if (!resumeId && !brief) throw new AppError(400, "brief_required", "Сначала добавь задание работодателя.")
    if (!session) { session = this.store.create(owner); session = this.store.update(session.id, { brief })! }
    const id = session.id
    const active: ActiveCall = { heartbeat: Date.now(), lastFrame: 0, pending: new Set(), starts: new Map(), truncated: new Set(), imageItems: [], finishing: false, greeted: false, frameAcks: new Map() }
    this.active.set(id, active)
    this.store.attempt(owner)
    this.store.update(id, { status: "connecting", endedAt: null, error: null })
    try {
      const history = JSON.stringify({ resumed: Boolean(resumeId), stage: session.stage, brief: session.brief, questions: session.questions, transcript: session.transcript.slice(-60) })
      active.connection = await this.provider.connect(sdp, owner, history, e => { if (this.active.get(id) === active) this.event(id, e) }, () => { if (this.active.get(id) === active) void this.interrupt(id, "Соединение с AI прервалось. Можно подключиться снова или получить разбор.") }, callId => this.store.addCall(callId, id))
      if (!active.connection.voice) this.store.addCall(active.connection.callId, id)
      if (active.finishing) { await this.endRemote(active.connection.callId); active.connection.close(); throw new AppError(409, "cancelled", "Подключение отменено.") }
      this.store.update(id, { status: "live" })
      active.interview = new Interview(id, this.store, active.connection, () => { void this.finish(id) }, () => { void this.interrupt(id, "Интервьюер не смог продолжить этот ход. Подключись снова — бриф, этап и полученные ответы сохранены.") })
      active.interview.setDeadline(session.createdAt + this.config.MAX_SESSION_SECONDS * 1000)
      return { session: this.store.get(id)!, sdp: active.connection.sdp, voiceId: active.connection.voice?.id }
    } catch (error) {
      this.active.delete(id)
      this.store.update(id, { status: "interrupted", endedAt: Date.now(), error: error instanceof AppError ? error.message : "Не удалось подключиться к AI." })
      throw error
    }
  }
  private event(id: string, raw: unknown) {
    const parsed = eventSchema.safeParse(raw)
    const active = this.active.get(id)
    if (!parsed.success || !active) return
    const event = parsed.data
    if (event.type === "response.done" && event.response?.status === "failed") {
      const failure = event.response.status_details?.error
      const mapped = providerError(502, failure?.code, failure?.type)
      if (mapped.code === "quota") {
        void this.interrupt(id, mapped.message)
        return
      }
    }
    if (["conversation.item.added", "conversation.item.created"].includes(event.type) && event.item) active.frameAcks.get(event.item.id)?.resolve()
    if (event.type === "error" && event.error?.event_id) active.frameAcks.get(event.error.event_id)?.reject(new AppError(502, "frame_rejected", "AI не принял кадр экрана. Попробуй выбрать окно снова."))
    if (event.type === "input_audio_buffer.speech_started" && event.item_id) active.starts.set(event.item_id, Date.now())
    if (event.type === "response.output_item.added" && event.item) active.starts.set(event.item.id, Date.now())
    if (event.type === "conversation.item.truncated" && event.item_id) {
      active.truncated.add(event.item_id)
      const entry = this.store.get(id)?.transcript.find(t => t.id === event.item_id)
      if (entry) this.store.transcript(id, { ...entry, interrupted: true })
    }
    if (event.type === "input_audio_buffer.committed" && event.item_id) active.pending.add(event.item_id)
    if (event.type === "conversation.item.input_audio_transcription.failed" && event.item_id) {
      active.pending.delete(event.item_id)
      this.store.update(id, { error: "Часть речи не удалось расшифровать. Разбор может быть неполным." })
    }
    const user = event.type === "conversation.item.input_audio_transcription.completed"
    const assistant = event.type === "response.output_audio_transcript.done"
    if (user && event.item_id) active.pending.delete(event.item_id)
    if ((user || assistant) && event.item_id && event.transcript?.trim()) {
      this.store.transcript(id, { id: event.item_id, role: user ? "user" : "assistant", ...(assistant ? { speaker: event.speaker ?? "design_lead" } : {}), text: event.transcript.trim().slice(0, 12000), at: active.starts.get(event.item_id) ?? Date.now(), ...(active.truncated.has(event.item_id) ? { interrupted: true } : {}) })
      active.pending.delete(event.item_id)
    }
    if (!active.finishing) {
      try { active.interview?.event(raw) } catch { void this.interrupt(id, "Не удалось продолжить разговор. Подключись снова — ответы сохранены.") }
    }
  }
  voice(id: string, voiceId: unknown) {
    const active = this.active.get(id)
    const voice = active?.connection?.voice
    if (!voice || active?.finishing || voice.id !== voiceId) throw new AppError(409, "disconnected", "Голосовое соединение закрыто.")
    return voice
  }
  expertSpeech(id: string) {
    const active = this.active.get(id)
    if (!active?.connection?.expertSpeech || active.finishing) throw new AppError(409, "disconnected", "Голосовое соединение закрыто.")
    return active.connection.expertSpeech
  }
  ready(id: string) {
    const active = this.active.get(id)
    if (!active?.connection) throw new AppError(409, "disconnected", "Соединение потеряно.")
    active.heartbeat = Date.now()
    if (!active.greeted) { active.interview?.ready(); active.greeted = true }
  }
  advance(id: string, stage: "questions" | "wrap_up") {
    const active = this.active.get(id)
    if (!active?.interview || active.finishing) throw new AppError(409, "disconnected", "Сначала восстанови соединение с AI.")
    try { active.interview.advance(stage) } catch { throw new AppError(409, "stage", "Этот этап пока недоступен. Дождись обновления состояния созвона.") }
    return this.store.get(id)!
  }
  heartbeat(id: string) { const active = this.active.get(id); if (active) active.heartbeat = Date.now() }
  async frame(id: string, image: string) {
    const active = this.active.get(id)
    if (!active?.connection || active.finishing) throw new AppError(409, "disconnected", "Экран пока не передаётся: восстанови соединение с AI.")
    if (Date.now() - active.lastFrame < 4500) throw new AppError(429, "frame_rate", "Кадр отправлен слишком рано.")
    const frameId = `frm_${randomUUID().replaceAll("-", "").slice(0, 24)}`
    active.lastFrame = Date.now()
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { active.frameAcks.delete(frameId); reject(new AppError(502, "frame_timeout", "AI пока не подтвердил получение экрана. Повторим передачу автоматически.")) }, 7000)
      const cleanup = () => { clearTimeout(timeout); active.frameAcks.delete(frameId) }
      active.frameAcks.set(frameId, { resolve: () => { cleanup(); resolve() }, reject: error => { cleanup(); reject(error) } })
      try { active.connection!.send({ type: "conversation.item.create", event_id: frameId, item: { id: frameId, type: "message", role: "user", content: [{ type: "input_text", text: screenFrameContext }, { type: "input_image", image_url: image }] } }) }
      catch (error) { cleanup(); reject(error) }
    })
    active.imageItems.push(frameId)
    // Keep visual context bounded while preserving the permanent sample for the report.
    if (active.imageItems.length > 6) active.connection.send({ type: "conversation.item.delete", item_id: active.imageItems.shift() })
    this.store.addFrame(id, { id: frameId, at: Date.now(), image })
    return { frameCount: this.store.get(id)!.frameCount }
  }
  screenStopped(id: string) {
    this.active.get(id)?.connection?.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: screenStoppedContext }] } })
  }
  async interrupt(id: string, message: string) {
    const active = this.active.get(id)
    if (!active || active.finishing) return
    active.finishing = true
    active.interview?.close()
    active.connection?.expertSpeech?.cancel()
    for (const ack of active.frameAcks.values()) ack.reject(new AppError(409, "disconnected", "Передача экрана остановлена."))
    if (active.connection) { await this.endRemote(active.connection.callId); active.connection.close() }
    this.active.delete(id)
    this.store.update(id, { status: "interrupted", endedAt: Date.now(), error: message })
  }
  async finish(id: string, farewell = false) {
    const call = this.active.get(id)
    if (farewell && call?.greeted && !call.finishing && call.interview) {
      try { await call.interview.farewellBeforeExit() } catch { /* A lost voice connection still permits the saved report. */ }
    }
    const pending = this.finishes.get(id)
    if (pending) return pending
    const task = this.finishNow(id).finally(() => this.finishes.delete(id))
    this.finishes.set(id, task)
    return task
  }
  private async finishNow(id: string) {
    const session = this.store.get(id)
    if (!session || ["finishing", "complete", "insufficient"].includes(session.status)) return
    this.store.update(id, { status: "finishing", endedAt: session.endedAt ?? Date.now() })
    const active = this.active.get(id)
    if (active && !active.finishing) {
      active.finishing = true
      active.interview?.close()
      if (active.connection) {
        try {
          active.connection.send({ type: "session.update", session: { type: "realtime", audio: { input: { turn_detection: null } } } })
          active.connection.send({ type: "response.cancel" })
          active.connection.send({ type: "input_audio_buffer.commit" })
          await delay(800)
          const deadline = Date.now() + 6000
          while (active.pending.size && Date.now() < deadline) await delay(150)
        } catch { /* The report can still use completed transcripts. */ }
        await this.endRemote(active.connection.callId)
        active.connection.close()
      }
      this.active.delete(id)
    }
    this.generate(id)
  }
  generate(id: string) {
    if (this.reports.has(id) || this.active.has(id)) return
    const session = this.store.get(id)
    if (!session || session.status === "complete") return
    const words = session.transcript.filter(t => t.role === "user").map(t => t.text).join(" ").trim().split(/\s+/).filter(Boolean).length
    if (words < minimumFeedbackWords) { this.store.update(id, { status: "insufficient", endedAt: session.endedAt ?? Date.now(), error: "Для содержательного разбора пока мало речи. В следующей защите расскажи о задаче и хотя бы одном своём решении." }); return }
    this.store.update(id, { status: "finishing", endedAt: session.endedAt ?? Date.now(), error: null })
    const task = this.report(this.store.get(id)!).then(feedback => {
      this.store.update(id, { status: "complete", feedback, error: null })
    }).catch((error: unknown) => {
      this.store.update(id, { status: "failed", error: error instanceof AppError ? error.message : "Не удалось подготовить разбор. Расшифровка сохранена — можно повторить запрос." })
    }).finally(() => this.reports.delete(id))
    this.reports.set(id, task)
  }
  private async report(session: DefenseSession) {
    const brief = session.brief
    if (brief && !brief.analysis.requirements.length) {
      // A report can still use the original assignment and transcript if extracting requirements fails.
      try {
        const analysis = await this.provider.analyzeBrief(brief.text, brief.analysis.imageSources)
        session = this.store.update(session.id, { brief: { ...brief, analysis } }) ?? session
      } catch { /* Keep the original sources for the report. */ }
    }
    return this.provider.feedback(session, this.store.frames(session.id))
  }
  async settled() { await Promise.all(this.finishes.values()); await Promise.all(this.reports.values()) }
  private async endRemote(callId: string) {
    try { await this.provider.hangup(callId); this.store.deleteCall(callId) }
    catch { process.stderr.write('{"event":"hangup_retry_pending"}\n') }
  }
  async recover() {
    for (const call of this.store.calls()) if (!this.active.has(call.session_id)) await this.endRemote(call.id)
  }
  private async sweep() {
    await this.recover()
    for (const [id, active] of this.active) {
      if (active.finishing) continue
      const session = this.store.get(id)
      if (session && Date.now() - session.createdAt >= this.config.MAX_SESSION_SECONDS * 1000) await this.finish(id, Date.now() - active.heartbeat < 30_000)
      else if (Date.now() - active.heartbeat > 60_000) await this.interrupt(id, "Связь с вкладкой потеряна. Сохранённая часть защиты доступна для разбора.")
    }
    this.store.cleanup(this.config.RETENTION_DAYS)
  }
  async close() { clearInterval(this.cleanupTimer); await Promise.all([...this.active.keys()].map(id => this.interrupt(id, "Сервис перезапущен. Сохранённые реплики доступны."))); await this.settled() }
}
