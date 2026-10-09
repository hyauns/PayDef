// Runs plugin woo/paydef-woocommerce/assets/paydef-smart-buttons.js against a
// fake DOM, fake fetch and a fake jQuery (only .on / .trigger are used).
import assert from "node:assert/strict"
import fs from "node:fs"

const SRC = fs.readFileSync(new URL("../../../plugin woo/paydef-woocommerce/assets/paydef-smart-buttons.js", import.meta.url), "utf8")
const SHIELD = "https://pay.example.com"

function makeEl(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(), attrs: { ...attrs }, style: {}, children: [], parentNode: null, className: "", innerHTML: "", value: attrs.value,
    getAttribute(n) { return this.attrs[n] ?? null },
    setAttribute(n, v) { this.attrs[n] = String(v) },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c },
    insertBefore(c) { c.parentNode = this; this.children.unshift(c); return c },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c },
    closest() { return null },
    querySelector() { return null },
    querySelectorAll() { return [] },
    scrollIntoView() {},
    get firstChild() { return this.children[0] || null },
  }
  if (el.tagName === "IFRAME") el.contentWindow = { posted: [], postMessage(m, o) { this.posted.push({ m, o }) } }
  return el
}

function boot({ context = "checkout", sessionOk = true, checkoutResult, expressResult, shippingResult, productType = "simple" } = {}) {
  const container = makeEl("div", { "data-context": context, "data-product-id": "12", "data-product-type": productType })
  const placeOrder = makeEl("button", { id: "place_order" })
  const form = makeEl("form")
  form.fields = [["billing_email", "a@b.c"], ["payment_method", "paydef"], ["woocommerce-process-checkout-nonce", "n"]]
  const radio = makeEl("input", { value: "paydef" })
  const body = makeEl("body")
  // containers currently in the page; WooCommerce re-renders replace them
  let containers = [container]
  body.contains = (el) => containers.includes(el) || el === placeOrder || el === form
  const listeners = []
  const fetched = []
  const jq = {}
  const document = {
    body,
    getElementById: (id) => (id === "place_order" ? placeOrder : null),
    createElement: (t) => makeEl(t),
    querySelector: (s) => (s === "form.checkout" ? form : s.startsWith("input[name=") ? radio : null),
    querySelectorAll: (s) => (s === ".paydef-smart-buttons" ? containers : []),
  }
  const responses = {
    paydef_button_session: sessionOk
      ? { success: true, data: { enabled: true, sessionId: "S1", embedUrl: SHIELD + "/checkout/buttons?session=S1", embedOrigin: SHIELD } }
      : { success: true, data: { enabled: false } },
    paydef_express_create: expressResult,
    paydef_shipping_change: shippingResult,
  }
  const window = {
    paydefSB: { ajax: "/?wc-ajax=%%endpoint%%", nonce: "N", fallbackMs: 10000 },
    wc_checkout_params: { checkout_url: "/?wc-ajax=checkout" },
    location: { href: "https://shop.example.com/checkout/" },
    addEventListener: (t, f) => { if (t === "message") listeners.push(f) },
  }
  const timers = []
  const fetch = async (url, init) => {
    const body = new URLSearchParams(init.body)
    fetched.push({ url, body })
    const name = url.split("wc-ajax=")[1]
    const json = name === "checkout" ? checkoutResult : responses[name]
    return { json: async () => json }
  }
  class FormData { constructor(f) { this.f = f } }
  class URLSearchParamsShim extends URLSearchParams { constructor(x) { super(x instanceof FormData ? x.f.fields : x) } }
  const jQuery = () => ({
    on: (events, a, b) => {
      const fn = typeof a === "function" ? a : b
      events.split(" ").forEach((ev) => { (jq[ev] = jq[ev] || []).push(fn) })
    },
    trigger: (ev, args) => { (jq[ev] || []).forEach((fn) => fn({ type: ev }, ...(args || []))) },
  })
  const setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  const clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true }
  new Function("window", "document", "jQuery", "fetch", "FormData", "URLSearchParams", "setTimeout", "clearTimeout", SRC)(
    window, document, jQuery, fetch, FormData, URLSearchParamsShim, setTimeout, clearTimeout
  )
  let current = container
  const frame = () => current.children.find((c) => c.tagName === "IFRAME")
  const send = (origin, data, from) =>
    listeners.forEach((f) => f({ origin, source: from ?? frame().contentWindow, data: { source: "paydef-buttons", ...data } }))
  // updated_checkout: the payment box (old container + its iframe) is replaced
  const rerender = ({ withContainer = true } = {}) => {
    current = makeEl("div", { "data-context": context })
    containers = withContainer ? [current] : []
  }
  const setSession = (ok) => {
    responses.paydef_button_session = ok
      ? { success: true, data: { enabled: true, sessionId: "S2", embedUrl: SHIELD + "/checkout/buttons?session=S2", embedOrigin: SHIELD } }
      : { success: true, data: { enabled: false } }
  }
  const setExpress = (res) => { responses.paydef_express_create = res }
  return { container, placeOrder, form, fetched, frame, send, timers, window, jq, rerender, setSession, setExpress }
}
const settle = () => new Promise((r) => globalThis.setTimeout(r, 20))

