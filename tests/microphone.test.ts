import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"

type Message = { type: string; pcm?: ArrayBuffer; draftCurrent?: boolean; serial?: number }
type Processor = { process: (inputs: Float32Array[][]) => boolean; port: { onmessage: (e: { data: string | { shortQuestion: number } }) => void } }
const source = readFileSync(new URL("../public/proof-mic.js", import.meta.url), "utf8")

test("delayed speaker echo stays silent and an independent overlapping voice triggers a preview", () => {
  const messages: Message[] = []
  let processor!: Processor
  runInNewContext(source, {
    sampleRate: 16000,
    AudioWorkletProcessor: class { port = { postMessage: (m: Message) => messages.push(m) } },
    registerProcessor: (_name: string, ctor: new () => Processor) => { processor = new ctor() },
  })
  processor.port.onmessage({ data: "listen" })
  processor.port.onmessage({ data: "overlap" })
  const reference = (i: number) => i < 0 ? 0 : 0.22 * Math.sin(i * .082 + 3 * Math.sin(i * .003))
  for (let start = 0; start < 48000; start += 128) {
    const speaker = Float32Array.from({ length: 128 }, (_, j) => reference(start + j))
    const mic = Float32Array.from(speaker, (_, j) => {
      const i = start + j
      return reference(i - 1920) * .45 + (i > 22000 ? .32 * Math.sin(i * .17) : 0)
    })
    processor.process([[mic], [speaker]])
    if (start < 22000) assert.equal(messages.length, 0)
  }
  processor.port.onmessage({ data: "flush" })
  assert.deepEqual(messages.map(m => m.type), ["start", "probe", "speech", "flushed"])
})

for (const rate of [16000, 44100, 48000]) {
  test(`microphone segments and flushes native ${rate} Hz at 16 kHz`, () => {
    const messages: Message[] = []
    let processor!: Processor
    runInNewContext(source, {
      sampleRate: rate,
      AudioWorkletProcessor: class { port = { postMessage: (m: Message) => messages.push(m) } },
      registerProcessor: (_name: string, ctor: new () => Processor) => { processor = new ctor() },
    })
    const feed = (seconds: number, loud: boolean) => {
      for (let start = 0; start < seconds * rate; start += 128) {
        const chunk = Float32Array.from({ length: 128 }, (_, i) => loud ? Math.sin(2 * Math.PI * (start + i) * 250 / rate) / 4 : 0)
        processor.process([[chunk]])
      }
    }
    feed(2, true)
    assert.equal(messages.length, 0, "loud playback before handoff must produce no capture events")
    processor.port.onmessage({ data: "listen" })
    feed(1, false)
    assert.equal(messages.length, 0)
    feed(1.5, true)
    feed(1.2, false)
    assert.deepEqual(messages.map(m => m.type), ["start", "draft", "speech"])
    assert.equal(messages[2].draftCurrent, true)
    const seconds = messages[2].pcm!.byteLength / 32000
    assert.ok(seconds > 2.4 && seconds < 2.7)
    processor.port.onmessage({ data: "pause" })
    feed(1.5, true)
    assert.equal(messages.length, 3)
    processor.port.onmessage({ data: "listen" })
    feed(0.4, true)
    feed(0.48, false)
    feed(0.4, true)
    feed(1.0, false)
    assert.equal(messages.at(-1)?.draftCurrent, false, "a resumed sentence must use the complete recording")
    feed(0.5, true)
    feed(0.45, false)
    const serial = messages.at(-1)?.serial
    assert.ok(serial)
    processor.port.onmessage({ data: { shortQuestion: serial - 1 } })
    feed(0.14, false)
    assert.equal(messages.at(-1)?.type, "draft")
    processor.port.onmessage({ data: { shortQuestion: serial } })
    assert.equal(messages.at(-1)?.type, "speech", "confirmed brief question ends after the shorter silence")
    assert.equal(messages.at(-1)?.draftCurrent, true)
    const beforeFlush = messages.length
    feed(0.4, true)
    processor.port.onmessage({ data: "flush" })
    assert.deepEqual(messages.slice(beforeFlush).map(m => m.type), ["start", "speech", "flushed"])
    assert.equal(processor.process([]), false)
  })
}
