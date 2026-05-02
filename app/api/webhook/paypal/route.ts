/**
 * PayPal Webhook Listener — POST /api/webhook/paypal
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  SECURITY: Real PayPal Signature Verification                      │
 * │                                                                     │
 * │  1. Extract PayPal security headers (transmission-id, cert-url,    │
 * │     auth-algo, transmission-sig, transmission-time)                 │
 * │  2. Parse the event body to find the transaction → merchant_id     │
 * │  3. Resolve the webhook_id:                                         │
 * │     a. Per-account: merchant_accounts.paypal_webhook_id             │
 * │     b. Fallback: PAYPAL_WEBHOOK_ID env var                          │
 * │  4. Call PayPal POST /v1/notifications/verify-webhook-signature     │
 * │  5. If verification fails → 401 + log the failed attempt           │
 * │  6. If verification succeeds → process the event atomically        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Supported events:
 *  • PAYMENT.CAPTURE.COMPLETED  → mark transaction COMPLETED
 *  • PAYMENT.CAPTURE.DENIED    → mark transaction FAILED
 *  • PAYMENT.CAPTURE.REFUNDED  → mark transaction REFUNDED
 *  • CUSTOMER.DISPUTE.CREATED  → mark transaction DISPUTED
 */
import { NextRequest, NextResponse } from "next/server"
import { getSql, getPool } from "@/lib/neon"
import { getUserAgent } from "@/lib/paypal"
import {
  resolveStoreWebhookEvent,
  type StoreWebhookPayload,
} from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  persistWebhookEventSafe,
  deliverWebhookEvent,
} from "@/lib/webhook-delivery"

// ─── Constants ────────────────────────────────────────────────────────────────

const GATEWAY_FEE_PERCENT = 0.02

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com"

/** Cert URL must point to a real PayPal domain — blocks spoofed certs */
const ALLOWED_CERT_DOMAINS = [
  "api.paypal.com",
  "api.sandbox.paypal.com",
  "www.paypal.com",
  "www.sandbox.paypal.com",
]

function isStrictProduction(): boolean {
  return process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayPalWebhookEvent {
  id: string
  event_type: string
  resource: {
    id: string               // capture ID, authorization ID, or dispute ID
    status: string
    amount?: {
      value: string
      currency_code: string
    }
    custom_id?: string       // our transaction ID
    parent_payment?: string  // order ID (present in authorization events)
    disputed_transactions?: {
      seller_transaction_id?: string
    }[]
    supplementary_data?: {
      related_ids?: {
        order_id?: string
      }
    }
  }
}

interface TransactionRow {
  id: string
  tenant_id: string
  store_id: string
  merchant_id: string
  original_amount: string
  status: string
  paypal_order_id: string | null
}

interface MerchantWebhookRow {
  paypal_webhook_id: string | null
  client_id: string
  client_secret: string
}

interface StoreRow {
  webhook_url: string | null
  webhook_secret: string | null
}

interface QueryResult<Row> {
  rows: Row[]
}

interface DbClient {
  query<Row = unknown>(text: string, params?: unknown[]): Promise<QueryResult<Row>>
  release(): void
}

// ─── PayPal OAuth (for verify-webhook-signature API) ──────────────────────────

/**
 * Gets a platform-level OAuth token for the verify-webhook-signature call.
 * Uses PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET env vars (platform credentials).
 * Falls back to the merchant account's credentials if platform-level aren't set.
 */
async function getPlatformAccessToken(
  clientId?: string,
  clientSecret?: string
): Promise<string> {
  const cId     = clientId     ?? process.env.PAYPAL_CLIENT_ID
  const cSecret = clientSecret ?? process.env.PAYPAL_CLIENT_SECRET

  if (!cId || !cSecret) {
    throw new Error(
      "Cannot verify webhook: no PayPal credentials available. " +
      "Set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET, or configure per-account credentials."
    )
  }

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${cId}:${cSecret}`).toString("base64")}`,
      "User-Agent": getUserAgent(cId),
    },
    body: "grant_type=client_credentials",
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal OAuth error [${res.status}]: ${text}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

// ─── Signature Verification ───────────────────────────────────────────────────

interface SignatureHeaders {
  transmissionId:   string
  transmissionTime: string
  certUrl:          string
  transmissionSig:  string
  authAlgo:         string
}

/**
 * Extracts and validates required PayPal security headers.
 * Returns null if any header is missing.
 */
function extractSignatureHeaders(req: NextRequest): SignatureHeaders | null {
  const transmissionId   = req.headers.get("paypal-transmission-id")
  const transmissionTime = req.headers.get("paypal-transmission-time")
  const certUrl          = req.headers.get("paypal-cert-url")
  const transmissionSig  = req.headers.get("paypal-transmission-sig")
  const authAlgo         = req.headers.get("paypal-auth-algo")

  if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig || !authAlgo) {
    return null
  }

  // Validate cert URL domain — prevents spoofed certificate attacks
  try {
    const certDomain = new URL(certUrl).hostname
    if (!ALLOWED_CERT_DOMAINS.some((d) => certDomain.endsWith(d))) {
      console.error(`[PayPal Webhook] Suspicious cert URL domain: ${certDomain}`)
      return null
    }
  } catch {
    console.error(`[PayPal Webhook] Invalid cert URL: ${certUrl}`)
    return null
  }

  return { transmissionId, transmissionTime, certUrl, transmissionSig, authAlgo }
}

