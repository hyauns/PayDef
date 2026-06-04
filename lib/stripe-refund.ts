/**
 * lib/stripe-refund.ts — Stripe refund orchestration
 *
 * Mirrors the PayPal refund flow (app/api/gateway/refund/route.ts) for stores
 * whose provider_type = 'STRIPE', WITHOUT touching:
 *   • merchant-account rotation / volume reversal (Stripe = one account per store,
 *     there is no merchant_accounts row and no current_volume to reverse)
 *   • lib/paypal.ts or the PayPal branch of the refund route
 *
 * It REUSES the shared, provider-neutral machinery:
 *   • refundPayment()            → lib/stripe.ts (full refund of the PaymentIntent)
 *   • payment.capture.refunded   → the same merchant webhook event PayPal emits,
 *     so the merchant receiver needs no new event name
 */

import { NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { refundPayment, StripeApiError } from "@/lib/stripe"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
} from "@/lib/webhook-delivery"
import { createLogger } from "@/lib/logger"
import type { AuthenticatedStore } from "@/lib/gateway-auth"

const moduleLog = createLogger({ route: "/api/gateway/refund", provider: "stripe" })

interface StripeTxRow {
  id: string
  tenant_id: string
  store_id: string
  original_amount: string
  original_currency: string | null
  status: string
  stripe_payment_intent_id: string | null
}

interface StripeKeyRow {
  stripe_secret_key: string | null
}

export interface StripeRefundParams {
  store: AuthenticatedStore
  transactionId: string
}

/**
 * Handles a refund request for a STRIPE-provider store and returns the same
 * response envelope as the PayPal path: { status: 'REFUNDED', transaction_id, ... }.
 * Idempotent: an already-REFUNDED transaction (or a charge Stripe reports as
 * already refunded) returns success with already_refunded: true.
 */
