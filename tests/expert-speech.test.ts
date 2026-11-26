import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { z } from "zod"
import { ExpertSpeech } from "../server/expert-speech.js"

const eventSchema = z.object({
  type: z.string(), speaker: z.string().optional(), transcript: z.string().optional(), item_id: z.string().optional(),
  item: z.object({ id: z.string() }).optional(),
  response: z.object({ status: z.string().optional(), metadata: z.object({ proof_turn: z.string() }) }).optional(),
})

test("expert audio becomes a spoken question only when this clip starts playing", async () => {
  const events: Array<z.infer<typeof eventSchema>> = []
  const signals: Array<z.infer<typeof eventSchema>> = []
  const question = "Какой приоритет ты выбрал?"
  const speech = new ExpertSpeech(async (speaker, text) => {
    assert.equal(speaker, "product_manager")
    assert.equal(text, question)
    return Buffer.from("fixture mp3")
  }, e => signals.push(eventSchema.parse(e)), e => events.push(eventSchema.parse(e)))
  speech.speak("token", "product_manager", question)
  await setImmediate()
  const id = signals[0].item!.id
  assert.equal(signals[0].type, "conversation.item.create")
  assert.deepEqual(speech.audio(id), { audio: Buffer.from("fixture mp3"), speaker: "product_manager" })
  assert.deepEqual(events.map(e => e.type), ["response.created"])
  speech.playback(id, "ended")
  speech.playback(id, "started")
  speech.playback(id, "started")
  speech.playback(id, "ended")
  speech.playback(id, "ended")
  assert.deepEqual(events.map(e => e.type), ["response.created", "response.output_item.added", "response.output_audio_transcript.done", "response.done", "output_audio_buffer.stopped"])
  assert.equal(events[2].item_id, id)
  assert.equal(events[2].transcript, question)
  assert.ok(events.every(e => e.speaker === "product_manager"))
  assert.equal(events[3].response?.metadata.proof_turn, "token")
  assert.equal(signals.length, 1)
  assert.throws(() => speech.audio(id))
})

test("interruptions while synthesizing or playing invalidate old audio, late acknowledgments and the Realtime history marker", async () => {
  let finishSynthesis!: () => void
  let firstSignal!: AbortSignal
  let round = 0
  const controls: Array<z.infer<typeof eventSchema>> = []
  const events: Array<z.infer<typeof eventSchema>> = []
  const speech = new ExpertSpeech(async (_speaker, _question, signal) => {
    if (++round === 1) {
      firstSignal = signal
      await new Promise<void>(resolve => { finishSynthesis = resolve })
    }
    return Buffer.from("fixture")
  }, e => controls.push(eventSchema.parse(e)), e => events.push(eventSchema.parse(e)))
  speech.speak("old", "cpo", "Старый вопрос?")
  speech.cancel()
  speech.speak("next", "systems_analyst", "Кто видит отказ?")
  finishSynthesis()
  await setImmediate()
  assert.equal(firstSignal.aborted, true)
  assert.equal(controls.length, 1)
  const id = controls[0].item!.id
  speech.playback(id, "started")
  speech.cancel()
  speech.playback(id, "ended")
  assert.ok(events.some(e => e.type === "conversation.item.truncated" && e.speaker === "systems_analyst"))
  assert.deepEqual(events.filter(e => e.type === "response.done").map(e => e.response?.status), ["cancelled", "cancelled"])
  assert.equal(controls[1].type, "conversation.item.delete")
  assert.equal(controls[1].item_id, id)
  assert.throws(() => speech.audio(id))
  assert.equal(events.filter(e => e.transcript).length, 1)
})

test("synthesis failure and missing playback each fail once without recording an unspoken expert", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const outputs: Array<z.infer<typeof eventSchema>> = []
  let calls = 0
  const expert = new ExpertSpeech(async () => {
    if (++calls === 1) throw new Error("voice unavailable")
    return Buffer.from("voice")
  }, () => {}, e => outputs.push(eventSchema.parse(e)))
  expert.speak("no-voice", "cpo", "Что проверил бы?")
  await setImmediate()
  expert.speak("no-playback", "systems_analyst", "Какие данные нужны?")
  await setImmediate()
  t.mock.timers.tick(45_001)
  assert.equal(calls, 2)
  assert.deepEqual(outputs.filter(e => e.type === "response.done").map(e => e.response?.status), ["failed", "failed"])
  assert.equal(outputs.filter(e => e.transcript).length, 0)
})
