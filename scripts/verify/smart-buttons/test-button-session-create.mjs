import assert from "node:assert/strict"
const { createButtonSession } = await import("@/lib/button-session-create")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS",
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id, extra = {}) => ({
  id, tenant_id: "tenant-1", client_id: "cid-" + id, client_secret: "x", shield_domain: "pay-" + id + ".example.com", proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, ...extra,
})
function deps(over = {}) {
  const calls = { inserted: null, circuits: null, strategy: null }
  return {
    calls,
    loadAccounts: async () => [acct("a"), acct("b", { current_volume: "995" }), acct("c", { display_profile_id: "p1" })],
    preferredProfileId: async () => null,
    filterOpenCircuits: async (rows) => { calls.circuits = rows.map((r) => r.id); return rows },
    selectByStrategy: async (rows) => { calls.strategy = rows.map((r) => r.id); return rows[0] },
    insertSession: async (row) => { calls.inserted = row; return { id: "sess-1", expires_at: "2026-10-08T12:30:00.000Z" } },
    ...over,
  }
}
const input = (over = {}) => ({ store: STORE, amount: 20, currency: "usd", context: "cart", defaultFlow: "REDIRECT", ...over })

// flow not SMART_BUTTONS → disabled, nothing inserted
let d = deps()
assert.deepEqual(await createButtonSession(d, input({ store: { ...STORE, checkoutFlow: "REDIRECT" } })), { enabled: false, reason: "flow" })
assert.equal(d.calls.inserted, null)
// platform default is never SMART_BUTTONS; store override null → disabled
assert.equal((await createButtonSession(deps(), input({ store: { ...STORE, checkoutFlow: null }, defaultFlow: "POPUP_BRIDGE" }))).reason, "flow")
// Stripe / Shopify stores never get Smart Buttons
assert.equal((await createButtonSession(deps(), input({ store: { ...STORE, providerType: "STRIPE" } }))).reason, "flow")
// no https return URL → cannot be framed
assert.equal((await createButtonSession(deps(), input({ store: { ...STORE, successReturnUrl: "http://shop.example.com/x", cancelReturnUrl: null } }))).reason, "framing_not_configured")

// happy path: eligibility drops b (1000 limit, 995 used, +20); circuits + strategy see a,c; session row as expected
d = deps()
let r = await createButtonSession(d, input())
assert.equal(r.enabled, true)
assert.equal(r.sessionId, "sess-1")
assert.equal(r.embedUrl, "https://pay-a.example.com/checkout/buttons?session=sess-1")
assert.equal(r.embedOrigin, "https://pay-a.example.com")
assert.equal(r.expiresAt, "2026-10-08T12:30:00.000Z")
assert.deepEqual(d.calls.circuits, ["a", "c"])
assert.deepEqual(d.calls.strategy, ["a", "c"])
assert.deepEqual(d.calls.inserted, {
  tenant_id: "tenant-1", store_id: "store-1", merchant_account_id: "a", shield_domain: "pay-a.example.com",
  context: "cart", amount: "20.00", currency: "USD", intent: "CAPTURE", allowed_origins: ["https://shop.example.com"],
})

// display-profile preference: only matching accounts when any match
d = deps({ preferredProfileId: async () => "p1" })
await createButtonSession(d, input())
assert.deepEqual(d.calls.circuits, ["c"])
d = deps({ preferredProfileId: async () => "nope" })
await createButtonSession(d, input())
assert.deepEqual(d.calls.circuits, ["a", "c"])

// MANUAL capture store → AUTHORIZE sessions
d = deps()
await createButtonSession(d, input({ store: { ...STORE, captureMode: "MANUAL" } }))
assert.equal(d.calls.inserted.intent, "AUTHORIZE")

// nothing eligible (all over limit / circuits open) → disabled
assert.deepEqual(await createButtonSession(deps({ loadAccounts: async () => [acct("b", { current_volume: "995" })] }), input()), { enabled: false, reason: "no_account" })
assert.deepEqual(await createButtonSession(deps({ filterOpenCircuits: async () => [] }), input()), { enabled: false, reason: "no_account" })
console.log("PASS test-button-session-create")
