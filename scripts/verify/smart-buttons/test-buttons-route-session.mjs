import assert from "node:assert/strict"
const { GET } = await import("@/app/checkout/buttons/route")
const SID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const req = (qs) => ({ nextUrl: new URL("https://pay.example.com/checkout/buttons" + qs) })
const ROW = {
  id: SID, store_id: "st", merchant_account_id: "ma", shield_domain: "pay.example.com", context: "cart",
  amount: "20.00", currency: "USD", intent: "CAPTURE", allowed_origins: ["https://shop.example.com"],
  expires_at: new Date(Date.now() + 600e3).toISOString(), client_id: " PINNED-CID ",
}
let seen = null
const use = (rows) => { seen = null; globalThis.__harnessSql = (s, ...v) => { seen = { q: s.join("?"), v }; return rows } }

use([ROW])
let r = await GET(req(`?session=${SID}`))
assert.equal(r.status, 200)
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors https://shop.example.com")
assert.equal(r.headers.get("cache-control"), "no-store")
let html = await r.text()
assert.ok(html.includes("client-id=PINNED-CID&amp;"), "SDK uses the pinned account")
assert.ok(html.includes('"express":true'))
assert.ok(html.includes("create-order"), "session runtime, not the fixed-order page")
assert.ok(seen.q.includes("button_sessions"))
assert.deepEqual(seen.v, [SID])

use([{ ...ROW, expires_at: new Date(Date.now() - 1000).toISOString() }])
r = await GET(req(`?session=${SID}`))
assert.equal(r.status, 410)
assert.ok((await r.text()).includes('"expired"'))

use([])
r = await GET(req(`?session=${SID}`))
assert.equal(r.status, 404)

use([ROW])
r = await GET(req(`?session=not-a-uuid`))
assert.equal(r.status, 400)
assert.equal(seen, null, "malformed session id never reaches the DB")
console.log("PASS test-buttons-route-session")
