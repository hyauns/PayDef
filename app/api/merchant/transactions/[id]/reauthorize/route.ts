import { NextRequest, NextResponse } from "next/server"
import { getSql, getPool } from "@/lib/neon"
import { reauthorizeAuthorization, PayPalApiError } from "@/lib/paypal"
import { decrypt } from "@/lib/encryption"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: transactionId } = await params
  const LOG = `[reauthorize:${transactionId}]`

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query("BEGIN")

      // 1. Lock the transaction
      const txRes = await client.query(
        `SELECT id, tenant_id, store_id, merchant_id, status, authorization_id, latest_authorization_id
         FROM transactions
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [transactionId, session.user.tenantId]
      )

      const transaction = txRes.rows[0]
      if (!transaction) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
      }

      if (transaction.status !== "AUTHORIZED") {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Can only reauthorize AUTHORIZED transactions." }, { status: 400 })
      }

      const activeAuthId = transaction.latest_authorization_id || transaction.authorization_id
      if (!activeAuthId) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "No active authorization found." }, { status: 400 })
      }

      // 2. Fetch merchant credentials
      const merchRes = await client.query(
        `SELECT client_id, client_secret, proxy_url
         FROM merchant_accounts
         WHERE id = $1`,
        [transaction.merchant_id]
      )
      const merchant = merchRes.rows[0]
      if (!merchant) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Merchant not found." }, { status: 500 })
      }

      // 3. Call PayPal
      const decryptedSecret = decrypt(merchant.client_secret)
      let reauthResult
      try {
        reauthResult = await reauthorizeAuthorization({
          clientId: merchant.client_id,
          clientSecret: decryptedSecret,
          authorizationId: activeAuthId,
          proxyUrl: merchant.proxy_url,
        })
      } catch (err) {
        await client.query("ROLLBACK")
        const payloadError = err instanceof PayPalApiError ? err.body : String(err)
        console.error(`${LOG} PayPal error:`, payloadError)
        return NextResponse.json({ error: "PayPal reauthorization failed", details: payloadError }, { status: 502 })
      }

      // 4. Update Database
      // A reauthorization sets a new honor period. PayPal typically gives 3 days for honor period on a reauth.
      // We will update latest_authorization_id and add 3 days to authorization_expires_at.
      await client.query(
        `UPDATE transactions
         SET latest_authorization_id = $1,
             authorization_expires_at = NOW() + INTERVAL '3 days',
             updated_at = NOW()
         WHERE id = $2`,
        [reauthResult.id, transactionId]
      )

      await client.query("COMMIT")

      return NextResponse.json({
        success: true,
        old_authorization_id: activeAuthId,
        new_authorization_id: reauthResult.id,
        status: reauthResult.status,
      })

    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`${LOG} Unexpected error:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
