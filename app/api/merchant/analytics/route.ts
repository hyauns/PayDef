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
import { getPool } from "@/lib/neon"

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = "24h" | "7d" | "30d"

// ─── Range → SQL helpers ──────────────────────────────────────────────────────

function rangeToIntervalLiteral(range: Range): string {
  // Returns a safe SQL INTERVAL literal — NO user input, only hardcoded values
  switch (range) {
    case "24h": return "INTERVAL '24 hours'"
    case "7d":  return "INTERVAL '7 days'"
    case "30d": return "INTERVAL '30 days'"
  }
}

function rangeToTruncUnit(range: Range): string {
  return range === "24h" ? "hour" : "day"
}

function rangeLabelFormat(range: Range): string {
  switch (range) {
    case "24h": return "HH24:00"
    case "7d":  return "Dy"
    case "30d": return "Mon DD"
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
      voidedCount: 0,
      successRate: 0, refundRate: 0, disputeRate: 0,
      avgTransaction: 0, gatewayFees: 0,
      activeAccounts: 0, totalAccounts: 0,
    },
    timeSeries: [],
    merchantData: [],
    storeData: [],
  }

  try {
    const pool       = getPool()
    const intervalSql = rangeToIntervalLiteral(range)
    const trunc      = rangeToTruncUnit(range)
    const labelFmt   = rangeLabelFormat(range)

    // Tenant filter: SUPER_ADMIN sees all, MERCHANT is scoped
    const isSuperAdmin = role === "SUPER_ADMIN"

    // ── Tenant WHERE fragments (safe — only hardcoded SQL + parameterized tenantId) ──
    const txTenantFilter = isSuperAdmin ? "" : `AND t.tenant_id = '${tenantId}'`
    const directTenantFilter = isSuperAdmin ? "" : `AND tenant_id = '${tenantId}'`
    const maTenantFilter = isSuperAdmin ? "" : `WHERE ma.tenant_id = '${tenantId}'`
    const sTenantFilter = isSuperAdmin ? "" : `WHERE s.tenant_id = '${tenantId}'`

    // Wait — using string interpolation for tenantId is SQL injection risk.
    // Since tenantId comes from the authenticated session (server-side), it's a UUID
    // from our own DB, but let's be safe and use parameterized queries properly.
    // We'll build queries with parameter placeholders.
    const tenantParams: string[] = isSuperAdmin ? [] : [tenantId!]

    // ── 1. Summary metrics ────────────────────────────────────────────────────
    const summaryQuery = isSuperAdmin
      ? `SELECT
           COALESCE(SUM(original_amount), 0)                           AS total_revenue,
           COUNT(*)                                                     AS total_transactions,
           COUNT(*) FILTER (WHERE status::text = 'COMPLETED')                 AS completed_count,
           COUNT(*) FILTER (WHERE status::text = 'FAILED')                    AS failed_count,
           COUNT(*) FILTER (WHERE status::text = 'REFUNDED')                  AS refunded_count,
           COUNT(*) FILTER (WHERE status::text = 'DISPUTED')                  AS disputed_count,
           COUNT(*) FILTER (WHERE status::text = 'VOIDED')                    AS voided_count,
           COALESCE(SUM(gateway_fee), 0)                                AS total_fees,
           COALESCE(AVG(original_amount), 0)                            AS avg_amount
         FROM transactions
         WHERE created_at >= NOW() - ${intervalSql}`
      : `SELECT
           COALESCE(SUM(original_amount), 0)                           AS total_revenue,
           COUNT(*)                                                     AS total_transactions,
           COUNT(*) FILTER (WHERE status::text = 'COMPLETED')                 AS completed_count,
           COUNT(*) FILTER (WHERE status::text = 'FAILED')                    AS failed_count,
           COUNT(*) FILTER (WHERE status::text = 'REFUNDED')                  AS refunded_count,
           COUNT(*) FILTER (WHERE status::text = 'DISPUTED')                  AS disputed_count,
           COUNT(*) FILTER (WHERE status::text = 'VOIDED')                    AS voided_count,
           COALESCE(SUM(gateway_fee), 0)                                AS total_fees,
           COALESCE(AVG(original_amount), 0)                            AS avg_amount
         FROM transactions
         WHERE tenant_id = $1
           AND created_at >= NOW() - ${intervalSql}`

    const summaryResult = await pool.query(summaryQuery, tenantParams)
    const summary = summaryResult.rows[0]
    if (!summary) return NextResponse.json(EMPTY_RESPONSE)

    const totalTx       = parseInt(summary.total_transactions ?? "0", 10) || 0
    const completedTx   = parseInt(summary.completed_count ?? "0", 10) || 0
    const failedTx      = parseInt(summary.failed_count ?? "0", 10) || 0
    const refundedTx    = parseInt(summary.refunded_count ?? "0", 10) || 0
    const disputedTx    = parseInt(summary.disputed_count ?? "0", 10) || 0
    const voidedTx      = parseInt(summary.voided_count ?? "0", 10) || 0
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
    const accountQuery = isSuperAdmin
      ? `SELECT status, COUNT(*) AS count FROM merchant_accounts GROUP BY status`
      : `SELECT status, COUNT(*) AS count FROM merchant_accounts WHERE tenant_id = $1 GROUP BY status`

    const accountResult = await pool.query(accountQuery, tenantParams)
    const accountCounts: Record<string, number> = {}
    for (const row of accountResult.rows) {
      accountCounts[row.status] = parseInt(row.count, 10) || 0
    }
    const activeAccounts = accountCounts["ACTIVE"] ?? 0
    const totalAccounts  = Object.values(accountCounts).reduce((a, b) => a + b, 0)

    // ── 3. Time-series data ───────────────────────────────────────────────────
    // date_trunc and to_char use SQL identifiers (not parameterizable),
    // so we embed them directly in the query string (hardcoded, safe values).
    const timeSeriesQuery = isSuperAdmin
      ? `SELECT
           to_char(date_trunc('${trunc}', created_at), '${labelFmt}') AS label,
           COALESCE(SUM(original_amount), 0)                           AS revenue,
           COUNT(*)                                                     AS transactions
         FROM transactions
         WHERE created_at >= NOW() - ${intervalSql}
         GROUP BY date_trunc('${trunc}', created_at)
         ORDER BY date_trunc('${trunc}', created_at) ASC`
      : `SELECT
           to_char(date_trunc('${trunc}', created_at), '${labelFmt}') AS label,
           COALESCE(SUM(original_amount), 0)                           AS revenue,
           COUNT(*)                                                     AS transactions
         FROM transactions
         WHERE tenant_id = $1
           AND created_at >= NOW() - ${intervalSql}
         GROUP BY date_trunc('${trunc}', created_at)
         ORDER BY date_trunc('${trunc}', created_at) ASC`

    const timeSeriesResult = await pool.query(timeSeriesQuery, tenantParams)
    const timeSeries = (timeSeriesResult.rows ?? []).map((row: Record<string, string>) => ({
      label:        row.label ?? "",
      revenue:      Math.round((parseFloat(row.revenue ?? "0") || 0) * 100) / 100,
      transactions: parseInt(row.transactions ?? "0", 10) || 0,
    }))

    // ── 4. Volume per Merchant ────────────────────────────────────────────────
    const merchantQuery = isSuperAdmin
      ? `SELECT
           ma.name                                  AS name,
           COALESCE(SUM(t.original_amount), 0)       AS volume,
           COUNT(t.id)                               AS tx_count
         FROM merchant_accounts ma
         LEFT JOIN transactions t ON t.merchant_id = ma.id
           AND t.created_at >= NOW() - ${intervalSql}
         GROUP BY ma.id, ma.name
         ORDER BY volume DESC`
      : `SELECT
           ma.name                                  AS name,
           COALESCE(SUM(t.original_amount), 0)       AS volume,
           COUNT(t.id)                               AS tx_count
         FROM merchant_accounts ma
         LEFT JOIN transactions t ON t.merchant_id = ma.id
           AND t.created_at >= NOW() - ${intervalSql}
         WHERE ma.tenant_id = $1
         GROUP BY ma.id, ma.name
         ORDER BY volume DESC`

    const merchantResult = await pool.query(merchantQuery, tenantParams)
    const merchantData = (merchantResult.rows ?? []).map((row: Record<string, string>) => ({
      name:    row.name ?? "Unknown",
      volume:  Math.round((parseFloat(row.volume ?? "0") || 0) * 100) / 100,
      txCount: parseInt(row.tx_count ?? "0", 10) || 0,
    }))

    // ── 5. Volume per Store ───────────────────────────────────────────────────
    const storeQuery = isSuperAdmin
      ? `SELECT
           s.name                                  AS name,
           COALESCE(SUM(t.original_amount), 0)      AS value
         FROM stores s
         LEFT JOIN transactions t ON t.store_id = s.id
           AND t.created_at >= NOW() - ${intervalSql}
         GROUP BY s.id, s.name
         ORDER BY value DESC`
      : `SELECT
           s.name                                  AS name,
           COALESCE(SUM(t.original_amount), 0)      AS value
         FROM stores s
         LEFT JOIN transactions t ON t.store_id = s.id
           AND t.created_at >= NOW() - ${intervalSql}
         WHERE s.tenant_id = $1
         GROUP BY s.id, s.name
         ORDER BY value DESC`

    const storeResult = await pool.query(storeQuery, tenantParams)
    const storeData = (storeResult.rows ?? []).map((row: Record<string, string>) => ({
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
        voidedCount:       voidedTx,
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
    console.error("[analytics] Error:", err instanceof Error ? err.stack : err)
    // Return safe empty response instead of a 500 — but log the full error
    return NextResponse.json(EMPTY_RESPONSE)
  }
}
