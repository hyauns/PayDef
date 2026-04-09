/**
 * POST /api/merchant/transactions/[id]/capture
 *
 * Dashboard-side capture trigger for AUTHORIZED transactions.
 * Auth: Session-based (merchant logged into dashboard).
 *
 * This wraps the same PayPal captureAuthorization logic as
 * POST /api/gateway/capture but uses session auth instead of API key,
 * allowing dashboard admins to manually capture funds.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getPool } from "@/lib/neon"
import { decrypt } from "@/lib/encryption"
import { captureAuthorization } from "@/lib/paypal"
import { getSql } from "@/lib/neon"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import {
  buildWebhookBusinessKey,
  enqueueStoreWebhookEvent,
} from "@/lib/webhook-delivery"
import { sendTransactionAlert } from "@/lib/telegram"

const GATEWAY_FEE_PERCENT = 0.02

interface TransactionRow {
  id:               string
  tenant_id:        string
  store_id:         string
  merchant_id:      string
  original_amount:  string
  status:           string
  authorization_id: string | null
  paypal_order_id:  string | null
  webhook_url:      string | null
}

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: transactionId } = await context.params
  const tenantId = session.user.tenantId
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"

  let body: { authorization_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const pool   = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const txResult = await client.query<TransactionRow>(
      `SELECT
         t.id, t.tenant_id, t.store_id, t.merchant_id,
         t.original_amount, t.status, t.authorization_id,
         t.paypal_order_id, s.webhook_url
       FROM   transactions t
       LEFT JOIN stores s ON s.id = t.store_id
       WHERE  t.id = $1
         ${isSuperAdmin ? "" : "AND t.tenant_id = $2"}
       LIMIT  1
       FOR UPDATE OF t`,
      isSuperAdmin ? [transactionId] : [transactionId, tenantId]
    )

    const tx = txResult.rows[0]
    if (!tx) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
    }

    if (tx.status === "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Already captured." }, { status: 409 })
    }

    if (tx.status !== "AUTHORIZED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: `Cannot capture transaction in '${tx.status}' status.` },
        { status: 400 }
      )
    }

    const authId = body.authorization_id ?? tx.authorization_id
    if (!authId) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "No authorization_id available." }, { status: 422 })
    }

    // Fetch merchant credentials
    const merchantResult = await client.query<MerchantRow>(
      `SELECT client_id, client_secret, proxy_url FROM merchant_accounts WHERE id = $1`,
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

    let captureResult
    try {
      captureResult = await captureAuthorization({
        clientId:        merchant.client_id,
        clientSecret:    decryptedSecret,
        authorizationId: authId,
        proxyUrl,
      })
    } catch (paypalError) {
      await client.query("ROLLBACK")
      console.error("[merchant-capture] PayPal capture failed:", paypalError)
      return NextResponse.json(
        { error: "PayPal capture failed. Please try again." },
        { status: 502 }
      )
    }

    if (captureResult.status !== "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: `Capture not completed — PayPal status: ${captureResult.status}` },
        { status: 422 }
      )
    }

    await client.query(
      `UPDATE transactions
       SET    status = 'COMPLETED'::transaction_status,
              paypal_capture_id = $1,
              gateway_fee = $2,
              completed_at = NOW(),
              checkout_expires_at = NULL,
              updated_at = NOW()
       WHERE  id = $3`,
      [captureResult.id, gatewayFee.toFixed(2), transactionId]
    )

    await client.query(
      `UPDATE merchant_accounts
       SET    current_volume = current_volume + $1, updated_at = NOW()
       WHERE  id = $2`,
      [originalAmount, tx.merchant_id]
    )

    await client.query("COMMIT")

    // Webhook + Telegram (fire-and-forget)
    if (tx.webhook_url) {
      const payload: Omit<StoreWebhookPayload, "event_id"> = {
        event:             "payment.capture.completed",
        transaction_id:    tx.id,
        paypal_order_id:   tx.paypal_order_id,
        paypal_capture_id: captureResult.id,
        authorization_id:  authId,
        amount:            originalAmount.toFixed(2),
        gateway_fee:       gatewayFee.toFixed(2),
        net_amount:        (originalAmount - gatewayFee).toFixed(2),
        status:            "COMPLETED",
        timestamp:         new Date().toISOString(),
      }
      enqueueStoreWebhookEvent({
        transactionId,
        tenantId:   tx.tenant_id,
        storeId:    tx.store_id,
        accountId:  tx.merchant_id,
        targetUrl:  tx.webhook_url,
        businessKey: buildWebhookBusinessKey("payment.capture.completed", transactionId, captureResult.id),
        event:      "payment.capture.completed",
        payload,
        source:     "dashboard_capture",
        triggerOrigin: "manual_dashboard",
      }).catch((e) => console.error("[merchant-capture] webhook failed:", e))
    }

    const sql = getSql()
    ;(async () => {
      try {
        const sn = await sql`SELECT name FROM stores WHERE id = ${tx.store_id} LIMIT 1` as unknown as { name: string }[]
        const an = await sql`SELECT name FROM merchant_accounts WHERE id = ${tx.merchant_id} LIMIT 1` as unknown as { name: string }[]
        sendTransactionAlert(tx.tenant_id, originalAmount, sn[0]?.name ?? "Unknown", an[0]?.name ?? "Unknown")
      } catch { /* silent */ }
    })()

    return NextResponse.json({
      status:            "COMPLETED",
      transaction_id:    transactionId,
      paypal_capture_id: captureResult.id,
      amount:            originalAmount.toFixed(2),
      gateway_fee:       gatewayFee.toFixed(2),
      net_amount:        (originalAmount - gatewayFee).toFixed(2),
    })

  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[merchant-capture] Unexpected error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
