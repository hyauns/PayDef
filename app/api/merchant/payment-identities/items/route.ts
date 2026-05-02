import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/merchant/payment-identities/items" })

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  const { searchParams } = new URL(req.url)
  const bundleId = searchParams.get("bundleId")
  if (!bundleId) return NextResponse.json({ error: "Missing bundleId" }, { status: 400 })

  const sql = getSql()
  
  // Verify bundle ownership
  const ownerCheck = await sql`SELECT id FROM payment_identity_bundles WHERE id = ${bundleId} AND tenant_id = ${tenantId}`
  if (ownerCheck.length === 0) {
    return NextResponse.json({ error: "Forbidden or bundle not found" }, { status: 403 })
  }

  const items = await sql`
    SELECT * FROM payment_identity_bundle_items
    WHERE bundle_id = ${bundleId} AND tenant_id = ${tenantId}
    ORDER BY sort_order ASC, created_at ASC
  `
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    bundleId, descriptorName, productSlug, productTitle,
    productDescription, productType, shippingRequired, trackingExpected,
    priceMin, priceMax, imageUrl, isActive, sortOrder
  } = body

  if (!bundleId || !descriptorName || !productTitle || !productType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const sql = getSql()

  // Verify ownership
  const ownerCheck = await sql`SELECT id FROM payment_identity_bundles WHERE id = ${bundleId} AND tenant_id = ${tenantId}`
  if (ownerCheck.length === 0) {
    return NextResponse.json({ error: "Forbidden or bundle not found" }, { status: 403 })
  }

  const rows = await sql`
    INSERT INTO payment_identity_bundle_items (
      tenant_id, bundle_id, descriptor_name, product_slug, product_title,
      product_description, product_type, shipping_required, tracking_expected,
      price_min, price_max, image_url, is_active, sort_order
    ) VALUES (
      ${tenantId}, ${bundleId}, ${descriptorName}, ${productSlug || null}, ${productTitle},
      ${productDescription || null}, ${productType}, ${Boolean(shippingRequired)}, ${Boolean(trackingExpected)},
      ${priceMin || null}, ${priceMax || null}, ${imageUrl || null}, ${isActive !== false}, ${sortOrder || 0}
    ) RETURNING id
  `

  log.info("merchant_identity_item.created", `Item created for bundle ${bundleId}`, { tenantId, bundleId, itemId: rows[0].id })
  return NextResponse.json({ success: true, itemId: rows[0].id })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const setClauses: string[] = []
  const vals: any[] = []
  let idx = 1

  const fieldMap: Record<string, string> = {
    descriptorName: "descriptor_name",
    productSlug: "product_slug",
    productTitle: "product_title",
    productDescription: "product_description",
    productType: "product_type",
    shippingRequired: "shipping_required",
    trackingExpected: "tracking_expected",
    priceMin: "price_min",
    priceMax: "price_max",
    imageUrl: "image_url",
    isActive: "is_active",
    sortOrder: "sort_order",
  }

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (fields[jsKey] !== undefined) {
      setClauses.push(`${dbCol} = $${idx++}`)
      const val = fields[jsKey]
      vals.push(val === "" ? null : typeof val === "boolean" ? val : val ?? null)
    }
  }

  if (setClauses.length === 0) return NextResponse.json({ success: true })

  setClauses.push("updated_at = NOW()")
  vals.push(id, tenantId)

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`UPDATE payment_identity_bundle_items SET ${setClauses.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, vals)
  } finally {
    client.release()
  }

  log.info("merchant_identity_item.updated", `Item updated: ${id}`, { tenantId, itemId: id })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const sql = getSql()
  await sql`UPDATE payment_identity_bundle_items SET is_active = false, updated_at = NOW() WHERE id = ${id} AND tenant_id = ${tenantId}`

  log.info("merchant_identity_item.disabled", `Item disabled: ${id}`, { tenantId, itemId: id })
  return NextResponse.json({ success: true })
}
