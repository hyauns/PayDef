// Verification suite for PayPal Smart Buttons (checkout_flow = SMART_BUTTONS).
// The repo has no test runner, so each test-*.mjs is a plain assertion script run
// through Node's TypeScript type-stripping with an @/ alias loader and stubs for
// modules that cannot load outside Next (neon/pg, https-proxy-agent, next/server).
// No database and no network. Run:  npm run verify:smart-buttons
// Sandbox end-to-end test (needs PayPal sandbox app credentials): see e2e-server.mjs
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const hook = new URL("alias-hook.mjs", import.meta.url).href
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
