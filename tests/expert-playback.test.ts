import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { ExpertPlayback } from "../src/lib/expert-playback.js"
import type { RealtimeEvent } from "../src/lib/realtime.js"

test("the browser acknowledges actual expert playback, retries blocked audio and drops interrupted clips", async t => {
  const events: RealtimeEvent[] = []
  const receipts: string[] = []
  const clips: AudioStub[] = []
  let blocked = true
  class AudioStub {
    onplaying?: () => void
    onended?: () => void
    paused = false
    constructor() { clips.push(this) }
    play() {
      return blocked ? Promise.reject(new DOMException("Gesture required", "NotAllowedError")) : Promise.resolve()
    }
    pause() { this.paused = true }
    removeAttribute() {}
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "Audio")
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: AudioStub })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "Audio", original)
    else Reflect.deleteProperty(globalThis, "Audio")
  })
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    if (options.method === "POST") {
      receipts.push(JSON.parse(String(options.body)).state)
      return Response.json({ ok: true })
    }
    return new Response("audio fixture", { headers: { "Content-Type": "audio/mpeg", "X-Proof-Speaker": "cpo" } })
  })
  const player = new ExpertPlayback("owned-session", e => events.push(e))
  await player.receive("expert_a")
  assert.deepEqual(events, [{ type: "audio-blocked", blocked: true }])
  assert.deepEqual(receipts, [])
  blocked = false
  await player.retry()
  clips[0].onplaying?.()
  clips[0].onended?.()
  await setImmediate()
  assert.deepEqual(receipts, ["started", "ended"])
  assert.ok(events.some(e => e.type === "speaker" && e.speaker === "cpo"))
  await player.receive("expert_a")
  assert.equal(clips.length, 1)
  await player.receive("expert_b")
  clips[1].onplaying?.()
  player.stop("expert_a")
  assert.equal(clips[1].paused, false)
  player.stop()
  clips[1].onended?.()
  await setImmediate()
  assert.equal(clips[1].paused, true)
  assert.deepEqual(receipts, ["started", "ended", "started", "interrupted"])
})