// 1. session fetched with the context; iframe mounted; messages from another origin / another window ignored
let t = boot({ context: "checkout", checkoutResult: { result: "success", paydef_transaction_id: "TX1", paydef_execute_token: "ET1", paydef_paypal_order_id: "PP1" } })
await settle()
assert.equal(t.fetched[0].url, "/?wc-ajax=paydef_button_session")
assert.equal(t.fetched[0].body.get("context"), "checkout")
assert.equal(t.fetched[0].body.get("nonce"), "N")
assert.equal(t.frame().src, SHIELD + "/checkout/buttons?session=S1")
t.send("https://evil.example.com", { type: "ready" })
assert.notEqual(t.placeOrder.style.display, "none", "foreign origin ignored")
t.send(SHIELD, { type: "ready" }, { postMessage() {} })
assert.notEqual(t.placeOrder.style.display, "none", "message from another window ignored")

// 2. ready hides Place order (PayDef selected)
t.send(SHIELD, { type: "ready" })
assert.equal(t.placeOrder.style.display, "none")

// 3. checkout create-order → WooCommerce checkout AJAX with the session → order-created
t.send(SHIELD, { type: "create-order", requestId: "r1" })
await settle()
const co = t.fetched.find((f) => f.url === "/?wc-ajax=checkout")
assert.equal(co.body.get("paydef_smart_session"), "S1")
assert.equal(co.body.get("billing_email"), "a@b.c")
let last = t.frame().contentWindow.posted.at(-1)
assert.equal(last.o, SHIELD)
assert.deepEqual(last.m, { type: "order-created", requestId: "r1", transactionId: "TX1", executeToken: "ET1", paypalOrderId: "PP1", source: "paydef-shop" })

// 4. approved → navigate
t.send(SHIELD, { type: "approved", redirectUrl: "https://shop.example.com/checkout/order-received/?transaction_id=TX1" })
assert.equal(t.window.location.href, "https://shop.example.com/checkout/order-received/?transaction_id=TX1")

// 5. checkout failure → WooCommerce notices inserted, checkout_error triggered, order-failed
t = boot({ context: "checkout", checkoutResult: { result: "failure", messages: "<ul class='woocommerce-error'><li>Billing email is required.</li></ul>" } })
await settle()
let errorEvents = 0
t.jq.checkout_error = [() => errorEvents++]
t.send(SHIELD, { type: "create-order", requestId: "r2" })
await settle()
assert.equal(t.frame().contentWindow.posted.at(-1).m.type, "order-failed")
assert.ok(t.form.children.some((c) => String(c.innerHTML).includes("Billing email is required.")))
assert.equal(errorEvents, 1)

// 6. no ready within fallbackMs → frame removed, Place order back, force-redirect flag added
t = boot({ context: "checkout" })
await settle()
assert.equal(t.timers.at(-1).ms, 10000)
t.timers.at(-1).fn()
assert.equal(t.frame(), undefined)
assert.notEqual(t.placeOrder.style.display, "none")
assert.ok(t.form.children.some((c) => c.getAttribute && c.getAttribute("name") === "paydef_force_redirect" && c.value === "1"))

// 7. store not enabled → nothing mounted
t = boot({ context: "cart", sessionOk: false })
await settle()
assert.equal(t.frame(), undefined)

// 8. cart express: create via paydef_express_create; shipping-change relayed and mapped
t = boot({
  context: "cart",
  expressResult: { success: true, data: { transactionId: "TX2", executeToken: "", paypalOrderId: "PP2", ownerToken: "OWN2" } },
  shippingResult: { success: false, data: { reason: "COUNTRY_ERROR" } },
})
await settle()
t.send(SHIELD, { type: "create-order", requestId: "r3" })
await settle()
const ex = t.fetched.find((f) => f.url === "/?wc-ajax=paydef_express_create")
assert.equal(ex.body.get("context"), "cart")
assert.equal(ex.body.get("sessionId"), "S1")
assert.equal(t.frame().contentWindow.posted.at(-1).m.paypalOrderId, "PP2")
// the owner token stays on the shop page: never posted into the iframe
assert.equal(JSON.stringify(t.frame().contentWindow.posted).includes("OWN2"), false)
t.send(SHIELD, { type: "shipping-change", requestId: "r4", transactionId: "TX2", address: { city: "Juneau", state: "AK", countryCode: "US", postalCode: "99801" } })
await settle()
const sc = t.fetched.find((f) => f.url === "/?wc-ajax=paydef_shipping_change")
assert.equal(sc.body.get("transactionId"), "TX2")
assert.equal(sc.body.get("address[state]"), "AK")
assert.equal(sc.body.get("ownerToken"), "OWN2")
assert.deepEqual(t.frame().contentWindow.posted.at(-1).m, { type: "shipping-rejected", requestId: "r4", reason: "COUNTRY_ERROR", source: "paydef-shop" })

