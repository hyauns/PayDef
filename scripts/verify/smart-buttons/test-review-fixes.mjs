import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")
const { buildFlowUrls } = await import("@/lib/checkout-flow")

const TX = "11111111-2222-3333-4444-555555555555"
const NOW = new Date("2026-10-08T12:00:00Z")
const ROW = {
  id: TX, status: "PENDING", intent: "CAPTURE", original_currency: "USD",
  paypal_order_id: "5O190127TN364715T", checkout_expires_at: "2026-10-08T12:20:00Z",
  merchant_success_url: "https://shop.example.com/thanks", merchant_cancel_url: "https://shop.example.com/cart",
  client_id: "AbCdClientId",
}
const fin = (row) => sb.decideButtonPage({ row, executeToken: null, tokenShouldBlock: false, now: NOW })
const q = (status) => `transaction_id=${TX}&status=${status}&paypal_order_id=5O190127TN364715T`

// ── Important 2: a finished transaction reports its real outcome, never "error"
let f = fin({ ...ROW, status: "COMPLETED" })
assert.equal(f.kind, "finished")
assert.equal(f.status, 409)
assert.deepEqual(f.allowedOrigins, ["https://shop.example.com"])
assert.deepEqual(f.result, { type: "approved", status: "COMPLETED", redirectUrl: `https://shop.example.com/thanks?${q("COMPLETED")}` })

assert.equal(fin({ ...ROW, status: "AUTHORIZED" }).result.type, "approved")

f = fin({ ...ROW, status: "FAILED" })
assert.deepEqual(f.result, { type: "failed", status: "FAILED", redirectUrl: `https://shop.example.com/cart?${q("FAILED")}` })

// time-expired but not yet swept → failed/EXPIRED to the cancel URL (not PayPal's approvalUrl)
f = fin({ ...ROW, checkout_expires_at: "2026-10-08T11:59:59Z" })
assert.equal(f.kind, "finished")
assert.equal(f.status, 410)
assert.deepEqual(f.result, { type: "failed", status: "EXPIRED", redirectUrl: `https://shop.example.com/cart?${q("EXPIRED")}` })

// no URL for that outcome → redirectUrl null; non-http(s) URL → null
assert.equal(fin({ ...ROW, status: "COMPLETED", merchant_success_url: null }).result.redirectUrl, null)
assert.equal(fin({ ...ROW, status: "COMPLETED", merchant_success_url: "javascript:alert(1)" }).result.redirectUrl, null)

// finished page posts the outcome and has no PayPal SDK
const page = sb.renderButtonsFinishedPage(fin({ ...ROW, status: "COMPLETED" }).result, ["https://shop.example.com"])
assert.ok(page.includes('"approved"'))
assert.ok(page.includes(`"redirectUrl":"https://shop.example.com/thanks?${q("COMPLETED")}"`))
assert.ok(page.includes('target="_top"'))
assert.equal(page.includes("paypal.com/sdk"), false)
assert.equal(page.includes('"error"'), false)
const evil = sb.renderButtonsFinishedPage({ type: "approved", status: "COMPLETED", redirectUrl: 'https://x.com/"><script>alert(1)</script>' }, ["https://x.com"])
assert.equal(evil.includes("<script>alert(1)"), false)
assert.equal(evil.includes('"><script'), false)
for (const body of [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) new Function(body)

// ── Important 1: never hand out an embedUrl the browser will refuse to frame
const base = { shieldDomain: "pay.example.com", approvalUrl: "https://www.paypal.com/checkoutnow?token=X", transactionId: TX, executeToken: "et1" }
const none = { popupUrl: null, popupOrigin: null, embedUrl: null, embedOrigin: null }
assert.deepEqual(buildFlowUrls({ ...base, flow: "SMART_BUTTONS", returnUrls: [] }), none)
assert.deepEqual(buildFlowUrls({ ...base, flow: "SMART_BUTTONS", returnUrls: [null, undefined] }), none)
assert.deepEqual(buildFlowUrls({ ...base, flow: "SMART_BUTTONS", returnUrls: ["http://shop.example.com/thanks"] }), none)
assert.equal(
  buildFlowUrls({ ...base, flow: "SMART_BUTTONS", returnUrls: ["https://shop.example.com/thanks"] }).embedUrl,
  `https://pay.example.com/checkout/buttons?ref=${TX}&et=et1`
)
// other flows ignore returnUrls entirely
assert.deepEqual(buildFlowUrls({ ...base, flow: "REDIRECT", returnUrls: [] }), none)
assert.ok(buildFlowUrls({ ...base, flow: "POPUP_BRIDGE", returnUrls: [] }).popupUrl)

console.log("PASS test-review-fixes")
