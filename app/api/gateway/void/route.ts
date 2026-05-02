/**
 * POST /api/gateway/void — Void (Release) an Authorized Payment
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  VOID FLOW                                                          │
 * │                                                                     │
 * │  1. Store admin cancels an order that was only AUTHORIZED            │
 * │  2. Store calls this endpoint with the authorization_id              │
 * │  3. Gateway calls PayPal to void/release the authorization           │
 * │  4. On success → mark VOIDED, notify store webhook                  │
 * │                                                                     │
 * │  SECURITY: X-API-Key and X-Store-ID headers are required.           │
 * │  Tenant isolation is enforced throughout.                           │
 * │  Idempotent: repeated calls for already-voided return success.      │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql, getPool } from "@/lib/neon"
import { voidAuthorization, PayPalApiError } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
} from "@/lib/webhook-delivery"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"

// ─── Row shapes ───────────────────────────────────────────────────────────────

// StoreRow removed since we use AuthenticatedStore

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

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

// ─── Request body ─────────────────────────────────────────────────────────────

interface VoidBody {
  authorization_id: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const LOG = "[void]"

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
  let body: VoidBody
  try {
    body = (await req.json()) as VoidBody
  } catch {
    console.warn(`${LOG} Invalid JSON body from storeId=${storeId}`)
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const { authorization_id } = body

  if (!authorization_id?.trim()) {
    console.warn(`${LOG} Missing authorization_id from storeId=${storeId}`)
    return NextResponse.json(
      { error: "authorization_id is required." },
      { status: 400 }
    )
  }

  console.info(`${LOG} START: storeId=${storeId} authId=${authorization_id}`)

  // ── Step 3. Verify store + API key ──────────────────────────────────────────
  // ── Step 3. Verify store + API key via shared helper ────────────────────────
  let store
  try {
    store = await authenticateStoreHeaders(req)
  } catch (error: any) {
    const msg = error.message
    if (msg.includes("Missing")) {
      return NextResponse.json({ error: msg }, { status: 401 })
    }
    if (msg.includes("Invalid")) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
    }
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const sql = getSql()

  // ── Rate limiting (after auth) ────────────────────────────────────────────
  const { allowed, headers: rlHeaders } = await checkRateLimit(store.id)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: rlHeaders }
    )
  }

  const tenantId = store.tenantId

  // ── Step 4. Look up and lock the transaction ────────────────────────────────
  // Use stateless SQL first for the lookup — avoids pool/WebSocket issues.
  // Only use pool for the actual UPDATE (which needs row-level locking).
  let transaction: any | null = null
  try {
    const txRows = (await sql`
      SELECT id, tenant_id, store_id, merchant_id,
             original_amount, status, authorization_id, latest_authorization_id,
             paypal_order_id, intent
      FROM   transactions
      WHERE  (authorization_id = ${authorization_id} OR latest_authorization_id = ${authorization_id})
        AND  store_id = ${store.id}
        AND  tenant_id = ${tenantId}
      LIMIT  1
    `) as unknown as any[]
    transaction = txRows[0] ?? null
  } catch (dbErr) {
    console.error(`${LOG} Transaction lookup DB error: authId=${authorization_id} storeId=${storeId}`, dbErr)
    return NextResponse.json(
      { error: "Database error during transaction lookup." },
      { status: 500 }
    )
  }

  if (!transaction) {
    console.warn(`${LOG} Transaction not found: authId=${authorization_id} storeId=${storeId} tenantId=${tenantId}`)
    return NextResponse.json(
      { error: "Authorization not found for this store." },
      { status: 404 }
    )
  }

  console.info(`${LOG} Transaction found: txId=${transaction.id} status=${transaction.status} merchantId=${transaction.merchant_id}`)

  // ── Idempotency: already voided ────────────────────────────────────────────
  if (transaction.status === "VOIDED" || transaction.status === "CANCELED") {
    console.info(`${LOG} Already voided/canceled: txId=${transaction.id} status=${transaction.status}`)
    return NextResponse.json({
      status:           "VOIDED",
      transaction_id:   transaction.id,
      authorization_id,
      already_voided:   true,
    })
  }

  // ── State guard: must be AUTHORIZED ────────────────────────────────────────
  if (transaction.status !== "AUTHORIZED") {
    console.warn(`${LOG} Wrong state for void: txId=${transaction.id} status=${transaction.status}`)
    return NextResponse.json(
      { error: `Cannot void transaction in '${transaction.status}' status.` },
      { status: 400 }
    )
  }

  // ── Step 5. Fetch merchant credentials ──────────────────────────────────────
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

  // ── Step 6. Call PayPal to void the authorization ───────────────────────────
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

  console.info(`${LOG} Calling PayPal void: authId=${authorization_id} clientId=${merchant.client_id.slice(0, 8)}... proxy=${proxyUrl ? "yes" : "no"}`)

  try {
    await voidAuthorization({
      clientId:        merchant.client_id,
      clientSecret:    decryptedSecret,
      authorizationId: transaction.latest_authorization_id || transaction.authorization_id || authorization_id,
      proxyUrl,
    })
  } catch (paypalError) {
    // PayPal 422 often means already voided or already captured
    if (paypalError instanceof PayPalApiError) {
      console.error(`${LOG} PayPal void failed [${paypalError.statusCode}]: ${paypalError.body}`)

      // If PayPal says AUTHORIZATION_ALREADY_VOIDED, treat as idempotent success
      if (paypalError.body.includes("AUTHORIZATION_ALREADY_VOIDED")) {
        console.info(`${LOG} PayPal says already voided — syncing DB: txId=${transaction.id}`)
        try {
          await sql`
            UPDATE transactions
            SET status = 'VOIDED', canceled_at = NOW(), updated_at = NOW()
            WHERE id = ${transaction.id}
          `
        } catch (syncErr) {
          console.error(`${LOG} DB sync after ALREADY_VOIDED failed: txId=${transaction.id}`, syncErr)
        }
        return NextResponse.json({
          status:           "VOIDED",
          transaction_id:   transaction.id,
          authorization_id,
          already_voided:   true,
        })
      }

      return NextResponse.json(
        {
          error: "Payment provider error during void.",
          paypal_status: paypalError.statusCode,
        },
        { status: 502 }
      )
    }

    console.error(`${LOG} PayPal void unexpected error:`, paypalError)
    return NextResponse.json(
      { error: "Payment provider error during void. Please try again." },
      { status: 502 }
    )
  }

  console.info(`${LOG} PayPal void SUCCESS: authId=${authorization_id}`)

  // ── Step 7. Update transaction to VOIDED ───────────────────────────────────
  // Use stateless SQL (not pool) to avoid WebSocket/pool issues in serverless.
  try {
    await sql`
      UPDATE transactions
      SET status = 'VOIDED',
          canceled_at = NOW(),
          checkout_expires_at = NULL,
          authorization_expires_at = NULL,
          updated_at = NOW()
      WHERE id = ${transaction.id}
    `
    console.info(`${LOG} DB updated to VOIDED: txId=${transaction.id}`)
  } catch (dbErr) {
    // PayPal void already succeeded — log the DB failure but still return success
    // to avoid the Store retrying and hitting PayPal ALREADY_VOIDED
    console.error(`${LOG} DB update to VOIDED FAILED (PayPal void succeeded, DB inconsistent): txId=${transaction.id}`, dbErr)
  }

  // ── Step 8. Persist webhook event + fire-and-forget delivery ───────────────
  if (store.webhookUrl) {
    const canonicalPayload: Omit<StoreWebhookPayload, "event_id"> = {
      event:            "payment.authorization.voided",
      transaction_id:   transaction.id,
      paypal_order_id:  transaction.paypal_order_id,
      authorization_id,
      amount:           parseFloat(transaction.original_amount).toFixed(2),
      status:           "VOIDED",
      timestamp:        new Date().toISOString(),
    }

    try {
      const { eventId, shouldDeliver } = await persistWebhookEventSafe({
        transactionId: transaction.id,
        tenantId,
        storeId: store.id,
        accountId: transaction.merchant_id,
        targetUrl: store.webhookUrl,
        businessKey: buildWebhookBusinessKey("payment.authorization.voided", transaction.id, authorization_id),
        event: "payment.authorization.voided",
        payload: canonicalPayload,
        source: "void_api",
        triggerOrigin: "void_api",
      })
      console.info(`${LOG} Webhook event persisted: eventId=${eventId} shouldDeliver=${shouldDeliver}`)
      if (shouldDeliver) {
        deliverWebhookEvent(eventId, "void_api").catch((e) =>
          console.error(`${LOG} Webhook delivery failed (cron will retry): txId=${transaction.id} eventId=${eventId}`, e)
        )
      }
    } catch (persistErr) {
      console.error(`${LOG} Webhook persistence FAILED (void still succeeded): txId=${transaction.id}`, persistErr)
    }
  }

  console.info(`${LOG} COMPLETE: txId=${transaction.id} authId=${authorization_id} status=VOIDED`)

  return NextResponse.json(
    {
      status:           "VOIDED",
      transaction_id:   transaction.id,
      authorization_id,
    },
    { status: 200 }
  )
}
