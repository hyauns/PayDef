import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")
const html = sb.renderButtonsPage({ transactionId: "t", executeToken: null, paypalOrderId: "o", clientId: "c", currency: "USD", intent: "capture", successUrl: "https://a.com/x", cancelUrl: null }, ["https://a.com"])
// The Continue link starts with the hidden attribute; an author rule like
// #paydef-continue{display:inline-block} overrides it (found in Task 11 e2e).
assert.ok(html.includes('<a id="paydef-continue" target="_top" hidden>'))
const style = html.match(/<style>([^<]*)<\/style>/)[1]
assert.ok(/\[hidden\]\{display:none( !important)?\}/.test(style), "a [hidden]{display:none} rule must win over #paydef-continue{display:...}")
const idRule = style.match(/#paydef-continue\{[^}]*\}/)
const hiddenIsMoreSpecific = /#paydef-continue\[hidden\]\{display:none\}/.test(style) || /\[hidden\]\{display:none !important\}/.test(style)
assert.ok(!idRule || !/display/.test(idRule[0]) || hiddenIsMoreSpecific, "the id rule must not beat [hidden]")
console.log("PASS test-continue-hidden")
