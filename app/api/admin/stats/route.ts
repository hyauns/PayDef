/**
 * GET /api/admin/stats
 * Super Admin only — returns network-wide statistics.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  // Total network volume (all completed transactions)
  const volumeResult = await sql`
    SELECT COALESCE(SUM(original_amount), 0) AS total_volume
    FROM transactions
    WHERE status = 'COMPLETED'
  `
  const totalVolume = parseFloat(volumeResult[0]?.total_volume ?? "0")

  // Platform fees collected
  const feesResult = await sql`
    SELECT COALESCE(SUM(gateway_fee), 0) AS total_fees
    FROM transactions
    WHERE status = 'COMPLETED'
  `
  const totalFees = parseFloat(feesResult[0]?.total_fees ?? "0")

  // Total tenants (merchants)
  const tenantsResult = await sql`SELECT COUNT(*) AS count FROM tenants`
  const totalTenants = parseInt(tenantsResult[0]?.count ?? "0", 10)

  // Total stores
  const storesResult = await sql`SELECT COUNT(*) AS count FROM stores`
  const totalStores = parseInt(storesResult[0]?.count ?? "0", 10)

  // Total merchant accounts (PayPal)
  const accountsResult = await sql`SELECT COUNT(*) AS count FROM merchant_accounts`
  const totalAccounts = parseInt(accountsResult[0]?.count ?? "0", 10)

  // Total transactions
  const txResult = await sql`SELECT COUNT(*) AS count FROM transactions`
  const totalTransactions = parseInt(txResult[0]?.count ?? "0", 10)

  // Transactions by status
  const statusBreakdown = await sql`
    SELECT status, COUNT(*) AS count
    FROM transactions
    GROUP BY status
  `

  // Volume over last 7 days
  const dailyVolume = await sql`
    SELECT 
      DATE(created_at) AS date,
      COALESCE(SUM(original_amount), 0) AS volume,
      COUNT(*) AS tx_count
    FROM transactions
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `

  return NextResponse.json({
    totalVolume,
    totalFees,
    totalTenants,
    totalStores,
    totalAccounts,
    totalTransactions,
    statusBreakdown: statusBreakdown.map((row: { status: string; count: string }) => ({
      status: row.status,
      count: parseInt(row.count, 10),
    })),
    dailyVolume: dailyVolume.map((row: { date: string; volume: string; tx_count: string }) => ({
      date: row.date,
      volume: parseFloat(row.volume),
      txCount: parseInt(row.tx_count, 10),
    })),
  })
}
