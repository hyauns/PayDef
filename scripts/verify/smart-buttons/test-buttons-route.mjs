import assert from "node:assert/strict"
const { GET } = await import("@/app/checkout/buttons/route")

const TX = "11111111-2222-3333-4444-555555555555"
const req = (qs) => ({ nextUrl: new URL("https://pay.example.com/checkout/buttons" + qs) })
const ROW = {
  id: TX, status: "PENDING", intent: "CAPTURE", original_currency: "USD",
  paypal_order_id: "5O190127TN364715T",
  checkout_expires_at: new Date(Date.now() + 10 * 60e3).toISOString(),
  merchant_success_url: "https://shop.example.com/thanks", merchant_cancel_url: null,
  client_id: "  AbCdClientId  ",
}
let queries = 0
const useRows = (rows) => { queries = 0; globalThis.__harnessSql = (strings, ...values) => { queries++; assert.deepEqual(values, [TX]); return rows } }

// invalid ref → 400, frame-ancestors 'none', no DB query
useRows([ROW])
let r = await GET(req("?ref=nope"))
assert.equal(r.status, 400)
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'")
assert.equal(r.headers.get("cache-control"), "no-store")
assert.equal(r.headers.get("x-frame-options"), null)
assert.equal(queries, 0, "invalid ref must not reach the DB")
assert.ok((await r.text()).includes('"invalid_ref"'))

// unknown tx → 404
useRows([])
r = await GET(req(`?ref=${TX}`))
assert.equal(r.status, 404)
assert.equal(queries, 1)

// happy path → 200 with merchant-only frame-ancestors and the trimmed client-id in the SDK URL
useRows([ROW])
r = await GET(req(`?ref=${TX}&et=whatever`))
assert.equal(r.status, 200)
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors https://shop.example.com")
assert.equal(r.headers.get("x-content-type-options"), "nosniff")
const body = await r.text()
assert.ok(body.includes("client-id=AbCdClientId&amp;"))
assert.ok(body.includes('"paypalOrderId":"5O190127TN364715T"'))

// finished tx → 409 page that posts the real outcome to the merchant origin
useRows([{ ...ROW, status: "COMPLETED" }])
r = await GET(req(`?ref=${TX}`))
assert.equal(r.status, 409)
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors https://shop.example.com")
const fin = await r.text()
assert.ok(fin.includes('"approved"') && fin.includes('"COMPLETED"'))
assert.ok(fin.includes(`https://shop.example.com/thanks?transaction_id=${TX}&status=COMPLETED`))

console.log("PASS test-buttons-route")
