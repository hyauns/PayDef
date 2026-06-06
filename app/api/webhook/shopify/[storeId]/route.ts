/**
 * POST /api/webhook/shopify/[storeId]
 *
 * Per-store Shopify webhook endpoint. The merchant registers this URL for the
 * `orders/paid` (and optionally `refunds/create`) topic in Shopify; the
 * [storeId] segment tells us which store's webhook signing secret to verify
 * against.
 *
 * This is the Shopify equivalent of /api/webhook/stripe/[storeId] — it is
 * completely separate and does NOT touch the PayPal or Stripe webhook handlers
 * or the mock-charge flow. It reuses the shared merchant-webhook delivery +
 * Telegram machinery.
 *
 * The PENDING PayDef transaction is matched by the `paydef_txn` note attribute
 * carried from the Draft Order. Idempotency is guaranteed by the first-
 * transition guard (status = 'PENDING' → 'COMPLETED'), so duplicate Shopify
 * deliveries are no-ops.
 *
 * Handled topics:
 *   • orders/paid (or orders/create with financial_status='paid') → COMPLETED
 *   • refunds/create                                              → REFUNDED
 */

import { NextRequest, NextResponse } from "next/server"
import { getPool, getSql } from "@/lib/neon"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { verifyShopifyWebhook } from "@/lib/shopify"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  deliverWebhookEvent,
  persistWebhookEventSafe,
} from "@/lib/webhook-delivery"
import { sendTransactionAlert } from "@/lib/telegram"
import { createLogger } from "@/lib/logger"

const moduleLog = createLogger({ route: "/api/webhook/shopify" })
const GATEWAY_FEE_PERCENT = 0.02

interface RouteContext {
  params: Promise<{ storeId: string }>
}

interface StoreRow {
  id: string
  tenant_id: string
  webhook_url: string | null
  shopify_webhook_secret: string | null
}

interface TxRow {
  id: string
  tenant_id: string
  store_id: string
  original_amount: string
  original_currency: string | null
}

interface ShopifyNoteAttribute {
  name?: string
  value?: string
}

interface ShopifyOrderPayload {
  id?: number | string
  order_id?: number | string
  financial_status?: string | null
  note_attributes?: ShopifyNoteAttribute[]
}

function decryptMaybe(value: string): string {
  return isEncrypted(value) ? decrypt(value) : value.trim()
}

function readPaydefTxn(payload: ShopifyOrderPayload): string | null {
  const attrs = Array.isArray(payload.note_attributes) ? payload.note_attributes : []
  const hit = attrs.find((a) => a?.name === "paydef_txn")
  return hit?.value?.trim() || null
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { storeId } = await context.params
  const log = moduleLog.child({ storeId })

  // Shopify signs the raw, unparsed body.
  const rawBody = await req.text()
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256")
  const topic = req.headers.get("x-shopify-topic") || ""

  if (!hmacHeader) {
    return NextResponse.json({ error: "Missing X-Shopify-Hmac-Sha256 header." }, { status: 400 })
  }

  // ── Load this store's Shopify webhook secret ───────────────────────────────
  const sql = getSql()
  let store: StoreRow | undefined
  try {
    const rows = (await sql`
      SELECT id, tenant_id, webhook_url, shopify_webhook_secret
      FROM stores
      WHERE id = ${storeId}
      LIMIT 1
    `) as unknown as StoreRow[]
    store = rows[0]
  } catch (err) {
    log.error("shopify_webhook.store_query_failed", "Failed to load store", { error: err })
    return NextResponse.json({ error: "Store lookup failed." }, { status: 500 })
  }

  if (!store || !store.shopify_webhook_secret) {
    log.error("shopify_webhook.not_configured", "Store missing Shopify webhook secret", {})
    return NextResponse.json({ error: "Store not found or Shopify not configured." }, { status: 404 })
  }

  // ── Verify signature ───────────────────────────────────────────────────────
  let secret: string
  try {
    secret = decryptMaybe(store.shopify_webhook_secret)
  } catch (err) {
    log.error("shopify_webhook.secret_decrypt_failed", "Failed to decrypt webhook secret", { error: err })
    return NextResponse.json({ error: "Webhook secret error." }, { status: 500 })
  }

  if (!verifyShopifyWebhook(rawBody, hmacHeader, secret)) {
    log.error("shopify_webhook.signature_invalid", "Shopify webhook HMAC verification failed", {})
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 })
  }

  let payload: ShopifyOrderPayload
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
  }

  log.info("shopify_webhook.received", `Shopify topic ${topic}`, { topic })

  try {
    if (topic === "refunds/create") {
      await refundShopifyTransaction(payload, store, log)
      return NextResponse.json({ received: true })
    }

    // orders/paid — or orders/create that is already paid.
    if (topic === "orders/paid" || topic === "orders/create") {
      const financialStatus = String(payload.financial_status || "").toLowerCase()
      if (topic === "orders/create" && financialStatus !== "paid") {
        log.info("shopify_webhook.unpaid_create", "orders/create not yet paid — ignoring", {
          financialStatus,
        })
        return NextResponse.json({ received: true })
      }
      await completeShopifyTransaction(payload, store, log)
      return NextResponse.json({ received: true })
    }

    // Acknowledge unhandled topics so Shopify doesn't retry them.
    log.info("shopify_webhook.ignored", `Unhandled topic ${topic}`, { topic })
    return NextResponse.json({ received: true })
  } catch (err) {
    log.error("shopify_webhook.processing_error", "Error while processing Shopify event", {
      error: err,
      topic,
    })
    // Return 500 so Shopify retries — processing is idempotent.
    return NextResponse.json({ error: "Processing error." }, { status: 500 })
  }
}