/**
 * Calls PayPal's POST /v1/notifications/verify-webhook-signature endpoint.
 *
 * This is the official way to verify that a webhook was genuinely sent by
 * PayPal and has not been tampered with.
 *
 * @param headers  — extracted PayPal security headers
 * @param body     — raw request body (as string, not parsed)
 * @param webhookId — the Webhook ID configured in PayPal's developer portal
 * @param accessToken — platform-level OAuth token
 * @returns "SUCCESS" | "FAILURE"
 */
async function callPayPalVerify(
  headers: SignatureHeaders,
  body: string,
  webhookId: string,
  accessToken: string
): Promise<"SUCCESS" | "FAILURE"> {
  const verifyPayload = {
    auth_algo:         headers.authAlgo,
    cert_url:          headers.certUrl,
    transmission_id:   headers.transmissionId,
    transmission_sig:  headers.transmissionSig,
    transmission_time: headers.transmissionTime,
    webhook_id:        webhookId,
    webhook_event:     JSON.parse(body),
  }

  const res = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "User-Agent":    getUserAgent(webhookId),
    },
    body: JSON.stringify(verifyPayload),
    signal: AbortSignal.timeout(10000), // 10s timeout
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[PayPal Webhook] Verify API error [${res.status}]: ${text}`)
    return "FAILURE"
  }

  const result = await res.json() as { verification_status: string }
  return result.verification_status === "SUCCESS" ? "SUCCESS" : "FAILURE"
}

/**
 * Full verification flow:
 *  1. Extract headers
 *  2. Resolve webhook ID (per-account → global fallback)
 *  3. Get OAuth token
 *  4. Call PayPal verify API
 */
async function verifyWebhookSignature(
  req: NextRequest,
  body: string,
  webhookId?: string | null,
  merchantCredentials?: { clientId: string; clientSecret: string }
): Promise<{ verified: boolean; reason?: string }> {
  const effectiveWebhookId = webhookId ?? process.env.PAYPAL_WEBHOOK_ID
  if (!effectiveWebhookId) {
    if (isStrictProduction()) {
      console.error(
        "[PayPal Webhook] No webhook ID configured in production. " +
        "Rejecting webhook until paypal_webhook_id or PAYPAL_WEBHOOK_ID is set."
      )
      return { verified: false, reason: "missing_webhook_id" }
    }

    console.warn(
      "[PayPal Webhook] No webhook ID configured (account or env). " +
      "Skipping verification outside production."
    )
    return { verified: true, reason: "dev_mode_skip" }
  }

  // Extract and validate security headers
  const headers = extractSignatureHeaders(req)
  if (!headers) {
    return { verified: false, reason: "missing_or_invalid_headers" }
  }

  try {
    // Get OAuth token — prefer platform credentials, fall back to merchant
    const accessToken = await getPlatformAccessToken(
      merchantCredentials?.clientId,
      merchantCredentials?.clientSecret
    )

    const result = await callPayPalVerify(headers, body, effectiveWebhookId, accessToken)

    if (result === "SUCCESS") {
      return { verified: true }
    }

    return { verified: false, reason: "paypal_verification_failed" }
  } catch (err) {
    console.error("[PayPal Webhook] Verification error:", err)
    return { verified: false, reason: `verification_error: ${(err as Error).message}` }
  }
}

// ─── Transaction Reference Resolver ───────────────────────────────────────────

/**
 * Extracts our internal transaction ID from a webhook event.
 * Supports PAYMENT.CAPTURE.* (custom_id, order_id) and
 * CUSTOMER.DISPUTE.* (seller_transaction_id).
 */
function resolveTransactionRef(event: PayPalWebhookEvent): {
  transactionId?: string
  paypalOrderId?: string
} {
  // PAYMENT.CAPTURE.* events
  const transactionId = event.resource.custom_id
  const paypalOrderId =
    event.resource.supplementary_data?.related_ids?.order_id ??
    event.resource.parent_payment

  // CUSTOMER.DISPUTE.* events reference the PayPal transaction ID
  // We'll need to match via paypal_capture_id or paypal_order_id
  if (!transactionId && !paypalOrderId) {
    const disputeTxId = event.resource.disputed_transactions?.[0]?.seller_transaction_id
    if (disputeTxId) {
      return { paypalOrderId: disputeTxId }
    }
  }

  return { transactionId, paypalOrderId }
}

// ─── Event-Specific Handlers ──────────────────────────────────────────────

type EventResult = {
  status: string
  transaction_id?: string
  [key: string]: unknown
}

// ─── PAYMENT.AUTHORIZATION.CREATED ─────────────────────────────────────

async function handleAuthorizationCreated(
  client: DbClient,
  transaction: TransactionRow,
  event: PayPalWebhookEvent
): Promise<EventResult> {
  if (transaction.status !== "AUTHORIZED" && transaction.status !== "PENDING") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }

  const authorizationId = event.resource.id
  const originalAmount = parseFloat(transaction.original_amount)
  const gatewayFee = originalAmount * GATEWAY_FEE_PERCENT

  // Save the authorization_id so the store can use it for manual capture
  await client.query(
    `UPDATE transactions
     SET authorization_id = $1,
         status = 'AUTHORIZED',
         authorized_at = NOW(),
         authorization_expires_at = NOW() + INTERVAL '7 days',
         checkout_expires_at = NULL,
         gateway_fee = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [authorizationId, gatewayFee.toFixed(2), transaction.id]
  )

  await client.query("COMMIT")

  return {
    status: "processed",
    transaction_id: transaction.id,
    authorization_id: authorizationId,
    new_status: "AUTHORIZED",
    gateway_fee: gatewayFee.toFixed(2),
  }
}

