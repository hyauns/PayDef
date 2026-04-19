/**
 * POST /api/gateway/capture — Manual Capture for Authorized Payments
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  AUTHORIZE → CAPTURE FLOW                                          │
 * │                                                                     │
 * │  1. Store creates order with intent=AUTHORIZE via /api/gateway/    │
 * │     checkout → buyer approves → PayPal authorizes the funds        │
 * │  2. PayPal sends PAYMENT.AUTHORIZATION.CREATED webhook → we save  │
 * │     the authorization_id and notify the store                       │
 * │  3. Store calls this endpoint with the authorization_id to         │
 * │     capture the funds when ready (e.g. after fulfillment)           │
 * │  4. On successful capture → mark COMPLETED, update volume,         │
 * │     create billing record, notify store webhook                     │
 * │                                                                     │
 * │  SECURITY: X-API-Key and X-Store-ID headers are required.           │
 * │  Tenant isolation is enforced throughout.                           │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql, getPool } from "@/lib/neon"
import { captureAuthorization } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { sendTransactionAlert } from "@/lib/telegram"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
} from "@/lib/webhook-delivery"
import bcrypt from "bcryptjs"

// ─── Constants ────────────────────────────────────────────────────────────────

const GATEWAY_FEE_PERCENT = 0.02

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface StoreRow {
  id:            string
  tenant_id:     string
  api_key_hash:  string
  is_active:     boolean
  webhook_url:   string | null
  webhook_secret: string | null
}

interface TransactionRow {
  id:               string
  tenant_id:        string
  store_id:         string
  merchant_id:      string
  original_amount:  string
  status:           string
  authorization_id: string | null
  paypal_order_id:  string | null
  intent:           string
}

interface MerchantNameRow {
  name: string
}

interface StoreNameRow {
  name: string
}

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

// ─── Request body ─────────────────────────────────────────────────────────────

interface CaptureBody {
  authorization_id: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Step 1. Validate headers ────────────────────────────────────────────────
  const storeId = req.headers.get("X-Store-ID")
  const apiKey  = req.headers.get("X-API-Key")

  if (!storeId || !apiKey) {
    return NextResponse.json(
      { error: "Missing X-Store-ID or X-API-Key header." },
      { status: 401 }
    )
  }

  // ── Step 2. Parse body ──────────────────────────────────────────────────────
  let body: CaptureBody
  try {
    body = (await req.json()) as CaptureBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const { authorization_id } = body

  if (!authorization_id?.trim()) {
    return NextResponse.json(
      { error: "authorization_id is required." },
      { status: 400 }
    )
  }

  // ── Step 3. Verify store + API key ──────────────────────────────────────────
  const sql = getSql()
  const storeRows = (await sql`
    SELECT id, tenant_id, api_key_hash, is_active, webhook_url, webhook_secret
    FROM   stores
    WHERE  id = ${storeId}
    LIMIT  1
  `) as unknown as StoreRow[]
  const store = storeRows[0] ?? null

  if (!store || !store.is_active) {
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const keyValid = await bcrypt.compare(apiKey, store.api_key_hash)
  if (!keyValid) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
  }

  const { tenant_id: tenantId } = store

  // ── Step 4. Look up the AUTHORIZED transaction ──────────────────────────────
  const pool   = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Lock the transaction row to prevent concurrent captures
    const txResult = await client.query<TransactionRow>(
      `SELECT id, tenant_id, store_id, merchant_id,
              original_amount, status, authorization_id,
              paypal_order_id, intent
       FROM   transactions
       WHERE  authorization_id = $1
         AND  store_id = $2
         AND  tenant_id = $3
       FOR UPDATE`,
      [authorization_id, storeId, tenantId]
    )

    const transaction = txResult.rows[0]

    if (!transaction) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "Authorization not found for this store." },
        { status: 404 }
      )
    }

    // Verify the transaction is in the correct state
    if (transaction.status === "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "This authorization has already been captured." },
        { status: 409 }
      )
    }

    if (transaction.status !== "AUTHORIZED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: `Cannot capture transaction in '${transaction.status}' status.` },
        { status: 400 }
      )
    }

    // ── Step 5. Fetch merchant credentials ─────────────────────────────────────
    const merchantResult = await client.query<MerchantRow>(
      `SELECT client_id, client_secret, proxy_url
       FROM   merchant_accounts
       WHERE  id = $1`,
      [transaction.merchant_id]
    )

    const merchant = merchantResult.rows[0]
    if (!merchant) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "Merchant account not found." },
        { status: 500 }
      )
    }

    // ── Step 6. Call PayPal to capture the authorization ───────────────────────
    const decryptedSecret = decrypt(merchant.client_secret)
    const proxyUrl = merchant.proxy_url ?? undefined

    let captureResult
    try {
      captureResult = await captureAuthorization({
        clientId:        merchant.client_id,
        clientSecret:    decryptedSecret,
        authorizationId: authorization_id,
        proxyUrl,
      })
    } catch (paypalError) {
      await client.query("ROLLBACK")
      console.error("[capture] PayPal capture failed:", paypalError)
      return NextResponse.json(
        { error: "Payment provider error during capture. Please try again." },
        { status: 502 }
      )
    }

    if (captureResult.status !== "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        {
          error: `Capture was not successful. PayPal status: ${captureResult.status}`,
          paypal_status: captureResult.status,
        },
        { status: 422 }
      )
    }

    // ── Step 7. Update transaction to COMPLETED ───────────────────────────────
    const originalAmount = parseFloat(transaction.original_amount)
    const gatewayFee     = originalAmount * GATEWAY_FEE_PERCENT

    await client.query(
      `UPDATE transactions
       SET status = 'COMPLETED',
           paypal_capture_id = $1,
           gateway_fee = $2,
           completed_at = NOW(),
           checkout_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $3`,
      [captureResult.id, gatewayFee.toFixed(2), transaction.id]
    )

    // ── Step 8. Increment merchant volume (deferred from checkout) ────────────
    await client.query(
      `UPDATE merchant_accounts
       SET    current_volume = current_volume + $1,
              updated_at     = NOW()
       WHERE  id = $2`,
      [originalAmount, transaction.merchant_id]
    )

    // ── Step 9. COMMIT ────────────────────────────────────────────────────────
    await client.query("COMMIT")

    // ── Step 10. Persist webhook event (awaited, stateless HTTP driver) ─────
    // Then fire-and-forget delivery — event is durable, cron retries if needed
    if (store.webhook_url) {
      const canonicalPayload: Omit<StoreWebhookPayload, "event_id"> = {
        event: "payment.capture.completed",
        transaction_id: transaction.id,
        paypal_order_id: transaction.paypal_order_id,
        paypal_capture_id: captureResult.id,
        authorization_id,
        amount: originalAmount.toFixed(2),
        gateway_fee: gatewayFee.toFixed(2),
        net_amount: (originalAmount - gatewayFee).toFixed(2),
        status: "COMPLETED",
        timestamp: new Date().toISOString(),
      }

      try {
        const { eventId, isNew, shouldDeliver } = await persistWebhookEventSafe({
          transactionId: transaction.id,
          tenantId,
          storeId,
          accountId: transaction.merchant_id,
          targetUrl: store.webhook_url,
          businessKey: buildWebhookBusinessKey("payment.capture.completed", transaction.id, captureResult.id),
          event: "payment.capture.completed",
          payload: canonicalPayload,
          source: "manual_capture_api",
          triggerOrigin: "capture_api",
        })
        console.info(`[capture] Webhook event persisted: event=payment.capture.completed tx=${transaction.id} eventId=${eventId} isNew=${isNew} shouldDeliver=${shouldDeliver}`)
        // Fire-and-forget delivery — event is persisted, cron will retry if this fails
        if (shouldDeliver) {
          deliverWebhookEvent(eventId, "capture_api").catch((e) =>
            console.error(`[capture] Webhook delivery failed (event persisted, cron will retry): tx=${transaction.id} eventId=${eventId}`, e)
          )
        }
      } catch (persistErr) {
        console.error(`[capture] Webhook event persistence FAILED (capture still succeeded): event=payment.capture.completed tx=${transaction.id} captureId=${captureResult.id}`, persistErr)
      }
    }

    // ── Step 11. Telegram notification (async, non-blocking) ──────────────────
    // Fetch store and account names for the message, then fire-and-forget
    ;(async () => {
      try {
        const storeNameRows = await sql`SELECT name FROM stores WHERE id = ${storeId} LIMIT 1` as unknown as StoreNameRow[]
        const acctNameRows = await sql`SELECT name FROM merchant_accounts WHERE id = ${transaction.merchant_id} LIMIT 1` as unknown as MerchantNameRow[]
        sendTransactionAlert({
          tenantId,
          amount: originalAmount,
          storeName: storeNameRows[0]?.name ?? "Unknown Store",
          accountName: acctNameRows[0]?.name ?? "Unknown Account",
          transactionId: transaction.id,
        })
      } catch { /* silent */ }
    })()

    return NextResponse.json(
      {
        status:            "COMPLETED",
        transaction_id:    transaction.id,
        paypal_capture_id: captureResult.id,
        amount:            originalAmount.toFixed(2),
        gateway_fee:       gatewayFee.toFixed(2),
        net_amount:        (originalAmount - gatewayFee).toFixed(2),
      },
      { status: 200 }
    )

  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[capture] Unexpected error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