/**
 * Marks a Shopify checkout transaction COMPLETED (first transition only) and
 * fans out the merchant webhook + Telegram alert. Idempotent: duplicate Shopify
 * deliveries find the row already COMPLETED and exit without re-notifying.
 */
async function completeShopifyTransaction(
  payload: ShopifyOrderPayload,
  store: StoreRow,
  log: ReturnType<typeof moduleLog.child>
): Promise<void> {
  const transactionId = readPaydefTxn(payload)
  const shopifyOrderId = payload.id != null ? String(payload.id) : null

  if (!transactionId) {
    log.error("shopify_webhook.no_paydef_txn", "Order missing paydef_txn note attribute — cannot match", {
      shopifyOrderId,
    })
    // Ack so Shopify stops retrying an unmatchable order.
    return
  }

  const pool = getPool()
  const client = await pool.connect()
  let tx: TxRow | null = null
  let gatewayFee = 0
  let netAmount = 0

  try {
    await client.query("BEGIN")

    // First-transition guard: only update rows still PENDING for this store.
    const updated = await client.query<TxRow>(
      `UPDATE transactions
       SET status = 'COMPLETED'::transaction_status,
           completed_at = NOW(),
           updated_at = NOW(),
           status_reason = 'shopify_order_paid',
           shopify_order_id = COALESCE($2, shopify_order_id)
       WHERE id = $1
         AND store_id = $3
         AND status = 'PENDING'
       RETURNING id, tenant_id, store_id, original_amount, original_currency`,
      [transactionId, shopifyOrderId, store.id]
    )

    tx = updated.rows[0] ?? null
    if (!tx) {
      // Either already processed (idempotent) or unknown/foreign transaction.
      await client.query("ROLLBACK")
      log.info("shopify_webhook.no_pending_tx", "No PENDING transaction for paydef_txn (already processed?)", {
        transactionId,
        shopifyOrderId,
      })
      return
    }

    const amount = parseFloat(tx.original_amount)
    gatewayFee = Math.round(amount * GATEWAY_FEE_PERCENT * 100) / 100
    netAmount = Math.round((amount - gatewayFee) * 100) / 100

    await client.query(`UPDATE transactions SET gateway_fee = $2 WHERE id = $1`, [
      tx.id,
      gatewayFee.toFixed(2),
    ])

    await client.query(
      `INSERT INTO billing_records (
         tenant_id, transaction_id, gross_amount, fee_amount, net_amount, currency, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        tx.tenant_id,
        tx.id,
        amount.toFixed(2),
        gatewayFee.toFixed(2),
        netAmount.toFixed(2),
        tx.original_currency ?? "USD",
      ]
    )

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    throw err
  } finally {
    client.release()
  }

  const amount = parseFloat(tx.original_amount)
  const currency = tx.original_currency ?? "USD"

  // ── Deliver merchant webhook (reuse shared delivery pipeline) ───────────────
  if (store.webhook_url) {
    const webhookPayload: Omit<StoreWebhookPayload, "event_id"> = {
      event: "payment.capture.completed",
      transaction_id: tx.id,
      paypal_order_id: null,
      amount: amount.toFixed(2),
      currency,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      status_reason: "shopify_order_paid",
      gateway_fee: gatewayFee.toFixed(2),
      net_amount: netAmount.toFixed(2),
      payment_method: "card",
    }

    try {
      const { eventId, shouldDeliver } = await persistWebhookEventSafe({
        transactionId: tx.id,
        tenantId: tx.tenant_id,
        storeId: tx.store_id,
        accountId: null,
        targetUrl: store.webhook_url,
        businessKey: buildWebhookBusinessKey("payment.capture.completed", tx.id, "shopify"),
        event: "payment.capture.completed",
        payload: webhookPayload,
        source: "shopify_webhook",
        triggerOrigin: "shopify_webhook",
      })

      if (shouldDeliver) {
        await deliverWebhookEvent(eventId, "shopify_webhook").catch((error) => {
          log.error(
            "shopify_webhook.delivery_failed",
            `Webhook delivery failed (event persisted, cron will retry): tx=${tx?.id} eventId=${eventId}`,
            { error }
          )
        })
      }
    } catch (error) {
      log.error("shopify_webhook.persist_failed", `Webhook event persistence failed: tx=${tx.id}`, {
        error,
      })
    }
  }

  // ── Telegram alert (non-blocking) ───────────────────────────────────────────
  try {
    await sendTransactionAlert({
      tenantId: tx.tenant_id,
      amount,
      storeName: "Unknown Store",
      accountName: "Shopify",
      transactionId: tx.id,
    })
  } catch (error) {
    log.error("shopify_webhook.telegram_failed", "Telegram notification failed", { error })
  }

  log.info("shopify_webhook.completed", `Transaction ${tx.id} marked COMPLETED via Shopify`, {
    transactionId: tx.id,
    shopifyOrderId,
  })
}

/**
 * Marks a Shopify transaction REFUNDED (first transition only) and fans out the
 * payment.capture.refunded merchant webhook. Matched by shopify_order_id since
 * the refunds/create payload carries order_id, not the note attributes.
 */
async function refundShopifyTransaction(
  payload: ShopifyOrderPayload,
  store: StoreRow,
  log: ReturnType<typeof moduleLog.child>
): Promise<void> {
  const shopifyOrderId = payload.order_id != null ? String(payload.order_id) : null
  if (!shopifyOrderId) {
    log.error("shopify_webhook.refund_no_order_id", "Refund payload missing order_id", {})
    return
  }

  const sql = getSql()
  const rows = (await sql`
    UPDATE transactions
    SET status = 'REFUNDED'::transaction_status,
        refunded_at = NOW(),
        updated_at = NOW(),
        status_reason = 'shopify_refund_created'
    WHERE shopify_order_id = ${shopifyOrderId}
      AND store_id = ${store.id}
      AND status = 'COMPLETED'
    RETURNING id, tenant_id, store_id, original_amount, original_currency
  `) as unknown as TxRow[]

  const tx = rows[0]
  if (!tx) {
    log.info("shopify_webhook.refund_no_tx", "No COMPLETED transaction for refunded order (already refunded?)", {
      shopifyOrderId,
    })
    return
  }

  if (!store.webhook_url) return

  const amount = parseFloat(tx.original_amount)
  const currency = tx.original_currency ?? "USD"
  const webhookPayload: Omit<StoreWebhookPayload, "event_id"> = {
    event: "payment.capture.refunded",
    transaction_id: tx.id,
    paypal_order_id: null,
    amount: amount.toFixed(2),
    currency,
    status: "REFUNDED",
    timestamp: new Date().toISOString(),
    status_reason: "shopify_refund_created",
    payment_method: "card",
  }

  try {
    const { eventId, shouldDeliver } = await persistWebhookEventSafe({
      transactionId: tx.id,
      tenantId: tx.tenant_id,
      storeId: tx.store_id,
      accountId: null,
      targetUrl: store.webhook_url,
      businessKey: buildWebhookBusinessKey("payment.capture.refunded", tx.id, "shopify"),
      event: "payment.capture.refunded",
      payload: webhookPayload,
      source: "shopify_webhook",
      triggerOrigin: "shopify_webhook",
    })

    if (shouldDeliver) {
      await deliverWebhookEvent(eventId, "shopify_webhook").catch((error) => {
        log.error("shopify_webhook.refund_delivery_failed", `Refund webhook delivery failed: tx=${tx.id}`, {
          error,
        })
      })
    }
  } catch (error) {
    log.error("shopify_webhook.refund_persist_failed", `Refund webhook persistence failed: tx=${tx.id}`, {
      error,
    })
  }

  log.info("shopify_webhook.refunded", `Transaction ${tx.id} marked REFUNDED via Shopify`, {
    transactionId: tx.id,
    shopifyOrderId,
  })
}
