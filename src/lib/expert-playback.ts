import { interviewerIdSchema, type InterviewerId } from "./interviewers"
import type { RealtimeEvent } from "./realtime"

type Clip = {
  id: string; endpoint: string; audio: HTMLAudioElement; controller: AbortController
  speaker?: InterviewerId; url?: string; started: boolean; reports: Promise<void>
}

export class ExpertPlayback {
  private clip?: Clip
  private seen = new Set<string>()
  constructor(private sessionId: string, private emit: (event: RealtimeEvent) => void) {}

  async receive(id: string) {
    if (this.seen.has(id)) return
    this.seen.add(id)
    this.stop()
    const clip: Clip = {
      id, endpoint: `/api/sessions/${this.sessionId}/expert-audio/${id}`, audio: new Audio(),
      controller: new AbortController(), started: false, reports: Promise.resolve(),
    }
    this.clip = clip
    try {
      const res = await fetch(clip.endpoint, { credentials: "same-origin", signal: AbortSignal.any([clip.controller.signal, AbortSignal.timeout(12_000)]) })
      if (res.status === 409 || res.status === 404) { if (this.clip === clip) this.release(clip); return }
      if (!res.ok) throw new Error("audio")
      clip.speaker = interviewerIdSchema.parse(res.headers.get("X-Proof-Speaker"))
      const audioData = await res.blob()
      if (this.clip !== clip) return
      clip.url = URL.createObjectURL(audioData)
      clip.audio.onplaying = () => {
        if (this.clip !== clip || clip.started || !clip.speaker) return
        clip.started = true
        this.report(clip, "started")
        this.emit({ type: "speaker", speaker: clip.speaker })
        this.emit({ type: "audio-blocked", blocked: false })
        this.emit({ type: "state", state: "speaking" })
      }
      clip.audio.onended = () => {
        if (this.clip !== clip) return
        this.report(clip, "ended")
        this.release(clip)
        this.emit({ type: "state", state: "listening" })
      }
      clip.audio.onerror = () => this.fail(clip)
      clip.audio.src = clip.url
      await this.tryPlay(clip)
    } catch { if (this.clip === clip) this.fail(clip) }
  }

  private report(clip: Clip, state: "started" | "ended" | "interrupted" | "failed") {
    // Preserve start-before-end ordering even for a very short or interrupted clip.
    clip.reports = clip.reports.then(async () => {
      const res = await fetch(clip.endpoint + "/playback", {
        method: "POST", credentials: "same-origin", keepalive: true, signal: AbortSignal.timeout(6000),
        headers: { "Content-Type": "application/json", "X-Proof-Client": "1" }, body: JSON.stringify({ state }),
      })
      if (!res.ok && res.status !== 409) throw new Error("playback")
    }).catch(() => {
      if (this.clip === clip) {
        this.release(clip)
        this.emit({ type: "error", message: "Потеряна связь во время реплики. Подключись снова." })
      }
    })
  }
  private fail(clip: Clip) {
    if (this.clip !== clip) return
    this.report(clip, "failed")
    this.release(clip)
    this.emit({ type: "error", message: "Не удалось воспроизвести голос специалиста. Подключись снова." })
  }
  private async tryPlay(clip: Clip) {
    try { await clip.audio.play() }
    catch (error) {
      if (this.clip !== clip) return
      if (error instanceof DOMException && error.name === "NotAllowedError") this.emit({ type: "audio-blocked", blocked: true })
      else this.fail(clip)
    }
  }
  async retry() {
    if (!this.clip?.url) return false
    await this.tryPlay(this.clip)
    return true
  }
  private release(clip: Clip) {
    this.clip = undefined
    clip.controller.abort()
    clip.audio.onplaying = null
    clip.audio.onended = null
    clip.audio.onerror = null
    clip.audio.pause()
    clip.audio.removeAttribute("src")
    if (clip.url) URL.revokeObjectURL(clip.url)
  }
  stop(id?: string) {
    const clip = this.clip
    if (!clip || (id && clip.id !== id)) return
    this.report(clip, "interrupted")
    this.release(clip)
  }
}
