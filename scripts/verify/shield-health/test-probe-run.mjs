import assert from "node:assert/strict"
const sh = await import("@/lib/shield-health")

const NOW = new Date("2026-10-09T12:00:00Z")
// shield_domains rows (state before this run)
const domains = [
  { id: "d1", domain: "pay.dead.com", probe_up: true, probe_failures: 1, probe_changed_at: null },     // 2nd failure → DOWN
  { id: "d2", domain: "pay.ok.com", probe_up: true, probe_failures: 0, probe_changed_at: null },       // stays UP
  { id: "d3", domain: "pay.back.com", probe_up: false, probe_failures: 9, probe_changed_at: "2026-10-09T10:00:00Z" }, // recovers
  { id: "d4", domain: "pay.orphan.com", probe_up: true, probe_failures: 1, probe_changed_at: null },   // DOWN, no account uses it
]
const accounts = [
  { id: "a1", name: "Choco <1>", tenant_id: "t1", shield_domain: "pay.dead.com", tenant_name: "T1", telegram_bot_token: "bot1", telegram_chat_id: "chat1" },
  { id: "a2", name: "Gibli", tenant_id: "t1", shield_domain: "pay.back.com", tenant_name: "T1", telegram_bot_token: "bot1", telegram_chat_id: "chat1" },
  { id: "a3", name: "Other", tenant_id: "t2", shield_domain: "pay.dead.com", tenant_name: "T2", telegram_bot_token: null, telegram_chat_id: null },
  // unregistered shield: only logged. (Tenant t2 on purpose — an account with no
  // shield_domains row counts as healthy, like in the filter, so in t1 it would
  // suppress the ⛔ line below.)
  { id: "a4", name: "Lost", tenant_id: "t2", shield_domain: "pay.unregistered.com", tenant_name: "T2", telegram_bot_token: null, telegram_chat_id: null },
]
const updates = []
const sql = async (strings, ...values) => {
  const q = strings.join("?")
  if (q.includes("FROM   shield_domains") && q.includes("is_active")) return domains
  if (q.includes("FROM   merchant_accounts")) return accounts
  if (q.includes("UPDATE shield_domains")) { updates.push({ q, values }); return [] }
  throw new Error("unexpected query: " + q)
}
const fetchImpl = async (url) =>
  String(url).includes("pay.dead.com") || String(url).includes("pay.orphan.com")
    ? (() => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e })()
    : { status: 200, text: async () => "shield-popup-ok" }
const sent = []
const send = async (bot, chat, text) => { sent.push({ bot, chat, text }); return { ok: true } }

let s = await sh.runShieldHealthProbe(sql, { mode: "shadow", fetchImpl, now: NOW, send })
assert.equal(s.probed, 4)
assert.deepEqual(s.down.sort(), ["pay.dead.com", "pay.orphan.com"])
assert.deepEqual(s.flips.map((f) => `${f.domain}:${f.to}`).sort(), ["pay.back.com:up", "pay.dead.com:down", "pay.orphan.com:down"])
assert.equal(updates.length, 4)
// shadow never writes health_ok; the enforce flag is passed as false
for (const u of updates) assert.match(u.q, /health_ok = CASE WHEN \?/)
const u1 = updates.find((u) => u.values.includes("d1"))
assert.ok(u1.values.includes(false), "probe_up=false written for d1")
assert.ok(u1.values.some((v) => typeof v === "string" && v.includes("ENOTFOUND")), "probe_error written")

// one Telegram message per tenant with a bot; tenant t2 has none; orphan domain → no recipient
assert.equal(sent.length, 1)
assert.equal(sent[0].bot, "bot1"); assert.equal(sent[0].chat, "chat1")
assert.match(sent[0].text, /Shield DOWN.*pay\.dead\.com/)
assert.match(sent[0].text, /ENOTFOUND/)
assert.match(sent[0].text, /Choco &lt;1&gt;/, "account names are HTML-escaped")
assert.match(sent[0].text, /shadow/)
assert.match(sent[0].text, /back UP.*pay\.back\.com.*2h/)
assert.doesNotMatch(sent[0].text, /No PayPal account/, "t1 still has pay.back.com healthy")
assert.equal(s.alerts, 1)

// enforce: health_ok written; all of t1's accounts dead → the ⛔ line
updates.length = 0; sent.length = 0
domains[0] = { ...domains[0], probe_up: true, probe_failures: 1 }
domains[2] = { ...domains[2], probe_up: true, probe_failures: 1 } // pay.back.com fails now too
const allDead = async (url) => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e }
s = await sh.runShieldHealthProbe(sql, { mode: "enforce", fetchImpl: allDead, now: NOW, send })
assert.ok(updates.every((u) => u.values.includes(true)), "enforce flag passed as true")
assert.equal(sent.length, 1)
assert.match(sent[0].text, /No PayPal account of T1 has a working shield.*refused/s)

// no flips → no messages
updates.length = 0; sent.length = 0
domains.forEach((d, i) => (domains[i] = { ...d, probe_up: false, probe_failures: 5 }))
s = await sh.runShieldHealthProbe(sql, { mode: "enforce", fetchImpl: allDead, now: NOW, send })
assert.equal(sent.length, 0); assert.equal(s.flips.length, 0)

// a Telegram failure is swallowed (pay.dead.com flips again → t1 gets a message → send throws)
domains[0] = { ...domains[0], probe_up: true, probe_failures: 1 }
s = await sh.runShieldHealthProbe(sql, { mode: "shadow", fetchImpl: allDead, now: NOW, send: async () => { throw new Error("telegram down") } })
assert.equal(s.flips.length, 1)

// safe wrapper never throws
const r = await sh.safeRunShieldHealthProbe(async () => { throw new Error("db down") }, { fetchImpl, now: NOW, send })
assert.match(r.error, /db down/)
console.log("PASS test-probe-run")
