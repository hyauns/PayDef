// Button-session page views must not move the SEQUENTIAL / TIME rotation pointer:
// only an order created on the pinned account does (advanceRotationPast).
import assert from "node:assert/strict"
const rot = await import("@/lib/merchant-rotation")

const A = { id: "acct-a" }
const B = { id: "acct-b" }
const updates = []
const tenants = {
  "t-seq": { rotation_strategy: "SEQUENTIAL", rotation_interval: 120, last_rotation_index: 0, last_rotation_at: null },
  "t-seq-default": { rotation_strategy: "SEQUENTIAL", rotation_interval: 120, last_rotation_index: 0, last_rotation_at: null },
  "t-time": { rotation_strategy: "TIME", rotation_interval: 60, last_rotation_index: 0, last_rotation_at: "2026-01-01T00:00:00Z" },
}
const sql = async (strings, ...values) => {
  const q = strings.join("?")
  if (q.includes("UPDATE tenants")) { updates.push({ q, values }); return [] }
  if (q.includes("FROM tenants")) return [tenants[values[0]]]
  return []
}

// ── SEQUENTIAL: page views (advance:false) keep showing the current account
assert.equal((await rot.selectByStrategy([A, B], "t-seq", sql, { advance: false })).id, "acct-a")
assert.equal((await rot.selectByStrategy([A, B], "t-seq", sql, { advance: false })).id, "acct-a")
assert.equal(updates.length, 0, "a page view wrote the rotation pointer")
// the order on A moves the pointer past A
await rot.advanceRotationPast([A, B], "acct-a", "t-seq", sql)
assert.equal(updates.length, 1)
assert.deepEqual(updates[0].values, [1, "t-seq"])
assert.equal((await rot.selectByStrategy([A, B], "t-seq", sql, { advance: false })).id, "acct-b")
// an account no longer in the list changes nothing
await rot.advanceRotationPast([A, B], "acct-gone", "t-seq", sql)
assert.equal(updates.length, 1)

// ── default (classic checkout) is unchanged: every call advances
assert.equal((await rot.selectByStrategy([A, B], "t-seq-default", sql)).id, "acct-a")
assert.equal((await rot.selectByStrategy([A, B], "t-seq-default", sql)).id, "acct-b")
assert.equal(updates.length, 3)
updates.length = 0

// ── TIME: interval elapsed → page views show the next account but do not rotate
assert.equal((await rot.selectByStrategy([A, B], "t-time", sql, { advance: false })).id, "acct-b")
assert.equal((await rot.selectByStrategy([A, B], "t-time", sql, { advance: false })).id, "acct-b")
assert.equal(updates.length, 0, "a page view rotated the TIME pointer")
// the order on B commits the rotation (index + timestamp)
await rot.advanceRotationPast([A, B], "acct-b", "t-time", sql)
assert.equal(updates.length, 1)
assert.match(updates[0].q, /last_rotation_at = NOW\(\)/)
assert.deepEqual(updates[0].values, [1, "t-time"])
// interval restarted → B stays current, and another order on B is a no-op
assert.equal((await rot.selectByStrategy([A, B], "t-time", sql, { advance: false })).id, "acct-b")
await rot.advanceRotationPast([A, B], "acct-b", "t-time", sql)
assert.equal(updates.length, 1)
updates.length = 0

// ── the button-session route itself never writes the pointer
const { POST } = await import("@/app/api/gateway/button-session/route")
const STORE = {
  id: "store-1", name: "Shop", tenantId: "t-route", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS",
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id) => ({
  id, tenant_id: "t-route", client_id: "cid", client_secret: "x", shield_domain: "pay.example.com", proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
})
const pinned = []
globalThis.__harnessStore = STORE
globalThis.__harnessSql = (strings, ...values) => {
  const q = strings.join("?")
  if (q.includes("UPDATE tenants")) { updates.push({ q, values }); return [] }
  if (q.includes("FROM tenants")) return [{ rotation_strategy: "SEQUENTIAL", rotation_interval: 120, last_rotation_index: 0, last_rotation_at: null }]
  if (q.includes("INSERT INTO button_sessions")) { pinned.push(values[2]); return [{ id: "sess-" + pinned.length, expires_at: "2026-10-08T12:30:00.000Z" }] }
  if (q.includes("FROM   merchant_accounts ma")) {
    // same tiebreaker as checkout: equal priorities keep one order
    assert.match(q, /ORDER BY ma\.priority DESC, ma\.id\b/)
    return [acct("acct-1"), acct("acct-2")]
  }
  return []
}
const req = (body) => ({ json: async () => body, headers: { get: () => null } })
for (let i = 0; i < 3; i++) assert.equal((await POST(req({ amount: 20, context: "cart" }))).status, 200)
assert.deepEqual(pinned, ["acct-1", "acct-1", "acct-1"])
assert.equal(updates.length, 0, "button-session route advanced the rotation pointer")
console.log("PASS test-rotation-advance")
