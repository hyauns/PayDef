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

// Run the page's inline script and collect what it posts to the parent.
const posts = (page) => {
  const out = []
  const body = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop()
  const window = { parent: { postMessage: (m, origin) => out.push({ m, origin }) } }
  new Function("window", "document", body)(window, { getElementById: () => ({}) })
  return out
}

// An unknown / malformed session has no allowed origins to answer: the page is
// frameable and tells the shop at once (targetOrigin "*", no data but the code)
// so the shop falls back instead of waiting for its timeout.
use([])
r = await GET(req(`?session=${SID}`))
assert.equal(r.status, 404)
assert.ok(!String(r.headers.get("content-security-policy") ?? "").includes("frame-ancestors"), "unknown session page is frameable")
let sent = posts(await r.text())
assert.equal(sent.length, 1)
assert.equal(sent[0].origin, "*")
assert.equal(sent[0].m.source, "paydef-buttons")
assert.equal(sent[0].m.type, "error")
assert.equal(sent[0].m.code, "not_found")

use([ROW])
r = await GET(req(`?session=not-a-uuid`))
assert.equal(r.status, 400)
assert.equal(seen, null, "malformed session id never reaches the DB")
assert.ok(!String(r.headers.get("content-security-policy") ?? "").includes("frame-ancestors"))
sent = posts(await r.text())
assert.deepEqual(sent.map((s) => [s.origin, s.m.type, s.m.code]), [["*", "error", "invalid_ref"]])

// Everything else keeps its framing: expired session (carries the session's
// origins), and the transaction page's invalid ref
use([{ ...ROW, expires_at: new Date(Date.now() - 1000).toISOString() }])
r = await GET(req(`?session=${SID}`))
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors https://shop.example.com")
assert.deepEqual(posts(await r.text()).map((s) => s.origin), ["https://shop.example.com"])
r = await GET(req(`?ref=not-a-uuid`))
assert.equal(r.status, 400)
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'")
use([])
r = await GET(req(`?ref=${SID}`))
assert.equal(r.status, 404)
assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'")
console.log("PASS test-buttons-route-session")
