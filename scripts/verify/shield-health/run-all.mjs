// Verification suite for the shield domain health check. Same harness as
// scripts/verify/smart-buttons (type-stripping + @/ alias hook + stubs).
// No database and no network. Run:  npm run verify:shield-health
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const hook = new URL("../smart-buttons/alias-hook.mjs", import.meta.url).href
const tests = readdirSync(here).filter((f) => /^test-.*\.mjs$/.test(f)).sort()

let failed = 0
for (const t of tests) {
  const r = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--import", hook, t], {
    cwd: here,
    encoding: "utf8",
  })
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"}  ${t}`)
  if (!ok) console.log((r.stdout + r.stderr).split("\n").slice(0, 12).map((l) => "      " + l).join("\n"))
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed ? 1 : 0)
