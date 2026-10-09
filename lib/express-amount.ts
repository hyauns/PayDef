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

/**
 * Was this express (cart / product) transaction approved without ever being
 * priced? Express orders are created at the item total; shipping and tax are
 * added by order-amount when the buyer picks an address in PayPal. Capturing
 * one that was never priced would collect the item total only — the shop would
 * lose its shipping — so execute refuses it.
 *
 * Before migration 030 the columns do not exist and nothing is express (false).
 * Any other failure is thrown: never capture blind.
 */
export async function isUnpricedExpress(
  load: () => Promise<{ express: boolean | null; express_priced_at: string | Date | null } | null>
): Promise<boolean> {
  try {
    const row = await load()
    return !!row && row.express === true && !row.express_priced_at
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "42703") return false
    throw error
  }
}

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>

/** order-amount: the new total, and the mark that this express order was priced. */
export async function saveExpressAmountSql(sql: SqlTag, transactionId: string, total: string): Promise<void> {
  await sql`UPDATE transactions SET original_amount = ${total}, express_priced_at = NOW(), updated_at = NOW() WHERE id = ${transactionId}`
}

/** execute: loader for isUnpricedExpress. */
export function loadExpressPricingSql(sql: SqlTag, transactionId: string) {
  return async () => {
    const rows = (await sql`SELECT express, express_priced_at FROM transactions WHERE id = ${transactionId}`) as Array<{
      express: boolean | null
      express_priced_at: string | Date | null
    }>
    return rows[0] ?? null
  }
}
