import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")

const SHOP = "https://shop.example.com"
const CFG = { sessionId: "S1", clientId: "CID", currency: "USD", intent: "capture", express: true }

function boot(config) {
  const html = sb.renderSessionButtonsPage(config, [SHOP])
  const body = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop()
  const posted = []
  const listeners = []
  const els = { "paydef-buttons": { style: {} }, "paydef-status": { textContent: "" }, "paydef-continue": { hidden: true, href: "" } }
  let options = null
  const fetched = []
  const window = {
    parent: { postMessage: (m, origin) => posted.push({ ...m, origin }) },
    addEventListener: (type, fn) => { if (type === "message") listeners.push(fn) },
    paypal: { Buttons: (o) => { options = o; return { render: () => Promise.resolve() } } },
  }
  const document = { getElementById: (id) => els[id], documentElement: { scrollHeight: 100 }, body: {} }
  const fetch = async (url, init) => {
    fetched.push({ url, body: init && init.body ? JSON.parse(init.body) : null })
    if (url === "/api/gateway/execute") return { ok: true, json: async () => ({}) }
    return { ok: true, json: async () => ({ transaction_id: "TX1", status: "COMPLETED", paypal_order_id: "PP1", merchant_success_url: SHOP + "/thanks", merchant_cancel_url: SHOP + "/cart" }) }
  }
  const setTimeout = (fn, ms) => (ms < 10000 ? Promise.resolve().then(fn) : 0) // ask() timeouts never fire here
  new Function("window", "document", "fetch", "setTimeout", "URL", body)(window, document, fetch, setTimeout, URL)
  const send = (origin, data) => listeners.forEach((fn) => fn({ origin, data: { source: "paydef-shop", ...data } }))
  return { posted, options: () => options, send, fetched, els, html }
}
const settle = () => new Promise((r) => globalThis.setTimeout(r, 20))
const pending = (p) => Promise.race([p.then(() => "resolved", () => "rejected"), new Promise((r) => globalThis.setTimeout(() => r("pending"), 50))])

// 1. createOrder relays; foreign origin ignored; shop reply resolves with the PayPal order id
let t = boot(CFG)
await settle()
let p = t.options().createOrder()
let ask = t.posted.find((m) => m.type === "create-order")
assert.ok(ask && ask.requestId, "create-order posted with requestId")
assert.equal(ask.origin, SHOP)
t.send("https://evil.example.com", { type: "order-created", requestId: ask.requestId, transactionId: "EVIL", paypalOrderId: "EVIL" })
assert.equal(await pending(p), "pending", "foreign origin must be ignored")
t.send(SHOP, { type: "order-created", requestId: ask.requestId, transactionId: "TX1", executeToken: "ET1", paypalOrderId: "PP1" })
assert.equal(await p, "PP1")

// 2. order-failed rejects createOrder
let t2 = boot(CFG)
await settle()
let p2 = t2.options().createOrder()
let ask2 = t2.posted.find((m) => m.type === "create-order")
t2.send(SHOP, { type: "order-failed", requestId: ask2.requestId, message: "Billing email is required." })
assert.equal(await pending(p2), "rejected")

// 3. express: shipping changes are relayed with the current transaction; updated resolves, rejected rejects with the right error
const errors = { ADDRESS_ERROR: "AE", COUNTRY_ERROR: "CE", STATE_ERROR: "SE", ZIP_ERROR: "ZE" }
let rejectedWith = []
const actions = { reject: (e) => { rejectedWith.push(e); return Promise.resolve() } }
let s1 = t.options().onShippingAddressChange({ shippingAddress: { city: "San Jose", state: "CA", countryCode: "US", postalCode: "95131" }, errors }, actions)
let ship = t.posted.filter((m) => m.type === "shipping-change").pop()
assert.equal(ship.transactionId, "TX1")
assert.deepEqual(ship.address, { city: "San Jose", state: "CA", countryCode: "US", postalCode: "95131" })
t.send(SHOP, { type: "shipping-updated", requestId: ship.requestId })
await s1
assert.deepEqual(rejectedWith, [])
let s2 = t.options().onShippingAddressChange({ shippingAddress: { city: "Juneau", state: "AK", countryCode: "US", postalCode: "99801" }, errors }, actions)
let ship2 = t.posted.filter((m) => m.type === "shipping-change").pop()
t.send(SHOP, { type: "shipping-rejected", requestId: ship2.requestId, reason: "COUNTRY_ERROR" })
await s2
assert.deepEqual(rejectedWith, ["CE"])

// 4. checkout session: no shipping callback at all (address comes from the form)
let t4 = boot({ ...CFG, express: false })
await settle()
assert.equal("onShippingAddressChange" in t4.options(), false)

// 5. onApprove executes the relayed transaction and reports approved with the browser-status URL
await t.options().onApprove()
const exec = t.fetched.find((f) => f.url === "/api/gateway/execute")
assert.deepEqual(exec.body, { transactionId: "TX1", executeToken: "ET1" })
const approved = t.posted.filter((m) => m.type === "approved").pop()
assert.ok(approved.redirectUrl.startsWith(SHOP + "/thanks?transaction_id=TX1"))
assert.equal(approved.transactionId, "TX1")
assert.equal(t.els["paydef-buttons"].style.display, "none")

// 6. never broadcast; SDK URL carries the pinned client-id
assert.equal(/postMessage\([^)]*["']\*["']/.test(t.html), false)
assert.ok(t.html.includes("client-id=CID"))
console.log("PASS test-session-page")