export async function handleStripeRefund(params: StripeRefundParams): Promise<NextResponse> {
  const { store, transactionId } = params
  const tenantId = store.tenantId
  const log = moduleLog.child({ transactionId, storeId: store.id })
  const sql = getSql()

  // ── Step 1. Look up the transaction (scoped to this store + tenant) ─────────
  let tx: StripeTxRow | null = null
  try {
    const rows = (await sql`
      SELECT id, tenant_id, store_id, original_amount, original_currency,
             status, stripe_payment_intent_id
      FROM   transactions
      WHERE  id = ${transactionId}
        AND  store_id = ${store.id}
        AND  tenant_id = ${tenantId}
      LIMIT  1
    `) as unknown as StripeTxRow[]
    tx = rows[0] ?? null
  } catch (err) {
    log.error("stripe_refund.tx_query_failed", "Transaction lookup failed", { error: err })
    return NextResponse.json({ error: "Database error during transaction lookup." }, { status: 500 })
  }

  if (!tx) {
    log.warn("stripe_refund.tx_not_found", "Transaction not found for store", {})
    return NextResponse.json({ error: "Transaction not found for this store." }, { status: 404 })
  }

  const amount = parseFloat(tx.original_amount)
  const currency = tx.original_currency ?? "USD"

  // ── Idempotency: already refunded ───────────────────────────────────────────
  if (tx.status === "REFUNDED") {
    log.info("stripe_refund.already_refunded", "Transaction already REFUNDED", {})
    return NextResponse.json({
      status: "REFUNDED",
      transaction_id: tx.id,
      amount: amount.toFixed(2),
      already_refunded: true,
    })
  }

  // ── State guard: must be COMPLETED (captured) ───────────────────────────────
  if (tx.status !== "COMPLETED") {
    log.warn("stripe_refund.wrong_state", `Cannot refund in '${tx.status}' status`, {})
    return NextResponse.json(
      { error: `Cannot refund transaction in '${tx.status}' status.` },
      { status: 400 }
    )
  }

  // ── Verify PaymentIntent exists ─────────────────────────────────────────────
  if (!tx.stripe_payment_intent_id) {
    log.error("stripe_refund.no_payment_intent", "COMPLETED Stripe tx has no payment_intent_id", {})
    return NextResponse.json(
      { error: "Transaction has no Stripe payment intent. Cannot refund." },
      { status: 422 }
    )
  }

  // ── Step 2. Load + decrypt the store's Stripe secret key ────────────────────
  let secretKey: string
  try {
    const rows = (await sql`
      SELECT stripe_secret_key FROM stores WHERE id = ${store.id} LIMIT 1
    `) as unknown as StripeKeyRow[]
    const raw = rows[0]?.stripe_secret_key
    if (!raw) {
      log.error("stripe_refund.not_configured", "Store has no Stripe secret key", {})
      return NextResponse.json({ error: "Stripe is not configured for this store." }, { status: 503 })
    }
    secretKey = isEncrypted(raw) ? decrypt(raw) : raw.trim()
  } catch (err) {
    log.error("stripe_refund.secret_failed", "Failed to load/decrypt Stripe secret key", { error: err })
    return NextResponse.json({ error: "Stripe credential error for this store." }, { status: 500 })
  }

  // ── Step 3. Call Stripe to refund the PaymentIntent ─────────────────────────
  let refund
  try {
    refund = await refundPayment({ secretKey, paymentIntentId: tx.stripe_payment_intent_id })
  } catch (err) {
    const status = err instanceof StripeApiError ? err.statusCode : 502
    log.error("stripe_refund.provider_error", "Stripe refund failed", { error: err })
    return NextResponse.json(
      { error: "Payment provider error during refund." },
      { status: status >= 400 && status < 600 ? status : 502 }
    )
  }

  log.info("stripe_refund.provider_ok", `Stripe refund ok refundId=${refund.id} status=${refund.status}`, {
    alreadyRefunded: refund.alreadyRefunded,
  })

  // ── Step 4. Mark REFUNDED (first transition only; idempotent) ───────────────
  // No merchant_accounts volume reversal — Stripe stores have no rotation/volume.
  try {
    await sql`
      UPDATE transactions
      SET status = 'REFUNDED',
          refunded_at = NOW(),
          updated_at = NOW(),
          status_reason = 'stripe_refund'
      WHERE id = ${tx.id}
        AND status = 'COMPLETED'
    `
  } catch (err) {
    // Stripe refund already succeeded — log but return success (DB may be retried).
    log.error("stripe_refund.db_update_failed", "DB update to REFUNDED failed after Stripe refund", {
      error: err,
    })
  }

  // ── Step 5. Fire the merchant webhook (reuse shared delivery pipeline) ───────
  if (store.webhookUrl) {
    const payload: Omit<StoreWebhookPayload, "event_id"> = {
      event: "payment.capture.refunded",
      transaction_id: tx.id,
      paypal_order_id: null,
      amount: amount.toFixed(2),
      currency,
      status: "REFUNDED",
      timestamp: new Date().toISOString(),
      status_reason: "stripe_refund",
      payment_method: "card",
    }

    try {
      const { eventId, shouldDeliver } = await persistWebhookEventSafe({
        transactionId: tx.id,
        tenantId,
        storeId: store.id,
        accountId: null,
        targetUrl: store.webhookUrl,
        businessKey: buildWebhookBusinessKey(
          "payment.capture.refunded",
          tx.id,
          refund.id || "stripe_refund"
        ),
        event: "payment.capture.refunded",
        payload,
        source: "refund_api",
        triggerOrigin: "refund_api",
      })
      if (shouldDeliver) {
        deliverWebhookEvent(eventId, "refund_api").catch((e) =>
          log.error("stripe_refund.delivery_failed", `Webhook delivery failed (cron will retry) eventId=${eventId}`, {
            error: e,
          })
        )
      }
    } catch (err) {
      log.error("stripe_refund.persist_failed", "Webhook persistence failed (refund still succeeded)", {
        error: err,
      })
    }
  }

  log.info("stripe_refund.complete", `Transaction ${tx.id} REFUNDED via Stripe`, {})

  return NextResponse.json(
    {
      status: "REFUNDED",
      transaction_id: tx.id,
      stripe_refund_id: refund.id || null,
      amount: amount.toFixed(2),
      already_refunded: refund.alreadyRefunded,
    },
    { status: 200 }
  )
}
