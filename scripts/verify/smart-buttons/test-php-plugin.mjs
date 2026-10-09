// Runs the plugin's PHP regression tests (scripts/verify/smart-buttons/php/test-*.php)
// in php-wasm — no PHP on PATH needed, no WordPress: php/wc-stubs.php fakes the
// few WP / WooCommerce pieces the tested plugin code touches.
//
// php-wasm comes from the npx cache that `npx @wp-playground/cli` (the WP rig in
// wp/) leaves behind, or from PHP_WASM_NODE_MODULES=<dir containing @php-wasm/>.
// Without it this test prints SKIP and passes.
import { createRequire } from "node:module"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

function findPhpWasm() {
  const dirs = []
  if (process.env.PHP_WASM_NODE_MODULES) dirs.push(process.env.PHP_WASM_NODE_MODULES)
  const npx = join(process.env.LOCALAPPDATA || join(process.env.HOME || "", ".npm"), "npm-cache", "_npx")
  const npxUnix = join(process.env.HOME || "", ".npm", "_npx")
  for (const root of [npx, npxUnix]) {
    if (existsSync(root)) for (const d of readdirSync(root)) dirs.push(join(root, d, "node_modules"))
  }
  return dirs.find((d) => existsSync(join(d, "@php-wasm", "node", "package.json")) && existsSync(join(d, "@php-wasm", "universal")))
}

const modules = findPhpWasm()
if (!modules) {
  console.log("SKIP test-php-plugin: php-wasm not found (run the WP rig once, or set PHP_WASM_NODE_MODULES)")
  process.exit(0)
}
const req = createRequire(join(modules, "noop.js"))
const { loadNodeRuntime, createNodeFsMountHandler } = req("@php-wasm/node")
const { PHP } = req("@php-wasm/universal")

const repo = fileURLToPath(new URL("../../../", import.meta.url))
const phpDir = fileURLToPath(new URL("./php/", import.meta.url))
const tests = readdirSync(phpDir).filter((f) => /^test-.*\.php$/.test(f)).sort()

let failed = 0
for (const t of tests) {
  const php = new PHP(await loadNodeRuntime("8.2", { emscriptenOptions: { processId: 1 } }))
  php.mkdir("/repo")
  await php.mount("/repo", createNodeFsMountHandler(repo))
  let r
  try {
    r = await php.run({ scriptPath: "/repo/scripts/verify/smart-buttons/php/" + t })
  } catch (e) {
    if (!e.response) throw e
    r = e.response // non-zero exit: PHP.run() throws, the response is attached
  }
  const out = r.text + (r.errors || "")
  const ok = r.exitCode === 0 && /^PASS /m.test(out) && !/(Fatal|Warning|Notice|Deprecated|Uncaught)/.test(out)
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"}  php/${t}`)
  if (!ok) console.log(out.split("\n").slice(0, 20).map((l) => "      " + l).join("\n"))
  php.exit()
}
process.exit(failed ? 1 : 0)
