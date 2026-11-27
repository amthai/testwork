import { resolve } from "node:path"
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("127.0.0.1"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  PROOF_PROVIDER: z.enum(["deepseek", "openai"]).optional(),
  DEEPSEEK_API_KEY: z.string().default(""),
  PROOF_TTS_PROVIDER: z.enum(["piper", "yandex"]).default("piper"),
  YANDEX_SPEECHKIT_API_KEY: z.string().trim().default(""),
  SPEECH_URL: z.string().url().default("http://127.0.0.1:8078"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  OPENAI_FEEDBACK_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  PROOF_ACCESS_CODE: z.string().default(""),
  DATA_DIR: z.string().default("data"),
  MAX_SESSION_SECONDS: z.coerce.number().int().min(30).max(2700).default(1800),
  DAILY_CALL_LIMIT_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
  MAX_DAILY_SESSIONS: z.coerce.number().int().positive().default(30),
  MAX_OWNER_DAILY_SESSIONS: z.coerce.number().int().positive().default(5),
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(3),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
})
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const value = envSchema.parse(env)
  if (value.NODE_ENV === "production" && (value.PROOF_ACCESS_CODE.length < 12 || !value.APP_ORIGIN.startsWith("https://"))) {
    throw new Error("Production requires HTTPS APP_ORIGIN and PROOF_ACCESS_CODE (at least 12 characters).")
  }
  const provider = value.PROOF_PROVIDER ?? (value.DEEPSEEK_API_KEY || !value.OPENAI_API_KEY ? "deepseek" : "openai")
  return { ...value, PROOF_PROVIDER: provider, DATA_DIR: resolve(value.DATA_DIR) }
}
export type Config = ReturnType<typeof readConfig>

export const hasModelKey = (config: Config) => Boolean(config.PROOF_PROVIDER === "deepseek" ? config.DEEPSEEK_API_KEY : config.OPENAI_API_KEY)
export const hasCallCredentials = (config: Config) => hasModelKey(config) &&
  (config.PROOF_PROVIDER !== "deepseek" || config.PROOF_TTS_PROVIDER !== "yandex" || Boolean(config.YANDEX_SPEECHKIT_API_KEY))
