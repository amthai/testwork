import { test } from "node:test"
import assert from "node:assert/strict"
import { briefInputSchema, briefSchema, type BriefImage } from "../src/lib/methodology.js"
import { canOpenPreparationStep } from "../src/lib/preparation.js"
import { validateBriefFile } from "../src/lib/brief-images.js"
import { publicServiceMessage, SERVICE_UNAVAILABLE } from "../src/lib/service-errors.js"
import { providerError } from "../server/errors.js"
import { validateBrief } from "../server/methodology/validation.js"
import { validateBriefImages } from "../server/brief-images.js"
import { sessionSchema } from "../src/lib/session.js"
import { reportMarkdown } from "../src/lib/report-export.js"
import { OpenAIProvider } from "../server/provider.js"
import { readConfig } from "../server/config.js"
import { brief, briefText, exampleSession } from "./fixtures.js"

const image: BriefImage = { id: "00000000-0000-4000-8000-000000000003", name: "Задание.png", dataUrl: "data:image/jpeg;base64,/9j/2Q==" }
const imageAnalysis = () => ({ ...structuredClone(brief.analysis), imageSources: [{ id: image.id, text: briefText, description: "Фото задания" }], requirements: brief.analysis.requirements.map(r => ({ ...r, sourceImageId: image.id })) })

