import { nextPhrase, SpeechStream, type VoiceFormat } from "./speech-stream.js"
import { nextYandexPhrase, yandexSpeech } from "./yandex-speech.js"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { AppError } from "./errors.js"
import type { TurnPlan } from "../src/lib/methodology.js"

import type { DefenseSession } from "../src/lib/session.js"
import { isBriefQuestion, type Dialogue } from "./methodology/dialogue.js"

type InterviewContext = Pick<DefenseSession, "stage" | "brief" | "questions" | "transcript"> & { remainingSeconds: number; participantName?: string | null }
type Turn = { id: string; token: string; abort: AbortController; text?: string; audio?: Buffer; stream?: SpeechStream; spokenReply?: boolean; started: boolean }
type Compose = (context: InterviewContext, instructions: string, signal: AbortSignal) => Promise<string>
type Plan = (context: InterviewContext, correction: string, frame: { id: string; image: string } | null, signal: AbortSignal) => Promise<TurnPlan>
type Route = (context: InterviewContext, frame: { id: string; image: string } | null, signal: AbortSignal, preview?: (text: string) => void) => Promise<Dialogue>
const unavailable = () => new AppError(503, "speech_unavailable", "Речевые модели сейчас недоступны. Попробуй подключиться снова.")

export class LocalVoiceCall {
  readonly id = `local_${randomUUID()}`
  format?: VoiceFormat
  private revision = 0
  private wake?: () => void
  private current?: Turn
  private closed = false
  private utterance?: { id: string; reference: string; confirmed: boolean; probed: boolean; draft?: { pcm: Buffer; text: Promise<string | null> } }
  private pendingEnd?: string
  private decoding = false
  private endingInput = false
  private frame: { id: string; image: string } | null = null
  private recent = new Set<string>()
  private lifetime = new AbortController()
  constructor(private url: string, private emit: (event: object) => void, private plan: Plan, private route: Route, private yandexKey?: string, private compose?: Compose) {}

