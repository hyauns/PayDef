/**
 * lib/shopify-refund.ts — Shopify refund orchestration
 *
 * Mirrors the PayPal refund flow (app/api/gateway/refund/route.ts) and the
 * Stripe handler (lib/stripe-refund.ts) for stores whose provider_type =
 * 'SHOPIFY', WITHOUT touching:
 *   • merchant-account rotation / volume reversal (Shopify = one account per
 *     store, there is no merchant_accounts row and no current_volume to reverse)
 *   • lib/paypal.ts / lib/stripe.ts or their branches of the refund route
 *
 * It REUSES the shared, provider-neutral machinery:
 *   • refundShopifyOrder()       → lib/shopify.ts (full refund of the paid Order)
 *   • payment.capture.refunded   → the same merchant webhook event PayPal/Stripe
 *     emit, so the merchant receiver needs no new event name
 *
 * The Shopify Order id is captured by the orders/paid webhook
 * (transactions.shopify_order_id), so a refund needs no extra lookup against
 * Shopify. The reverse direction (a refund created inside Shopify) is already
 * handled by the refunds/create webhook — this handler is idempotent with it.
 */

import { NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { refundShopifyOrder, ShopifyApiError } from "@/lib/shopify"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
} from "@/lib/webhook-delivery"
import { createLogger } from "@/lib/logger"
import type { AuthenticatedStore } from "@/lib/gateway-auth"

const moduleLog = createLogger({ route: "/api/gateway/refund", provider: "shopify" })

interface ShopifyTxRow {
  id: string
  tenant_id: string
  store_id: string
  original_amount: string
  original_currency: string | null
  status: string
  shopify_order_id: string | null
}

interface ShopifyKeyRow {
  shopify_store_domain: string | null
  shopify_access_token: string | null
}

export interface ShopifyRefundParams {
  store: AuthenticatedStore
  transactionId: string
}

/**
 * Handles a refund request for a SHOPIFY-provider store and returns the same
 * response envelope as the PayPal path: { status: 'REFUNDED', transaction_id, ... }.
 * Idempotent: an already-REFUNDED transaction (or an order Shopify reports as
 * already refunded) returns success with already_refunded: true.
 */
