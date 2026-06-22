/**
 * POST /api/webhook/stripe/[storeId]
 *
 * Per-store Stripe webhook endpoint. The merchant configures this URL in their
 * Stripe Dashboard; the [storeId] segment tells us which store's webhook
 * signing secret to verify against.
 *
 * This is the Stripe equivalent of /api/webhook/paypal — it is completely
 * separate and does NOT touch the PayPal webhook handler or the mock-charge
 * flow. It reuses the shared merchant-webhook delivery + Telegram machinery.
 *
 * Handled events:
 *   • checkout.session.completed / async_payment_succeeded → mark COMPLETED,
 *     deliver merchant webhook + Telegram alert (idempotent, first transition only)
 *   • checkout.session.expired                              → mark EXPIRED
 *   • checkout.session.async_payment_failed                 → mark FAILED
 */

import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getPool, getSql } from "@/lib/neon"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { verifyStripeWebhook, StripeApiError } from "@/lib/stripe"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  deliverWebhookEvent,
  persistWebhookEventSafe,
} from "@/lib/webhook-delivery"
import { sendTransactionAlert } from "@/lib/telegram"
import { createLogger } from "@/lib/logger"

const moduleLog = createLogger({ route: "/api/webhook/stripe" })
const GATEWAY_FEE_PERCENT = 0.02

interface RouteContext {
  params: Promise<{ storeId: string }>
}

interface StoreRow {
  id: string
  tenant_id: string
  webhook_url: string | null
  stripe_secret_key: string | null
  stripe_webhook_secret: string | null
}

interface TxRow {
  id: string
  tenant_id: string
  store_id: string
  original_amount: string
  original_currency: string | null
}