test("preparation gates require a saved assignment, then microphone; going back remains possible", () => {
  for (const [hasBrief, microphone, expected] of [[false, false, [true, false, false]], [false, true, [true, false, false]], [true, false, [true, true, false]], [true, true, [true, true, true]]] as const) {
    assert.deepEqual([0, 1, 2].map(step => canOpenPreparationStep(step, hasBrief, microphone)), expected)
  }
  assert.equal(canOpenPreparationStep(3, true, true), false)
})
test("assignment accepts text, photos alone, or both, with bounded and unique attachments", () => {
  assert.ok(briefInputSchema.safeParse({ text: briefText }).success)
  assert.ok(briefInputSchema.safeParse({ images: [image] }).success)
  assert.ok(briefInputSchema.safeParse({ text: "Контекст", images: [image] }).success)
  for (const input of [{ text: "Коротко" }, { text: "a".repeat(16001) }, { images: [image, image] }, { images: Array(4).fill(image) }, { images: [{ ...image, dataUrl: "https://example.com/photo.jpg" }] }]) assert.equal(briefInputSchema.safeParse(input).success, false)
})
test("original file validation rejects empty, oversize and unsupported photos", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) assert.doesNotThrow(() => validateBriefFile({ type, size: 1000 }))
  for (const file of [{ type: "image/svg+xml", size: 10 }, { type: "image/heic", size: 1000 }, { type: "image/jpeg", size: 0 }, { type: "image/png", size: 10 * 1024 * 1024 + 1 }]) assert.throws(() => validateBriefFile(file))
})
test("photo quotes must use the declared image transcript and source IDs", () => {
  assert.deepEqual(validateBrief("", imageAnalysis(), [image]), imageAnalysis())
  const other = { ...image, id: "00000000-0000-4000-8000-000000000004" }
  assert.throws(() => validateBrief(briefText, imageAnalysis(), [other]))
  assert.throws(() => validateBrief(briefText, imageAnalysis(), []))
  assert.throws(() => validateBrief("", { ...imageAnalysis(), requirements: brief.analysis.requirements }, [image]))
  assert.throws(() => validateBrief("", { ...imageAnalysis(), imageSources: [{ id: image.id, text: "Другой текст", description: "" }] }, [image]))
  assert.throws(() => validateBrief("", { ...imageAnalysis(), imageSources: [imageAnalysis().imageSources[0], imageAnalysis().imageSources[0]] }, [image]))
})
test("server JPEG guard rejects missing headers, truncated segments and oversized dimensions", () => {
  const jpeg = (width: number) => ({ ...image, dataUrl: "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 1, width >> 8, width & 255, 1, 1, 17, 0, 255, 217]).toString("base64") })
  assert.doesNotThrow(() => validateBriefImages([jpeg(2048)]))
  for (const candidate of [image, jpeg(2049), jpeg(0), { ...image, dataUrl: "data:image/jpeg;base64," + Buffer.from([255, 216, 255, 224, 255, 255, 255, 217]).toString("base64") }]) assert.throws(() => validateBriefImages([candidate]))
})
test("all quota variants are neutral and do not claim a nonexistent call was saved", () => {
  for (const code of ["insufficient_quota", "credit_balance_exhausted", "billing_limit_reached", "billing_hard_limit_reached"]) {
    const error = providerError(429, code)
    assert.equal(error.code, "quota"); assert.equal(error.message, SERVICE_UNAVAILABLE)
    assert.doesNotMatch(error.message, /баланс|OpenAI|сохранена|владельц/i)
  }
  assert.equal(publicServiceMessage("Private provider detail", "quota"), SERVICE_UNAVAILABLE)
  assert.equal(publicServiceMessage("Микрофон отключён"), "Микрофон отключён")
})
test("legacy saved errors and text-only briefs remain safe to render", () => {
  const legacy = { ...exampleSession, error: "У сервиса закончился баланс OpenAI. Сообщи владельцу сервиса; твоя сессия сохранена." }
  assert.equal(sessionSchema.parse(legacy).error, SERVICE_UNAVAILABLE)
  const restored = briefSchema.parse({ id: brief.id, text: briefText, preparedAt: 1, analysis: { task: brief.analysis.task, requirements: brief.analysis.requirements.map(({ sourceImageId: _source, ...r }) => r), constraints: [], ambiguities: [] } })
  assert.deepEqual(restored.images, []); assert.deepEqual(restored.analysis.imageSources, [])
  assert.equal(restored.analysis.requirements[0].sourceImageId, null)
})
test("photo context is preserved in exported reports without raw image bytes", () => {
  const session = { ...exampleSession, brief: { ...brief, text: "", images: [{ id: image.id, name: image.name }], analysis: imageAnalysis() } }
  const report = reportMarkdown(session)
  assert.ok(report.includes(briefText)); assert.ok(report.includes("Распознанный текст"))
  assert.ok(report.includes(image.name)); assert.equal(report.includes("base64"), false)
})
test("OpenAI adapter sends actual image input and requests a grounded structured response", async t => {
  let requested = false
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requested = true
    const body = JSON.parse(String(init.body)) as { store: boolean; input: { content: { type: string; image_url?: string; text?: string }[] }[]; text: { format: { strict: boolean } } }
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
    assert.equal(body.input[0].content.find(item => item.type === "input_image")?.image_url, image.dataUrl)
    assert.ok(body.input[0].content.some(item => item.text?.includes(image.id)))
    return new Response(JSON.stringify({ id: "resp_fixture", object: "response", status: "completed", output: [{ id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ images: imageAnalysis().imageSources }), annotations: [] }] }] }), { status: 200, headers: { "content-type": "application/json" } })
  })
  const provider = new OpenAIProvider(readConfig({ NODE_ENV: "test", OPENAI_API_KEY: "test-only-not-a-credential" }))
  assert.deepEqual(await provider.readBriefImages([image]), imageAnalysis().imageSources)
  assert.equal(requested, true)
})

test("final report requirements cite the stored OCR text, even when the model changes a quote", async t => {
  let valid = true
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    assert.equal(body.text.format.name, "assignment_requirements")
    assert.deepEqual(JSON.parse(body.input), { text: "", imageSources: imageAnalysis().imageSources })
    const { imageSources, ...analysis } = imageAnalysis()
    assert.ok(imageSources.length)
    if (!valid) analysis.requirements[0].quote = "Выдуманная моделью цитата"
    return Response.json({ id: "resp_fixture", object: "response", status: "completed", output: [{ id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(analysis), annotations: [] }] }] })
  })
  const provider = new OpenAIProvider(readConfig({ NODE_ENV: "test", OPENAI_API_KEY: "fixture" }))
  const sources = imageAnalysis().imageSources
  assert.deepEqual(await provider.analyzeBrief("", sources), imageAnalysis())
  valid = false
  await assert.rejects(provider.analyzeBrief("", sources), /выделить требования/)
})
