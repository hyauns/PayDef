import assert from "node:assert/strict"
const { probeShieldDomain, normalizeDomain } = await import("@/lib/shield-health")

const calls = []
const fake = (impl) => async (url, init) => { calls.push({ url, init }); return impl() }
const res = (status, body) => ({ status, text: async () => body })

let r = await probeShieldDomain("pay.a.com", fake(() => res(200, "shield-popup-ok\n")))
assert.deepEqual(r, { ok: true, status: 200, error: null })
assert.equal(calls[0].url, "https://pay.a.com/api/health/shield-popup")
assert.equal(calls[0].init.redirect, "manual")
assert.ok(calls[0].init.signal, "timeout signal")

r = await probeShieldDomain("pay.a.com", fake(() => res(200, "<html>parked</html>")))
assert.equal(r.ok, false); assert.equal(r.status, 200); assert.match(r.error, /unexpected body/)

r = await probeShieldDomain("pay.a.com", fake(() => res(307, "")))
assert.equal(r.ok, false); assert.equal(r.status, 307); assert.match(r.error, /HTTP 307/)

// non-200: the unread body is cancelled (fakes without a body still work, cancel errors ignored)
let cancelled = false
r = await probeShieldDomain("pay.a.com", fake(() => ({ status: 307, text: async () => "", body: { cancel() { cancelled = true; return Promise.resolve() } } })))
assert.equal(r.ok, false); assert.equal(cancelled, true, "body cancelled on non-200")
r = await probeShieldDomain("pay.a.com", fake(() => ({ status: 307, body: { cancel() { throw new Error("x") } } })))
assert.equal(r.status, 307)
r = await probeShieldDomain("pay.a.com", fake(() => ({ status: 307, body: { cancel() { return Promise.reject(new Error("x")) } } })))
assert.equal(r.status, 307)

r = await probeShieldDomain("pay.a.com", fake(() => res(502, "bad gateway")))
assert.equal(r.ok, false); assert.match(r.error, /HTTP 502/)

r = await probeShieldDomain("pay.a.com", fake(() => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e }))
assert.equal(r.ok, false); assert.equal(r.status, null); assert.match(r.error, /ENOTFOUND/)

r = await probeShieldDomain("pay.a.com", fake(() => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError") }))
assert.equal(r.ok, false); assert.match(r.error, /timeout/i)

// error text is bounded
r = await probeShieldDomain("pay.a.com", fake(() => { throw new Error("x".repeat(1000)) }))
assert.ok(r.error.length <= 200)

assert.equal(normalizeDomain(" Pay.A.com. "), "pay.a.com")
assert.equal(normalizeDomain(null), "")
console.log("PASS test-probe")
