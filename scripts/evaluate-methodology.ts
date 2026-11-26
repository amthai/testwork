import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { hasModelKey, readConfig } from "../server/config.js"
import { createProvider } from "../server/deepseek.js"
import { AppError } from "../server/errors.js"
import { evaluationCases } from "../tests/evaluation-cases.js"
import { briefText } from "../tests/fixtures.js"

if (!process.argv.includes("--live")) {
  console.log("Без --live запросы к модели не выполняются. Поведенческие сценарии:")
  for (const c of evaluationCases) console.log(`${c.id}: ${c.expected}`)
  console.log("Для платной проверки: npm run eval:methodology -- --live [--case=strong-answer]. Результаты требуют экспертного чтения; это не проверка голоса.")
} else {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local")
  const config = readConfig()
  if (!hasModelKey(config)) throw new Error("Ключ выбранного провайдера не настроен на сервере.")
  const requested = process.argv.find(arg => arg.startsWith("--case="))?.slice(7)
  const selected = requested ? evaluationCases.filter(c => c.id === requested) : evaluationCases
  if (!selected.length) throw new Error("Неизвестный сценарий. Запусти без --live для списка.")
  const provider = createProvider(config)
  const dir = resolve("output/evaluations", new Date().toISOString().replaceAll(":", "-"))
  mkdirSync(dir, { recursive: true })
  try {
    const analysis = await provider.analyzeBrief(briefText, [])
    for (const c of selected) {
      const session = structuredClone(c.session)
      session.brief!.analysis = analysis
      const feedback = await provider.feedback(session, [])
      writeFileSync(resolve(dir, `${c.id}.json`), JSON.stringify({ model: config.PROOF_PROVIDER === "deepseek" ? "deepseek-flash" : config.OPENAI_FEEDBACK_MODEL, expectedReview: c.expected, feedback, status: "needs-human-review" }, null, 2), { mode: 0o600 })
      console.log(`${c.id}: структурный контракт и ссылки проверены; качество требует экспертного чтения.`)
    }
    console.log(`Результаты: ${dir}`)
  } catch (error) {
    console.error(error instanceof AppError ? `${error.code}: ${error.message}` : "Проверка не завершилась. Результат не считается пройденным.")
    process.exitCode = 1
  }
}
