import assert from "node:assert/strict"
const { buildFlowUrls } = await import("@/lib/checkout-flow")

const TX = "11111111-2222-3333-4444-555555555555"
const base = { shieldDomain: "pay.example.com", approvalUrl: "https://www.paypal.com/checkoutnow?token=X", transactionId: TX, executeToken: "et1", returnUrls: ["https://shop.example.com/thanks"] }

assert.deepEqual(buildFlowUrls({ ...base, flow: "REDIRECT" }), { popupUrl: null, popupOrigin: null, embedUrl: null, embedOrigin: null })

const popup = buildFlowUrls({ ...base, flow: "POPUP_BRIDGE" })
assert.ok(popup.popupUrl.startsWith("https://pay.example.com/checkout/popup?"))
assert.equal(popup.popupOrigin, "https://pay.example.com")
assert.equal(popup.embedUrl, null)
assert.equal(popup.embedOrigin, null)

const sb = buildFlowUrls({ ...base, flow: "SMART_BUTTONS" })
assert.equal(sb.embedUrl, `https://pay.example.com/checkout/buttons?ref=${TX}&et=et1`)
assert.equal(sb.embedOrigin, "https://pay.example.com")
assert.equal(sb.popupUrl, null)
assert.equal(sb.popupOrigin, null)

console.log("PASS test-flow-urls")
