import { randomBytes } from "node:crypto"
import { existsSync, lstatSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

const target = resolve(".env.local")
if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("Refusing a symlink env target.")
try { execFileSync("git", ["ls-files", "--error-unmatch", ".env.local"], { stdio: "ignore" }); throw new Error("Refusing a tracked env file.") }
catch (error) { if (!(error && typeof error === "object" && "status" in error && error.status === 1)) throw error }
const previous = existsSync(target) ? readFileSync(target, "utf8") : ""
if (/^PROOF_ACCESS_CODE=.+$/m.test(previous)) process.stdout.write("Access code is already configured; existing value preserved.\n")
else {
  const code = randomBytes(18).toString("base64url")
  const next = previous.replace(/^PROOF_ACCESS_CODE=.*\n?/m, "").trimEnd() + `\nPROOF_ACCESS_CODE=${code}\n`
  writeFileSync(target, next, { mode: 0o600 }); chmodSync(target, 0o600)
  process.stdout.write("PROOF_ACCESS_CODE saved to ignored .env.local. The value was not printed.\n")
}