  private changed() { this.revision++; this.wake?.() }
  async poll(after: number) {
    if (!this.closed && this.revision === after) {
      if (this.wake) throw new AppError(409, "duplicate_poll", "Созвон уже открыт в другой вкладке.")
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => this.wake?.(), 12_000)
        this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve() }
      })
    }
    if (this.closed) throw new AppError(409, "disconnected", "Соединение закрыто.")
    const t = this.current
    const ready = t?.stream || t?.audio
    return { revision: this.revision, state: t ? ready ? "speaking" : "thinking" : "listening", audioId: ready ? t.id : null }
  }
  stream(id: string) {
    return this.current?.id === id ? this.current.stream?.open() : null
  }
  audio(id: string) {
    if (this.current?.id !== id || !this.current.audio) throw new AppError(409, "stale_audio", "Реплика уже завершена.")
    return this.current.audio
  }
  private done(t: Turn, status: string, output: object[] = []) {
    this.emit({ type: "response.done", response: { id: t.id, status, metadata: { proof_turn: t.token }, output } })
  }
  private cancel() {
    const t = this.current
    if (!t) return
    this.current = undefined
    this.pendingEnd = undefined
    t.abort.abort()
    if (t.started) this.emit({ type: "conversation.item.truncated", item_id: t.id })
    this.done(t, "cancelled")
    this.changed()
  }
  playback(id: string, state: "started" | "ended" | "interrupted") {
    const t = this.current
    if (!t || t.id !== id || !(t.audio || t.stream)) return
    if (state === "started" && !t.started) {
      t.started = true
      this.emit({ type: "response.output_item.added", item: { id, role: "assistant" } })
      this.emit({ type: "response.output_audio_transcript.done", response_id: id, item_id: id, transcript: t.text })
    }
    if (state === "interrupted" && t.started) {
      this.cancel()
    }
    if (state === "ended" && t.started) {
      if (!this.endingInput && this.utterance && !this.utterance.confirmed) { this.pendingEnd = id; return }
      this.current = undefined
      this.done(t, "completed", t.spokenReply ? [{ type: "message" }] : [])
      this.emit({ type: "output_audio_buffer.stopped", response_id: id })
      this.changed()
    }
  }
  turn(token: string, context: InterviewContext, correction: string, spoken?: string, dialogue = false, compose = false) {
    this.cancel()
    const t: Turn = { id: randomUUID(), token, abort: new AbortController(), text: spoken, started: false }
    this.current = t
    this.emit({ type: "response.created", response: { id: t.id, metadata: { proof_turn: token } } })
    this.changed()
    void this.generate(t, context, correction, dialogue, compose).catch(() => {
      if (this.current !== t || this.closed) return
      this.current = undefined
      t.abort.abort()
      this.done(t, "failed")
      this.changed()
    })
  }
  private async *synthesize(text: string, signal: AbortSignal) {
    if (this.yandexKey !== undefined) {
      yield* yandexSpeech(text, this.yandexKey, signal, Boolean(this.format))
      return
    }
    const response = await fetch(new URL("/synthesize", this.url), {
      method: "POST", body: text, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    })
    if (!response.ok) throw unavailable()
    const wav = Buffer.from(await response.arrayBuffer())
    if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") throw unavailable()
    yield wav
  }
  private async generate(t: Turn, context: InterviewContext, correction: string, dialogue: boolean, compose: boolean) {
    const synthesize = (text: string) => this.synthesize(text, t.abort.signal)
    const split = this.yandexKey !== undefined ? nextYandexPhrase : nextPhrase
    const publish = (text: string, final: boolean) => {
      if (this.current !== t || !this.format) return
      const fresh = !t.stream
      t.text = text
      t.stream ??= new SpeechStream(this.format, synthesize, t.abort.signal, split)
      t.stream.update(text, final)
      if (fresh) this.changed()
      if (final && t.started) this.emit({ type: "response.output_audio_transcript.done", response_id: t.id, item_id: t.id, transcript: text })
    }
    if (compose && this.compose) {
      try {
        const words = await this.compose(context, correction, t.abort.signal)
        if (words.trim()) t.text = words.trim()
      } catch { /* Use the caller’s short contextual fallback if generation is unavailable. */ }
      if (this.current !== t || t.abort.signal.aborted) return
    }
    if (t.text !== undefined) {
      if (this.format) publish(t.text, true)
      else {
        for await (const audio of synthesize(t.text)) {
          if (this.current === t) { t.audio = audio; this.changed() }
        }
      }
      return
    }
    const preview = this.format ? (text: string) => {
      if (!split(text, false)) return
      t.spokenReply = true
      publish(text, false)
    } : undefined
    let plan: Dialogue | TurnPlan
    try {
      plan = dialogue ? await this.route(context, this.frame, t.abort.signal, preview) : await this.plan(context, correction, this.frame, t.abort.signal)
    } catch (error) {
      // Finish buffered speech if a streamed reply loses its final metadata.
      if (this.current === t && t.spokenReply && t.text && t.started) { publish(t.text, true); return }
      throw error
    }
    if (this.current !== t) return
    if (t.spokenReply && plan.action === "reply" && "reply" in plan) {
      publish(plan.reply.trimEnd().slice(0, 1400), true)
      return
    }
    this.current = undefined
    this.done(t, "completed", [{ type: "function_call", name: dialogue ? "dialogue" : "plan_turn", call_id: t.id, arguments: JSON.stringify(plan) }])
    this.changed()
  }
  endInput() { this.endingInput = true }
  get capturing() { return Boolean(this.utterance) }
  private remember(id: string) {
    this.recent.add(id)
    if (this.recent.size > 64) this.recent.delete(this.recent.values().next().value!)
  }
  start(id: string) {
    if (this.utterance?.id === id || this.recent.has(id)) return
    if (this.utterance) throw new AppError(409, "speech_busy", "Предыдущая реплика ещё обрабатывается.")
    this.utterance = { id, reference: this.current?.started ? this.current.text ?? "" : "", confirmed: false, probed: false }
  }
  private async recognize(pcm: Buffer) {
    const response = await fetch(new URL("/transcribe", this.url), {
      method: "POST", body: new Uint8Array(pcm), signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15_000)]),
    })
    if (!response.ok) throw unavailable()
    return z.object({ text: z.string().max(12000) }).parse(await response.json()).text.trim()
  }
  private confirm(id: string, text: string) {
    const u = this.utterance
    if (this.closed || u?.id !== id || !text) return false
    if (u.confirmed) return true
    const words = (s: string) => (s.toLowerCase().replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) ?? []).join(" ")
    const phrase = words(text)
    if (!phrase || (u.reference && (" " + words(u.reference) + " ").includes(" " + phrase + " "))) return false
    u.confirmed = true
    this.emit({ type: "input_audio_buffer.speech_started", item_id: id })
    if (!this.endingInput) this.cancel()
    return true
  }
  async probe(id: string, pcm: Buffer) {
    const u = this.utterance
    if (u?.id !== id || u.confirmed || u.probed || !this.current) return
    u.probed = true
    // The final utterance is still authoritative if the short preview is unclear.
    try { this.confirm(id, await this.recognize(pcm)) } catch { /* Retry with the full utterance. */ }
  }
  async draft(id: string, pcm: Buffer) {
    const u = this.utterance
    if (!u || u.id !== id || this.decoding || u.draft) return false
    // Only commit the words after the microphone confirms the silence continued.
    u.draft = { pcm, text: this.recognize(pcm).catch(() => null) }
    const text = await u.draft.text
    return Boolean(text && isBriefQuestion(text) && !/(?:\s(?:на|и|или|по|для|с|за|в|к)|[,—–-])\s*$/iu.test(text))
  }
  async transcribe(id: string, pcm?: Buffer) {
    if (this.recent.has(id)) return
    if (this.utterance?.id !== id || this.decoding) throw new AppError(409, "speech_busy", "Реплика ещё не готова к распознаванию.")
    const draft = this.utterance.draft
    if (!pcm && !draft) throw new AppError(409, "missing_draft", "Фрагмент речи недоступен.")
    this.decoding = true
    this.emit({ type: "input_audio_buffer.committed", item_id: id })
    try {
      const text = pcm ? await this.recognize(pcm) : (await draft!.text ?? await this.recognize(draft!.pcm))
      if (this.closed) return
      const accepted = this.confirm(id, text)
      this.emit({ type: "input_audio_buffer.speech_stopped", item_id: id })
      this.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript: accepted ? text : "" })
      this.remember(id)
    } catch {
      if (!this.closed) {
        this.emit({ type: "input_audio_buffer.speech_stopped", item_id: id })
        this.remember(id)
        this.emit({ type: "conversation.item.input_audio_transcription.failed", item_id: id })
      }
      // The server has handled this utterance. Keep the browser microphone connected.
    } finally {
      this.utterance = undefined
      this.decoding = false
      if (this.pendingEnd) {
        const ended = this.pendingEnd
        this.pendingEnd = undefined
        this.playback(ended, "ended")
      }
    }
  }
  control(raw: object) {
    const event = z.object({ type: z.string(), item: z.object({ id: z.string().optional(), type: z.string(), content: z.array(z.object({ image_url: z.string().optional() })).optional() }).optional() }).parse(raw)
    if (event.type === "response.cancel") this.cancel()
    if (event.type === "conversation.item.create" && event.item?.type === "message") {
      const image = event.item.content?.find(part => part.image_url)?.image_url
      this.frame = image && event.item.id ? { id: event.item.id, image } : null
      if (this.frame) this.emit({ type: "conversation.item.added", item: { id: this.frame.id } })
    }
  }
  close() {
    this.closed = true
    if (this.current?.started) this.emit({ type: "conversation.item.truncated", item_id: this.current.id })
    this.current?.abort.abort()
    this.current = undefined
    this.lifetime.abort()
    this.frame = null
    this.changed()
  }
}

export async function speechReady(url: string) {
  try { return (await fetch(new URL("/ready", url), { signal: AbortSignal.timeout(1800) })).ok } catch { return false }
}

