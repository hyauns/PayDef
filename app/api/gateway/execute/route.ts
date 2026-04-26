/**
 * POST /api/gateway/execute
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  THE MISSING EXECUTION STEP                                         │
 * │                                                                     │
 * │  This endpoint is called by the shield domain's success page        │
 * │  (result-client.tsx) immediately after the buyer returns from       │
 * │  PayPal with an APPROVED order.                                     │
 * │                                                                     │
 * │  CAPTURE intent:                                                    │
 * │    POST /v2/checkout/orders/{paypalOrderId}/capture                 │
 * │    → status moves from PENDING → COMPLETED                         │
 * │                                                                     │
 * │  AUTHORIZE intent:                                                  │
 * │    POST /v2/checkout/orders/{paypalOrderId}/authorize               │
 * │    → status moves from PENDING → AUTHORIZED                        │
 * │    → authorization_id is saved for later capture                   │
 * │                                                                     │
 * │  Without this step, money NEVER moves — PayPal order stays in      │
 * │  APPROVED state (not captured, not authorized).                     │
 * │                                                                     │
 * │  Security: No external auth required — transactionId is the        │
 * │  secret (UUID, unguessable). The endpoint is idempotent: calling   │
 * │  it twice for a non-PENDING transaction is a no-op.                │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/neon"
import { decrypt } from "@/lib/encryption"
import { captureApprovedOrder, authorizeApprovedOrder } from "@/lib/paypal"
import { sendTransactionAlert } from "@/lib/telegram"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
  deliverWebhookEventReliably,
} from "@/lib/webhook-delivery"
import { getSql } from "@/lib/neon"
import { verifyExecuteToken } from "@/lib/execute-token"

const GATEWAY_FEE_PERCENT = 0.02

// ─── DB row shapes ─────────────────────────────────────────────────────────────

interface TransactionRow {
  id:               string
  tenant_id:        string
  store_id:         string
  merchant_id:      string
  original_amount:  string
  status:           string
  intent:           string   // 'CAPTURE' | 'AUTHORIZE'
  paypal_order_id:  string | null
  authorization_id: string | null
  merchant_success_url: string | null
  merchant_cancel_url:  string | null
  webhook_url:          string | null
  webhook_secret:       string | null
}

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { transactionId?: string; executeToken?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const transactionId = body.transactionId?.trim()
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId is required." }, { status: 400 })
  }

  // ── Execute token verification (shadow/enforce) ────────────────────────────
  const tokenResult = verifyExecuteToken(transactionId, body.executeToken)
  const tokenLogLine =
    `[execute] Token check: tx=${transactionId} reason=${tokenResult.reason} ` +
    `mode=${process.env.EXECUTE_TOKEN_MODE ?? "shadow"} blocked=${tokenResult.shouldBlock}`
  if (tokenResult.valid) {
    console.info(tokenLogLine)
  } else {
    console.warn(tokenLogLine)
  }
  if (tokenResult.shouldBlock) {
    return NextResponse.json(
      { error: "Invalid or missing executeToken." },
      { status: 403 }
    )
  }

  const pool   = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // ── 1. Lock the transaction row ─────────────────────────────────────────
    const txResult = await client.query<TransactionRow>(
      `SELECT
         t.id, t.tenant_id, t.store_id, t.merchant_id,
         t.original_amount, t.status, t.intent,
         t.paypal_order_id, t.authorization_id,
         t.merchant_success_url, t.merchant_cancel_url,
         s.webhook_url, s.webhook_secret
       FROM   transactions t
       LEFT JOIN stores s ON s.id = t.store_id
       WHERE  t.id = $1
       LIMIT  1
       FOR UPDATE OF t`,
      [transactionId]
    )

    const tx = txResult.rows[0]
    if (!tx) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
    }

    // ── 2. Idempotency check ─────────────────────────────────────────────────
    // If already executed (not PENDING), return current state — safe to retry.
    // SPECIAL CASE: For AUTHORIZED status, also attempt to re-fire the webhook
    // in case the PayPal IPN ran first (set status to AUTHORIZED) but its
    // delivery attempt failed or timed out. This is the most common race.
    if (tx.status !== "PENDING") {
      await client.query("ROLLBACK")
      console.info(`[execute] Transaction ${transactionId} already in status ${tx.status} — skipping execute`)

      // For AUTHORIZE flow: re-attempt webhook delivery if the event exists and
      // is still pending/retrying. The buyer redirect triggers this path when
      // IPN wins the race, so this is a critical recovery opportunity.
      if (tx.status === "AUTHORIZED" && tx.authorization_id && tx.webhook_url) {
        const originalAmount  = parseFloat(tx.original_amount)
        const gatewayFee      = originalAmount * GATEWAY_FEE_PERCENT
        const authWebhookPayload: Omit<StoreWebhookPayload, "event_id"> = {
          event:              "payment.authorization.created",
          transaction_id:     tx.id,
          paypal_order_id:    tx.paypal_order_id,
          authorization_id:   tx.authorization_id,
          amount:             originalAmount.toFixed(2),
          gateway_fee:        gatewayFee.toFixed(2),
          net_amount:         (originalAmount - gatewayFee).toFixed(2),
          status:             "AUTHORIZED",
          timestamp:          new Date().toISOString(),
        }
        try {
          const { eventId, shouldDeliver } = await persistWebhookEventSafe({
            transactionId,
            tenantId:    tx.tenant_id,
            storeId:     tx.store_id,
            accountId:   tx.merchant_id,
            targetUrl:   tx.webhook_url,
            businessKey: buildWebhookBusinessKey("payment.authorization.created", transactionId, tx.authorization_id),
            event:       "payment.authorization.created",
            payload:     authWebhookPayload,
            source:      "execute_api_idempotency_recovery",
            triggerOrigin: "buyer_return",
          })
          console.info(`[execute] Idempotency-recovery: auth webhook persisted eventId=${eventId} shouldDeliver=${shouldDeliver} authId=${tx.authorization_id}`)
          if (shouldDeliver) {
            const delivery = await deliverWebhookEventReliably(eventId, "buyer_return")
            console.info(
              `[execute] Idempotency-recovery delivery result: tx=${transactionId} eventId=${eventId} status=${delivery.finalStatus} deliveredAt=${delivery.deliveredAt ?? "pending"} nextRetry=${delivery.nextRetryAt ?? "none"}`
            )
          }
        } catch (err) {
          console.error(`[execute] Idempotency-recovery: webhook persist failed tx=${transactionId} authId=${tx.authorization_id}`, err)
        }
      }

      return NextResponse.json({
        status:         tx.status,
        transaction_id: tx.id,
        already_executed: true,
      })
    }

    if (!tx.paypal_order_id) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Transaction has no paypal_order_id." }, { status: 422 })
    }

    // ── 3. Fetch merchant credentials ────────────────────────────────────────
    const merchantResult = await client.query<MerchantRow>(
      `SELECT client_id, client_secret, proxy_url
       FROM   merchant_accounts
       WHERE  id = $1`,
      [tx.merchant_id]
    )

    const merchant = merchantResult.rows[0]
    if (!merchant) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Merchant account not found." }, { status: 500 })
    }

    const decryptedSecret = decrypt(merchant.client_secret)
    const proxyUrl        = merchant.proxy_url ?? undefined
    const originalAmount  = parseFloat(tx.original_amount)
    const gatewayFee      = originalAmount * GATEWAY_FEE_PERCENT

    // ── 4. Execute PayPal call based on intent ───────────────────────────────
    const intent = (tx.intent ?? "CAPTURE").toUpperCase()
    console.info(`[execute] tx=${transactionId} intent=${intent} (db.intent=${tx.intent}) paypal_order=${tx.paypal_order_id}`)

    if (intent === "AUTHORIZE") {
      // ── Manual Capture flow: authorize only ────────────────────────────────
      console.info(`[execute] Authorizing order ${tx.paypal_order_id} for tx ${transactionId}`)

      let authResult
      try {
        authResult = await authorizeApprovedOrder({
          clientId:     merchant.client_id,
          clientSecret: decryptedSecret,
          orderId:      tx.paypal_order_id,
          proxyUrl,
        })
      } catch (err) {
        await client.query("ROLLBACK")
        console.error("[execute] PayPal authorize failed:", err)
        // Mark FAILED in DB so we don't retry infinitely
        await client.query(
          `UPDATE transactions SET status = 'FAILED'::transaction_status,
                  status_reason = $1, updated_at = NOW() WHERE id = $2`,
          [err instanceof Error ? err.message.slice(0, 255) : "paypal_authorize_failed", transactionId]
        ).catch(() => null)
        return NextResponse.json(
          { error: "PayPal authorization failed. The buyer approval may have expired." },
          { status: 502 }
        )
      }

      // Extract authorization ID from PayPal response
      const authId = authResult.purchase_units?.[0]?.payments?.authorizations?.[0]?.id
        ?? authResult.id

      if (!authId) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "PayPal did not return an authorization ID." }, { status: 502 })
      }

      // ── Update DB: PENDING → AUTHORIZED ───────────────────────────────────
      await client.query(
        `UPDATE transactions
         SET    status = 'AUTHORIZED'::transaction_status,
                authorization_id = $1,
                gateway_fee = $2,
                authorization_expires_at = NOW() + INTERVAL '7 days',
                checkout_expires_at = NULL,
                updated_at = NOW()
         WHERE  id = $3`,
        [authId, gatewayFee.toFixed(2), transactionId]
      )

      await client.query("COMMIT")

      console.info(`[execute] AUTHORIZE complete: tx=${transactionId} status=AUTHORIZED authId=${authId}`)

      // ── Persist webhook event (awaited, uses stateless HTTP driver) ───────
      // Then fire-and-forget delivery — event is durable, cron retries if needed
      if (tx.webhook_url) {
        const payload: Omit<StoreWebhookPayload, "event_id"> = {
          event:              "payment.authorization.created",
          transaction_id:     tx.id,
          paypal_order_id:    tx.paypal_order_id,
          authorization_id:   authId,
          amount:             originalAmount.toFixed(2),
          gateway_fee:        gatewayFee.toFixed(2),
          net_amount:         (originalAmount - gatewayFee).toFixed(2),
          status:             "AUTHORIZED",
          timestamp:          new Date().toISOString(),
        }
        try {
          const { eventId, isNew, shouldDeliver } = await persistWebhookEventSafe({
            transactionId,
            tenantId:   tx.tenant_id,
            storeId:    tx.store_id,
            accountId:  tx.merchant_id,
            targetUrl:  tx.webhook_url,
            businessKey: buildWebhookBusinessKey("payment.authorization.created", transactionId, authId),
            event:      "payment.authorization.created",
            payload,
            source:     "execute_api",
            triggerOrigin: "buyer_return",
          })
          console.info(`[execute] Webhook event persisted: event=payment.authorization.created tx=${transactionId} eventId=${eventId} isNew=${isNew} shouldDeliver=${shouldDeliver}`)
          // Authorization delivery is awaited here because buyer-return runs
          // inside the checkout UX and background promises are not reliable on Vercel.
          if (shouldDeliver) {
            const delivery = await deliverWebhookEventReliably(eventId, "buyer_return")
            console.info(
              `[execute] Auth webhook delivery result: tx=${transactionId} eventId=${eventId} status=${delivery.finalStatus} deliveredAt=${delivery.deliveredAt ?? "pending"} nextRetry=${delivery.nextRetryAt ?? "none"}`
            )
          }
        } catch (persistErr) {
          console.error(`[execute] Webhook event persistence FAILED (payment still succeeded): event=payment.authorization.created tx=${transactionId} authId=${authId}`, persistErr)
        }
      }

      // Telegram alert (fire-and-forget)
      const sql = getSql()
      try {
        const sn = await sql`SELECT name FROM stores WHERE id = ${tx.store_id} LIMIT 1` as unknown as { name: string }[]
        const an = await sql`SELECT name FROM merchant_accounts WHERE id = ${tx.merchant_id} LIMIT 1` as unknown as { name: string }[]
        await sendTransactionAlert({
          tenantId: tx.tenant_id,
          amount: originalAmount,
          storeName: sn[0]?.name ?? "Unknown",
          accountName: an[0]?.name ?? "Unknown",
          transactionId,
        })
      } catch (error) {
        console.error("[execute] Telegram notification failed (authorized):", error)
      }

      console.info(`[execute] Responding: status=AUTHORIZED tx=${transactionId} (redirect will carry this status)`)
      return NextResponse.json({
        status:           "AUTHORIZED",
        transaction_id:   transactionId,
        authorization_id: authId,
        amount:           originalAmount.toFixed(2),
        gateway_fee:      gatewayFee.toFixed(2),
      })

    } else {
      // ── Automatic Capture flow: capture immediately ────────────────────────
      console.info(`[execute] Capturing order ${tx.paypal_order_id} for tx ${transactionId}`)

      let captureResult
      try {
        captureResult = await captureApprovedOrder({
          clientId:     merchant.client_id,
          clientSecret: decryptedSecret,
          orderId:      tx.paypal_order_id,
          proxyUrl,
        })
      } catch (err) {
        await client.query("ROLLBACK")
        console.error("[execute] PayPal capture failed:", err)
        await client.query(
          `UPDATE transactions SET status = 'FAILED'::transaction_status,
                  status_reason = $1, updated_at = NOW() WHERE id = $2`,
          [err instanceof Error ? err.message.slice(0, 255) : "paypal_capture_failed", transactionId]
        ).catch(() => null)
        return NextResponse.json(
          { error: "PayPal capture failed. The buyer approval may have expired." },
          { status: 502 }
        )
      }

      // Extract capture ID from PayPal response
      const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id
        ?? captureResult.id

      const paypalStatus = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.status
        ?? captureResult.status

      if (paypalStatus !== "COMPLETED") {
        await client.query("ROLLBACK")
        // Mark as FAILED — PayPal captured but not completed (e.g. PENDING, DECLINED)
        await client.query(
          `UPDATE transactions SET status = 'FAILED'::transaction_status,
                  status_reason = $1, updated_at = NOW() WHERE id = $2`,
          [`paypal_capture_status_${paypalStatus}`, transactionId]
        ).catch(() => null)
        return NextResponse.json(
          { error: `Capture not completed — PayPal status: ${paypalStatus}` },
          { status: 422 }
        )
      }

      // ── Update DB: PENDING → COMPLETED ──────────────────────────────────
      await client.query(
        `UPDATE transactions
         SET    status = 'COMPLETED'::transaction_status,
                paypal_capture_id = $1,
                gateway_fee = $2,
                completed_at = NOW(),
                checkout_expires_at = NULL,
                updated_at = NOW()
         WHERE  id = $3`,
        [captureId, gatewayFee.toFixed(2), transactionId]
      )

      // ── Update merchant volume ─────────────────────────────────────────────
      await client.query(
        `UPDATE merchant_accounts
         SET    current_volume = current_volume + $1,
                updated_at     = NOW()
         WHERE  id = $2`,
        [originalAmount, tx.merchant_id]
      )

      await client.query("COMMIT")

      console.info(`[execute] CAPTURE complete: tx=${transactionId} status=COMPLETED captureId=${captureId}`)

      // ── Persist webhook event (awaited, uses stateless HTTP driver) ───────
      // Then fire-and-forget delivery — event is durable, cron retries if needed
      if (tx.webhook_url) {
        const payload: Omit<StoreWebhookPayload, "event_id"> = {
          event:             "payment.capture.completed",
          transaction_id:    tx.id,
          paypal_order_id:   tx.paypal_order_id,
          paypal_capture_id: captureId,
          amount:            originalAmount.toFixed(2),
          gateway_fee:       gatewayFee.toFixed(2),
          net_amount:        (originalAmount - gatewayFee).toFixed(2),
          status:            "COMPLETED",
          timestamp:         new Date().toISOString(),
        }
        try {
          const { eventId, isNew, shouldDeliver } = await persistWebhookEventSafe({
            transactionId,
            tenantId:   tx.tenant_id,
            storeId:    tx.store_id,
            accountId:  tx.merchant_id,
            targetUrl:  tx.webhook_url,
            businessKey: buildWebhookBusinessKey("payment.capture.completed", transactionId, captureId),
            event:      "payment.capture.completed",
            payload,
            source:     "execute_api",
            triggerOrigin: "buyer_return",
          })
          console.info(`[execute] Webhook event persisted: event=payment.capture.completed tx=${transactionId} eventId=${eventId} isNew=${isNew} shouldDeliver=${shouldDeliver}`)
          if (shouldDeliver) {
            await deliverWebhookEvent(eventId, "buyer_return").catch((e) =>
              console.error(`[execute] Webhook delivery failed (event persisted, cron will retry): tx=${transactionId} eventId=${eventId}`, e)
            )
          }
        } catch (persistErr) {
          console.error(`[execute] Webhook event persistence FAILED (payment still succeeded): event=payment.capture.completed tx=${transactionId} captureId=${captureId}`, persistErr)
        }
      }

      // Telegram alert (fire-and-forget)
      const sql = getSql()
      try {
        const sn = await sql`SELECT name FROM stores WHERE id = ${tx.store_id} LIMIT 1` as unknown as { name: string }[]
        const an = await sql`SELECT name FROM merchant_accounts WHERE id = ${tx.merchant_id} LIMIT 1` as unknown as { name: string }[]
        await sendTransactionAlert({
          tenantId: tx.tenant_id,
          amount: originalAmount,
          storeName: sn[0]?.name ?? "Unknown",
          accountName: an[0]?.name ?? "Unknown",
          transactionId,
        })
      } catch (error) {
        console.error("[execute] Telegram notification failed (completed):", error)
      }

      console.info(`[execute] Responding: status=COMPLETED tx=${transactionId} captureId=${captureId} (redirect will carry this status)`)
      return NextResponse.json({
        status:            "COMPLETED",
        transaction_id:    transactionId,
        paypal_capture_id: captureId,
        amount:            originalAmount.toFixed(2),
        gateway_fee:       gatewayFee.toFixed(2),
        net_amount:        (originalAmount - gatewayFee).toFixed(2),
      })
    }

  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[execute] Unexpected error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred during payment execution." },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
