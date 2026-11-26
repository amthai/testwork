import { voiceFrames } from "./voice-frames"
import { z } from "zod"
import { api } from "./api"
import type { RealtimeEvent } from "./realtime"
import { interviewerIdSchema, type InterviewerId } from "./interviewers"

const updateSchema = z.object({ revision: z.number(), state: z.enum(["thinking", "listening", "speaking"]), audioId: z.string().uuid().nullable(), speaker: interviewerIdSchema.nullish() })
type CaptureMessage = { type: "start" | "flushed" } | { type: "speech" | "probe" | "draft"; pcm: ArrayBuffer; draftCurrent?: boolean; serial?: number }

export class LocalTransport {
  private abort = new AbortController()
  private context?: AudioContext
  private microphone?: MediaStreamAudioSourceNode
  private capture?: AudioWorkletNode
  private nodes = new Set<AudioBufferSourceNode>()
  private queued: AudioBuffer[] = []
  private playAt = 0
  private audioComplete = false
  private streamAbort?: AbortController
  private playingId?: string
  private speaker: InterviewerId = "design_lead"
  private capturing = false
  private playbackStarted = false
  private sessionId?: string
  private voiceId?: string
  private inputId?: string
  private draftId?: string
  private sends: Promise<void> = Promise.resolve()
  private flushAck?: () => void
  private outputStopped = false
  private failed = false
  constructor(private notify: (e: RealtimeEvent) => void) {}
  async connect(stream: MediaStream, resumeId?: string, briefId?: string) {
    this.notify({ type: "state", state: "connecting" })
    try {
      if (typeof AudioContext === "undefined" || typeof AudioWorkletNode === "undefined") throw new Error("Для голосового созвона нужен браузер с поддержкой Web Audio и защищённое соединение.")
      this.context = new AudioContext()
      this.context.onstatechange = () => {
        if (this.abort.signal.aborted) return
        const running = this.context?.state === "running"
        this.notify({ type: "audio-blocked", blocked: !running })
        if (running) this.startPlayback()
      }
      void this.context.resume().catch(() => this.notify({ type: "audio-blocked", blocked: true }))
      await this.context.audioWorklet.addModule(import.meta.env.BASE_URL + "proof-mic.js?v=5")
      const created = await api.create("", this.abort.signal, resumeId, briefId)
      this.sessionId = created.session.id
      this.voiceId = created.voiceId
      if (!this.voiceId) throw new Error("Настройки голосовой связи изменились. Обнови страницу.")
      this.capture = new AudioWorkletNode(this.context, "proof-microphone", { numberOfInputs: 2 })
      this.capture.port.onmessage = ({ data }: MessageEvent<CaptureMessage>) => this.onCapture(data)
      this.capture.connect(this.context.destination)
      await this.replaceMicrophone(stream)
      const format = document.createElement("audio").canPlayType('audio/ogg; codecs="opus"') ? "opus" : "wav"
      const ready = await fetch(`/api/sessions/${this.sessionId}/ready`, {
        method: "POST", credentials: "same-origin", signal: this.abort.signal,
        headers: { "Content-Type": "application/json", "X-Proof-Client": "1", "X-Proof-Voice": this.voiceId },
        body: JSON.stringify({ format }),
      })
      if (!ready.ok) throw new Error("Не удалось запустить голосовой созвон.")
      this.setCapture(true)
      this.abort.signal.throwIfAborted()
      void this.poll().catch(() => this.lost())
      return created.session
    } catch (e) {
      if (this.sessionId) void api.interrupt(this.sessionId).catch(() => undefined)
      this.disconnect()
      if (e instanceof DOMException) throw new Error("Не удалось включить звук. Проверь доступ к микрофону и подключись снова.")
      throw e
    }
  }
  async replaceMicrophone(stream: MediaStream) {
    if (!this.context || !this.capture || this.microphone?.mediaStream === stream) return
    if (!stream.getAudioTracks().some(t => t.readyState === "live")) throw new Error("Подключи микрофон снова.")
    this.microphone?.disconnect()
    this.microphone = this.context.createMediaStreamSource(stream)
    this.microphone.connect(this.capture)
  }
  private request(path: string, method = "GET", body?: BodyInit, contentType?: string) {
    return fetch(`/api/sessions/${this.sessionId}/voice${path}`, {
      method, credentials: "same-origin", body,
      headers: { "X-Proof-Voice": this.voiceId!, "X-Proof-Client": "1", ...(contentType ? { "Content-Type": contentType } : {}) },
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(path.startsWith("?after=") ? 65_000 : 22_000)]),
    })
  }
  private async post(path: string, body?: BodyInit, type?: string) {
    if (!(await this.request(path, "POST", body, type)).ok) throw new Error("Не удалось передать реплику. Подключись снова.")
  }
  private enqueue(job: () => Promise<void>) {
    this.sends = this.sends.then(async () => { if (!this.failed && !this.abort.signal.aborted) await job() }).catch(() => this.lost())
  }
  private onCapture(data: CaptureMessage) {
    if (data.type === "flushed") { this.flushAck?.(); return }
    if (this.failed || this.abort.signal.aborted) return
    if (data.type === "start") {
      if (!this.capturing) return
      const id = crypto.randomUUID()
      this.inputId = id
      this.enqueue(() => this.post(`/${id}/start`))
    } else if (data.type === "probe" && this.inputId) {
      const id = this.inputId
      this.enqueue(() => this.post(`/${id}/probe`, data.pcm, "application/octet-stream"))
    } else if (data.type === "draft" && this.inputId) {
      const id = this.inputId
      this.enqueue(async () => {
        const response = await this.request(`/${id}/draft`, "POST", data.pcm, "application/octet-stream")
        if (response.ok) {
          this.draftId = id
          const result = z.object({ shortQuestion: z.boolean() }).parse(await response.json())
          if (result.shortQuestion && data.serial !== undefined && this.inputId === id) this.capture?.port.postMessage({ shortQuestion: data.serial })
        }
      })
    } else if (data.type === "speech" && this.inputId) {
      const id = this.inputId
      this.inputId = undefined
      this.enqueue(async () => {
        if (data.draftCurrent && this.draftId === id) await this.post(`/${id}/commit`)
        else await this.post(`/${id}/speech`, data.pcm, "application/octet-stream")
        this.draftId = undefined
      })
    }
  }
  async flush() {
    if (this.capture && this.context?.state === "running" && !this.failed) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 1500)
        this.flushAck = () => { clearTimeout(timer); resolve() }
        this.capture!.port.postMessage("flush")
      })
      this.flushAck = undefined
    }
    await this.sends
  }
  private setCapture(listen: boolean) {
    if (listen === this.capturing) return
    this.capturing = listen
    this.capture?.port.postMessage(listen ? "listen" : "pause")
  }
  private async poll() {
    let revision = -1
    while (!this.abort.signal.aborted && !this.failed && !this.outputStopped) {
      const known = this.playingId ? "&known=" + this.playingId : ""
      const res = await this.request("?after=" + revision + known)
      if (this.outputStopped) { await res.body?.cancel(); return }
      if (res.status === 409 && this.sessionId) {
        // The server retires the voice channel after the last audible buffer.
        const session = await api.session(this.sessionId)
        if (["finishing", "complete", "failed", "insufficient"].includes(session.status)) return
      }
      if (!res.ok) throw new Error("Соединение закрыто.")
      if (res.headers.get("content-type")?.includes("application/x-proof-speech")) {
        const id = z.string().uuid().parse(res.headers.get("x-proof-audio"))
        revision = z.coerce.number().int().parse(res.headers.get("x-proof-revision"))
        this.capture?.port.postMessage("overlap")
        const speaker = interviewerIdSchema.parse(res.headers.get("x-proof-speaker") ?? "design_lead")
        this.begin(id, speaker)
        const controller = new AbortController()
        this.streamAbort = controller
        void this.consume(id, res, controller.signal).catch(() => {
          if (!controller.signal.aborted && this.playingId === id) this.lost()
        })
        continue
      }
      const update = updateSchema.parse(await res.json())
      if (this.outputStopped) return
      revision = update.revision
      this.capture?.port.postMessage(update.state === "listening" ? "clear" : "overlap")
      if (!update.audioId) {
        this.stopPlayback()
        this.notify({ type: "state", state: update.state })
      } else if (update.audioId !== this.playingId) {
        this.begin(update.audioId, update.speaker ?? "design_lead")
        const id = update.audioId
        void this.legacyAudio(id).catch(() => { if (this.playingId === id) this.lost() })
      }
    }
  }
  private begin(id: string, speaker: InterviewerId) {
    this.stopPlayback()
    this.playingId = id
    this.speaker = speaker
    this.notify({ type: "state", state: "thinking" })
  }
  private async consume(id: string, response: Response, signal: AbortSignal) {
    if (!response.body) throw new Error("Не удалось получить звук.")
    for await (const packet of voiceFrames(response.body)) {
      if (signal.aborted || this.playingId !== id) return
      if (!packet) { this.stopPlayback(); this.playingId = id; return }
      await this.decode(id, packet, signal)
    }
    if (signal.aborted || this.playingId !== id) return
    this.audioComplete = true
    this.maybeEnded()
  }
  private async legacyAudio(id: string) {
    const res = await this.request("/" + id)
    if (res.status === 409) return
    if (!res.ok) throw new Error("Не удалось загрузить голос.")
    await this.decode(id, await res.arrayBuffer())
    if (this.playingId === id) { this.audioComplete = true; this.maybeEnded() }
  }
  private async decode(id: string, packet: ArrayBuffer, signal?: AbortSignal) {
    const decoded = await this.context!.decodeAudioData(packet)
    if (this.abort.signal.aborted || this.playingId !== id || signal?.aborted) return
    this.queued.push(decoded)
    this.startPlayback()
  }
  private startPlayback() {
    const id = this.playingId, context = this.context
    if (!id || !context || !this.queued.length) return
    if (context.state !== "running") { this.notify({ type: "audio-blocked", blocked: true }); return }
    for (const buffer of this.queued.splice(0)) {
      const node = context.createBufferSource()
      node.buffer = buffer
      node.connect(context.destination)
      node.connect(this.capture!, 0, 1)
      this.nodes.add(node)
      node.onended = () => {
        this.nodes.delete(node)
        node.disconnect()
        if (this.playingId === id) this.maybeEnded()
      }
      const at = Math.max(this.playAt, context.currentTime)
      node.start(at)
      this.playAt = at + buffer.duration
    }
    if (!this.playbackStarted) {
      this.playbackStarted = true
      this.notify({ type: "speaker", speaker: this.speaker })
      this.notify({ type: "state", state: "speaking" })
      this.enqueue(() => this.post(`/${id}/playback`, JSON.stringify({ state: "started" }), "application/json"))
    }
  }
  private maybeEnded() {
    const id = this.playingId
    if (!id || !this.audioComplete || !this.playbackStarted || this.nodes.size || this.queued.length) return
    this.audioComplete = false
    this.enqueue(() => this.post(`/${id}/playback`, JSON.stringify({ state: "ended" }), "application/json"))
  }
  stopOutput() {
    this.outputStopped = true
    this.stopPlayback()
  }
  async playAudio() {
    try { await this.context?.resume(); this.startPlayback(); this.notify({ type: "audio-blocked", blocked: this.context?.state !== "running" }) }
    catch { this.notify({ type: "audio-blocked", blocked: true }) }
  }
  private stopPlayback() {
    this.streamAbort?.abort()
    this.streamAbort = undefined
    for (const node of this.nodes) { node.onended = null; node.stop(); node.disconnect() }
    this.nodes.clear()
    this.queued = []
    this.audioComplete = false
    this.playAt = 0
    this.playbackStarted = false
    this.playingId = undefined
  }
  private lost() {
    if (this.failed || this.abort.signal.aborted) return
    this.failed = true
    this.disconnect()
    this.notify({ type: "state", state: "disconnected" })
    this.notify({ type: "error", message: "Голосовая связь прервалась. Подключись снова, чтобы продолжить защиту." })
    if (this.sessionId) void api.interrupt(this.sessionId).catch(() => undefined)
  }
  disconnect() {
    this.abort.abort()
    this.flushAck?.()
    this.microphone?.disconnect()
    this.capture?.disconnect()
    this.capture?.port.close()
    this.stopPlayback()
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined)
  }
}

