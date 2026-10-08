import assert from "node:assert/strict"
const { payerFromPayPal } = await import("@/lib/smart-buttons")
// Shape of the sandbox capture response seen in the 2026-10-08 spike
const capture = {
  id: "8NF39149PR4564450", status: "COMPLETED",
  payer: { email_address: "sb-buyer@personal.example.com", name: { given_name: "John", surname: "Doe" } },
  purchase_units: [{
    shipping: { name: { full_name: "John Doe" }, address: { address_line_1: "Vietnam Main Street", admin_area_2: "Hanoi", admin_area_1: "Vietnam", postal_code: "100000", country_code: "VN" } },
    payments: { captures: [{ id: "C1", status: "COMPLETED", amount: { currency_code: "USD", value: "15.00" } }] },
  }],
}
assert.deepEqual(payerFromPayPal(capture), {
  payerEmail: "sb-buyer@personal.example.com",
  payerName: "John Doe",
  shippingAddress: { name: { full_name: "John Doe" }, address: { address_line_1: "Vietnam Main Street", admin_area_2: "Hanoi", admin_area_1: "Vietnam", postal_code: "100000", country_code: "VN" } },
})
assert.deepEqual(payerFromPayPal({ id: "x", status: "COMPLETED" }), { payerEmail: null, payerName: null, shippingAddress: null })
assert.equal(payerFromPayPal({ id: "x", status: "C", payer: { name: { given_name: "Ann" } } }).payerName, "Ann")
assert.equal(payerFromPayPal({ id: "x", status: "C", payer: { email_address: "  " } }).payerEmail, null)
console.log("PASS test-execute-payer")
