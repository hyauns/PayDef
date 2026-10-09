// /api/gateway/checkout with a button session, run through the real route with a
// fake pool / SQL / PayPal fetch.
import assert from "node:assert/strict"
const { POST } = await import("@/app/api/gateway/checkout/route")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS",
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id, extra = {}) => ({
  id, tenant_id: "tenant-1", client_id: "cid-" + id, client_secret: "secret", shield_domain: "pay.example.com", proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
  ...extra,
})
const SESSION = {
  id: "11111111-2222-3333-4444-555555555555", store_id: "store-1", merchant_account_id: "acct-1", context: "checkout",
  amount: "20.00", currency: "USD", expires_at: new Date(Date.now() + 600_000).toISOString(),
}

let scenario
const sqlLog = []
globalThis.__harnessStore = STORE
globalThis.__harnessSql = (strings, ...values) => {
  const q = strings.join("?")
  sqlLog.push({ q, values })
  if (q.includes("FROM   button_sessions")) return [scenario.session]
  if (q.includes("FROM tenants")) return [{ rotation_strategy: "SEQUENTIAL", rotation_interval: 120, last_rotation_index: 0, last_rotation_at: null }]
  return []
}
globalThis.__harnessPool = {
  connect: async () => ({
    release() {},
    async query(text, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] }
      if (text.includes("FROM   merchant_accounts ma")) return { rows: scenario.accounts }
      if (text.includes("FOR UPDATE")) return { rows: [scenario.locked(params[0])] }
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
  const r = await POST({ json: async () => body, headers: { get: () => null } })
  return { status: r.status, body: await r.json() }
}
const BODY = { amount: 20, currency: "USD", itemName: "Thing", buttonSessionId: SESSION.id }

// ── Fix 1: an order on the pinned account moves the SEQUENTIAL pointer past it
scenario = { session: SESSION, accounts: [acct("acct-1"), acct("acct-2")], locked: (id) => acct(id) }
let r = await call(BODY)
assert.equal(r.status, 201, JSON.stringify(r.body))
const upd = sqlLog.filter((s) => s.q.includes("UPDATE tenants"))
assert.equal(upd.length, 1, "checkout did not advance the rotation pointer")
assert.deepEqual(upd[0].values, [1, "tenant-1"])

// ── Fix 2: single-account tenant, the pinned account fails the locked re-check
// (volume committed meanwhile) → 409 for the session, not 403 "System Overloaded"
scenario = { session: SESSION, accounts: [acct("acct-1")], locked: (id) => acct(id, { current_volume: "995" }) }
r = await call(BODY)
assert.equal(r.status, 409, JSON.stringify(r.body))
assert.equal(r.body.code, "button_session_account_unavailable")
// same when the pinned account is gone from the pool entirely
scenario = { session: SESSION, accounts: [], locked: (id) => acct(id) }
r = await call(BODY)
assert.equal(r.status, 409, JSON.stringify(r.body))
assert.equal(r.body.code, "button_session_account_unavailable")

console.log("PASS test-checkout-session-route")
