/**
 * GET /api/merchant/accounts
 * Returns PayPal accounts owned by the logged-in merchant (tenant-scoped).
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  // MERCHANT users must have a tenantId
  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const sql = getSql()

  // For SUPER_ADMIN: return all accounts (for admin dashboard)
  // For MERCHANT: return only their tenant's accounts
  const accounts = role === "SUPER_ADMIN"
    ? await sql`
        SELECT 
          id,
          tenant_id,
          client_id,
          shield_domain,
          daily_limit,
          current_volume,
          priority,
          status,
          volume_reset_at,
          created_at,
          updated_at
        FROM merchant_accounts
        ORDER BY created_at DESC
      `
    : await sql`
        SELECT 
          id,
          tenant_id,
          client_id,
          shield_domain,
          daily_limit,
          current_volume,
          priority,
          status,
          volume_reset_at,
          created_at,
          updated_at
        FROM merchant_accounts
        WHERE tenant_id = ${tenantId}
        ORDER BY priority DESC, created_at DESC
      `

  // Get transaction counts per account
  const accountIds = accounts.map((a: { id: string }) => a.id)
  
  let txCounts: Record<string, number> = {}
  if (accountIds.length > 0) {
    const countQuery = role === "SUPER_ADMIN"
      ? await sql`
          SELECT merchant_id, COUNT(*) AS count
          FROM transactions
          GROUP BY merchant_id
        `
      : await sql`
          SELECT merchant_id, COUNT(*) AS count
          FROM transactions
          WHERE tenant_id = ${tenantId}
          GROUP BY merchant_id
        `
    
    txCounts = countQuery.reduce(
      (acc: Record<string, number>, row: { merchant_id: string; count: string }) => {
        acc[row.merchant_id] = parseInt(row.count, 10)
        return acc
      },
      {}
    )
  }

  return NextResponse.json({
    accounts: accounts.map((account: {
      id: string
      tenant_id: string
      client_id: string
      shield_domain: string
      daily_limit: string
      current_volume: string
      priority: number
      status: string
      volume_reset_at: string | null
      created_at: string
      updated_at: string
    }) => ({
      id: account.id,
      tenantId: account.tenant_id,
      clientId: account.client_id,
      shieldDomain: account.shield_domain,
      dailyLimit: parseFloat(account.daily_limit),
      currentVolume: parseFloat(account.current_volume),
      priority: account.priority,
      status: account.status,
      volumeResetAt: account.volume_reset_at,
      transactionCount: txCounts[account.id] ?? 0,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    })),
  })
}
