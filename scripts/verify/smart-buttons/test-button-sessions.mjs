import assert from "node:assert/strict"
const bs = await import("@/lib/button-sessions")

// pickPinnedAccount
assert.equal(bs.pickPinnedAccount([{ id: "a" }, { id: "b" }], { merchant_account_id: "b" }).id, "b")
assert.equal(bs.pickPinnedAccount([{ id: "a" }], { merchant_account_id: "b" }), null)

// isButtonContext
assert.equal(bs.isButtonContext("cart"), true)
assert.equal(bs.isButtonContext("checkout"), true)
assert.equal(bs.isButtonContext("product"), true)
assert.equal(bs.isButtonContext("mini"), false)
assert.equal(bs.isButtonContext(null), false)

// buildSessionEmbedUrl
assert.equal(bs.buildSessionEmbedUrl("pay.example.com", "S", "T"), "https://pay.example.com/checkout/buttons?session=S&st=T")
assert.equal(bs.buildSessionEmbedUrl("pay.example.com", "S", null), "https://pay.example.com/checkout/buttons?session=S")

// sessionToken is null when the HMAC feature is disabled (no secret in the harness); verify passes then
assert.equal(bs.sessionToken("S"), null)
assert.equal(bs.verifySessionToken("S", null).shouldBlock, false)

// decideSessionPage
const NOW = new Date("2026-10-08T12:00:00Z")
const ROW = {
  id: "11111111-2222-3333-4444-555555555555", store_id: "st", merchant_account_id: "ma", shield_domain: "pay.example.com",
  context: "cart", amount: "20.00", currency: "usd", intent: "AUTHORIZE",
  allowed_origins: ["https://shop.example.com"], expires_at: "2026-10-08T12:30:00Z", client_id: "  CID  ",
}
const d = (row, block = false) => bs.decideSessionPage({ row, tokenShouldBlock: block, now: NOW })
assert.deepEqual(d(null), { kind: "error", status: 404, code: "not_found", allowedOrigins: [] })
assert.equal(d(ROW, true).code, "invalid_token")
assert.equal(d(ROW, true).status, 403)
assert.equal(d({ ...ROW, expires_at: "2026-10-08T11:59:59Z" }).code, "expired")
assert.equal(d({ ...ROW, expires_at: "2026-10-08T11:59:59Z" }).status, 410)
assert.equal(d({ ...ROW, allowed_origins: [] }).code, "framing_not_configured")
const r = d(ROW)
assert.equal(r.kind, "render")
assert.deepEqual(r.allowedOrigins, ["https://shop.example.com"])
assert.deepEqual(r.config, { sessionId: ROW.id, clientId: "CID", currency: "USD", intent: "authorize", express: true })
assert.equal(d({ ...ROW, context: "checkout" }).config.express, false)
assert.equal(d({ ...ROW, context: "product" }).config.express, true)
assert.equal(d({ ...ROW, intent: "CAPTURE" }).config.intent, "capture")
console.log("PASS test-button-sessions")

// purgeExpiredButtonSessions: deletes sessions a day past expiry, in batches;
// before migration 030 (no table) it is a no-op, not an error
{
  const seen = []
  const fakeSql = async (strings, ...values) => { seen.push(strings.join("?")); return [{ id: "x" }, { id: "y" }] }
  assert.equal(await bs.purgeExpiredButtonSessions(fakeSql), 2)
  assert.match(seen[0], /DELETE FROM button_sessions/)
  assert.match(seen[0], /expires_at < now\(\) - interval '1 day'/)
  assert.match(seen[0], /LIMIT 5000/)
  const missing = async () => { const e = new Error('relation "button_sessions" does not exist'); e.code = "42P01"; throw e }
  assert.equal(await bs.purgeExpiredButtonSessions(missing), 0)
  const down = async () => { throw new Error("connection refused") }
  await assert.rejects(bs.purgeExpiredButtonSessions(down), /connection refused/)
}
console.log("PASS purgeExpiredButtonSessions")
