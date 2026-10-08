/**
 * lib/express-amount.ts — update an express Smart Buttons order's total once the
 * buyer's address is known (cart / product page).
 *
 * The PayPal order was created with item_total only (express_item_total on the
 * transaction). The storefront prices shipping and tax for the address PayPal
 * reported and sends them with its own order total; PayDef refuses anything
 * that does not add up, so PayPal's total always equals the store's total.
 *
 * Dependencies are injected (DB, PayPal); app/api/gateway/order-amount wires them.
 */

import { buildAmountPatch } from "@/lib/paypal"

export interface ExpressTxRow {
  id:                 string
  status:             string
  express:            boolean
  express_item_total: string | null
  paypal_order_id:    string | null
  original_currency:  string | null
  client_id:          string
  client_secret:      string
  proxy_url:          string | null
}

export interface ExpressAmountDeps {
  loadTx(transactionId: string, storeId: string): Promise<ExpressTxRow | null>
  patch(
    row: ExpressTxRow,
    amount: { currency: string; itemTotal: string; shipping: string; taxTotal: string; total: string }
  ): Promise<{ total: string }>
  saveAmount(transactionId: string, total: string): Promise<void>
}

export type ExpressAmountResult =
  | { ok: true; amount: string }
  | { ok: false; status: 400 | 404 | 409 | 502; code: string; expected?: string }

export async function updateExpressAmount(
  deps: ExpressAmountDeps,
  input: { transactionId: string; storeId: string; shipping: unknown; taxTotal: unknown; total: unknown }
): Promise<ExpressAmountResult> {
  const row = await deps.loadTx(input.transactionId, input.storeId)
  if (!row) return { ok: false, status: 404, code: "not_found" }
  if (row.status !== "PENDING") return { ok: false, status: 409, code: "not_pending" }
  if (!row.express || row.express_item_total === null || !row.paypal_order_id) {
    return { ok: false, status: 409, code: "not_express" }
  }

  const currency = (row.original_currency || "USD").toUpperCase()
  const itemTotal = Number(row.express_item_total).toFixed(2)
  let expected: string
  let shipping: string
  let taxTotal: string
  try {
    shipping = Number(input.shipping).toFixed(2)
    taxTotal = Number(input.taxTotal).toFixed(2)
    expected = buildAmountPatch({ currency, itemTotal, shipping, taxTotal }).total
  } catch {
    return { ok: false, status: 400, code: "invalid_amount" }
  }

  const claimed = Number(input.total)
  if (!Number.isFinite(claimed) || claimed.toFixed(2) !== expected) {
    return { ok: false, status: 409, code: "total_mismatch", expected }
  }

  try {
    await deps.patch(row, { currency, itemTotal, shipping, taxTotal, total: expected })
  } catch {
    return { ok: false, status: 502, code: "paypal_patch_failed" }
  }
  await deps.saveAmount(row.id, expected)
  return { ok: true, amount: expected }
}
