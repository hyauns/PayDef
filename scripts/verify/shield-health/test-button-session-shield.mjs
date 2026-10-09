import assert from "node:assert/strict"
const { createButtonSession } = await import("@/lib/button-session-create")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS",
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id, domain) => ({
  id, tenant_id: "tenant-1", client_id: "cid-" + id, client_secret: "x", shield_domain: domain, proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
})
const input = { store: STORE, amount: 20, currency: "USD", context: "cart", defaultFlow: "REDIRECT" }
const deps = (accounts, filterShieldHealth) => {
  const d = {
    seen: null,
    loadAccounts: async () => accounts,
    preferredProfileId: async () => null,
    filterOpenCircuits: async (a) => a,
    selectByStrategy: async (a) => { d.seen = a.map((x) => x.id); return a[0] },
    insertSession: async () => ({ id: "sess-1", expires_at: "2026-10-09T12:30:00Z" }),
  }
  if (filterShieldHealth) d.filterShieldHealth = filterShieldHealth
  return d
}
const dropDead = async (a) => a.filter((x) => x.shield_domain !== "pay.dead.com")

// dead account never pinned; rotation sees the filtered list
let d = deps([acct("a", "pay.dead.com"), acct("b", "pay.ok.com")], dropDead)
let r = await createButtonSession(d, input)
assert.equal(r.enabled, true)
assert.deepEqual(d.seen, ["b"])
assert.match(r.embedUrl, /pay\.ok\.com/)

// all dead → shield_unavailable (not no_account)
r = await createButtonSession(deps([acct("a", "pay.dead.com")], dropDead), input)
assert.deepEqual(r, { enabled: false, reason: "shield_unavailable" })

// no accounts at all stays no_account; dep omitted = unchanged behaviour
r = await createButtonSession(deps([], dropDead), input)
assert.deepEqual(r, { enabled: false, reason: "no_account" })
d = deps([acct("a", "pay.dead.com")])
r = await createButtonSession(d, input)
assert.equal(r.enabled, true)
console.log("PASS test-button-session-shield")