// 9. checkout re-render: the old (ready) entry must not keep Place order hidden
//    when the new container cannot show buttons
t = boot({ context: "checkout" })
await settle()
t.send(SHIELD, { type: "ready" })
assert.equal(t.placeOrder.style.display, "none")
t.rerender()
t.setSession(false)
t.jq.updated_checkout.forEach((fn) => fn({ type: "updated_checkout" }))
await settle()
t.jq.payment_method_selected.forEach((fn) => fn({ type: "payment_method_selected" }))
assert.notEqual(t.placeOrder.style.display, "none", "Place order is back when the new box has no buttons")

// 10. a page without a checkout container never touches Place order (another
//     gateway may have hidden it for its own buttons)
t = boot({ context: "cart" })
await settle()
t.placeOrder.style.display = "none"
t.jq.payment_method_selected.forEach((fn) => fn({ type: "payment_method_selected" }))
t.jq.updated_checkout.forEach((fn) => fn({ type: "updated_checkout" }))
assert.equal(t.placeOrder.style.display, "none", "Place order left alone")

// 11. product / cart: PayDef refuses the session at click time (expired after a
//     long-open page, or the pinned account is gone) → one fresh session, buttons
//     stay; a second refusal falls back
t = boot({ context: "product", expressResult: { success: false, data: { code: "session", message: "Button session is invalid or expired." } } })
await settle()
t.send(SHIELD, { type: "ready" })
t.send(SHIELD, { type: "create-order", requestId: "r5" })
await settle()
assert.equal(t.fetched.filter((f) => f.url === "/?wc-ajax=paydef_button_session").length, 2, "a new session was requested")
assert.notEqual(t.container.style.display, "none", "buttons stay")
assert.ok(t.frame(), "a new iframe is shown")
t.send(SHIELD, { type: "ready" })
t.send(SHIELD, { type: "create-order", requestId: "r6" })
await settle()
assert.equal(t.container.style.display, "none", "second refusal: classic flow")

// 12. product / cart: the shop refuses the express order (out of stock, options
//     missing) → its message is shown next to the buttons, as text, and cleared
//     on the next attempt
for (const context of ["product", "cart"]) {
  t = boot({ context, expressResult: { success: false, data: { message: "Sorry, <b>not enough</b> stock." } } })
  await settle()
  t.send(SHIELD, { type: "ready" })
  t.send(SHIELD, { type: "create-order", requestId: "r7" })
  await settle()
  assert.equal(t.frame().contentWindow.posted.at(-1).m.type, "order-failed")
  const notices = () => t.container.children.filter((c) => c.className === "woocommerce-error")
  assert.equal(notices().length, 1, context + ": error notice shown")
  assert.equal(notices()[0].textContent, "Sorry, <b>not enough</b> stock.")
  assert.equal(notices()[0].innerHTML, "", "message set as text, never as HTML")
  assert.notEqual(t.container.style.display, "none", "buttons stay for another try")
  // next attempt: the old notice goes, a successful order leaves none
  t.setExpress({ success: true, data: { transactionId: "TX3", executeToken: "", paypalOrderId: "PP3", ownerToken: "OWN3" } })
  t.send(SHIELD, { type: "create-order", requestId: "r8" })
  await settle()
  assert.equal(t.frame().contentWindow.posted.at(-1).m.paypalOrderId, "PP3")
  assert.equal(notices().length, 0, context + ": notice cleared on the next attempt")
}

// 13. a session PayDef does not know (not_found / invalid_ref page, posted to "*")
//     → classic flow at once, no waiting for fallbackMs
for (const code of ["not_found", "invalid_ref"]) {
  t = boot({ context: "cart" })
  await settle()
  t.send(SHIELD, { type: "error", code })
  assert.equal(t.container.style.display, "none", code + ": cart buttons hidden at once")
  assert.equal(t.frame(), undefined)
  assert.equal(t.fetched.filter((f) => f.url === "/?wc-ajax=paydef_button_session").length, 1, code + ": no renewal")
  t = boot({ context: "checkout" })
  await settle()
  t.send(SHIELD, { type: "error", code })
  assert.equal(t.frame(), undefined)
  assert.ok(t.form.children.some((c) => c.getAttribute && c.getAttribute("name") === "paydef_force_redirect"), code + ": checkout falls back to redirect")
}

console.log("PASS test-plugin-bridge")
