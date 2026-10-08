import assert from "node:assert/strict"
import fs from "node:fs"

const src = fs.readFileSync(new URL("../../../app/docs/api/page.tsx", import.meta.url), "utf8")
const snippet = src.match(/const smartButtonsSnippet = `([\s\S]*?)`/)[1]
const script = snippet.match(/<script>([\s\S]*?)<\/script>/)[1]

const EMBED = "https://pay.example.com/checkout/buttons?ref=abc"
const APPROVAL = "https://www.paypal.com/checkoutnow?token=X"

function run(messages) {
  let timer = null
  const listeners = []
  const window = {
    location: { href: "https://shop.example.com/checkout" },
    addEventListener: (type, fn) => { if (type === "message") listeners.push(fn) },
  }
  const frame = { style: {} }
  const document = { createElement: () => frame, getElementById: () => ({ appendChild() {} }) }
  const setTimeout = (fn, ms) => { timer = { fn, ms }; return 1 }
  const clearTimeout = () => { timer = null }
  const code = script.replace("{{embedUrl}}", EMBED).replace("{{approvalUrl}}", APPROVAL)
  new Function("window", "document", "setTimeout", "clearTimeout", "URL", code)(window, document, setTimeout, clearTimeout, URL)
  for (const [origin, data] of messages) listeners.forEach((fn) => fn({ origin, data }))
  return { window, timer, frame }
}

// frame refused → no message → the timer fires → redirect fallback
let r = run([])
assert.equal(r.timer.ms, 10000)
r.timer.fn()
assert.equal(r.window.location.href, APPROVAL)

// ready → timer cleared, buyer stays
r = run([["https://pay.example.com", { source: "paydef-buttons", type: "ready" }]])
assert.equal(r.timer, null)
assert.equal(r.window.location.href, "https://shop.example.com/checkout")

// approved → goes to redirectUrl
r = run([["https://pay.example.com", { source: "paydef-buttons", type: "ready" }],
         ["https://pay.example.com", { source: "paydef-buttons", type: "approved", redirectUrl: "https://shop.example.com/thanks?x=1" }]])
assert.equal(r.window.location.href, "https://shop.example.com/thanks?x=1")

// a foreign origin cannot mark it ready or redirect the buyer
r = run([["https://evil.example.com", { source: "paydef-buttons", type: "approved", redirectUrl: "https://evil.example.com/" }]])
assert.equal(r.window.location.href, "https://shop.example.com/checkout")
assert.notEqual(r.timer, null)

console.log("PASS test-docs-snippet")
