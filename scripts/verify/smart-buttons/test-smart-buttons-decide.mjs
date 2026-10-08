import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")

const TX = "11111111-2222-3333-4444-555555555555"

// buildSmartButtonsUrl
assert.equal(
  sb.buildSmartButtonsUrl("pay.example.com", TX, "abc"),
  `https://pay.example.com/checkout/buttons?ref=${TX}&et=abc`
)
assert.equal(
  sb.buildSmartButtonsUrl("pay.example.com", TX, null),
  `https://pay.example.com/checkout/buttons?ref=${TX}`
)
assert.ok(sb.buildSmartButtonsUrl(null, TX, null).startsWith("https://checkout.service-portal.com/checkout/buttons?"))

// frameAncestorOrigins — https always, http only for local dev hosts, dedupe, junk ignored
assert.deepEqual(
  sb.frameAncestorOrigins([
    "https://shop.example.com/checkout/order-received/12?key=x",
    "https://shop.example.com/cart",
    "http://evil.example.com/",
    "http://localhost:4101/thanks",
    "http://127.0.0.1:8080/",
    "javascript:alert(1)",
    "not a url",
    null,
    undefined,
    "",
  ]),
  ["https://shop.example.com", "http://localhost:4101", "http://127.0.0.1:8080"]
)

// frameAncestorsCsp
assert.equal(sb.frameAncestorsCsp(["https://a.com", "https://b.com"]), "frame-ancestors https://a.com https://b.com")
assert.equal(sb.frameAncestorsCsp([]), "frame-ancestors 'none'")

// toSdkIntent
assert.equal(sb.toSdkIntent("AUTHORIZE"), "authorize")
assert.equal(sb.toSdkIntent("CAPTURE"), "capture")
assert.equal(sb.toSdkIntent(null), "capture")

// isTransactionRef
assert.equal(sb.isTransactionRef(TX), true)
assert.equal(sb.isTransactionRef("1; DROP TABLE"), false)
assert.equal(sb.isTransactionRef(null), false)

// decideButtonPage
const NOW = new Date("2026-10-08T12:00:00Z")
const ROW = {
  id: TX,
  status: "PENDING",
  intent: "AUTHORIZE",
  original_currency: "EUR",
  paypal_order_id: "5O190127TN364715T",
  checkout_expires_at: "2026-10-08T12:20:00Z",
  merchant_success_url: "https://shop.example.com/thanks",
  merchant_cancel_url: "https://shop.example.com/cart",
  client_id: "AbCdClientId",
}
const ok = sb.decideButtonPage({ row: ROW, executeToken: "tok", tokenShouldBlock: false, now: NOW })
assert.equal(ok.kind, "render")
assert.deepEqual(ok.allowedOrigins, ["https://shop.example.com"])
assert.deepEqual(ok.config, {
  transactionId: TX,
  executeToken: "tok",
  paypalOrderId: "5O190127TN364715T",
  clientId: "AbCdClientId",
  currency: "EUR",
  intent: "authorize",
  successUrl: "https://shop.example.com/thanks",
  cancelUrl: "https://shop.example.com/cart",
})

const err = (input) => {
  const d = sb.decideButtonPage({ row: ROW, executeToken: "tok", tokenShouldBlock: false, now: NOW, ...input })
  assert.equal(d.kind, "error")
  return [d.status, d.code]
}
assert.deepEqual(err({ row: null }), [404, "not_found"])
assert.deepEqual(err({ tokenShouldBlock: true }), [403, "invalid_token"])
assert.equal(sb.decideButtonPage({ row: { ...ROW, status: "COMPLETED" }, executeToken: "tok", tokenShouldBlock: false, now: NOW }).kind, "finished")
assert.equal(sb.decideButtonPage({ row: { ...ROW, checkout_expires_at: "2026-10-08T11:59:59Z" }, executeToken: "tok", tokenShouldBlock: false, now: NOW }).kind, "finished")
assert.deepEqual(err({ row: { ...ROW, paypal_order_id: null } }), [409, "no_paypal_order"])
assert.deepEqual(
  err({ row: { ...ROW, merchant_success_url: null, merchant_cancel_url: "http://shop.example.com/" } }),
  [409, "framing_not_configured"]
)
// finished decisions still carry the origins so the error page can tell the parent
assert.deepEqual(
  sb.decideButtonPage({ row: { ...ROW, status: "COMPLETED" }, executeToken: null, tokenShouldBlock: false, now: NOW }).allowedOrigins,
  ["https://shop.example.com"]
)
// currency fallback
const noCur = sb.decideButtonPage({ row: { ...ROW, original_currency: null }, executeToken: null, tokenShouldBlock: false, now: NOW })
assert.equal(noCur.config.currency, "USD")

console.log("PASS test-smart-buttons-decide")
