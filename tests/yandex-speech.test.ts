import assert from "node:assert/strict"
import { test } from "node:test"
import { readConfig, hasCallCredentials } from "../server/config.js"
import { nextYandexPhrase, yandexSpeech } from "../server/yandex-speech.js"
import { interviewerProfiles } from "../src/lib/roles/team.js"

test("LiveTTS uses one request for a ready question and starts delivering PCM before its end", async t => {
  const text = "Понял. А что произойдёт, если сумма выйдет за лимит?"
  assert.equal(nextYandexPhrase(text, true), text)
  assert.equal(nextYandexPhrase("Понял. А что", false), "")
  assert.equal(nextYandexPhrase("На задание есть четыре часа. К концу", false), "На задание есть четыре часа.")
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c } })
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: URL | string, options: RequestInit) => {
    assert.equal(String(url), "https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis")
    assert.equal(new Headers(options.headers).get("Authorization"), "Api-Key fixture")
    const request = JSON.parse(String(options.body))
    assert.deepEqual(request.hints, [{ voice: "denis" }, { role: "casual" }])
    assert.equal(request.model, "livetts")
    assert.equal(request.text, text)
    return new Response(stream)
  })
  const audio = yandexSpeech(text, "fixture", new AbortController().signal, true)
  const first = audio.next()
  const chunk = (pcm: number[]) => JSON.stringify({ result: { audioChunk: { data: Buffer.from(pcm).toString("base64") } } })
  const head = chunk([1, 2])
  controller.enqueue(Buffer.from(head.slice(0, 9)))
  controller.enqueue(Buffer.from(head.slice(9) + "\n"))
  assert.deepEqual((await first).value?.subarray(44), Buffer.from([1, 2]))
  controller.enqueue(Buffer.from(JSON.stringify({ result: { textChunk: { text } } }) + "\n" + chunk([3, 4])))
  controller.close()
  assert.deepEqual((await audio.next()).value?.subarray(44), Buffer.from([3, 4]))
  assert.equal((await audio.next()).done, true)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test("a legacy client receives a single playable WAV for multiple SpeechKit records", async t => {
  const record = JSON.stringify({ result: { audioChunk: { data: "AQI=" } } })
  t.mock.method(globalThis, "fetch", async () => new Response(record + "\n" + record + "\n"))
  const audio = yandexSpeech("Покажи свой экран.", "fixture", new AbortController().signal, false)
  const wav = (await audio.next()).value!
  assert.equal(wav.toString("ascii", 0, 4), "RIFF")
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.equal(wav.readUInt32LE(40), 4)
  assert.equal((await audio.next()).done, true)
})

test("all four team voices select a distinct supported LiveTTS voice and role", async t => {
  const hints: unknown[] = []
  t.mock.method(globalThis, "fetch", async (_url: URL, init: RequestInit) => {
    const request = JSON.parse(String(init.body))
    assert.equal(request.model, "livetts")
    hints.push(request.hints)
    return new Response('{"result":{"audioChunk":{"data":"AQI="}}}')
  })
  for (const id of ["design_lead", "product_manager", "cpo", "systems_analyst"] as const) {
    const audio = yandexSpeech("Поясни, пожалуйста.", "fixture", new AbortController().signal, true, interviewerProfiles[id].yandexVoice)
    assert.equal((await audio.next()).done, false)
    assert.equal((await audio.next()).done, true)
  }
  assert.deepEqual(hints, [
    [{ voice: "denis" }, { role: "casual" }], [{ voice: "sofia" }, { role: "casual" }],
    [{ voice: "irina" }, { role: "neutral" }], [{ voice: "sergey" }, { role: "support" }],
  ])
})

test("missing Yandex credentials prevent new calls", () => {
  assert.equal(hasCallCredentials(readConfig({ PROOF_TTS_PROVIDER: "yandex", DEEPSEEK_API_KEY: "fixture" })), false)
})

test("an error record after an audio fragment cannot appear to be a successful utterance", async t => {
  const lines = '{"result":{"audioChunk":{"data":"AQI="}}}\n{"error":{"code":14}}'
  t.mock.method(globalThis, "fetch", async () => new Response(lines))
  const audio = yandexSpeech("Покажи свой экран.", "fixture", new AbortController().signal, true)
  assert.equal((await audio.next()).done, false)
  await assert.rejects(audio.next())
})
