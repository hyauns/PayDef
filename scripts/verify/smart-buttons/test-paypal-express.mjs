import assert from "node:assert/strict"
const pp = await import("@/lib/paypal")
const BASE = { clientId: "x", clientSecret: "y", amount: "20.00", currencyCode: "USD", items: [{ name: "a", quantity: "1", unitAmount: { currencyCode: "USD", value: "20.00" } }], returnUrl: "https://s/ok", cancelUrl: "https://s/no", customId: "t", skipRandomization: true }

assert.equal(pp.buildOrderPayload(BASE).application_context.shipping_preference, "NO_SHIPPING")
assert.equal(pp.buildOrderPayload({ ...BASE, shippingPreference: "GET_FROM_FILE" }).application_context.shipping_preference, "GET_FROM_FILE")
// a provided address always wins (checkout page)
assert.equal(
  pp.buildOrderPayload({ ...BASE, shippingPreference: "GET_FROM_FILE", shipping: { address: { address_line_1: "1 A St", country_code: "US" } } }).application_context.shipping_preference,
  "SET_PROVIDED_ADDRESS"
)
// express order: item_total equals amount at creation (shipping is PATCHed in later)
const express = pp.buildOrderPayload({ ...BASE, shippingPreference: "GET_FROM_FILE" })
assert.equal(express.purchase_units[0].amount.value, "20.00")
assert.equal(express.purchase_units[0].amount.breakdown.item_total.value, "20.00")
assert.equal("shipping" in express.purchase_units[0], false)

const { total, patch } = pp.buildAmountPatch({ currency: "USD", itemTotal: "20.00", shipping: "9.00", taxTotal: "1.65" })
assert.equal(total, "30.65")
assert.deepEqual(patch, [{
  op: "replace",
  path: "/purchase_units/@reference_id=='default'/amount",
  value: {
    currency_code: "USD",
    value: "30.65",
    breakdown: {
      item_total: { currency_code: "USD", value: "20.00" },
      shipping: { currency_code: "USD", value: "9.00" },
      tax_total: { currency_code: "USD", value: "1.65" },
    },
  },
}])
assert.equal(pp.buildAmountPatch({ currency: "USD", itemTotal: "20.00", shipping: "0", taxTotal: "0" }).total, "20.00")
assert.equal(pp.buildAmountPatch({ currency: "USD", itemTotal: "0.1", shipping: "0.2", taxTotal: "0" }).total, "0.30") // no float drift
assert.throws(() => pp.buildAmountPatch({ currency: "USD", itemTotal: "20.00", shipping: "-1", taxTotal: "0" }))
assert.throws(() => pp.buildAmountPatch({ currency: "USD", itemTotal: "abc", shipping: "0", taxTotal: "0" }))
assert.equal(typeof pp.patchOrderAmount, "function")
console.log("PASS test-paypal-express")
