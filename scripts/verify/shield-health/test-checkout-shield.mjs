// /api/gateway/checkout with dead shields, through the real route.
import assert from "node:assert/strict"
process.env.SHIELD_HEALTH_MODE = "enforce"
delete process.env.UPSTASH_REDIS_REST_URL // circuit breaker off
const { POST } = await import("@/app/api/gateway/checkout/route")
const { clearRotationCache } = await import("@/lib/merchant-rotation")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS", // as in test-checkout-session-route.mjs; button sessions need it
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id, domain) => ({
  id, tenant_id: "tenant-1", client_id: "cid-" + id, client_secret: "secret", shield_domain: domain, proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
})
const SESSION = {
  id: "11111111-2222-3333-4444-555555555555", store_id: "store-1", merchant_account_id: "acct-dead", context: "checkout",
  amount: "20.00", currency: "USD", expires_at: new Date(Date.now() + 600_000).toISOString(),
}
const fresh = new Date(Date.now() - 30_000).toISOString()
const HEALTH = [
  { domain: "pay.dead.com", probe_up: false, probe_checked_at: fresh },
  { domain: "pay.ok.com", probe_up: true, probe_checked_at: fresh },
]

let scenario
let lockedIds = []
globalThis.__harnessStore = STORE
globalThis.__harnessSql = (strings, ...values) => {
  const q = strings.join("?")
  if (/FROM\s+shield_domains/.test(q) && q.includes("probe_up")) return HEALTH
  if (q.includes("FROM   button_sessions")) return [scenario.session]
  if (q.includes("UPDATE tenants")) return [{ id: "tenant-1" }]
  if (q.includes("FROM tenants")) return [{ rotation_strategy: "SEQUENTIAL", rotation_interval: 120, last_rotation_index: 0, last_rotation_at: null }]
  return []
}
globalThis.__harnessPool = {
  connect: async () => ({
    release() {},
    async query(text, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] }
      if (text.includes("FROM   merchant_accounts ma")) return { rows: scenario.accounts }
      if (text.includes("FOR UPDATE")) { lockedIds.push(params[0]); return { rows: [scenario.accounts.find((a) => a.id === params[0])] } }
      if (/RETURNING\s+id/i.test(text) || /gen_random_uuid/i.test(text)) return { rows: [{ id: "99999999-8888-7777-6666-555555555555" }] }
      return { rows: [] }
    },
  }),
}
globalThis.fetch = async (url) => {
  const u = String(url)
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: new Headers() })
  if (u.includes("/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 3600 })
  if (u.includes("/v2/checkout/orders")) return json({ id: "5O190127TN364715T", status: "CREATED", links: [{ rel: "approve", href: "https://www.paypal.com/checkoutnow?token=5O190127TN364715T" }, { rel: "payer-action", href: "https://www.paypal.com/checkoutnow?token=5O190127TN364715T" }] })
  return json({})
}
const call = async (body) => {
  clearRotationCache("tenant-1")
  const r = await POST({ json: async () => body, headers: { get: () => null } })
  return { status: r.status, body: await r.json() }
}
const BODY = { amount: 20, currency: "USD", itemName: "Thing" }

// all shields dead → 503 shield_unavailable, nothing locked
scenario = { accounts: [acct("acct-dead", "pay.dead.com"), acct("acct-dead2", "Pay.Dead.com")] }
lockedIds = []
let r = await call(BODY)
assert.equal(r.status, 503, JSON.stringify(r.body))
assert.equal(r.body.code, "shield_unavailable")
assert.equal(lockedIds.length, 0)

// one healthy → the order goes to it
scenario = { accounts: [acct("acct-dead", "pay.dead.com"), acct("acct-ok", "pay.ok.com")] }
lockedIds = []
r = await call(BODY)
assert.equal(r.status, 201, JSON.stringify(r.body))
assert.deepEqual(lockedIds, ["acct-ok"])

// button session pinned on a dead account → 409 (plugin renews the session)
scenario = { session: SESSION, accounts: [acct("acct-dead", "pay.dead.com"), acct("acct-ok", "pay.ok.com")] }
r = await call({ ...BODY, buttonSessionId: SESSION.id })
assert.equal(r.status, 409, JSON.stringify(r.body))
assert.equal(r.body.code, "button_session_account_unavailable")

// shadow: all dead, still routed exactly as before
process.env.SHIELD_HEALTH_MODE = "shadow"
scenario = { accounts: [acct("acct-dead", "pay.dead.com")] }
lockedIds = []
r = await call(BODY)
assert.equal(r.status, 201, JSON.stringify(r.body))
assert.deepEqual(lockedIds, ["acct-dead"])
console.log("PASS test-checkout-shield")
