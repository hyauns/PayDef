import assert from "node:assert/strict"
const bs = await import("@/lib/button-sessions")
const NOW = new Date("2026-10-08T12:00:00Z")
const ROW = { id: "s1", store_id: "store-1", merchant_account_id: "a1", context: "cart", amount: "20.00", currency: "USD", expires_at: "2026-10-08T12:30:00Z" }
assert.deepEqual(bs.resolveCheckoutSession(ROW, "store-1", NOW, "USD"), { ok: true, session: ROW })
assert.deepEqual(bs.resolveCheckoutSession(null, "store-1", NOW, "USD"), { ok: false, status: 409, code: "button_session_invalid" })
assert.deepEqual(bs.resolveCheckoutSession(ROW, "store-2", NOW, "USD"), { ok: false, status: 409, code: "button_session_invalid" })
assert.deepEqual(bs.resolveCheckoutSession({ ...ROW, expires_at: "2026-10-08T11:00:00Z" }, "store-1", NOW, "USD"), { ok: false, status: 409, code: "button_session_invalid" })
// the order must be in the session's currency (case-insensitive)
assert.deepEqual(bs.resolveCheckoutSession(ROW, "store-1", NOW, "usd"), { ok: true, session: ROW })
assert.deepEqual(bs.resolveCheckoutSession(ROW, "store-1", NOW, "EUR"), { ok: false, status: 409, code: "button_session_invalid" })
// express only off the checkout page, and only with a session
assert.equal(bs.isExpressCheckout({ express: true }, ROW), true)
assert.equal(bs.isExpressCheckout({ express: true }, { ...ROW, context: "checkout" }), false)
assert.equal(bs.isExpressCheckout({ express: true }, null), false)
assert.equal(bs.isExpressCheckout({ express: false }, ROW), false)
console.log("PASS test-checkout-pin")
