/**
 * POST /api/merchant/accounts/sync
 *
 * Synchronizes merchant account data:
 *  1. Recalculates current_volume from transactions (since last reset)
 *  2. Verifies PayPal API connectivity per account
 *  3. Auto-pauses accounts that have exceeded their daily_limit
 *
 * Returns the refreshed account list.
 *
 * Security:
 *  • Tenant-scoped — MERCHANT only sees their own accounts
 *  • client_secret decrypted just-in-time for connectivity check, never returned
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { decrypt } from "@/lib/encryption"

// ─── PayPal Connectivity Check ────────────────────────────────────────────────

async function checkPayPalConnectivity(
  clientId: string,
  encryptedSecret: string
): Promise<{ connected: boolean; error?: string }> {
  try {
    const clientSecret = decrypt(encryptedSecret)
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    const res = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (res.ok) {
      return { connected: true }
    }

    const errBody = await res.text().catch(() => "")
    return { connected: false, error: `HTTP ${res.status}: ${errBody.slice(0, 120)}` }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { connected: false, error: "Connection timed out (6s)" }
    }
    const message = err instanceof Error ? err.message : "Connection failed"
    return { connected: false, error: message.slice(0, 120) }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role !== "MERCHANT" || !tenantId) {
    return NextResponse.json({ error: "Only merchants can sync accounts" }, { status: 403 })
  }

  const sql = getSql()

  // ── Step 1: Recalculate current_volume from transactions ────────────────
  // Uses SUM of completed transaction amounts since the last volume_reset_at
  await sql`
    UPDATE merchant_accounts ma
    SET current_volume = COALESCE(sub.real_volume, 0),
        updated_at = NOW()
    FROM (
      SELECT
        t.merchant_id,
        SUM(t.original_amount) AS real_volume
      FROM transactions t
      JOIN merchant_accounts ma2 ON t.merchant_id = ma2.id
      WHERE t.tenant_id = ${tenantId}
        AND t.status = 'COMPLETED'
        AND t.created_at >= COALESCE(ma2.volume_reset_at, ma2.created_at)
      GROUP BY t.merchant_id
    ) sub
    WHERE ma.id = sub.merchant_id
      AND ma.tenant_id = ${tenantId}
  `

  // Also zero-out accounts with no matching transactions
  await sql`
    UPDATE merchant_accounts
    SET current_volume = 0, updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND id NOT IN (
        SELECT DISTINCT merchant_id FROM transactions
        WHERE tenant_id = ${tenantId}
          AND status = 'COMPLETED'
      )
  `

  // ── Step 2: Fetch updated accounts for connectivity check ───────────────
  const accounts = (await sql`
    SELECT id, name, client_id, client_secret, current_volume, daily_limit, status
    FROM merchant_accounts
    WHERE tenant_id = ${tenantId}
    ORDER BY priority DESC, created_at DESC
  `) as unknown as {
    id: string
    name: string
    client_id: string
    client_secret: string
    current_volume: string
    daily_limit: string
    status: string
  }[]

  // ── Step 3: Check connectivity + auto-pause over-limit accounts ─────────
  const connectivityResults: Record<string, { connected: boolean; error?: string }> = {}
  const statusUpdates: { id: string; newStatus: string }[] = []

  for (const acct of accounts) {
    const volume = parseFloat(acct.current_volume)
    const limit  = parseFloat(acct.daily_limit)

    // Auto-pause if over hard limit
    if (volume >= limit && acct.status === "ACTIVE") {
      statusUpdates.push({ id: acct.id, newStatus: "PAUSED" })
    }

    // Verify PayPal connectivity (only for active/warming accounts)
    if (acct.status === "ACTIVE" || acct.status === "WARMING_UP") {
      connectivityResults[acct.id] = await checkPayPalConnectivity(
        acct.client_id,
        acct.client_secret
      )
    } else {
      connectivityResults[acct.id] = { connected: false, error: "Account not active" }
    }
  }

  // Apply status updates
  for (const { id, newStatus } of statusUpdates) {
    await sql`
      UPDATE merchant_accounts
      SET status = ${newStatus}::account_status, updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `
  }

  return NextResponse.json({
    synced: accounts.length,
    connectivity: connectivityResults,
    statusUpdates: statusUpdates.length,
    message: `Synced ${accounts.length} accounts. ${statusUpdates.length} auto-paused.`,
  })
}
