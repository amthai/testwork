import { spawn } from "node:child_process"
import { Readable } from "node:stream"
import { buffer } from "node:stream/consumers"

export type VoiceFormat = "opus" | "wav"
export const streamType = "application/x-proof-speech"

// Leave partial words and decimals in the tail. Long sentences also break at a clause.
export function nextPhrase(text: string, final: boolean): string {
  const end = /[.!?…]+[»”"]*(?=\s)|(?<=.{28})(?:[,;:]| —)(?=\s)/u.exec(text)
  return end ? text.slice(0, end.index + end[0].length) : final ? text : ""
}

async function encode(wav: Buffer, signal: AbortSignal) {
  const process = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0",
    "-map_metadata", "-1", "-c:a", "libopus", "-application", "voip", "-b:a", "24k", "-f", "ogg", "pipe:1"],
  { stdio: ["pipe", "pipe", "ignore"], signal })
  const closed = new Promise<void>((resolve, reject) => {
    process.once("error", reject)
    process.once("close", code => code === 0 ? resolve() : reject(new Error("Audio encoding failed")))
  })
  process.stdin.on("error", () => { /* The exit status reports an encoding failure. */ })
  process.stdin.end(wav)
  const [result] = await Promise.all([buffer(process.stdout), closed])
  return result
}

export class SpeechStream {
  private text = ""
  private final = false
  private wake?: () => void
  private attached = false

  constructor(private format: VoiceFormat, private synthesize: (text: string) => AsyncIterable<Buffer>, private signal: AbortSignal, private split = nextPhrase) {
    signal.addEventListener("abort", () => this.wake?.(), { once: true })
  }
  update(text: string, final: boolean) {
    if (!text.startsWith(this.text)) throw new Error("Speech prefix changed")
    this.text = text
    this.final = final
    this.wake?.()
  }
  open() {
    if (this.attached) return null
    this.attached = true
    return Readable.from(this.frames())
  }
  private async *frames() {
    let offset = 0
    while (!this.signal.aborted) {
      const phrase = this.split(this.text.slice(offset), this.final)
      if (!phrase) {
        if (this.final) break
        await new Promise<void>(resolve => { this.wake = resolve })
        this.wake = undefined
        continue
      }
      offset += phrase.length
      if (!phrase.trim()) continue
      try {
        for await (const wav of this.synthesize(phrase.trim())) {
          if (this.signal.aborted) break
          const audio = this.format === "opus" ? await encode(wav, this.signal) : wav
          const size = Buffer.alloc(4)
          size.writeUInt32BE(audio.length)
          yield Buffer.concat([size, audio])
        }
      } catch (error) {
        if (this.signal.aborted) break
        throw error
      }
    }
    // Distinguish a confirmed interruption from a broken HTTP response.
    yield Buffer.alloc(4, this.signal.aborted ? 255 : 0)
  }
}
