/**
 * POST /api/gateway/order-amount
 *
 * Express Smart Buttons (cart / product page): the storefront priced shipping
 * and tax for the address the buyer picked inside PayPal; update the PayPal
 * order total to match. See lib/express-amount.ts.
 *
 * Authentication: X-Store-ID + X-API-Key.
 * Body: { transactionId, shipping, taxTotal, total }
 * 200 { ok: true, amount } | 4xx/502 { error, code, expected? }
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { createLogger } from "@/lib/logger"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { patchOrderAmount } from "@/lib/paypal"
import { isTransactionRef } from "@/lib/smart-buttons"
import { updateExpressAmount, type ExpressTxRow } from "@/lib/express-amount"

const log = createLogger({ route: "/api/gateway/order-amount" })

const MESSAGES: Record<string, string> = {
  not_found:           "Transaction not found.",
  not_pending:         "Transaction is no longer pending.",
  not_express:         "Transaction is not an express Smart Buttons order.",
  total_mismatch:      "Total does not equal item total + shipping + tax.",
  invalid_amount:      "shipping and taxTotal must be non-negative amounts.",
  paypal_patch_failed: "PayPal refused the new total.",
}

export async function POST(req: NextRequest) {
  let store
  try {
    store = await authenticateStoreHeaders(req)
  } catch (error) {
    const msg = error instanceof Error ? error.message : ""
    if (msg.includes("Missing")) return NextResponse.json({ error: msg }, { status: 401 })
    if (msg.includes("Invalid")) return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const { allowed, headers: rlHeaders } = await checkRateLimit(store.id)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: rlHeaders })
  }

  let body: { transactionId?: unknown; shipping?: unknown; taxTotal?: unknown; total?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }
  if (!isTransactionRef(body.transactionId)) {
    return NextResponse.json({ error: "transactionId is required." }, { status: 400 })
  }
  const transactionId = body.transactionId

  const sql = getSql()
  const result = await updateExpressAmount(
    {
      loadTx: async (id, storeId) => {
        const rows = (await sql`
          SELECT t.id, t.status, t.express, t.express_item_total, t.paypal_order_id, t.original_currency,
                 ma.client_id, ma.client_secret, ma.proxy_url
          FROM   transactions t
          JOIN   merchant_accounts ma ON ma.id = t.merchant_id
          WHERE  t.id = ${id} AND t.store_id = ${storeId}
          LIMIT  1
        `) as unknown as ExpressTxRow[]
        return rows[0] ?? null
      },
      patch: async (row, amount) => {
        // Credentials are decrypted just-in-time, as in /api/gateway/checkout.
        const proxy = row.proxy_url ? (isEncrypted(row.proxy_url) ? decrypt(row.proxy_url) : row.proxy_url).trim() : ""
        return patchOrderAmount({
          clientId:     row.client_id.trim(),
          clientSecret: decrypt(row.client_secret).trim(),
          proxyUrl:     proxy || undefined,
          orderId:      row.paypal_order_id as string,
          currency:     amount.currency,
          itemTotal:    amount.itemTotal,
          shipping:     amount.shipping,
          taxTotal:     amount.taxTotal,
        })
      },
      saveAmount: async (id, total) => {
        await sql`UPDATE transactions SET original_amount = ${total}, updated_at = NOW() WHERE id = ${id}`
      },
    },
    { transactionId, storeId: store.id, shipping: body.shipping, taxTotal: body.taxTotal, total: body.total }
  )

  if (!result.ok) {
    log.warn("order_amount.refused", `order-amount refused tx=${transactionId} code=${result.code}`, {
      storeId: store.id, transactionId, code: result.code,
    })
    return NextResponse.json(
      { error: MESSAGES[result.code] ?? "Request refused.", code: result.code, ...(result.expected ? { expected: result.expected } : {}) },
      { status: result.status }
    )
  }

  log.info("order_amount.updated", `Express total updated tx=${transactionId} amount=${result.amount}`, {
    storeId: store.id, transactionId, amount: result.amount,
  })
  return NextResponse.json({ ok: true, amount: result.amount })
}
