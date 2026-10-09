import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")

const CFG = {
  transactionId: "11111111-2222-3333-4444-555555555555",
  executeToken: "tok123",
  paypalOrderId: "5O190127TN364715T",
  clientId: "AbC-d_123",
  currency: "EUR",
  intent: "authorize",
  successUrl: "https://shop.example.com/thanks",
  cancelUrl: "https://shop.example.com/cart",
}
const ORIGINS = ["https://shop.example.com"]

// SDK URL
const sdk = sb.buildSdkUrl(CFG)
const u = new URL(sdk)
assert.equal(u.origin + u.pathname, "https://www.paypal.com/sdk/js")
assert.equal(u.searchParams.get("client-id"), "AbC-d_123")
assert.equal(u.searchParams.get("currency"), "EUR")
assert.equal(u.searchParams.get("intent"), "authorize")
assert.equal(u.searchParams.get("components"), "buttons")
assert.equal(u.searchParams.get("integration-date"), "2026-10-08")

// Page
const html = sb.renderButtonsPage(CFG, ORIGINS)
assert.ok(html.startsWith("<!doctype html>"))
assert.ok(html.includes(sdk.replace(/&/g, "&amp;")), "SDK src must be the HTML-escaped SDK URL")
assert.ok(html.includes('"paypalOrderId":"5O190127TN364715T"'))
assert.ok(html.includes('["https://shop.example.com"]'))
assert.ok(html.includes("/api/gateway/execute"))
assert.ok(html.includes("/api/gateway/browser-status/"))
assert.ok(html.includes('id="paydef-buttons"'))
assert.ok(html.includes('target="_top"'), "fallback Continue link must navigate the top window")
// Review Focus 1: a cancel in the PayPal popup must NOT cancel the transaction
assert.equal(html.includes("browser-result"), false)
// Never broadcast
assert.equal(/postMessage\([^)]*["']\*["']/.test(html), false)

// Review Focus 2: hostile values cannot break out of the inline script or attribute
const evil = sb.renderButtonsPage(
  { ...CFG, paypalOrderId: '</script><script>alert(1)</script>', successUrl: 'https://x.com/"><img src=x onerror=alert(2)>', clientId: 'a"b<c' },
  ORIGINS
)
assert.equal(evil.includes("</script><script>alert(1)"), false)
assert.equal(evil.includes("<img src=x"), false)
assert.equal(evil.includes('client-id=a"b'), false)
assert.equal((evil.match(/<\/script>/g) || []).length, (html.match(/<\/script>/g) || []).length)

// Error page (Review Focus 4)
const errHtml = sb.renderButtonsErrorPage("expired", ORIGINS)
assert.ok(errHtml.includes('"expired"'))
assert.ok(errHtml.includes('"error"'))
assert.ok(errHtml.includes('["https://shop.example.com"]'))
assert.equal(errHtml.includes("paypal.com/sdk"), false)

// Express sessions (cart / product) price shipping through onShippingAddressChange.
// PayPal's guest "Debit or Credit Card" button is not shown there, so a payment
// can never skip the shipping callback; the checkout page (address typed by the
// buyer) keeps the card button.
{
  const page = (express) => sb.renderSessionButtonsPage({ sessionId: "S", clientId: "cid", currency: "USD", intent: "capture", express }, ["https://shop.example.com"])
  assert.match(page(true), /disable-funding=card/)
  assert.doesNotMatch(page(false), /disable-funding/)
  assert.doesNotMatch(sb.buildSdkUrl({ clientId: "cid", currency: "USD", intent: "capture" }), /disable-funding/)
}
console.log("PASS test-smart-buttons-render")