async function handleCaptureCompleted(
  client: DbClient,
  transaction: TransactionRow,
  event: PayPalWebhookEvent
): Promise<EventResult> {
  if (transaction.status === "COMPLETED") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }

  const captureId      = event.resource.id
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
    [captureId, gatewayFee.toFixed(2), transaction.id]
  )

  await client.query(
    `UPDATE merchant_accounts
     SET current_volume = current_volume + $1,
         updated_at = NOW()
     WHERE id = $2`,
    [originalAmount, transaction.merchant_id]
  )

  await client.query("COMMIT")

  return {
    status: "processed",
    transaction_id: transaction.id,
    capture_id: captureId,
    gateway_fee: gatewayFee.toFixed(2),
  }
}

async function handleCaptureDenied(
  client: DbClient,
  transaction: TransactionRow
): Promise<EventResult> {
  if (transaction.status === "FAILED") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }

  await client.query(
    `UPDATE transactions
     SET status = 'FAILED',
         failed_at = NOW(),
         checkout_expires_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [transaction.id]
  )

  // Reverse the optimistic volume increment from checkout
  await client.query(
    `UPDATE merchant_accounts
     SET current_volume = GREATEST(0, current_volume - $1),
         updated_at = NOW()
     WHERE id = $2`,
    [parseFloat(transaction.original_amount), transaction.merchant_id]
  )

  await client.query("COMMIT")

  return { status: "processed", transaction_id: transaction.id, new_status: "FAILED" }
}

async function handleCaptureRefunded(
  client: DbClient,
  transaction: TransactionRow
): Promise<EventResult> {
  if (transaction.status === "REFUNDED") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }

  await client.query(
    `UPDATE transactions
     SET status = 'REFUNDED',
         refunded_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [transaction.id]
  )

  // Reverse volume for refunded transactions
  await client.query(
    `UPDATE merchant_accounts
     SET current_volume = GREATEST(0, current_volume - $1),
         updated_at = NOW()
     WHERE id = $2`,
    [parseFloat(transaction.original_amount), transaction.merchant_id]
  )

  await client.query("COMMIT")

  return { status: "processed", transaction_id: transaction.id, new_status: "REFUNDED" }
}

