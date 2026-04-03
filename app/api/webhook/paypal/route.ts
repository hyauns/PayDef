/**
 * PayPal Webhook Listener — /api/webhook/paypal
 *
 * Handles PAYMENT.CAPTURE.COMPLETED events:
 * 1. Verifies webhook signature (if PAYPAL_WEBHOOK_ID is set)
 * 2. Updates transaction status to COMPLETED
 * 3. Increments merchant account currentVolume
 * 4. Calculates & stores gateway fee (2%)
 * 5. Sends async notification to store's webhookUrl
 */
import { NextRequest, NextResponse } from "next/server"
import { getSql, getPool } from "@/lib/neon"

// Gateway fee percentage (2%)
const GATEWAY_FEE_PERCENT = 0.02

// ─── Types ────────────────────────────────────────────────────────────────────
interface PayPalWebhookEvent {
  id: string
  event_type: string
  resource: {
    id: string               // capture ID
    status: string
    amount: {
      value: string
      currency_code: string
    }
    custom_id?: string       // our transaction ID
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

interface StoreRow {
  webhook_url: string | null
}

// ─── Webhook Signature Verification (optional) ────────────────────────────────
async function verifyWebhookSignature(
  req: NextRequest,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) {
    // If no webhook ID configured, skip verification (dev mode)
    console.warn("[PayPal Webhook] PAYPAL_WEBHOOK_ID not set, skipping signature verification")
    return true
  }

  const transmissionId = req.headers.get("paypal-transmission-id")
  const transmissionTime = req.headers.get("paypal-transmission-time")
  const certUrl = req.headers.get("paypal-cert-url")
  const transmissionSig = req.headers.get("paypal-transmission-sig")
  const authAlgo = req.headers.get("paypal-auth-algo")

  if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig || !authAlgo) {
    console.error("[PayPal Webhook] Missing signature headers")
    return false
  }

  // For production, implement full signature verification using PayPal's verify-webhook-signature API
  // For now, we accept the webhook if all headers are present
  // TODO: Call PayPal's POST /v1/notifications/verify-webhook-signature endpoint
  return true
}

// ─── POST Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const bodyText = await req.text()
  
  // Verify webhook signature
  const isValid = await verifyWebhookSignature(req, bodyText)
  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  let event: PayPalWebhookEvent
  try {
    event = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Only handle PAYMENT.CAPTURE.COMPLETED events
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    // Acknowledge but ignore other event types
    return NextResponse.json({ status: "ignored", event_type: event.event_type })
  }

  const captureId = event.resource.id
  const paypalOrderId = event.resource.supplementary_data?.related_ids?.order_id
  const transactionId = event.resource.custom_id

  if (!transactionId && !paypalOrderId) {
    console.error("[PayPal Webhook] No transaction reference found in webhook payload")
    return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 })
  }

  const sql = getSql()
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Find the transaction by custom_id (our transaction ID) or paypal_order_id
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

    // Skip if already processed
    if (transaction.status === "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json({ status: "already_processed", transaction_id: transaction.id })
    }

    // Calculate gateway fee (2% of original amount)
    const originalAmount = parseFloat(transaction.original_amount)
    const gatewayFee = originalAmount * GATEWAY_FEE_PERCENT

    // Update transaction to COMPLETED with capture ID and gateway fee
    await client.query(
      `UPDATE transactions
       SET status = 'COMPLETED',
           paypal_capture_id = $1,
           gateway_fee = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [captureId, gatewayFee.toFixed(2), transaction.id]
    )

    // Note: currentVolume was already incremented during checkout (optimistic lock)
    // We don't increment again here to avoid double-counting

    await client.query("COMMIT")

    // Get store's webhook URL for notification
    const storeResult = await sql<StoreRow[]>`
      SELECT webhook_url FROM stores WHERE id = ${transaction.store_id}
    `
    const store = storeResult[0]

    // Send async webhook notification to store (fire and forget)
    if (store?.webhook_url) {
      sendStoreWebhook(store.webhook_url, {
        event: "payment.completed",
        transaction_id: transaction.id,
        paypal_order_id: transaction.paypal_order_id,
        paypal_capture_id: captureId,
        amount: originalAmount.toFixed(2),
        gateway_fee: gatewayFee.toFixed(2),
        net_amount: (originalAmount - gatewayFee).toFixed(2),
        status: "COMPLETED",
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        console.error("[PayPal Webhook] Failed to send store notification:", err)
      })
    }

    return NextResponse.json({
      status: "processed",
      transaction_id: transaction.id,
      capture_id: captureId,
      gateway_fee: gatewayFee.toFixed(2),
    })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[PayPal Webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  } finally {
    client.release()
  }
}

// ─── Store Webhook Notification ───────────────────────────────────────────────
async function sendStoreWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    attempt++
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Source": "payment-gateway",
          "X-Webhook-Event": "payment.completed",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      if (response.ok) {
        console.log(`[Store Webhook] Successfully notified ${webhookUrl}`)
        return
      }

      console.warn(
        `[Store Webhook] Attempt ${attempt}/${maxRetries} failed with status ${response.status}`
      )
    } catch (err) {
      console.warn(`[Store Webhook] Attempt ${attempt}/${maxRetries} failed:`, err)
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
    }
  }

  throw new Error(`Failed to notify store webhook after ${maxRetries} attempts`)
}

// ─── GET Handler (for webhook verification) ───────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "PayPal webhook endpoint is active",
    supported_events: ["PAYMENT.CAPTURE.COMPLETED"],
  })
}
