import { z } from "zod"
import { interviewerIdSchema, type InterviewerId } from "./interviewers"
import { ExpertPlayback } from "./expert-playback"
import { api } from "./api"
import type { DefenseSession } from "./session"

export type AiState = "connecting" | "listening" | "thinking" | "speaking" | "disconnected"
export type RealtimeEvent = { type: "speaker"; speaker: InterviewerId } | { type: "state"; state: AiState } | { type: "audio-blocked"; blocked: boolean } | { type: "error"; message: string }
const eventSchema = z.object({
  type: z.string(), item_id: z.string().optional(), item: z.object({ id: z.string() }).optional(),
  response_id: z.string().optional(), error: z.object({ code: z.string().optional() }).optional(),
  response: z.object({ id: z.string().optional(), status: z.string().optional(), metadata: z.object({
    speaker: interviewerIdSchema.optional(), mode: z.string().optional(),
  }).nullish() }).optional(),
})

export class RealtimeTransport {
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private audio: HTMLAudioElement | null = null
  private experts?: ExpertPlayback
  private abort: AbortController | null = null
  private intentionalClose = false
  private lossTimer: ReturnType<typeof setTimeout> | null = null
  constructor(private onEvent: (event: RealtimeEvent) => void) {}
  async connect(stream: MediaStream, resumeId?: string, briefId?: string): Promise<DefenseSession> {
    this.disconnect()
    this.intentionalClose = false
    const abort = new AbortController()
    this.abort = abort
    this.onEvent({ type: "state", state: "connecting" })
    const pc = new RTCPeerConnection()
    this.pc = pc
    const audio = new Audio()
    audio.autoplay = true
    this.audio = audio
    pc.ontrack = event => { audio.srcObject = event.streams[0] ?? new MediaStream([event.track]); void this.playAudio() }
    const track = stream.getAudioTracks().find(t => t.readyState === "live")
    if (!track) { this.disconnect(); throw new Error("Микрофон отключён. Подключи его снова.") }
    pc.addTrack(track, stream)
    const channel = pc.createDataChannel("oai-events")
    this.channel = channel
    const speakers = new Map<string, InterviewerId>()
    channel.onmessage = message => {
      if (this.channel !== channel) return
      let raw: unknown
      try { raw = JSON.parse(String(message.data)) } catch { return }
      const parsed = eventSchema.safeParse(raw)
      if (!parsed.success) return
      const event = parsed.data
      if ((event.type === "conversation.item.added" || event.type === "conversation.item.created") && event.item && /^expert_[0-9a-f]{24}$/.test(event.item.id)) {
        void this.experts?.receive(event.item.id)
      }
      if (event.type === "conversation.item.deleted" && event.item_id) this.experts?.stop(event.item_id)
      if (event.type === "input_audio_buffer.speech_started") this.experts?.stop()
      if (event.type === "response.done" && event.response?.status === "failed") {
        this.onEvent({ type: "state", state: "listening" })
        this.onEvent({ type: "error", message: "Интервьюер не смог ответить. Можно подключиться снова или завершить защиту — полученные реплики сохранены." })
      }
      if (event.type === "response.created") {
        const metadata = event.response?.metadata
        if (event.response?.id && metadata?.speaker && ["intro", "speak", "close"].includes(metadata.mode ?? "")) speakers.set(event.response.id, metadata.speaker)
        this.onEvent({ type: "state", state: "thinking" })
      }
      if (event.type === "output_audio_buffer.started") {
        this.experts?.stop()
        this.onEvent({ type: "speaker", speaker: speakers.get(event.response_id ?? "") ?? "design_lead" })
        this.onEvent({ type: "state", state: "speaking" })
      }
      if (event.type === "output_audio_buffer.stopped" && event.response_id) speakers.delete(event.response_id)
      if (["input_audio_buffer.speech_started", "output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(event.type)) this.onEvent({ type: "state", state: "listening" })
      if (event.type === "error" && !["input_audio_buffer_commit_empty", "response_cancel_not_active", "conversation_already_has_active_response"].includes(event.error?.code ?? "")) this.onEvent({ type: "error", message: "AI не смог обработать часть сессии. Если ответ не приходит, подключись снова." })
    }
    const lost = () => {
      if (this.intentionalClose || this.channel !== channel) return
      this.experts?.stop()
      this.onEvent({ type: "state", state: "disconnected" })
    }
    channel.onclose = lost
    pc.onconnectionstatechange = () => {
      if (this.lossTimer) clearTimeout(this.lossTimer)
      if (pc.connectionState === "failed" || pc.connectionState === "closed") lost()
      if (pc.connectionState === "disconnected") this.lossTimer = setTimeout(lost, 5000)
      if (pc.connectionState === "connected") this.onEvent({ type: "state", state: "listening" })
    }
    let session: DefenseSession | undefined
    const connectTimeout = setTimeout(() => abort.abort(), 40_000)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const created = await api.create(offer.sdp!, abort.signal, resumeId, briefId)
      session = created.session
      if (abort.signal.aborted) throw new Error("Подключение отменено.")
      this.experts = new ExpertPlayback(session.id, this.onEvent)
      await pc.setRemoteDescription({ type: "answer", sdp: created.sdp })
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { cleanup(); reject(new Error("Не удалось установить голосовую связь. Попробуй другую сеть и подключись снова.")) }, 15_000)
        const cleanup = () => { clearTimeout(timeout); channel.removeEventListener("open", opened); abort.signal.removeEventListener("abort", cancelled) }
        const opened = () => { cleanup(); resolve() }
        const cancelled = () => { cleanup(); reject(new Error("Подключение отменено.")) }
        channel.addEventListener("open", opened, { once: true })
        abort.signal.addEventListener("abort", cancelled, { once: true })
        if (channel.readyState === "open") opened()
        else if (abort.signal.aborted) cancelled()
      })
      await api.ready(session.id)
      return session
    } catch (error) {
      this.disconnect()
      if (session) void api.interrupt(session.id).catch(() => undefined)
      throw error
    } finally { clearTimeout(connectTimeout) }
  }
  async playAudio() {
    if (await this.experts?.retry()) return
    if (!this.audio?.srcObject) return
    try { await this.audio.play(); this.onEvent({ type: "audio-blocked", blocked: false }) }
    catch { this.onEvent({ type: "audio-blocked", blocked: true }) }
  }
  replaceMicrophone(stream: MediaStream) {
    const track = stream.getAudioTracks()[0]
    const sender = this.pc?.getSenders().find(s => s.track?.kind === "audio")
    if (sender && track) return sender.replaceTrack(track)
    return Promise.resolve()
  }
  stopOutput() {
    this.experts?.stop()
    this.experts = undefined
    if (this.audio) this.audio.muted = true
  }
  disconnect() {
    this.intentionalClose = true
    this.stopOutput()
    this.abort?.abort(); this.abort = null
    if (this.lossTimer) clearTimeout(this.lossTimer)
    this.lossTimer = null
    this.channel?.close(); this.channel = null
    this.pc?.close(); this.pc = null
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; this.audio = null }
  }
}
