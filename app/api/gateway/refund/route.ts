/**
 * POST /api/gateway/refund — Full Refund for a Captured Payment
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  REFUND FLOW                                                        │
 * │                                                                     │
 * │  1. Store admin cancels an order that was already CAPTURED           │
 * │  2. Store calls this endpoint with the transaction_id                │
 * │  3. Gateway calls PayPal to refund the captured payment              │
 * │  4. On success → mark REFUNDED, reverse volume, notify webhook      │
 * │                                                                     │
 * │  SECURITY: X-API-Key and X-Store-ID headers are required.           │
 * │  Tenant isolation is enforced throughout.                           │
 * │  Idempotent: repeated calls for already-refunded return success.    │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { refundCapture, PayPalApiError } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
} from "@/lib/webhook-delivery"
import bcrypt from "bcryptjs"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { compareApiKeyCached } from "@/lib/api-key-cache"

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
  paypal_order_id:  string | null
  paypal_capture_id: string | null
  authorization_id: string | null
  intent:           string
}

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

// ─── Request body ─────────────────────────────────────────────────────────────

interface RefundBody {
  transaction_id: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const LOG = "[refund]"

  // ── Step 1. Validate headers ────────────────────────────────────────────────
  const storeId = req.headers.get("X-Store-ID")
  const apiKey  = req.headers.get("X-API-Key")

  if (!storeId || !apiKey) {
    console.warn(`${LOG} Missing auth headers: storeId=${!!storeId} apiKey=${!!apiKey}`)
    return NextResponse.json(
      { error: "Missing X-Store-ID or X-API-Key header." },
      { status: 401 }
    )
  }

  // ── Step 2. Parse body ──────────────────────────────────────────────────────
  let body: RefundBody
  try {
    body = (await req.json()) as RefundBody
  } catch {
    console.warn(`${LOG} Invalid JSON body from storeId=${storeId}`)
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const { transaction_id } = body

  if (!transaction_id?.trim()) {
    console.warn(`${LOG} Missing transaction_id from storeId=${storeId}`)
    return NextResponse.json(
      { error: "transaction_id is required." },
      { status: 400 }
    )
  }

  console.info(`${LOG} START: storeId=${storeId} txId=${transaction_id}`)

  // ── Step 3. Verify store + API key ──────────────────────────────────────────
  const sql = getSql()
  let store: StoreRow | null = null
  try {
    const storeRows = (await sql`
      SELECT id, tenant_id, api_key_hash, is_active, webhook_url, webhook_secret
      FROM   stores
      WHERE  id = ${storeId}
      LIMIT  1
    `) as unknown as StoreRow[]
    store = storeRows[0] ?? null
  } catch (dbErr) {
    console.error(`${LOG} Store lookup DB error: storeId=${storeId}`, dbErr)
    return NextResponse.json(
      { error: "Database error during authentication." },
      { status: 500 }
    )
  }

  if (!store || !store.is_active) {
    console.warn(`${LOG} Store not found or inactive: storeId=${storeId}`)
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const keyValid = await compareApiKeyCached(apiKey, store.api_key_hash)
  if (!keyValid) {
    console.warn(`${LOG} Invalid API key for storeId=${storeId}`)
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
  }

  // ── Rate limiting (after auth) ──────────────────────────────────────────────
  const { allowed, headers: rlHeaders } = await checkRateLimit(storeId)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: rlHeaders }
    )
  }

  const tenantId = store.tenant_id
  console.info(`${LOG} Auth OK: storeId=${storeId} tenantId=${tenantId}`)

  // ── Step 4. Look up the transaction (stateless SQL) ─────────────────────────
  let transaction: TransactionRow | null = null
  try {
    const txRows = (await sql`
      SELECT id, tenant_id, store_id, merchant_id,
             original_amount, status, paypal_order_id,
             paypal_capture_id, authorization_id, intent
      FROM   transactions
      WHERE  id = ${transaction_id}
        AND  store_id = ${storeId}
        AND  tenant_id = ${tenantId}
      LIMIT  1
    `) as unknown as TransactionRow[]
    transaction = txRows[0] ?? null
  } catch (dbErr) {
    console.error(`${LOG} Transaction lookup DB error: txId=${transaction_id} storeId=${storeId}`, dbErr)
    return NextResponse.json(
      { error: "Database error during transaction lookup." },
      { status: 500 }
    )
  }

  if (!transaction) {
    console.warn(`${LOG} Transaction not found: txId=${transaction_id} storeId=${storeId} tenantId=${tenantId}`)
    return NextResponse.json(
      { error: "Transaction not found for this store." },
      { status: 404 }
    )
  }

  console.info(`${LOG} Transaction found: txId=${transaction.id} status=${transaction.status} captureId=${transaction.paypal_capture_id}`)

  // ── Idempotency: already refunded ──────────────────────────────────────────
  if (transaction.status === "REFUNDED") {
    console.info(`${LOG} Already refunded: txId=${transaction.id}`)
    return NextResponse.json({
      status:           "REFUNDED",
      transaction_id:   transaction.id,
      amount:           parseFloat(transaction.original_amount).toFixed(2),
      already_refunded: true,
    })
  }

  // ── State guard: must be COMPLETED (captured) ──────────────────────────────
  if (transaction.status !== "COMPLETED") {
    const hint = transaction.status === "AUTHORIZED"
      ? " Use POST /api/gateway/void to release the authorization instead."
      : ""
    console.warn(`${LOG} Wrong state for refund: txId=${transaction.id} status=${transaction.status}`)
    return NextResponse.json(
      { error: `Cannot refund transaction in '${transaction.status}' status.${hint}` },
      { status: 400 }
    )
  }

  // ── Verify capture ID exists ───────────────────────────────────────────────
  if (!transaction.paypal_capture_id) {
    console.error(`${LOG} No paypal_capture_id on COMPLETED transaction: txId=${transaction.id}`)
    return NextResponse.json(
      { error: "Transaction has no PayPal capture ID. Cannot refund." },
      { status: 422 }
    )
  }

  // ── Step 5. Fetch merchant credentials ─────────────────────────────────────
  let merchant: MerchantRow | null = null
  try {
    const merchantRows = (await sql`
      SELECT client_id, client_secret, proxy_url
      FROM   merchant_accounts
      WHERE  id = ${transaction.merchant_id}
      LIMIT  1
    `) as unknown as MerchantRow[]
    merchant = merchantRows[0] ?? null
  } catch (dbErr) {
    console.error(`${LOG} Merchant lookup DB error: merchantId=${transaction.merchant_id}`, dbErr)
    return NextResponse.json(
      { error: "Database error during merchant lookup." },
      { status: 500 }
    )
  }

  if (!merchant) {
    console.error(`${LOG} Merchant account not found: merchantId=${transaction.merchant_id}`)
    return NextResponse.json(
      { error: "Merchant account not found." },
      { status: 500 }
    )
  }

  // ── Step 6. Call PayPal to refund the capture ──────────────────────────────
  let decryptedSecret: string
  try {
    decryptedSecret = decrypt(merchant.client_secret)
  } catch (decryptErr) {
    console.error(`${LOG} Credential decryption failed: merchantId=${transaction.merchant_id}`, decryptErr)
    return NextResponse.json(
      { error: "Internal credential error." },
      { status: 500 }
    )
  }

  const proxyUrl = merchant.proxy_url ?? undefined

  console.info(`${LOG} Calling PayPal refund: captureId=${transaction.paypal_capture_id} clientId=${merchant.client_id.slice(0, 8)}...`)

  let refundResult
  try {
    refundResult = await refundCapture({
      clientId:     merchant.client_id,
      clientSecret: decryptedSecret,
      captureId:    transaction.paypal_capture_id,
      proxyUrl,
    })
  } catch (paypalError) {
    if (paypalError instanceof PayPalApiError) {
      console.error(`${LOG} PayPal refund failed [${paypalError.statusCode}]: ${paypalError.body}`)

      // If PayPal says CAPTURE_FULLY_REFUNDED, treat as idempotent success
      if (paypalError.body.includes("CAPTURE_FULLY_REFUNDED")) {
        console.info(`${LOG} PayPal says already refunded — syncing DB: txId=${transaction.id}`)
        try {
          await sql`
            UPDATE transactions
            SET status = 'REFUNDED', refunded_at = NOW(), updated_at = NOW()
            WHERE id = ${transaction.id}
          `
        } catch (syncErr) {
          console.error(`${LOG} DB sync after FULLY_REFUNDED failed: txId=${transaction.id}`, syncErr)
        }
        return NextResponse.json({
          status:           "REFUNDED",
          transaction_id:   transaction.id,
          amount:           parseFloat(transaction.original_amount).toFixed(2),
          already_refunded: true,
        })
      }

      return NextResponse.json(
        {
          error: "Payment provider error during refund.",
          paypal_status: paypalError.statusCode,
        },
        { status: 502 }
      )
    }

    console.error(`${LOG} PayPal refund unexpected error:`, paypalError)
    return NextResponse.json(
      { error: "Payment provider error during refund. Please try again." },
      { status: 502 }
    )
  }

  console.info(`${LOG} PayPal refund SUCCESS: captureId=${transaction.paypal_capture_id} refundId=${refundResult.id} refundStatus=${refundResult.status}`)

  // ── Step 7. Update transaction to REFUNDED + reverse volume ────────────────
  const originalAmount = parseFloat(transaction.original_amount)

  try {
    await sql`
      UPDATE transactions
      SET status = 'REFUNDED',
          refunded_at = NOW(),
          updated_at = NOW()
      WHERE id = ${transaction.id}
    `

    await sql`
      UPDATE merchant_accounts
      SET current_volume = GREATEST(0, current_volume - ${originalAmount}),
          updated_at = NOW()
      WHERE id = ${transaction.merchant_id}
    `

    console.info(`${LOG} DB updated to REFUNDED + volume reversed: txId=${transaction.id}`)
  } catch (dbErr) {
    // PayPal refund already succeeded — log but return success
    console.error(`${LOG} DB update FAILED (PayPal refund succeeded, DB inconsistent): txId=${transaction.id}`, dbErr)
  }

  // ── Step 8. Persist webhook event + fire-and-forget delivery ───────────────
  if (store.webhook_url) {
    const canonicalPayload: Omit<StoreWebhookPayload, "event_id"> = {
      event:            "payment.capture.refunded",
      transaction_id:   transaction.id,
      paypal_order_id:  transaction.paypal_order_id,
      paypal_capture_id: transaction.paypal_capture_id,
      amount:           originalAmount.toFixed(2),
      status:           "REFUNDED",
      timestamp:        new Date().toISOString(),
    }

    try {
      const { eventId, shouldDeliver } = await persistWebhookEventSafe({
        transactionId: transaction.id,
        tenantId,
        storeId,
        accountId: transaction.merchant_id,
        targetUrl: store.webhook_url,
        businessKey: buildWebhookBusinessKey("payment.capture.refunded", transaction.id, refundResult.id),
        event: "payment.capture.refunded",
        payload: canonicalPayload,
        source: "refund_api",
        triggerOrigin: "refund_api",
      })
      console.info(`${LOG} Webhook event persisted: eventId=${eventId} shouldDeliver=${shouldDeliver}`)
      if (shouldDeliver) {
        deliverWebhookEvent(eventId, "refund_api").catch((e) =>
          console.error(`${LOG} Webhook delivery failed (cron will retry): txId=${transaction.id} eventId=${eventId}`, e)
        )
      }
    } catch (persistErr) {
      console.error(`${LOG} Webhook persistence FAILED (refund still succeeded): txId=${transaction.id}`, persistErr)
    }
  }

  console.info(`${LOG} COMPLETE: txId=${transaction.id} refundId=${refundResult.id} status=REFUNDED`)

  return NextResponse.json(
    {
      status:           "REFUNDED",
      transaction_id:   transaction.id,
      paypal_refund_id: refundResult.id,
      amount:           originalAmount.toFixed(2),
    },
    { status: 200 }
  )
}
