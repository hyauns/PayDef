/**
 * POST /api/gateway/reauthorize
 *
 * Store-facing API endpoint for server-to-server reauthorization.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql, getPool } from "@/lib/neon"
import { reauthorizeAuthorization, PayPalApiError } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"

interface MerchantRow {
  client_id:     string
  client_secret: string
  proxy_url:     string | null
}

interface ReauthorizeBody {
  storeId?: string
  transactionId?: string
  orderNumber?: string
  authorization_id?: string
}

export async function POST(req: NextRequest) {
  // ── Step 1. Auth & Rate Limiting ────────────────────────────────────────────
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

  // ── Step 2. Parse Body ──────────────────────────────────────────────────────
  let body: ReauthorizeBody
  try {
    body = (await req.json()) as ReauthorizeBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const lookupId = body.transactionId || body.authorization_id
  if (!lookupId?.trim()) {
    console.error(`[reauthorize:validation_failed] Missing transactionId/authorization_id for store ${store.id}`)
    return NextResponse.json({ error: "transactionId or authorization_id is required." }, { status: 400 })
  }

  const tenantId = store.tenantId
  const pool = getPool()
  const client = await pool.connect()

  try {
    console.info(`[reauthorize:request_started] lookupId=${lookupId} storeId=${store.id}`)
    await client.query("BEGIN")

    // ── Step 3. Find and lock transaction ─────────────────────────────────────
    const txResult = await client.query<any>(
      `SELECT id, tenant_id, store_id, merchant_id, status, authorization_id, latest_authorization_id
       FROM transactions
       WHERE (id = $1 OR authorization_id = $1 OR latest_authorization_id = $1)
         AND store_id = $2
         AND tenant_id = $3
       FOR UPDATE`,
      [lookupId, store.id, tenantId]
    )

    const transaction = txResult.rows[0]
    if (!transaction) {
      console.error(`[reauthorize:validation_failed] Transaction not found: ${lookupId}`)
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Transaction/Authorization not found for this store." }, { status: 404 })
    }

    if (transaction.status !== "AUTHORIZED") {
      console.error(`[reauthorize:validation_failed] Invalid status ${transaction.status} for tx ${transaction.id}`)
      await client.query("ROLLBACK")
      return NextResponse.json({ error: `Cannot reauthorize transaction in '${transaction.status}' status.` }, { status: 400 })
    }

    const activeAuthId = transaction.latest_authorization_id || transaction.authorization_id
    if (!activeAuthId) {
      console.error(`[reauthorize:validation_failed] No active authorization for tx ${transaction.id}`)
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "No active authorization found." }, { status: 400 })
    }

    // ── Step 4. Fetch Merchant Credentials ────────────────────────────────────
    const merchantResult = await client.query<MerchantRow>(
      `SELECT client_id, client_secret, proxy_url
       FROM merchant_accounts
       WHERE id = $1`,
      [transaction.merchant_id]
    )
    const merchant = merchantResult.rows[0]
    if (!merchant) {
      console.error(`[reauthorize:validation_failed] Merchant not found for tx ${transaction.id}`)
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Merchant account not found." }, { status: 500 })
    }

    // ── Step 5. Call PayPal ───────────────────────────────────────────────────
    const decryptedSecret = decrypt(merchant.client_secret)
    let reauthResult
    try {
      console.info(`[reauthorize:paypal_started] tx=${transaction.id} authId=${activeAuthId}`)
      reauthResult = await reauthorizeAuthorization({
        clientId: merchant.client_id,
        clientSecret: decryptedSecret,
        authorizationId: activeAuthId,
        proxyUrl: merchant.proxy_url ?? undefined,
      })
      console.info(`[reauthorize:paypal_completed] tx=${transaction.id} newAuthId=${reauthResult.id}`)
    } catch (paypalError) {
      await client.query("ROLLBACK")
      const errMsg = paypalError instanceof PayPalApiError ? paypalError.body : String(paypalError)
      console.error(`[reauthorize:failed] PayPal error for tx ${transaction.id}: ${errMsg}`)
      return NextResponse.json({ error: "Payment provider error during reauthorization. Please try again." }, { status: 502 })
    }

    // ── Step 6. Update Database ───────────────────────────────────────────────
    await client.query(
      `UPDATE transactions
       SET latest_authorization_id = $1,
           authorization_expires_at = NOW() + INTERVAL '3 days',
           updated_at = NOW()
       WHERE id = $2`,
      [reauthResult.id, transaction.id]
    )
    console.info(`[reauthorize:db_updated] tx=${transaction.id} updated latest_authorization_id`)

    await client.query("COMMIT")
    console.info(`[reauthorize:completed] tx=${transaction.id} newAuthId=${reauthResult.id}`)

    return NextResponse.json({
      ok: true,
      transactionId: transaction.id,
      status: transaction.status,
      authorizationId: transaction.authorization_id,
      latestAuthorizationId: reauthResult.id,
      message: "Reauthorization successful"
    }, { headers: rlHeaders })

  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[reauthorize:failed] Internal server error:", error)
    return NextResponse.json({ error: "Internal server error during reauthorization." }, { status: 500 })
  } finally {
    client.release()
  }
}
