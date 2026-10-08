import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")

const TX = "11111111-2222-3333-4444-555555555555"
const NOW = new Date("2026-10-08T12:00:00Z")
const ROW = {
  id: TX, status: "PENDING", intent: "CAPTURE", original_currency: "USD",
  paypal_order_id: "5O190127TN364715T", checkout_expires_at: "2026-10-08T12:20:00Z",
  merchant_success_url: "https://shop.example.com/thanks", merchant_cancel_url: "https://shop.example.com/cart",
  client_id: "AbCdClientId",
}
const decide = (row) => sb.decideButtonPage({ row, executeToken: null, tokenShouldBlock: false, now: NOW })

// ── Minor 3: non-http(s) return URLs never reach the page (Continue href / redirectUrl)
let d = decide({ ...ROW, merchant_success_url: "javascript:alert(1)" })
assert.equal(d.kind, "render")
assert.equal(d.config.successUrl, null)
assert.equal(d.config.cancelUrl, "https://shop.example.com/cart")
d = decide({ ...ROW, merchant_cancel_url: "data:text/html,x" })
assert.equal(d.config.cancelUrl, null)

// ── Run the real inline script against a fake SDK / fetch / DOM
async function runPage(config, statuses) {
  const html = sb.renderButtonsPage(config, ["https://shop.example.com"])
  const body = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop()
  const els = {
    "paydef-buttons": { style: {} },
    "paydef-status": { textContent: "" },
    "paydef-continue": { hidden: true, href: "" },
  }
  const posted = []
  let buttonsCfg = null
  const window = {
    parent: { postMessage: (m, origin) => posted.push({ ...m, origin }) },
    paypal: { Buttons: (cfg) => { buttonsCfg = cfg; return { render: () => Promise.resolve() } } },
  }
  const document = { getElementById: (id) => els[id], documentElement: { scrollHeight: 100 }, body: {} }
  let n = 0
  const fetch = async (url) => {
    if (url === "/api/gateway/execute") return { ok: true, json: async () => ({}) }
    const status = statuses[Math.min(n++, statuses.length - 1)]
    return { ok: true, json: async () => ({ transaction_id: TX, status, paypal_order_id: "5O190127TN364715T" }) }
  }
  const setTimeout = (fn) => fn()
  new Function("window", "document", "fetch", "setTimeout", "URL", body)(window, document, fetch, setTimeout, URL)
  await new Promise((r) => globalThis.setTimeout(r, 0))
  return { els, posted, buttonsCfg }
}

const CFG = { transactionId: TX, executeToken: null, paypalOrderId: "5O190127TN364715T", clientId: "c", currency: "USD", intent: "capture", successUrl: "https://shop.example.com/thanks", cancelUrl: "https://shop.example.com/cart" }

// ── Minor 1: once there is a result the PayPal buttons are hidden
let p = await runPage(CFG, ["COMPLETED"])
assert.equal(p.buttonsCfg.createOrder(), "5O190127TN364715T")
assert.notEqual(p.els["paydef-buttons"].style.display, "none", "buttons visible before approval")
await p.buttonsCfg.onApprove()
assert.equal(p.els["paydef-buttons"].style.display, "none", "buttons hidden after approved")
assert.equal(p.els["paydef-continue"].hidden, false)
assert.ok(p.els["paydef-continue"].href.startsWith("https://shop.example.com/thanks?transaction_id="))
assert.equal(p.posted.at(-1).type, "approved")
assert.equal(p.posted.at(-1).origin, "https://shop.example.com")

p = await runPage(CFG, ["FAILED"])
await p.buttonsCfg.onApprove()
assert.equal(p.els["paydef-buttons"].style.display, "none", "buttons hidden after failed")
assert.equal(p.posted.at(-1).type, "failed")

p = await runPage(CFG, ["PENDING"])
await p.buttonsCfg.onApprove()
assert.equal(p.els["paydef-buttons"].style.display, "none", "buttons hidden after pending (a 2nd approval would do nothing)")
assert.equal(p.posted.at(-1).type, "pending")

// cancel keeps the buttons usable (Review Focus 1)
p = await runPage(CFG, ["COMPLETED"])
p.buttonsCfg.onCancel()
assert.notEqual(p.els["paydef-buttons"].style.display, "none")
assert.equal(p.posted.at(-1).type, "cancelled")

console.log("PASS test-minors")
