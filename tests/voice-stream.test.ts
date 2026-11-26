import assert from "node:assert/strict"
import { test } from "node:test"
import { once } from "node:events"
import { Readable } from "node:stream"
import { replyPrefix } from "../server/deepseek.js"
import { SpeechStream } from "../server/speech-stream.js"
import { voiceFrames } from "../src/lib/voice-frames.js"

test("a conversational reply starts with the first complete sentence before model completion", async () => {
  const abort = new AbortController()
  const spoken: string[] = []
  const stream = new SpeechStream("wav", async function* (text) {
    spoken.push(text)
    yield Buffer.from(text)
  }, abort.signal)
  const wire = stream.open()!
  stream.update('Да, вижу. Следу', false)
  const frames = voiceFrames(Readable.toWeb(wire) as ReadableStream<Uint8Array>)
  const first = await frames.next()
  assert.deepEqual(spoken, ["Да, вижу."])
  assert.equal(Buffer.from(first.value!).toString(), "Да, вижу.")
  stream.update("Да, вижу. Следующий экран тоже виден.", true)
  assert.equal(Buffer.from((await frames.next()).value!).toString(), "Следующий экран тоже виден.")
  assert.equal((await frames.next()).done, true)
})

test("cancelling a turn discards unsynthesized phrases and ends the stream", async () => {
  const abort = new AbortController()
  const stream = new SpeechStream("wav", async function* (text) { yield Buffer.from(text) }, abort.signal)
  const wire = stream.open()!
  const closed = once(wire, "end")
  wire.resume()
  stream.update("Пока думаю", false)
  abort.abort()
  await closed
})

test("only a confirmed conversational action exposes a spoken JSON prefix", () => {
  assert.equal(replyPrefix('{"action":"questions","reply":"Вопрос.'), "")
  assert.equal(replyPrefix('{"action":"reply","reply":"Да, вижу. На ак'), "Да, вижу. На ак")
  assert.equal(replyPrefix('{"action":"reply","reply":"Вижу \\"Заказ\\""'), 'Вижу "Заказ"')
})

test("fragmented framing rejects truncation and accepts a split end marker", async () => {
  const read = (bytes: number[]) => voiceFrames(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  } }))
  const frames = read([0,0,0,2,7,9,0,0,0,0])
  assert.deepEqual(new Uint8Array((await frames.next()).value!), Uint8Array.of(7,9))
  assert.equal((await frames.next()).done,true)
  await assert.rejects(read([0,0,0,2,7]).next(), /Оборвалась/)
})

test("only direct assignment questions skip dialogue planning", async () => {
  const { isBriefQuestion } = await import("../server/methodology/dialogue.js")
  assert.ok(isBriefQuestion("А сколько времени отводится на работу?"))
  assert.ok(isBriefQuestion("Нужно ли обязательно делать компоненты?"))
  assert.equal(isBriefQuestion("Сколько времени занимает вот этот экран?"), false)
  assert.equal(isBriefQuestion("Сколько времени осталось? Давай перейдём к вопросам."), false)
  assert.equal(isBriefQuestion("Я расскажу, сколько времени это заняло."), false)
})
