/**
 * GET /api/merchant/logs
 * Transaction history with pagination, search, and filtering.
 * Tenant-scoped for MERCHANT users.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const offset = (page - 1) * limit

  // Filters
  const search = searchParams.get("search")?.trim() ?? ""
  const status = searchParams.get("status")?.toUpperCase()
  const storeId = searchParams.get("storeId")
  const accountId = searchParams.get("accountId")
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")

  const sql = getSql()

  // Build WHERE conditions
  const conditions: string[] = []
  const values: (string | number)[] = []
  let paramIndex = 1

  // Tenant scoping for MERCHANT users
  if (role === "MERCHANT") {
    conditions.push(`t.tenant_id = $${paramIndex++}`)
    values.push(tenantId!)
  }

  if (status && ["PENDING", "COMPLETED", "FAILED", "REFUNDED", "DISPUTED"].includes(status)) {
    conditions.push(`t.status = $${paramIndex++}`)
    values.push(status)
  }

  if (storeId) {
    conditions.push(`t.store_id = $${paramIndex++}`)
    values.push(storeId)
  }

  if (accountId) {
    conditions.push(`t.merchant_id = $${paramIndex++}`)
    values.push(accountId)
  }

  if (startDate) {
    conditions.push(`t.created_at >= $${paramIndex++}`)
    values.push(startDate)
  }

  if (endDate) {
    conditions.push(`t.created_at <= $${paramIndex++}`)
    values.push(endDate)
  }

  if (search) {
    conditions.push(`(
      t.id::text ILIKE $${paramIndex} OR
      t.paypal_order_id ILIKE $${paramIndex} OR
      t.masked_item_name ILIKE $${paramIndex} OR
      s.name ILIKE $${paramIndex}
    )`)
    values.push(`%${search}%`)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Count total for pagination
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM transactions t
    LEFT JOIN stores s ON t.store_id = s.id
    ${whereClause}
  `

  // Main query with joins
  const dataQuery = `
    SELECT 
      t.id,
      t.tenant_id,
      t.store_id,
      t.merchant_id,
      t.original_amount,
      t.gateway_fee,
      t.status,
      t.masked_item_name,
      t.paypal_order_id,
      t.paypal_capture_id,
      t.buyer_ip,
      t.buyer_country,
      t.created_at,
      t.updated_at,
      s.name AS store_name,
      ma.client_id AS account_client_id,
      ma.shield_domain AS account_shield_domain
    FROM transactions t
    LEFT JOIN stores s ON t.store_id = s.id
    LEFT JOIN merchant_accounts ma ON t.merchant_id = ma.id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `

  values.push(limit, offset)

  // Execute queries using raw sql template with dynamic values
  // Since neon tagged template doesn't support dynamic WHERE, we use Pool
  const { getPool } = await import("@/lib/neon")
  const pool = getPool()

  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, values.slice(0, -2)),
    pool.query(dataQuery, values),
  ])

  const total = parseInt(countResult.rows[0]?.total ?? "0", 10)
  const totalPages = Math.ceil(total / limit)

  return NextResponse.json({
    transactions: dataResult.rows.map((tx) => ({
      id: tx.id,
      tenantId: tx.tenant_id,
      storeId: tx.store_id,
      storeName: tx.store_name,
      merchantId: tx.merchant_id,
      accountClientId: tx.account_client_id,
      accountShieldDomain: tx.account_shield_domain,
      originalAmount: parseFloat(tx.original_amount),
      gatewayFee: parseFloat(tx.gateway_fee),
      status: tx.status,
      maskedItemName: tx.masked_item_name,
      paypalOrderId: tx.paypal_order_id,
      paypalCaptureId: tx.paypal_capture_id,
      buyerIp: tx.buyer_ip,
      buyerCountry: tx.buyer_country,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  })
}
