/**
 * GET /api/merchant/stores
 * Returns stores owned by the logged-in merchant (tenant-scoped).
 *
 * POST /api/merchant/stores
 * Creates a new store for the logged-in merchant.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"

// Generate a secure API key (prefix + random bytes)
function generateApiKey(): string {
  const prefix = "gw_live_"
  const random = randomBytes(24).toString("base64url")
  return `${prefix}${random}`
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const sql = getSql()

  const stores = role === "SUPER_ADMIN"
    ? await sql`
        SELECT 
          s.id, s.tenant_id, s.name, s.webhook_url, s.is_active, 
          s.created_at, s.updated_at,
          t.name AS tenant_name
        FROM stores s
        LEFT JOIN tenants t ON s.tenant_id = t.id
        ORDER BY s.created_at DESC
      `
    : await sql`
        SELECT 
          id, tenant_id, name, webhook_url, is_active, 
          created_at, updated_at
        FROM stores
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `

  // Get transaction counts per store
  const storeIds = stores.map((s: { id: string }) => s.id)
  
  let txCounts: Record<string, { count: number; volume: number }> = {}
  if (storeIds.length > 0) {
    const countQuery = role === "SUPER_ADMIN"
      ? await sql`
          SELECT store_id, COUNT(*) AS count, COALESCE(SUM(original_amount), 0) AS volume
          FROM transactions
          GROUP BY store_id
        `
      : await sql`
          SELECT store_id, COUNT(*) AS count, COALESCE(SUM(original_amount), 0) AS volume
          FROM transactions
          WHERE tenant_id = ${tenantId}
          GROUP BY store_id
        `
    
    txCounts = countQuery.reduce(
      (acc: Record<string, { count: number; volume: number }>, row: { store_id: string; count: string; volume: string }) => {
        acc[row.store_id] = {
          count: parseInt(row.count, 10),
          volume: parseFloat(row.volume),
        }
        return acc
      },
      {}
    )
  }

  return NextResponse.json({
    stores: stores.map((store: {
      id: string
      tenant_id: string
      tenant_name?: string
      name: string
      webhook_url: string | null
      is_active: boolean
      created_at: string
      updated_at: string
    }) => ({
      id: store.id,
      tenantId: store.tenant_id,
      tenantName: store.tenant_name,
      name: store.name,
      webhookUrl: store.webhook_url,
      isActive: store.is_active,
      transactionCount: txCounts[store.id]?.count ?? 0,
      totalVolume: txCounts[store.id]?.volume ?? 0,
      createdAt: store.created_at,
      updatedAt: store.updated_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role !== "MERCHANT" || !tenantId) {
    return NextResponse.json({ error: "Only merchants can create stores" }, { status: 403 })
  }

  const body = await req.json()
  const { name, webhookUrl } = body

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Store name is required (min 2 chars)" }, { status: 400 })
  }

  const sql = getSql()

  // Generate API key and hash it
  const apiKey = generateApiKey()
  const apiKeyHash = await bcrypt.hash(apiKey, 12)

  const result = await sql`
    INSERT INTO stores (tenant_id, name, api_key_hash, webhook_url)
    VALUES (${tenantId}, ${name.trim()}, ${apiKeyHash}, ${webhookUrl ?? null})
    RETURNING id, name, webhook_url, is_active, created_at
  `

  const store = result[0]

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.name,
      webhookUrl: store.webhook_url,
      isActive: store.is_active,
      createdAt: store.created_at,
    },
    // Return the plaintext API key ONLY on creation — never stored or retrievable again
    apiKey,
  }, { status: 201 })
}
