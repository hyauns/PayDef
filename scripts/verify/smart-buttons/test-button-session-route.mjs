import assert from "node:assert/strict"
const { POST } = await import("@/app/api/gateway/button-session/route")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS",
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const ACCT = {
  id: "acct-1", tenant_id: "tenant-1", client_id: "cid", client_secret: "x", shield_domain: "pay.example.com", proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
}
let inserted = null
globalThis.__harnessSql = (strings, ...values) => {
  const q = strings.join("?")
  if (q.includes("INSERT INTO button_sessions")) { inserted = values; return [{ id: "sess-9", expires_at: "2026-10-08T12:30:00.000Z" }] }
  if (q.includes("FROM   merchant_accounts ma")) return [ACCT]
  return [] // system_settings, display profiles: nothing configured
}
const req = (body) => ({ json: async () => body, headers: { get: () => null } })
const call = async (body) => { const r = await POST(req(body)); return { status: r.status, body: await r.json() } }

// unauthenticated
globalThis.__harnessStore = null
assert.equal((await call({ amount: 20, context: "cart" })).status, 401)

globalThis.__harnessStore = STORE
// validation
assert.equal((await call({ amount: 0, context: "cart" })).status, 400)
assert.equal((await call({ amount: 20, context: "mini" })).status, 400)
// flow off → enabled:false and no INSERT
globalThis.__harnessStore = { ...STORE, checkoutFlow: "REDIRECT" }
let r = await call({ amount: 20, context: "cart" })
assert.deepEqual(r, { status: 200, body: { enabled: false, reason: "flow" } })
assert.equal(inserted, null)

// happy path through the real wiring (rotation, profile, breaker run for real against fake SQL)
globalThis.__harnessStore = STORE
r = await call({ amount: 20, currency: "eur", context: "product" })
assert.equal(r.status, 200)
assert.equal(r.body.enabled, true)
assert.equal(r.body.sessionId, "sess-9")
assert.equal(r.body.embedUrl, "https://pay.example.com/checkout/buttons?session=sess-9")
assert.deepEqual(inserted, ["tenant-1", "store-1", "acct-1", "pay.example.com", "product", "20.00", "EUR", "CAPTURE", ["https://shop.example.com"]])
console.log("PASS test-button-session-route")