function decryptMaybe(value: string): string {
  return isEncrypted(value) ? decrypt(value) : value.trim()
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { storeId } = await context.params
  const log = moduleLog.child({ storeId })

  // Stripe requires the raw, unparsed body for signature verification.
  const rawBody = await req.text()
  const signature = req.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header." }, { status: 400 })
  }

  // ── Load this store's Stripe credentials ────────────────────────────────────
  const sql = getSql()
  let store: StoreRow | undefined
  try {
    const rows = (await sql`
      SELECT id, tenant_id, webhook_url, stripe_secret_key, stripe_webhook_secret
      FROM stores
      WHERE id = ${storeId}
      LIMIT 1
    `) as unknown as StoreRow[]
    store = rows[0]
  } catch (err) {
    log.error("stripe_webhook.store_query_failed", "Failed to load store", { error: err })
    return NextResponse.json({ error: "Store lookup failed." }, { status: 500 })
  }

  if (!store || !store.stripe_secret_key || !store.stripe_webhook_secret) {
    log.error("stripe_webhook.not_configured", "Store missing Stripe credentials", {})
    return NextResponse.json({ error: "Store not found or Stripe not configured." }, { status: 404 })
  }

  // ── Verify signature ────────────────────────────────────────────────────────
  let event: Stripe.Event
  try {
    const secretKey = decryptMaybe(store.stripe_secret_key)
    const webhookSecret = decryptMaybe(store.stripe_webhook_secret)
    event = verifyStripeWebhook(secretKey, rawBody, signature, webhookSecret)
  } catch (err) {
    const status = err instanceof StripeApiError ? err.statusCode : 400
    log.error("stripe_webhook.signature_invalid", "Stripe webhook signature verification failed", {
      error: err,
    })
    return NextResponse.json({ error: "Invalid signature." }, { status: status === 400 ? 400 : 400 })
  }

  log.info("stripe_webhook.received", `Stripe event ${event.type} (${event.id})`, {
    eventType: event.type,
    eventId: event.id,
  })

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session
        // For card payments payment_status is "paid"; async methods complete via
        // the async_payment_succeeded event.
        if (
          event.type === "checkout.session.completed" &&
          session.payment_status !== "paid"
        ) {
          log.info("stripe_webhook.pending_async", "Session completed but payment pending (async)", {
            sessionId: session.id,
            paymentStatus: session.payment_status,
          })
          break
        }
        await completeStripeTransaction(session, store, log)
        break
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session
        await transitionTerminalStatus(session.id, "EXPIRED", "stripe_checkout_expired", log)
        break
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session
        await transitionTerminalStatus(session.id, "FAILED", "stripe_async_payment_failed", log)
        break
      }

      default:
        // Acknowledge unhandled events so Stripe doesn't retry them.
        log.info("stripe_webhook.ignored", `Unhandled event type ${event.type}`, {
          eventType: event.type,
        })
    }
  } catch (err) {
    log.error("stripe_webhook.processing_error", "Error while processing Stripe event", {
      error: err,
      eventType: event.type,
    })
    // Return 500 so Stripe retries — processing is idempotent.
    return NextResponse.json({ error: "Processing error." }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/**
 * Marks a Stripe checkout transaction COMPLETED (first transition only) and
 * fans out the merchant webhook + Telegram alert. Idempotent: duplicate Stripe
 * deliveries find the row already COMPLETED and exit without re-notifying.
 */
async function completeStripeTransaction(
  session: Stripe.Checkout.Session,
  store: StoreRow,
  log: ReturnType<typeof moduleLog.child>
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  const pool = getPool()
  const client = await pool.connect()
  let tx: TxRow | null = null
  let gatewayFee = 0
  let netAmount = 0

  try {
    await client.query("BEGIN")

    // First-transition guard: only update rows still PENDING.
    const updated = await client.query<TxRow>(
      `UPDATE transactions
       SET status = 'COMPLETED'::transaction_status,
           completed_at = NOW(),
           updated_at = NOW(),
           status_reason = 'stripe_checkout_completed',
           stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id)
       WHERE stripe_session_id = $1
         AND status = 'PENDING'
       RETURNING id, tenant_id, store_id, original_amount, original_currency`,
      [session.id, paymentIntentId]
    )

    tx = updated.rows[0] ?? null
    if (!tx) {
      // Either already processed (idempotent) or unknown session — no-op.
      await client.query("ROLLBACK")
      log.info("stripe_webhook.no_pending_tx", "No PENDING transaction for session (already processed?)", {
        sessionId: session.id,
      })
      return
    }

    const amount = parseFloat(tx.original_amount)
    gatewayFee = Math.round(amount * GATEWAY_FEE_PERCENT * 100) / 100
    netAmount = Math.round((amount - gatewayFee) * 100) / 100

    await client.query(
      `UPDATE transactions SET gateway_fee = $2 WHERE id = $1`,
      [tx.id, gatewayFee.toFixed(2)]
    )

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

  // ── Resolve the merchant webhook target from the TRANSACTION's own store ────
  // The Stripe webhook arrives at /api/webhook/stripe/[storeId], where [storeId]
  // is whichever store's endpoint Stripe was configured to call. When several
  // stores share one Stripe account, Stripe delivers EVERY event in that account
  // to that single endpoint — so `store` (loaded from the URL) can belong to a
  // different merchant than the transaction. The merchant webhook must always go
  // to the transaction's own store, matching the event store_id + signing secret
  // used by the delivery pipeline (deliverWebhookEvent signs with tx.store_id's
  // secret). Using `store.webhook_url` here delivered other merchants' payments
  // to the wrong endpoint (401) and left their orders stuck PENDING.
  let merchantWebhookUrl = store.webhook_url
  if (tx.store_id !== store.id) {
    const rows = (await getSql()`
      SELECT webhook_url FROM stores WHERE id = ${tx.store_id} LIMIT 1
    `) as unknown as { webhook_url: string | null }[]
    merchantWebhookUrl = rows[0]?.webhook_url ?? null
    log.info("stripe_webhook.cross_store_delivery", "Tx store differs from webhook URL store; delivering to tx store", {
      txStoreId: tx.store_id,
      webhookUrlStoreId: store.id,
      resolvedTarget: merchantWebhookUrl,
    })
  }

  // ── Deliver merchant webhook (reuse shared delivery pipeline) ───────────────
  if (merchantWebhookUrl) {
    const payload: Omit<StoreWebhookPayload, "event_id"> = {
      event: "payment.capture.completed",
      transaction_id: tx.id,
      paypal_order_id: null,
      amount: amount.toFixed(2),
      currency,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      status_reason: "stripe_checkout_completed",
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
        targetUrl: merchantWebhookUrl,
        businessKey: buildWebhookBusinessKey("payment.capture.completed", tx.id, "stripe"),
        event: "payment.capture.completed",
        payload,
        source: "stripe_webhook",
        triggerOrigin: "stripe_webhook",
      })

      if (shouldDeliver) {
        await deliverWebhookEvent(eventId, "stripe_webhook").catch((error) => {
          log.error(
            "stripe_webhook.delivery_failed",
            `Webhook delivery failed (event persisted, cron will retry): tx=${tx?.id} eventId=${eventId}`,
            { error }
          )
        })
      }
    } catch (error) {
      log.error("stripe_webhook.persist_failed", `Webhook event persistence failed: tx=${tx.id}`, {
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
      accountName: "Stripe",
      transactionId: tx.id,
    })
  } catch (error) {
    log.error("stripe_webhook.telegram_failed", "Telegram notification failed", { error })
  }

  log.info("stripe_webhook.completed", `Transaction ${tx.id} marked COMPLETED via Stripe`, {
    transactionId: tx.id,
    sessionId: session.id,
  })
}

/** Transitions a PENDING Stripe transaction to a terminal non-success status. */
async function transitionTerminalStatus(
  sessionId: string,
  status: "EXPIRED" | "FAILED",
  reason: string,
  log: ReturnType<typeof moduleLog.child>
): Promise<void> {
  const sql = getSql()
  const rows = (await sql`
    UPDATE transactions
    SET status = ${status}::transaction_status,
        updated_at = NOW(),
        status_reason = ${reason}
    WHERE stripe_session_id = ${sessionId}
      AND status = 'PENDING'
    RETURNING id
  `) as unknown as { id: string }[]
  log.info("stripe_webhook.terminal_transition", `Session ${sessionId} → ${status} (changed=${rows.length})`, {
    sessionId,
    status,
    changed: rows.length,
  })
}
