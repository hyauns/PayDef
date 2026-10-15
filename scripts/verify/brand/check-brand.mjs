#!/usr/bin/env node
// Fails while user-visible "PayDef" branding remains. Wire identifiers that
// live merchants or stored data depend on are kept on purpose and allowed.
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const args = process.argv.slice(2)
const pluginDir = args[0] === "--plugin" ? args[1] : null

const ALLOWED = [
  /_?paydef[-_][a-z0-9_-]+/g, // paydef-buttons, paydef_txn, _paydef_*, paydef-woocommerce, data-paydef-mounted
  /\bPaydef_[A-Za-z_]+/g, // plugin PHP classes
  /\bPAYDEF_WC_[A-Z_]+/g, // plugin PHP constants
  /\bPAYDEF_WEBHOOK_URL\b/g, // legacy env fallback
  /tags: "paydef"/g, // Shopify order tag store owners may filter on
]
const BRAND = /paydef|gooytoy/i

function repoFiles() {
  const out = execSync("git ls-files app lib components scripts docs README.md .env.example", { encoding: "utf8" })
  return out.split("\n").filter(Boolean).filter((f) =>
    !f.startsWith("scripts/verify/") &&
    !f.startsWith("docs/superpowers/") &&
    !/^scripts\/[^/]+\.sql$/.test(f) &&
    /\.(tsx?|mjs|cjs|js|md|example)$/.test(f)
  )
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(php|js|txt)$/.test(name) ? [p] : []
  })
}

const files = pluginDir ? walk(pluginDir) : repoFiles()
const hits = []
for (const file of files) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const stripped = ALLOWED.reduce((s, re) => s.replace(re, ""), line)
    if (BRAND.test(stripped)) hits.push(`${pluginDir ? relative(pluginDir, file) : file}:${i + 1}: ${line.trim().slice(0, 140)}`)
  })
}

if (hits.length) {
  console.error(hits.join("\n"))
  console.error(`\n${hits.length} PayDef branding hit(s) left`)
  process.exit(1)
}
console.log(`brand ok (${files.length} files)`)
