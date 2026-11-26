import { z } from "zod"

const sampleRate = 24_000
const message = z.object({
  result: z.object({ audioChunk: z.object({ data: z.string() }).nullish() }),
})

// Each browser frame must be independently decodable. The legacy client
// receives the same PCM in a single WAV file.
function wav(pcm: Buffer) {
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(pcm.length + 36, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function nextYandexPhrase(text: string, final: boolean) {
  if (final) return text
  // Keep the completed part together for intonation, including short acknowledgments.
  const ends = Array.from(text.matchAll(/[.!?…]+[»”"]*(?=\s)/gu))
  const last = ends.at(-1)
  if (!last) return ""
  const complete = text.slice(0, last.index + last[0].length)
  return complete.trim().length >= 16 ? complete : ""
}

async function* jsonLines(body: NonNullable<Response["body"]>) {
  const decoder = new TextDecoder()
  let rest = ""
  for await (const bytes of body) {
    const lines = (rest + decoder.decode(bytes, { stream: true })).split("\n")
    rest = lines.pop()!
    for (const line of lines) if (line.trim()) yield line
  }
  rest += decoder.decode()
  if (rest.trim()) yield rest
}

export async function* yandexSpeech(text: string, key: string, signal: AbortSignal, streaming: boolean) {
  const response = await fetch("https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Api-Key ${key}` },
    body: JSON.stringify({
      text, model: "livetts", hints: [{ voice: "denis" }, { role: "casual" }],
      outputAudioSpec: { rawAudio: { audioEncoding: "LINEAR16_PCM", sampleRateHertz: String(sampleRate) } },
      unsafeMode: true,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error(`SpeechKit synthesis failed (HTTP ${response.status})`)
  }
  let pending: Buffer[] = []
  let size = 0
  let sent = false
  for await (const line of jsonLines(response.body)) {
    const encoded = message.parse(JSON.parse(line)).result.audioChunk?.data
    if (!encoded) continue
    const pcm = Buffer.from(encoded, "base64")
    if (!pcm.length || pcm.length % 2) throw new Error("Invalid SpeechKit PCM")
    pending.push(pcm)
    size += pcm.length
    if (streaming && (!sent || size >= sampleRate * 2)) {
      yield wav(Buffer.concat(pending, size))
      pending = []
      size = 0
      sent = true
    }
  }
  if (size) yield wav(Buffer.concat(pending, size))
  else if (!sent) throw new Error("Missing SpeechKit audio")
}
