import assert from "node:assert/strict"
const { updateExpressAmount } = await import("@/lib/express-amount")

const ROW = { id: "tx1", status: "PENDING", express: true, express_item_total: "20.00", paypal_order_id: "PP1", original_currency: "USD", client_id: "c", client_secret: "s", proxy_url: null }
function deps(row = ROW, over = {}) {
  const calls = { patch: null, saved: null }
  return {
    calls,
    loadTx: async (id, storeId) => (row && id === row.id && storeId === "store-1" ? row : null),
    patch: async (r, a) => { calls.patch = { orderId: r.paypal_order_id, ...a }; return { total: a.total } },
    saveAmount: async (id, total) => { calls.saved = { id, total } },
    ...over,
  }
}
const input = (over = {}) => ({ transactionId: "tx1", storeId: "store-1", shipping: "9.00", taxTotal: "1.65", total: "30.65", ...over })

let d = deps()
assert.deepEqual(await updateExpressAmount(d, input()), { ok: true, amount: "30.65" })
assert.deepEqual(d.calls.patch, { orderId: "PP1", currency: "USD", itemTotal: "20.00", shipping: "9.00", taxTotal: "1.65", total: "30.65" })
assert.deepEqual(d.calls.saved, { id: "tx1", total: "30.65" })
// numbers are accepted too; total compared to 2 decimals
assert.equal((await updateExpressAmount(deps(), input({ shipping: 9, taxTotal: 0, total: 29 }))).amount, "29.00")

assert.deepEqual(await updateExpressAmount(deps(), input({ transactionId: "nope" })), { ok: false, status: 404, code: "not_found" })
assert.deepEqual(await updateExpressAmount(deps(), input({ storeId: "store-2" })), { ok: false, status: 404, code: "not_found" })
assert.deepEqual(await updateExpressAmount(deps({ ...ROW, status: "COMPLETED" }), input()), { ok: false, status: 409, code: "not_pending" })
assert.deepEqual(await updateExpressAmount(deps({ ...ROW, express: false }), input()), { ok: false, status: 409, code: "not_express" })
assert.deepEqual(await updateExpressAmount(deps({ ...ROW, express_item_total: null }), input()), { ok: false, status: 409, code: "not_express" })
d = deps()
assert.deepEqual(await updateExpressAmount(d, input({ total: "30.00" })), { ok: false, status: 409, code: "total_mismatch", expected: "30.65" })
assert.equal(d.calls.patch, null, "no PayPal call on mismatch")
assert.deepEqual(await updateExpressAmount(deps(), input({ shipping: "-1", total: "20.65" })), { ok: false, status: 400, code: "invalid_amount" })
d = deps(ROW, { patch: async () => { throw new Error("PayPal 422") } })
assert.deepEqual(await updateExpressAmount(d, input()), { ok: false, status: 502, code: "paypal_patch_failed" })
assert.equal(d.calls.saved, null, "amount not saved when PayPal refused")
// isUnpricedExpress: an express transaction must have been priced (shipping +
// tax for the buyer's PayPal address) before execute may capture it
{
  const { isUnpricedExpress } = await import("@/lib/express-amount")
  const row = (r) => async () => r
  assert.equal(await isUnpricedExpress(row({ express: true, express_priced_at: null })), true)
  assert.equal(await isUnpricedExpress(row({ express: true, express_priced_at: "2026-10-09T01:00:00Z" })), false)
  assert.equal(await isUnpricedExpress(row({ express: false, express_priced_at: null })), false)
  assert.equal(await isUnpricedExpress(row(null)), false)
  // before migration 030 the columns do not exist: nothing is express
  assert.equal(await isUnpricedExpress(async () => { const e = new Error("column does not exist"); e.code = "42703"; throw e }), false)
  // any other failure: do not capture blind
  await assert.rejects(isUnpricedExpress(async () => { throw new Error("db down") }), /db down/)
}
// the SQL behind it: order-amount marks the transaction priced together with
// the new amount; execute reads the two columns
{
  const { saveExpressAmountSql, loadExpressPricingSql } = await import("@/lib/express-amount")
  let seen = null
  const fakeSql = async (strings, ...values) => { seen = { q: strings.join("?"), values }; return [{ express: true, express_priced_at: null }] }
  await saveExpressAmountSql(fakeSql, "tx1", "29.00")
  assert.ok(seen.q.includes("UPDATE transactions SET original_amount = ?, express_priced_at = NOW()"), seen.q)
  assert.deepEqual(seen.values, ["29.00", "tx1"])
  assert.deepEqual(await loadExpressPricingSql(fakeSql, "tx1")(), { express: true, express_priced_at: null })
  assert.ok(seen.q.includes("SELECT express, express_priced_at FROM transactions WHERE id = ?"), seen.q)
}
console.log("PASS test-express-amount")
