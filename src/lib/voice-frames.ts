// A zero length ends the utterance. All ones marks a deliberate interruption.
export async function* voiceFrames(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  let tail = new Uint8Array(0)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error("Оборвалась загрузка голоса.")
      const bytes = new Uint8Array(tail.length + value.length)
      bytes.set(tail)
      bytes.set(value, tail.length)
      let pos = 0
      while (bytes.length - pos >= 4) {
        const size = new DataView(bytes.buffer).getUint32(pos)
        if (size === 0) return
        if (size === 0xffffffff) { yield null; return }
        if (size > 8_000_000) throw new Error("Слишком большой фрагмент голоса.")
        if (bytes.length - pos - 4 < size) break
        pos += 4
        yield bytes.slice(pos, pos + size).buffer
        pos += size
      }
      tail = bytes.slice(pos)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
