import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
// Must be set before lib/execute-token.ts is first used (it caches the validation).
const SECRET = "ab".repeat(32)
process.env.EXECUTE_HMAC_SECRET = SECRET
delete process.env.EXECUTE_TOKEN_MODE           // shadow (default): never blocks
const { GET } = await import("@/app/checkout/buttons/route")

const TX = "11111111-2222-3333-4444-555555555555"
const ROW = {
  id: TX, status: "PENDING", intent: "CAPTURE", original_currency: "USD", paypal_order_id: "O1",
  checkout_expires_at: new Date(Date.now() + 600e3).toISOString(),
  merchant_success_url: "https://shop.example.com/thanks", merchant_cancel_url: null, client_id: "c",
}
globalThis.__harnessSql = () => [ROW]
const req = (qs) => ({ nextUrl: new URL("https://pay.example.com/checkout/buttons" + qs) })
const good = createHmac("sha256", SECRET).update(TX).digest("hex")

// ── Minor 2: shadow mode renders, but never echoes a token that failed verification
let body = await (await GET(req(`?ref=${TX}&et=${"00".repeat(32)}`))).text()
assert.ok(body.includes('"executeToken":null'), "invalid et must not be echoed")
assert.equal(body.includes("00".repeat(32)), false)

body = await (await GET(req(`?ref=${TX}&et=${good}`))).text()
assert.ok(body.includes(`"executeToken":"${good}"`), "valid et is passed through")

console.log("PASS test-route-token")