export async function handleShopifyRefund(params: ShopifyRefundParams): Promise<NextResponse> {
  const { store, transactionId } = params
  const tenantId = store.tenantId
  const log = moduleLog.child({ transactionId, storeId: store.id })
  const sql = getSql()

  // ── Step 1. Look up the transaction (scoped to this store + tenant) ─────────
  let tx: ShopifyTxRow | null = null
  try {
    const rows = (await sql`
      SELECT id, tenant_id, store_id, original_amount, original_currency,
             status, shopify_order_id
      FROM   transactions
      WHERE  id = ${transactionId}
        AND  store_id = ${store.id}
        AND  tenant_id = ${tenantId}
      LIMIT  1
    `) as unknown as ShopifyTxRow[]
    tx = rows[0] ?? null
  } catch (err) {
    log.error("shopify_refund.tx_query_failed", "Transaction lookup failed", { error: err })
    return NextResponse.json({ error: "Database error during transaction lookup." }, { status: 500 })
  }

  if (!tx) {
    log.warn("shopify_refund.tx_not_found", "Transaction not found for store", {})
    return NextResponse.json({ error: "Transaction not found for this store." }, { status: 404 })
  }

  const amount = parseFloat(tx.original_amount)
  const currency = tx.original_currency ?? "USD"

  // ── Idempotency: already refunded ───────────────────────────────────────────
  if (tx.status === "REFUNDED") {
    log.info("shopify_refund.already_refunded", "Transaction already REFUNDED", {})
    return NextResponse.json({
      status: "REFUNDED",
      transaction_id: tx.id,
      amount: amount.toFixed(2),
      already_refunded: true,
    })
  }

  // ── State guard: must be COMPLETED (paid) ───────────────────────────────────
  if (tx.status !== "COMPLETED") {
    log.warn("shopify_refund.wrong_state", `Cannot refund in '${tx.status}' status`, {})
    return NextResponse.json(
      { error: `Cannot refund transaction in '${tx.status}' status.` },
      { status: 400 }
    )
  }

  // ── Verify the paid Shopify Order id exists ─────────────────────────────────
  // It is recorded by the orders/paid webhook. A COMPLETED tx without it means
  // the order was never reconciled — we cannot target the refund.
  if (!tx.shopify_order_id) {
    log.error("shopify_refund.no_order_id", "COMPLETED Shopify tx has no shopify_order_id", {})
    return NextResponse.json(
      { error: "Transaction has no Shopify order id. Cannot refund." },
      { status: 422 }
    )
  }

  // ── Step 2. Load + decrypt the store's Shopify credentials ──────────────────
  let shopDomain: string
  let accessToken: string
  try {
    const rows = (await sql`
      SELECT shopify_store_domain, shopify_access_token
      FROM stores WHERE id = ${store.id} LIMIT 1
    `) as unknown as ShopifyKeyRow[]
    const row = rows[0]
    if (!row?.shopify_store_domain || !row?.shopify_access_token) {
      log.error("shopify_refund.not_configured", "Store has no Shopify credentials", {})
      return NextResponse.json({ error: "Shopify is not configured for this store." }, { status: 503 })
    }
    shopDomain = row.shopify_store_domain.trim()
    accessToken = isEncrypted(row.shopify_access_token)
      ? decrypt(row.shopify_access_token)
      : row.shopify_access_token.trim()
  } catch (err) {
    log.error("shopify_refund.creds_failed", "Failed to load/decrypt Shopify credentials", { error: err })
    return NextResponse.json({ error: "Shopify credential error for this store." }, { status: 500 })
  }

  // ── Step 3. Call Shopify to refund the paid order ───────────────────────────
  let refund
  try {
    refund = await refundShopifyOrder({
      shopDomain,
      accessToken,
      orderId: tx.shopify_order_id,
      amount: amount.toFixed(2),
      currency,
      note: `PayDef refund ${tx.id}`,
    })
  } catch (err) {
    const status = err instanceof ShopifyApiError ? err.statusCode : 502
    log.error("shopify_refund.provider_error", "Shopify refund failed", { error: err })
    return NextResponse.json(
      { error: "Payment provider error during refund." },
      { status: status >= 400 && status < 600 ? status : 502 }
    )
  }

  log.info("shopify_refund.provider_ok", `Shopify refund ok refundId=${refund.refundId}`, {
    alreadyRefunded: refund.alreadyRefunded,
  })

  // ── Step 4. Mark REFUNDED (first transition only; idempotent) ───────────────
  // No merchant_accounts volume reversal — Shopify stores have no rotation/volume.
  try {
    await sql`
      UPDATE transactions
      SET status = 'REFUNDED',
          refunded_at = NOW(),
          updated_at = NOW(),
          status_reason = 'shopify_refund'
      WHERE id = ${tx.id}
        AND status = 'COMPLETED'
    `
  } catch (err) {
    // Shopify refund already succeeded — log but return success (DB may be retried).
    log.error("shopify_refund.db_update_failed", "DB update to REFUNDED failed after Shopify refund", {
      error: err,
    })
  }

  // ── Step 5. Fire the merchant webhook (reuse shared delivery pipeline) ───────
  // Note: the refunds/create Shopify webhook also fires for this refund and is
  // idempotent on the same business key, so the merchant is never double-notified.
  if (store.webhookUrl) {
    const payload: Omit<StoreWebhookPayload, "event_id"> = {
      event: "payment.capture.refunded",
      transaction_id: tx.id,
      paypal_order_id: null,
      amount: amount.toFixed(2),
      currency,
      status: "REFUNDED",
      timestamp: new Date().toISOString(),
      status_reason: "shopify_refund",
      payment_method: "card",
    }

    try {
      const { eventId, shouldDeliver } = await persistWebhookEventSafe({
        transactionId: tx.id,
        tenantId,
        storeId: store.id,
        accountId: null,
        targetUrl: store.webhookUrl,
        businessKey: buildWebhookBusinessKey("payment.capture.refunded", tx.id, "shopify"),
        event: "payment.capture.refunded",
        payload,
        source: "refund_api",
        triggerOrigin: "refund_api",
      })
      if (shouldDeliver) {
        deliverWebhookEvent(eventId, "refund_api").catch((e) =>
          log.error("shopify_refund.delivery_failed", `Webhook delivery failed (cron will retry) eventId=${eventId}`, {
            error: e,
          })
        )
      }
    } catch (err) {
      log.error("shopify_refund.persist_failed", "Webhook persistence failed (refund still succeeded)", {
        error: err,
      })
    }
  }

  log.info("shopify_refund.complete", `Transaction ${tx.id} REFUNDED via Shopify`, {})

  return NextResponse.json(
    {
      status: "REFUNDED",
      transaction_id: tx.id,
      shopify_refund_id: refund.refundId || null,
      amount: amount.toFixed(2),
      already_refunded: refund.alreadyRefunded,
    },
    { status: 200 }
  )
}
