import assert from "node:assert/strict"
const sh = await import("@/lib/shield-health")

const NOW = new Date("2026-10-09T12:00:00Z")
const fresh = "2026-10-09T11:59:00Z"
const stale = "2026-10-09T11:50:00Z"
const A = { id: "a", shield_domain: "pay.dead.com" }
const B = { id: "b", shield_domain: "pay.ok.com" }
const C = { id: "c", shield_domain: "Pay.Dead.com." } // case + trailing dot
const D = { id: "d", shield_domain: null }
const health = [
  { domain: "pay.dead.com", probe_up: false, probe_checked_at: fresh },
  { domain: "pay.ok.com", probe_up: true, probe_checked_at: fresh },
]

// mode
delete process.env.SHIELD_HEALTH_MODE; assert.equal(sh.getShieldHealthMode(), "shadow")
process.env.SHIELD_HEALTH_MODE = " Enforce "; assert.equal(sh.getShieldHealthMode(), "enforce")
process.env.SHIELD_HEALTH_MODE = "on"; assert.equal(sh.getShieldHealthMode(), "shadow")

// enforce drops dead (incl. differently written domain), keeps order and no-shield accounts
let r = sh.filterHealthyShieldAccounts([A, B, C, D], health, "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["b", "d"])
assert.deepEqual(r.skipped, [{ accountId: "a", domain: "pay.dead.com" }, { accountId: "c", domain: "pay.dead.com" }])
// shadow keeps everything but reports the same skips
r = sh.filterHealthyShieldAccounts([A, B, C, D], health, "shadow", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a", "b", "c", "d"])
assert.equal(r.skipped.length, 2)
// stale / never probed / no row → healthy
r = sh.filterHealthyShieldAccounts([A], [{ ...health[0], probe_checked_at: stale }], "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a"])
r = sh.filterHealthyShieldAccounts([A], [{ ...health[0], probe_up: null }], "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a"])
r = sh.filterHealthyShieldAccounts([A], [], "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a"])
// empty stays empty in enforce (never widened back)
r = sh.filterHealthyShieldAccounts([A, C], health, "enforce", NOW)
assert.deepEqual(r.accounts, [])

// loadShieldHealth: one query with normalised, de-duplicated domains; never throws
let seen
const sqlOk = async (strings, ...values) => { seen = { q: strings.join("?"), values }; return health }
assert.deepEqual(await sh.loadShieldHealth(sqlOk, ["Pay.Dead.com", "pay.dead.com", null, "pay.ok.com"]), health)
assert.match(seen.q, /FROM shield_domains/)
assert.match(seen.q, /is_active\s*=\s*true/, "inactive duplicate rows cannot shadow the active one")
assert.deepEqual(seen.values[0], ["pay.dead.com", "pay.ok.com"])
assert.deepEqual(await sh.loadShieldHealth(async () => { throw new Error("db down") }, ["pay.ok.com"]), [])
let queried = false
assert.deepEqual(await sh.loadShieldHealth(async () => { queried = true; return [] }, [null]), [])
assert.equal(queried, false, "no query without domains")

// applyShieldHealth: refusedAll only in enforce with a non-empty pool that became empty
r = await sh.applyShieldHealth([A, C], sqlOk, { storeId: "s", tenantId: "t" }, "enforce", NOW)
assert.equal(r.refusedAll, true)
r = await sh.applyShieldHealth([A, C], sqlOk, { storeId: "s", tenantId: "t" }, "shadow", NOW)
assert.equal(r.refusedAll, false); assert.equal(r.accounts.length, 2)
r = await sh.applyShieldHealth([], sqlOk, { storeId: "s", tenantId: "t" }, "enforce", NOW)
assert.equal(r.refusedAll, false)
console.log("PASS test-filter")
