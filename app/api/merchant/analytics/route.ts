/**
 * GET /api/merchant/analytics
 *
 * Aggregates transaction data for the Analytics dashboard charts.
 * Tenant-scoped — MERCHANT users only see their own data.
 *
 * Query params:
 *   ?range=24h|7d|30d  (default: 7d)
 *
 * Response shape (matches Recharts component expectations):
 *   {
 *     summary:      { totalRevenue, totalTransactions, successRate, ... }
 *     timeSeries:   [{ label, revenue, transactions }]       — AreaChart
 *     merchantData: [{ name, volume, txCount }]               — BarChart
 *     storeData:    [{ name, value }]                         — PieChart
 *   }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = "24h" | "7d" | "30d"

interface TimeSeriesRow {
  label:        string
  revenue:      string
  transactions: string
}

interface MerchantVolumeRow {
  name:     string
  volume:   string
  tx_count: string
}

interface StoreVolumeRow {
  name:  string
  value: string
}

interface SummaryRow {
  total_revenue:     string
  total_transactions: string
  completed_count:   string
  failed_count:      string
  refunded_count:    string
  disputed_count:    string
  total_fees:        string
  avg_amount:        string
}

interface AccountStatusRow {
  status: string
  count:  string
}

// ─── Range → SQL helpers ──────────────────────────────────────────────────────

function rangeToInterval(range: Range): string {
  switch (range) {
    case "24h": return "24 hours"
    case "7d":  return "7 days"
    case "30d": return "30 days"
  }
}

function rangeToTruncUnit(range: Range): string {
  // 24h → group by hour, 7d/30d → group by day
  return range === "24h" ? "hour" : "day"
}

function rangeLabelFormat(range: Range): string {
  // PostgreSQL to_char format for the X-axis label
  switch (range) {
    case "24h": return "HH24:00"        // "14:00"
    case "7d":  return "Dy"             // "Mon"
    case "30d": return "Mon DD"         // "Apr 01"
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  // Parse range from query string
  const { searchParams } = new URL(req.url)
  const rangeParam = searchParams.get("range") ?? "7d"
  const range: Range = ["24h", "7d", "30d"].includes(rangeParam)
    ? (rangeParam as Range)
    : "7d"

  // ── Safe defaults — returned if the DB is empty or any query errors ────────
  const EMPTY_RESPONSE = {
    range,
    summary: {
      totalRevenue: 0, totalTransactions: 0,
      completedCount: 0, failedCount: 0, refundedCount: 0, disputedCount: 0,
      successRate: 0, refundRate: 0, disputeRate: 0,
      avgTransaction: 0, gatewayFees: 0,
      activeAccounts: 0, totalAccounts: 0,
    },
    timeSeries: [],
    merchantData: [],
    storeData: [],
  }

  try {
    const sql      = getSql()
    const interval = rangeToInterval(range)
    const trunc    = rangeToTruncUnit(range)
    const labelFmt = rangeLabelFormat(range)

    // Tenant filter: SUPER_ADMIN sees all, MERCHANT is scoped
    const isSuperAdmin = role === "SUPER_ADMIN"

    // ── 1. Summary metrics ────────────────────────────────────────────────────
    const summaryRows = isSuperAdmin
      ? (await sql`
          SELECT
            COALESCE(SUM(original_amount), 0)                           AS total_revenue,
            COUNT(*)                                                     AS total_transactions,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')                 AS completed_count,
            COUNT(*) FILTER (WHERE status = 'FAILED')                    AS failed_count,
            COUNT(*) FILTER (WHERE status = 'REFUNDED')                  AS refunded_count,
            COUNT(*) FILTER (WHERE status = 'DISPUTED')                  AS disputed_count,
            COALESCE(SUM(gateway_fee), 0)                                AS total_fees,
            COALESCE(AVG(original_amount), 0)                            AS avg_amount
          FROM transactions
          WHERE created_at >= NOW() - ${interval}::interval
        `) as unknown as SummaryRow[]
      : (await sql`
          SELECT
            COALESCE(SUM(original_amount), 0)                           AS total_revenue,
            COUNT(*)                                                     AS total_transactions,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')                 AS completed_count,
            COUNT(*) FILTER (WHERE status = 'FAILED')                    AS failed_count,
            COUNT(*) FILTER (WHERE status = 'REFUNDED')                  AS refunded_count,
            COUNT(*) FILTER (WHERE status = 'DISPUTED')                  AS disputed_count,
            COALESCE(SUM(gateway_fee), 0)                                AS total_fees,
            COALESCE(AVG(original_amount), 0)                            AS avg_amount
          FROM transactions
          WHERE tenant_id = ${tenantId}
            AND created_at >= NOW() - ${interval}::interval
        `) as unknown as SummaryRow[]

    const summary = summaryRows[0]
    if (!summary) return NextResponse.json(EMPTY_RESPONSE)

    const totalTx       = parseInt(summary.total_transactions ?? "0", 10) || 0
    const completedTx   = parseInt(summary.completed_count ?? "0", 10) || 0
    const failedTx      = parseInt(summary.failed_count ?? "0", 10) || 0
    const refundedTx    = parseInt(summary.refunded_count ?? "0", 10) || 0
    const disputedTx    = parseInt(summary.disputed_count ?? "0", 10) || 0
    const totalRevenue  = parseFloat(summary.total_revenue ?? "0") || 0
    const totalFees     = parseFloat(summary.total_fees ?? "0") || 0
    const avgAmount     = parseFloat(summary.avg_amount ?? "0") || 0

    const successRate = totalTx > 0
      ? Math.round((completedTx / totalTx) * 10000) / 100
      : 0

    const refundRate = totalTx > 0
      ? Math.round((refundedTx / totalTx) * 10000) / 100
      : 0

    const disputeRate = totalTx > 0
      ? Math.round((disputedTx / totalTx) * 10000) / 100
      : 0

    // ── 2. Active account counts ──────────────────────────────────────────────
    const accountStatusRows = isSuperAdmin
      ? (await sql`
          SELECT status, COUNT(*) AS count
          FROM merchant_accounts
          GROUP BY status
        `) as unknown as AccountStatusRow[]
      : (await sql`
          SELECT status, COUNT(*) AS count
          FROM merchant_accounts
          WHERE tenant_id = ${tenantId}
          GROUP BY status
        `) as unknown as AccountStatusRow[]

    const accountCounts: Record<string, number> = {}
    for (const row of accountStatusRows) {
      accountCounts[row.status] = parseInt(row.count, 10) || 0
    }
    const activeAccounts = accountCounts["ACTIVE"] ?? 0
    const totalAccounts  = Object.values(accountCounts).reduce((a, b) => a + b, 0)

    // ── 3. Time-series data ───────────────────────────────────────────────────
    const timeSeriesRows = isSuperAdmin
      ? (await sql`
          SELECT
            to_char(date_trunc(${trunc}, created_at), ${labelFmt}) AS label,
            COALESCE(SUM(original_amount), 0)                       AS revenue,
            COUNT(*)                                                 AS transactions
          FROM transactions
          WHERE created_at >= NOW() - ${interval}::interval
          GROUP BY date_trunc(${trunc}, created_at)
          ORDER BY date_trunc(${trunc}, created_at) ASC
        `) as unknown as TimeSeriesRow[]
      : (await sql`
          SELECT
            to_char(date_trunc(${trunc}, created_at), ${labelFmt}) AS label,
            COALESCE(SUM(original_amount), 0)                       AS revenue,
            COUNT(*)                                                 AS transactions
          FROM transactions
          WHERE tenant_id = ${tenantId}
            AND created_at >= NOW() - ${interval}::interval
          GROUP BY date_trunc(${trunc}, created_at)
          ORDER BY date_trunc(${trunc}, created_at) ASC
        `) as unknown as TimeSeriesRow[]

    const timeSeries = (timeSeriesRows ?? []).map((row) => ({
      label:        row.label ?? "",
      revenue:      Math.round((parseFloat(row.revenue ?? "0") || 0) * 100) / 100,
      transactions: parseInt(row.transactions ?? "0", 10) || 0,
    }))

    // ── 4. Volume per Merchant ────────────────────────────────────────────────
    const merchantVolumeRows = isSuperAdmin
      ? (await sql`
          SELECT
            ma.name                                  AS name,
            COALESCE(SUM(t.original_amount), 0)       AS volume,
            COUNT(t.id)                               AS tx_count
          FROM merchant_accounts ma
          LEFT JOIN transactions t ON t.merchant_id = ma.id
            AND t.created_at >= NOW() - ${interval}::interval
          GROUP BY ma.id, ma.name
          ORDER BY volume DESC
        `) as unknown as MerchantVolumeRow[]
      : (await sql`
          SELECT
            ma.name                                  AS name,
            COALESCE(SUM(t.original_amount), 0)       AS volume,
            COUNT(t.id)                               AS tx_count
          FROM merchant_accounts ma
          LEFT JOIN transactions t ON t.merchant_id = ma.id
            AND t.created_at >= NOW() - ${interval}::interval
          WHERE ma.tenant_id = ${tenantId}
          GROUP BY ma.id, ma.name
          ORDER BY volume DESC
        `) as unknown as MerchantVolumeRow[]

    const merchantData = (merchantVolumeRows ?? []).map((row) => ({
      name:    row.name ?? "Unknown",
      volume:  Math.round((parseFloat(row.volume ?? "0") || 0) * 100) / 100,
      txCount: parseInt(row.tx_count ?? "0", 10) || 0,
    }))

    // ── 5. Volume per Store ───────────────────────────────────────────────────
    const storeVolumeRows = isSuperAdmin
      ? (await sql`
          SELECT
            s.name                                  AS name,
            COALESCE(SUM(t.original_amount), 0)      AS value
          FROM stores s
          LEFT JOIN transactions t ON t.store_id = s.id
            AND t.created_at >= NOW() - ${interval}::interval
          GROUP BY s.id, s.name
          ORDER BY value DESC
        `) as unknown as StoreVolumeRow[]
      : (await sql`
          SELECT
            s.name                                  AS name,
            COALESCE(SUM(t.original_amount), 0)      AS value
          FROM stores s
          LEFT JOIN transactions t ON t.store_id = s.id
            AND t.created_at >= NOW() - ${interval}::interval
          WHERE s.tenant_id = ${tenantId}
          GROUP BY s.id, s.name
          ORDER BY value DESC
        `) as unknown as StoreVolumeRow[]

    const storeData = (storeVolumeRows ?? []).map((row) => ({
      name:  row.name ?? "Unknown",
      value: Math.round((parseFloat(row.value ?? "0") || 0) * 100) / 100,
    }))

    // ── Response ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      range,
      summary: {
        totalRevenue:      Math.round(totalRevenue * 100) / 100,
        totalTransactions: totalTx,
        completedCount:    completedTx,
        failedCount:       failedTx,
        refundedCount:     refundedTx,
        disputedCount:     disputedTx,
        successRate,
        refundRate,
        disputeRate,
        avgTransaction:    Math.round(avgAmount * 100) / 100,
        gatewayFees:       Math.round(totalFees * 100) / 100,
        activeAccounts,
        totalAccounts,
      },
      timeSeries,
      merchantData,
      storeData,
    })
  } catch (err) {
    console.error("[analytics] Error:", err instanceof Error ? err.message : err)
    // Return safe empty response instead of a 500
    return NextResponse.json(EMPTY_RESPONSE)
  }
}
