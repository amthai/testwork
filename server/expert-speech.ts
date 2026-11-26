import { randomUUID } from "node:crypto"
import type { InterviewerId } from "../src/lib/interviewers.js"
import { AppError } from "./errors.js"

type Synthesize = (speaker: InterviewerId, text: string, signal: AbortSignal) => Promise<Buffer>
type Playback = "started" | "ended" | "interrupted" | "failed"
type Turn = {
  id: string; token: string; speaker: InterviewerId; text: string; controller: AbortController
  timer?: ReturnType<typeof setTimeout>; audio?: Buffer; announced: boolean; started: boolean
}

// Realtime fixes its output voice at the first audio response. Its conversation
// item transports the approved text and notifies the browser about the separate audio.
export class ExpertSpeech {
  private active?: Turn

  constructor(
    private synthesize: Synthesize,
    private send: (event: object) => void,
    private emit: (event: object) => void,
  ) {}

  speak(token: string, speaker: InterviewerId, text: string) {
    this.cancel()
    const turn: Turn = {
      id: "expert_" + randomUUID().replaceAll("-", "").slice(0, 24), token, speaker, text,
      controller: new AbortController(), announced: false, started: false,
    }
    this.active = turn
    this.emit({ type: "response.created", speaker, response: { id: turn.id, metadata: { proof_turn: token, speaker } } })
    this.deadline(turn, 30_000)
    void this.synthesize(speaker, text, turn.controller.signal).then(audio => {
      if (this.active !== turn) return
      if (!audio.length) throw new Error("Empty speech response")
      turn.audio = audio
      this.send({ type: "conversation.item.create", event_id: turn.id, item: {
        type: "message", id: turn.id, role: "assistant", content: [{ type: "output_text", text }],
      } })
      turn.announced = true
      this.deadline(turn, 45_000)
    }).catch(() => { if (this.active === turn) this.finish(turn, "failed") })
  }

  private deadline(turn: Turn, delay: number) {
    clearTimeout(turn.timer)
    turn.timer = setTimeout(() => { if (this.active === turn) this.finish(turn, "failed") }, delay)
    turn.timer.unref()
  }

  audio(id: string) {
    const turn = this.active
    if (!turn || turn.id !== id || !turn.audio) throw new AppError(409, "stale_audio", "Реплика уже завершена.")
    return { audio: turn.audio, speaker: turn.speaker }
  }

  playback(id: string, state: Playback) {
    const turn = this.active
    if (!turn || turn.id !== id || !turn.audio) return
    if (state === "started" && !turn.started) {
      turn.started = true
      this.deadline(turn, 120_000)
      this.emit({ type: "response.output_item.added", response_id: id, item: { id, role: "assistant" }, speaker: turn.speaker })
      this.emit({ type: "response.output_audio_transcript.done", response_id: id, item_id: id, transcript: turn.text, speaker: turn.speaker })
    } else if (state === "ended" && turn.started) this.finish(turn, "completed")
    else if (state === "interrupted") this.finish(turn, "cancelled")
    else if (state === "failed") this.finish(turn, "failed")
  }

  rejected(eventId?: string) {
    const turn = this.active
    if (!turn || turn.id !== eventId) return
    turn.announced = false
    this.finish(turn, "failed")
  }

  cancel() {
    if (!this.active) return false
    this.finish(this.active, "cancelled")
    return true
  }

  private finish(turn: Turn, status: "completed" | "failed" | "cancelled") {
    this.active = undefined
    clearTimeout(turn.timer)
    turn.controller.abort()
    if (status !== "completed") {
      if (turn.announced) {
        try { this.send({ type: "conversation.item.delete", item_id: turn.id }) } catch { /* socket already closed */ }
      }
      if (turn.started) this.emit({ type: "conversation.item.truncated", item_id: turn.id, speaker: turn.speaker })
    }
    this.emit({ type: "response.done", speaker: turn.speaker, response: { id: turn.id, status, metadata: { proof_turn: turn.token, speaker: turn.speaker }, output: [] } })
    if (status === "completed") this.emit({ type: "output_audio_buffer.stopped", response_id: turn.id, speaker: turn.speaker })
  }
}