async function handleDisputeCreated(
  client: DbClient,
  transaction: TransactionRow
): Promise<EventResult> {
  if (transaction.status === "DISPUTED") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }

  await client.query(
    `UPDATE transactions
     SET status = 'DISPUTED',
         disputed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [transaction.id]
  )

  await client.query("COMMIT")

  return { status: "processed", transaction_id: transaction.id, new_status: "DISPUTED" }
}

// ─── Supported Event Types ────────────────────────────────────────────────────

const SUPPORTED_EVENTS: Record<
  string,
  (client: DbClient, tx: TransactionRow, event: PayPalWebhookEvent) => Promise<EventResult>
> = {
  "PAYMENT.AUTHORIZATION.CREATED": handleAuthorizationCreated,
  "PAYMENT.CAPTURE.COMPLETED":     handleCaptureCompleted,
  "PAYMENT.CAPTURE.DENIED":        handleCaptureDenied,
  "PAYMENT.CAPTURE.REFUNDED":      handleCaptureRefunded,
  "CUSTOMER.DISPUTE.CREATED":      handleDisputeCreated,
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const bodyText = await req.text()

  // ── Parse webhook event ──────────────────────────────────────────────────
  let event: PayPalWebhookEvent
  try {
    event = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // ── Check if this is a supported event type ──────────────────────────────
  const handler = SUPPORTED_EVENTS[event.event_type]
  if (!handler) {
    // Acknowledge but ignore unsupported event types
    return NextResponse.json({ status: "ignored", event_type: event.event_type })
  }

  // ── Resolve transaction reference ────────────────────────────────────────
  const { transactionId, paypalOrderId } = resolveTransactionRef(event)

  if (!transactionId && !paypalOrderId) {
    console.error("[PayPal Webhook] No transaction reference in event:", event.id)
    return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 })
  }

  // ── Look up the transaction → merchant account → webhook ID ──────────────
  // We need the merchant_id to resolve the per-account webhook_id for
  // signature verification. This query is read-only (no lock) since we
  // haven't started the mutation transaction yet.
  const sql = getSql()

  let txLookupResult
  if (transactionId) {
    txLookupResult = await sql`
      SELECT t.merchant_id, ma.paypal_webhook_id, ma.client_id, ma.client_secret
      FROM transactions t
      JOIN merchant_accounts ma ON t.merchant_id = ma.id
      WHERE t.id = ${transactionId}
      LIMIT 1
    `
  } else {
    txLookupResult = await sql`
      SELECT t.merchant_id, ma.paypal_webhook_id, ma.client_id, ma.client_secret
      FROM transactions t
      JOIN merchant_accounts ma ON t.merchant_id = ma.id
      WHERE t.paypal_order_id = ${paypalOrderId}
      LIMIT 1
    `
  }

  const lookupRow = txLookupResult[0] as MerchantWebhookRow | undefined

  // ── Verify webhook signature (multi-tenant) ──────────────────────────────
  // Priority: per-account webhook_id → global PAYPAL_WEBHOOK_ID → dev skip
  const { verified, reason } = await verifyWebhookSignature(
    req,
    bodyText,
    lookupRow?.paypal_webhook_id,
    lookupRow
      ? { clientId: lookupRow.client_id, clientSecret: lookupRow.client_secret }
      : undefined
  )

  if (!verified) {
    console.error(
      `[PayPal Webhook] Signature verification FAILED for event ${event.id}: ${reason}`,
      { event_type: event.event_type, transactionId, paypalOrderId }
    )
    return NextResponse.json(
      { error: "Invalid webhook signature", reason },
      { status: 401 }
    )
  }

  // ── Process the event atomically ─────────────────────────────────────────
  const pool   = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Lock the transaction row
    let transactionQuery: string
    let transactionParams: string[]

    if (transactionId) {
      transactionQuery = `
        SELECT id, tenant_id, store_id, merchant_id, original_amount, status, paypal_order_id
        FROM transactions
        WHERE id = $1
        FOR UPDATE
      `
      transactionParams = [transactionId]
    } else {
      transactionQuery = `
        SELECT id, tenant_id, store_id, merchant_id, original_amount, status, paypal_order_id
        FROM transactions
        WHERE paypal_order_id = $1
        FOR UPDATE
      `
      transactionParams = [paypalOrderId!]
    }

    const txResult = await client.query<TransactionRow>(transactionQuery, transactionParams)
    const transaction = txResult.rows[0]

    if (!transaction) {
      await client.query("ROLLBACK")
      console.error("[PayPal Webhook] Transaction not found:", transactionId || paypalOrderId)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    // Dispatch to the appropriate event handler
    const result = await handler(client, transaction, event)

    // ── Persist store webhook event (awaited, stateless HTTP driver) ────────
    // Then fire-and-forget delivery — event is durable, cron retries if needed
    if (result.status === "processed") {
      const storeResult = await sql`
        SELECT webhook_url, webhook_secret FROM stores WHERE id = ${transaction.store_id}
      ` as unknown as StoreRow[]
      const store = storeResult[0]
      const storeEvent = resolveStoreWebhookEvent(event.event_type)

      if (store?.webhook_url && storeEvent) {
        const canonicalPayload: Omit<StoreWebhookPayload, "event_id"> = {
          event: storeEvent,
          transaction_id: transaction.id,
          paypal_order_id: transaction.paypal_order_id,
          amount: parseFloat(transaction.original_amount).toFixed(2),
          status: String(result.new_status ?? "COMPLETED"),
          timestamp: new Date().toISOString(),
          paypal_event_type: event.event_type,
          ...(result.capture_id ? { paypal_capture_id: String(result.capture_id) } : {}),
          ...(result.authorization_id ? { authorization_id: String(result.authorization_id) } : {}),
          ...(result.gateway_fee
            ? {
                gateway_fee: String(result.gateway_fee),
                net_amount: (
                  parseFloat(transaction.original_amount) -
                  parseFloat(String(result.gateway_fee))
                ).toFixed(2),
              }
            : {}),
        }

        const reference =
          result.capture_id
            ? String(result.capture_id)
            : result.authorization_id
            ? String(result.authorization_id)
            : event.resource.id

        try {
          const { eventId, isNew, shouldDeliver } = await persistWebhookEventSafe({
            transactionId: transaction.id,
            tenantId: transaction.tenant_id,
            storeId: transaction.store_id,
            accountId: transaction.merchant_id,
            targetUrl: store.webhook_url,
            businessKey: buildWebhookBusinessKey(storeEvent, transaction.id, reference),
            event: storeEvent,
            payload: canonicalPayload,
            source: event.event_type,
            triggerOrigin: "paypal_webhook",
          })
          console.info(`[PayPal Webhook] Store webhook event persisted: event=${storeEvent} tx=${transaction.id} eventId=${eventId} isNew=${isNew} shouldDeliver=${shouldDeliver}`)
          // Fire-and-forget delivery — event is persisted, cron will retry if this fails
          if (shouldDeliver) {
            deliverWebhookEvent(eventId, "paypal_webhook").catch((e) =>
              console.error(`[PayPal Webhook] Store webhook delivery failed (event persisted, cron will retry): tx=${transaction.id} eventId=${eventId}`, e)
            )
          }
        } catch (persistErr) {
          console.error(`[PayPal Webhook] Store webhook persistence FAILED: event=${storeEvent} tx=${transaction.id}`, persistErr)
        }
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[PayPal Webhook] Error processing event:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  } finally {
    client.release()
  }
}

// ─── Store Webhook Notification ───────────────────────────────────────────────

// ─── GET Handler (endpoint health check) ──────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "PayPal webhook endpoint is active",
    supported_events: Object.keys(SUPPORTED_EVENTS),
  })
}
