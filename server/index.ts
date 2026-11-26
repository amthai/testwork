import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { buildApp } from "./app.js"
import { readConfig } from "./config.js"

if (existsSync(".env.local")) loadEnvFile(".env.local")
const config = readConfig()
const { app } = await buildApp(config)
await app.listen({ port: config.PORT, host: config.HOST })
process.stdout.write(`Proof server listening on ${config.HOST}:${config.PORT}\n`)
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)) })
