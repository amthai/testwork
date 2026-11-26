import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import OpenAI from "openai"
import { readConfig } from "../server/config.js"
import { providerError } from "../server/errors.js"

if (existsSync(".env.local")) loadEnvFile(".env.local")
const config = readConfig()
if (!config.OPENAI_API_KEY) { process.stderr.write("OPENAI_API_KEY is not configured.\n"); process.exit(1) }
const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 })
try {
  await client.models.retrieve(config.OPENAI_REALTIME_MODEL)
  const response = await client.responses.create({ model: config.OPENAI_FEEDBACK_MODEL, input: "Reply only OK.", max_output_tokens: 16, store: false })
  process.stdout.write(JSON.stringify({ realtimeModelAccessible: true, generation: response.status }) + "\n")
} catch (error) {
  const mapped = error instanceof OpenAI.APIError ? providerError(error.status ?? 502, error.code ?? undefined, error.type ?? undefined) : providerError(502)
  process.stderr.write(JSON.stringify({ code: mapped.code, message: mapped.message }) + "\n")
  process.exitCode = 1
}
