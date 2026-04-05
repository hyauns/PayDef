/**
 * POST /api/merchant/transactions/capture
 *
 * Allows merchants to manually capture an AUTHORIZED payment from the
 * Transaction Log dashboard. This is the merchant-facing equivalent of
 * POST /api/gateway/capture, but authenticated via session (not API key).
 *
 * Body: { transactionId: string }
 *
 * Security:
 *  • Session-based auth (merchant must be logged in)
 *  • Tenant isolation — only transactions belonging to the merchant's tenant
 *  • Transaction must be in AUTHORIZED status and less than 3 days old
 *  • All capture actions are logged to the audit log
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { captureAuthorization } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { sendTransactionAlert } from "@/lib/telegram"

const GATEWAY_FEE_PERCENT = 0.02
const MAX_CAPTURE_AGE_HOURS = 72 // 3 days — PayPal's typical auth window

interface TransactionRow {
  id:               string
  tenant_id:        string
  store_id:         string
  merchant_id:      string
  original_amount:  string
  status:           string
  authorization_id: string | null
  paypal_order_id:  string | null
  created_at:       string
}

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

interface NameRow {
  name: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  let body: { transactionId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { transactionId } = body
  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "transactionId is required" }, { status: 400 })
  }

  const sql = getSql()
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // ── Look up and lock the transaction ─────────────────────────────────────
    const txResult = await client.query<TransactionRow>(
      `SELECT id, tenant_id, store_id, merchant_id,
              original_amount, status, authorization_id,
              paypal_order_id, created_at
       FROM   transactions
       WHERE  id = $1
         AND  tenant_id = $2
       FOR UPDATE`,
      [transactionId, tenantId]
    )

    const transaction = txResult.rows[0]

    if (!transaction) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    if (transaction.status === "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Already captured" }, { status: 409 })
    }

    if (transaction.status !== "AUTHORIZED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: `Cannot capture transaction in '${transaction.status}' status` },
        { status: 400 }
      )
    }

    if (!transaction.authorization_id) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "No authorization ID found on this transaction" },
        { status: 400 }
      )
    }

    // ── Check age (3-day window) ─────────────────────────────────────────────
    const createdAt = new Date(transaction.created_at).getTime()
    const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60)
    if (ageHours > MAX_CAPTURE_AGE_HOURS) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "Authorization has expired (older than 3 days). The funds have been released." },
        { status: 410 }
      )
    }

    // ── Fetch merchant credentials ───────────────────────────────────────────
    const merchantResult = await client.query<MerchantRow>(
      `SELECT client_id, client_secret, proxy_url
       FROM   merchant_accounts
       WHERE  id = $1`,
      [transaction.merchant_id]
    )

    const merchant = merchantResult.rows[0]
    if (!merchant) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Merchant account not found" }, { status: 500 })
    }

    // ── Call PayPal to capture ────────────────────────────────────────────────
    const decryptedSecret = decrypt(merchant.client_secret)
    let captureResult
    try {
      captureResult = await captureAuthorization({
        clientId:        merchant.client_id,
        clientSecret:    decryptedSecret,
        authorizationId: transaction.authorization_id,
        proxyUrl:        merchant.proxy_url ?? undefined,
      })
    } catch (err) {
      await client.query("ROLLBACK")
      console.error("[merchant-capture] PayPal capture failed:", err)
      return NextResponse.json(
        { error: "Payment provider error during capture. Please try again." },
        { status: 502 }
      )
    }

    if (captureResult.status !== "COMPLETED") {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: `Capture not successful. PayPal status: ${captureResult.status}` },
        { status: 422 }
      )
    }

    // ── Update transaction to COMPLETED ──────────────────────────────────────
    const originalAmount = parseFloat(transaction.original_amount)
    const gatewayFee = originalAmount * GATEWAY_FEE_PERCENT

    await client.query(
      `UPDATE transactions
       SET status = 'COMPLETED',
           paypal_capture_id = $1,
           gateway_fee = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [captureResult.id, gatewayFee.toFixed(2), transaction.id]
    )

    // ── Increment merchant volume ────────────────────────────────────────────
    await client.query(
      `UPDATE merchant_accounts
       SET    current_volume = current_volume + $1,
              updated_at     = NOW()
       WHERE  id = $2`,
      [originalAmount, transaction.merchant_id]
    )

    await client.query("COMMIT")

    // ── Audit log (fire-and-forget) ──────────────────────────────────────────
    sql`
      INSERT INTO system_logs (action, status, level, metadata, tenant_id)
      VALUES (
        'MANUAL_CAPTURE',
        'OK',
        'info',
        ${JSON.stringify({
          transactionId: transaction.id,
          capturedBy: session.user.email,
          amount: originalAmount.toFixed(2),
          paypalCaptureId: captureResult.id,
        })}::jsonb,
        ${tenantId}
      )
    `.catch(() => { /* silent */ })

    // ── Telegram notification (fire-and-forget) ──────────────────────────────
    ;(async () => {
      try {
        const storeRows = (await sql`
          SELECT name FROM stores WHERE id = ${transaction.store_id} LIMIT 1
        `) as unknown as NameRow[]
        const acctRows = (await sql`
          SELECT name FROM merchant_accounts WHERE id = ${transaction.merchant_id} LIMIT 1
        `) as unknown as NameRow[]
        sendTransactionAlert(
          tenantId,
          originalAmount,
          storeRows[0]?.name ?? "Unknown Store",
          acctRows[0]?.name ?? "Unknown Account"
        )
      } catch { /* silent */ }
    })()

    return NextResponse.json({
      status: "COMPLETED",
      transactionId: transaction.id,
      paypalCaptureId: captureResult.id,
      amount: originalAmount.toFixed(2),
      gatewayFee: gatewayFee.toFixed(2),
      netAmount: (originalAmount - gatewayFee).toFixed(2),
    })

  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[merchant-capture] Unexpected error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
