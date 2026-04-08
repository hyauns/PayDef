/**
 * GET /api/merchant/logs
 *
 * High-density transaction log with pagination, search, and multi-filter.
 * Tenant-scoped — MERCHANT users only see their own transactions.
 *
 * Query params:
 *   ?page=1           — page number (1-indexed, default 1)
 *   ?limit=20         — rows per page (1–100, default 20)
 *   ?search=...       — searches orderId, paypalOrderId, item names, store/account names
 *   ?status=PENDING   — filter by transaction status (PENDING|COMPLETED|FAILED|REFUNDED|DISPUTED)
 *   ?storeId=uuid     — filter by store
 *   ?accountId=uuid   — filter by merchant account
 *   ?startDate=ISO    — created_at >= this date
 *   ?endDate=ISO      — created_at <= this date
 *
 * Response shape:
 *   {
 *     transactions: [...],    — enriched with store name, account name, both item names
 *     pagination: { page, limit, total, totalPages, hasMore }
 *   }
 *
 * Security:
 *   • tenant_id filter applied to EVERY query (MERCHANT users)
 *   • api_key_hash / client_secret NEVER selected
 *   • created_at / updated_at returned as ISO strings
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getPool } from "@/lib/neon"

// ─── Allowed status values ────────────────────────────────────────────────────

const VALID_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "DISPUTED",
  "CANCELED",
  "EXPIRED",
] as const

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

  // ── Parse query params ────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const offset = (page - 1) * limit

  const search    = searchParams.get("search")?.trim() ?? ""
  const status    = searchParams.get("status")?.toUpperCase() ?? ""
  const storeId   = searchParams.get("storeId") ?? ""
  const accountId = searchParams.get("accountId") ?? ""
  const startDate = searchParams.get("startDate") ?? ""
  const endDate   = searchParams.get("endDate") ?? ""

  // ── Build dynamic WHERE clause ────────────────────────────────────────────
  const conditions: string[] = []
  const values: (string | number)[] = []
  let paramIdx = 1

  // CRITICAL: tenant_id isolation for MERCHANT users
  if (role === "MERCHANT") {
    conditions.push(`t.tenant_id = $${paramIdx++}`)
    values.push(tenantId!)
  }

  // Status filter
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    conditions.push(`t.status = $${paramIdx++}`)
    values.push(status)
  }

  // Store filter
  if (storeId) {
    conditions.push(`t.store_id = $${paramIdx++}`)
    values.push(storeId)
  }

  // Account filter
  if (accountId) {
    conditions.push(`t.merchant_id = $${paramIdx++}`)
    values.push(accountId)
  }

  // Date range
  if (startDate) {
    conditions.push(`t.created_at >= $${paramIdx++}`)
    values.push(startDate)
  }
  if (endDate) {
    conditions.push(`t.created_at <= $${paramIdx++}`)
    values.push(endDate)
  }

  // Full-text search across multiple fields
  if (search) {
    conditions.push(`(
      t.id::text ILIKE $${paramIdx} OR
      t.paypal_order_id ILIKE $${paramIdx} OR
      t.paypal_capture_id ILIKE $${paramIdx} OR
      t.original_item_name ILIKE $${paramIdx} OR
      t.masked_item_name ILIKE $${paramIdx} OR
      t.customer_email ILIKE $${paramIdx} OR
      s.name ILIKE $${paramIdx} OR
      ma.name ILIKE $${paramIdx}
    )`)
    values.push(`%${search}%`)
    paramIdx++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // ── SQL: count total matching rows ────────────────────────────────────────
  const countSql = `
    SELECT COUNT(*) AS total
    FROM transactions t
    LEFT JOIN stores s ON t.store_id = s.id
    LEFT JOIN merchant_accounts ma ON t.merchant_id = ma.id
    ${whereClause}
  `

  // ── SQL: fetch page of transactions ───────────────────────────────────────
  // Includes JOINed store name and account name for display.
  // NEVER selects: api_key_hash, client_secret
  const dataSql = `
    SELECT
      t.id,
      t.tenant_id,
      t.store_id,
      t.merchant_id,
      t.original_amount,
      t.original_currency,
      t.original_item_name,
      t.masked_item_name,
      t.gateway_fee,
      t.status,
      t.paypal_order_id,
      t.paypal_capture_id,
      t.customer_email,
      t.buyer_ip,
      t.buyer_country,
      t.ip_address,
      t.created_at,
      t.updated_at,
      s.name        AS store_name,
      ma.name       AS account_name,
      ma.client_id  AS account_client_id
    FROM transactions t
    LEFT JOIN stores s ON t.store_id = s.id
    LEFT JOIN merchant_accounts ma ON t.merchant_id = ma.id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `

  const dataValues = [...values, limit, offset]

  // ── Execute queries ─────────────────────────────────────────────────────
  // Uses Pool (not tagged template) because of the dynamic WHERE clause
  const pool = getPool()

  const [countResult, dataResult] = await Promise.all([
    pool.query(countSql, values),
    pool.query(dataSql, dataValues),
  ])

  const total      = parseInt(countResult.rows[0]?.total ?? "0", 10)
  const totalPages = Math.ceil(total / limit)

  // ── Map rows → response ─────────────────────────────────────────────────
  const transactions = dataResult.rows.map((tx: Record<string, unknown>) => ({
    id:                tx.id,
    tenantId:          tx.tenant_id,
    storeId:           tx.store_id,
    storeName:         tx.store_name ?? null,
    merchantId:        tx.merchant_id,
    accountName:       tx.account_name ?? null,
    accountClientId:   tx.account_client_id ?? null,
    originalAmount:    parseFloat(tx.original_amount as string),
    originalCurrency:  tx.original_currency ?? "USD",
    originalItemName:  tx.original_item_name ?? null,   // for admin audit
    maskedItemName:    tx.masked_item_name,
    gatewayFee:        parseFloat(tx.gateway_fee as string),
    status:            tx.status,
    paypalOrderId:     tx.paypal_order_id ?? null,
    paypalCaptureId:   tx.paypal_capture_id ?? null,
    customerEmail:     tx.customer_email ?? null,
    buyerIp:           tx.buyer_ip ?? null,
    buyerCountry:      tx.buyer_country ?? null,
    ipAddress:         tx.ip_address ?? null,
    createdAt:         tx.created_at,                    // ISO string from Neon
    updatedAt:         tx.updated_at,
  }))

  return NextResponse.json({
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  })
}
