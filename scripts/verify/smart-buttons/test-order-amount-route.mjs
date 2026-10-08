import assert from "node:assert/strict"
const { POST } = await import("@/app/api/gateway/order-amount/route")
const STORE = { id: "store-1", tenantId: "t", name: "Shop", providerType: "PAYPAL", captureMode: "INSTANT" }
const req = (body) => ({ json: async () => body, headers: { get: () => null } })
const call = async (body) => { const r = await POST(req(body)); return { status: r.status, body: await r.json() } }
const TX = "11111111-2222-3333-4444-555555555555"
let lastQuery = null
globalThis.__harnessSql = (strings, ...values) => { lastQuery = { q: strings.join("?"), values }; return [] }

globalThis.__harnessStore = null
assert.equal((await call({ transactionId: TX })).status, 401)
globalThis.__harnessStore = STORE
assert.equal((await call({ transactionId: "nope" })).status, 400)
let r = await call({ transactionId: TX, shipping: "9.00", taxTotal: "0", total: "29.00" })
assert.deepEqual(r, { status: 404, body: { error: "Transaction not found.", code: "not_found" } })
assert.deepEqual(lastQuery.values, [TX, "store-1"], "lookup is scoped to the authenticated store")
console.log("PASS test-order-amount-route")
