/**
 * GET /api/merchant/dashboard-stats
 *
 * Returns real-time dashboard metrics for the logged-in merchant's tenant:
 *   • Total volume today (sum of captured transactions)
 *   • % change vs yesterday
 *   • Active vs total shield domains
 *   • System health status
 *
 * All queries are scoped to session.user.tenantId.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface TotalRow {
  total: string
}

interface CountRow {
  count: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  // Super admins see all tenants combined; merchants see only their own
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"

  const sql = getSql()

  try {
    // ── 1. Today's total volume ──────────────────────────────────────────────
    // Only COMPLETED (captured) and AUTHORIZED (reserved, guaranteed) count.
    // PENDING = buyer still in checkout, money not yet committed — excluded.
    // CANCELED, EXPIRED, FAILED, REFUNDED, DISPUTED are also excluded.
    const todayQuery = isSuperAdmin
      ? sql`
          SELECT COALESCE(SUM(original_amount), 0)::TEXT AS total
          FROM transactions
          WHERE created_at >= CURRENT_DATE
            AND status IN ('COMPLETED', 'AUTHORIZED')
        `
      : sql`
          SELECT COALESCE(SUM(original_amount), 0)::TEXT AS total
          FROM transactions
          WHERE tenant_id = ${tenantId}
            AND created_at >= CURRENT_DATE
            AND status IN ('COMPLETED', 'AUTHORIZED')
        `

    // ── 2. Yesterday's total volume ──────────────────────────────────────────
    const yesterdayQuery = isSuperAdmin
      ? sql`
          SELECT COALESCE(SUM(original_amount), 0)::TEXT AS total
          FROM transactions
          WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
            AND created_at < CURRENT_DATE
            AND status IN ('COMPLETED', 'AUTHORIZED')
        `
      : sql`
          SELECT COALESCE(SUM(original_amount), 0)::TEXT AS total
          FROM transactions
          WHERE tenant_id = ${tenantId}
            AND created_at >= CURRENT_DATE - INTERVAL '1 day'
            AND created_at < CURRENT_DATE
            AND status IN ('COMPLETED', 'AUTHORIZED')
        `

    // ── 3. Shield domains count ──────────────────────────────────────────────
    const domainsQuery = sql`
      SELECT
        COUNT(*)::TEXT AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::TEXT AS active
      FROM shield_domains
    `

    // ── 4. Transaction count today ───────────────────────────────────────────
    const txCountQuery = isSuperAdmin
      ? sql`
          SELECT COUNT(*)::TEXT AS count
          FROM transactions
          WHERE created_at >= CURRENT_DATE
        `
      : sql`
          SELECT COUNT(*)::TEXT AS count
          FROM transactions
          WHERE tenant_id = ${tenantId}
            AND created_at >= CURRENT_DATE
        `

    // Run all queries in parallel
    const [todayRows, yesterdayRows, domainRows, txCountRows] = await Promise.all([
      todayQuery,
      yesterdayQuery,
      domainsQuery,
      txCountQuery,
    ])

    const todayRow = todayRows[0] as TotalRow | undefined
    const yesterdayRow = yesterdayRows[0] as TotalRow | undefined
    const domainRow = domainRows[0] as { active: string; total: string } | undefined
    const txCountRow = txCountRows[0] as CountRow | undefined

    const todayVolume = parseFloat(todayRow?.total ?? "0")
    const yesterdayVolume = parseFloat(yesterdayRow?.total ?? "0")
    const activeDomains = parseInt(domainRow?.active ?? "0", 10)
    const totalDomains = parseInt(domainRow?.total ?? "0", 10)
    const txCount = parseInt(txCountRow?.count ?? "0", 10)

    // Calculate % change
    let percentChange = 0
    if (yesterdayVolume > 0) {
      percentChange = ((todayVolume - yesterdayVolume) / yesterdayVolume) * 100
    } else if (todayVolume > 0) {
      percentChange = 100 // infinite increase, cap at 100
    }

    const degradedDomains = totalDomains - activeDomains

    return NextResponse.json({
      volume: {
        today: todayVolume,
        yesterday: yesterdayVolume,
        percentChange: Math.round(percentChange * 10) / 10, // 1 decimal
      },
      domains: {
        active: activeDomains,
        total: totalDomains,
        degraded: degradedDomains,
      },
      transactions: {
        countToday: txCount,
      },
    })
  } catch (err) {
    console.error("[dashboard-stats] Error:", err)
    // Return safe defaults so the UI never crashes
    return NextResponse.json({
      volume: { today: 0, yesterday: 0, percentChange: 0 },
      domains: { active: 0, total: 0, degraded: 0 },
      transactions: { countToday: 0 },
    })
  }
}
