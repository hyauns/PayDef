/**
 * POST /api/gateway/tracking — send a shipment tracking number to PayPal.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  TRACKING FLOW                                                      │
 * │                                                                     │
 * │  1. Store admin adds a tracking number to a shipped order            │
 * │  2. Store calls this endpoint with the transaction id + number       │
 * │  3. Gateway calls PayPal's add-tracking API for that capture         │
 * │                                                                     │
 * │  PayPal attaches tracking to a CAPTURE, so the payment must already  │
 * │  be captured: an AUTHORIZED (funds-on-hold) transaction is refused   │
 * │  with 409 so the caller knows to capture first and retry.            │
 * │                                                                     │
 * │  SECURITY: X-API-Key and X-Store-ID headers are required.           │
 * │  Tenant isolation is enforced throughout.                           │
 * │  Idempotent: PayPal's "tracker already exists" answer returns 200.  │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { addOrderTracking, PayPalApiError } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"

interface TrackingBody {
  transaction_id?:   string
  authorization_id?: string
  tracking_number?:  string
  carrier?:          string
  notify_payer?:     boolean
}

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

export async function POST(req: NextRequest) {
  const LOG = "[tracking]"

  // ── Step 1. Auth + rate limit ───────────────────────────────────────────────
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

  const { allowed, headers: rlHeaders } = await checkRateLimit(store.id)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: rlHeaders }
    )
  }

  // ── Step 2. Parse body ──────────────────────────────────────────────────────
  let body: TrackingBody
  try {
    body = (await req.json()) as TrackingBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const lookupId       = (body.transaction_id || body.authorization_id || "").trim()
  const trackingNumber = (body.tracking_number || "").trim()

  if (!lookupId) {
    return NextResponse.json({ error: "transaction_id or authorization_id is required." }, { status: 400 })
  }
  if (!trackingNumber) {
    return NextResponse.json({ error: "tracking_number is required." }, { status: 400 })
  }

  const sql      = getSql()
  const tenantId = store.tenantId

  // ── Step 3. Look up the transaction (tenant + store scoped) ─────────────────
  let transaction: any | null = null
  try {
    const rows = (await sql`
      SELECT id, status, paypal_order_id, paypal_capture_id, merchant_id
      FROM   transactions
      WHERE  (id::text = ${lookupId}
              OR authorization_id = ${lookupId}
              OR latest_authorization_id = ${lookupId})
        AND  store_id = ${store.id}
        AND  tenant_id = ${tenantId}
      LIMIT  1
    `) as unknown as any[]
    transaction = rows[0] ?? null
  } catch (dbErr) {
    console.error(`${LOG} Transaction lookup DB error: id=${lookupId} store=${store.id}`, dbErr)
    return NextResponse.json({ error: "Database error during transaction lookup." }, { status: 500 })
  }

  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found for this store." }, { status: 404 })
  }

  // PayPal hangs tracking off the capture, so there is nothing to attach to
  // until the money has actually been taken. 409 tells the caller to capture
  // first and try again, rather than looking like a broken request.
  if (!transaction.paypal_capture_id) {
    console.warn(`${LOG} No capture yet: tx=${transaction.id} status=${transaction.status}`)
    return NextResponse.json(
      {
        error: `Payment is '${transaction.status}' with no capture — PayPal accepts tracking only after capture. Capture the payment first.`,
        needs_capture: true,
      },
      { status: 409, headers: rlHeaders }
    )
  }
  if (!transaction.paypal_order_id) {
    return NextResponse.json({ error: "Transaction has no PayPal order id." }, { status: 400 })
  }

  // ── Step 4. Merchant credentials ────────────────────────────────────────────
  let merchant: MerchantRow | null = null
  try {
    const rows = (await sql`
      SELECT client_id, client_secret, proxy_url
      FROM   merchant_accounts
      WHERE  id = ${transaction.merchant_id}
      LIMIT  1
    `) as unknown as MerchantRow[]
    merchant = rows[0] ?? null
  } catch (dbErr) {
    console.error(`${LOG} Merchant lookup DB error: merchant=${transaction.merchant_id}`, dbErr)
    return NextResponse.json({ error: "Database error during merchant lookup." }, { status: 500 })
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant account not found." }, { status: 500 })
  }

  // ── Step 5. Call PayPal ─────────────────────────────────────────────────────
  try {
    await addOrderTracking({
      clientId:       merchant.client_id,
      clientSecret:   decrypt(merchant.client_secret),
      paypalOrderId:  transaction.paypal_order_id,
      captureId:      transaction.paypal_capture_id,
      trackingNumber,
      carrier:        body.carrier,
      notifyPayer:    body.notify_payer === true,
      proxyUrl:       merchant.proxy_url ?? undefined,
    })
  } catch (error) {
    const raw = error instanceof PayPalApiError ? error.body : String(error)

    // Sending the same number twice is a no-op, not a failure — the caller
    // (a shop admin saving an order again) should see success.
    if (/ALREADY|DUPLICATE/i.test(raw ?? "")) {
      console.info(`${LOG} Tracking already recorded: tx=${transaction.id} number=${trackingNumber}`)
      return NextResponse.json(
        { ok: true, transaction_id: transaction.id, tracking_number: trackingNumber, already_added: true },
        { headers: rlHeaders }
      )
    }

    console.error(`${LOG} PayPal error for tx ${transaction.id}: ${raw}`)
    return NextResponse.json(
      { error: "Payment provider error while adding tracking." },
      { status: 502, headers: rlHeaders }
    )
  }

  console.info(`${LOG} OK: tx=${transaction.id} number=${trackingNumber}`)
  return NextResponse.json(
    { ok: true, transaction_id: transaction.id, tracking_number: trackingNumber },
    { headers: rlHeaders }
  )
}
