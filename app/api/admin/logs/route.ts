/**
 * GET /api/admin/logs
 *
 * Queries the `system_logs` table with pagination, level/account filtering,
 * and free-text search. Both SUPER_ADMIN and MERCHANT roles are allowed.
 *
 * Query params:
 *   ?level=success|error|warning|info  — filter by log level
 *   ?account=uuid                     — filter by account_id
 *   ?search=...                       — search action + metadata text
 *   ?page=1                           — 1-indexed page (default 1)
 *   ?limit=40                         — rows per page (max 100, default 40)
 *
 * Response:
 *   {
 *     logs: [{ id, action, status, level, metadata, accountId, tenantId, storeId, createdAt }],
 *     accounts: [{ id, name }],            — for the account dropdown
 *     pagination: { page, limit, total, totalPages }
 *   }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getPool } from "@/lib/neon"

const VALID_LEVELS = ["success", "error", "warning", "info"] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const isSuperAdmin = role === "SUPER_ADMIN"

  // ── Parse query params ──────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "40", 10)))
  const offset = (page - 1) * limit

  const levelParam   = searchParams.get("level")?.toLowerCase() ?? ""
  const accountParam = searchParams.get("account") ?? ""
  const searchParam  = searchParams.get("search")?.trim() ?? ""

  // ── Build dynamic WHERE clause ──────────────────────────────────────────
  const conditions: string[] = []
  const values: (string | number)[] = []
  let paramIdx = 1

  // Tenant scoping for MERCHANT users
  if (!isSuperAdmin) {
    conditions.push(`sl.tenant_id = $${paramIdx++}`)
    values.push(tenantId!)
  }

  // Level filter
  if (levelParam && (VALID_LEVELS as readonly string[]).includes(levelParam)) {
    conditions.push(`sl.level = $${paramIdx++}`)
    values.push(levelParam)
  }

  // Account filter
  if (accountParam) {
    conditions.push(`sl.account_id = $${paramIdx++}`)
    values.push(accountParam)
  }

  // Free-text search across action + metadata text
  if (searchParam) {
    conditions.push(`(
      sl.action ILIKE $${paramIdx} OR
      sl.metadata::text ILIKE $${paramIdx}
    )`)
    values.push(`%${searchParam}%`)
    paramIdx++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // ── Count total matching rows ───────────────────────────────────────────
  const countSql = `
    SELECT COUNT(*) AS total
    FROM system_logs sl
    ${whereClause}
  `

  // ── Fetch page of logs ──────────────────────────────────────────────────
  const dataSql = `
    SELECT
      sl.id,
      sl.action,
      sl.status,
      sl.level,
      sl.metadata,
      sl.tenant_id,
      sl.account_id,
      sl.store_id,
      sl.created_at,
      ma.name   AS account_name,
      s.name    AS store_name,
      t.name    AS tenant_name
    FROM system_logs sl
    LEFT JOIN merchant_accounts ma ON sl.account_id = ma.id
    LEFT JOIN stores s ON sl.store_id = s.id
    LEFT JOIN tenants t ON sl.tenant_id = t.id
    ${whereClause}
    ORDER BY sl.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `

  const dataValues = [...values, limit, offset]

  // ── Fetch available accounts for the filter dropdown ────────────────────
  const accountsSql = isSuperAdmin
    ? `SELECT id, name FROM merchant_accounts ORDER BY name`
    : `SELECT id, name FROM merchant_accounts WHERE tenant_id = $1 ORDER BY name`
  const accountsValues = isSuperAdmin ? [] : [tenantId!]

  const pool = getPool()

  const [countResult, dataResult, accountsResult] = await Promise.all([
    pool.query(countSql, values),
    pool.query(dataSql, dataValues),
    pool.query(accountsSql, accountsValues),
  ])

  const total      = parseInt(countResult.rows[0]?.total ?? "0", 10)
  const totalPages = Math.ceil(total / limit)

  const logs = dataResult.rows.map((row: Record<string, unknown>) => ({
    id:          row.id,
    action:      row.action,
    status:      row.status,
    level:       row.level ?? "info",
    metadata:    row.metadata ?? {},
    tenantId:    row.tenant_id ?? null,
    tenantName:  row.tenant_name ?? null,
    accountId:   row.account_id ?? null,
    accountName: row.account_name ?? null,
    storeId:     row.store_id ?? null,
    storeName:   row.store_name ?? null,
    createdAt:   row.created_at,
  }))

  const accounts = accountsResult.rows.map((row: Record<string, unknown>) => ({
    id:   row.id,
    name: row.name,
  }))

  return NextResponse.json({
    logs,
    accounts,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  })
}
