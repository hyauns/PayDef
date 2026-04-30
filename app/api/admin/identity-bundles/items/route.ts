import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { validateBundleItem } from "@/lib/identity-bundle-validation"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/admin/identity-bundles/items" })

// ─── GET: List items for a bundle ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const bundleId = searchParams.get("bundleId")
  if (!bundleId) return NextResponse.json({ error: "bundleId is required" }, { status: 400 })

  const sql = getSql()
  const items = await sql`
    SELECT * FROM payment_identity_bundle_items
    WHERE bundle_id = ${bundleId}
    ORDER BY sort_order ASC, created_at ASC
  `

  return NextResponse.json({ items })
}

// ─── POST: Create a new bundle item ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    bundleId, descriptorName, productSlug, productTitle,
    productDescription, productType, shippingRequired,
    trackingExpected, priceMin, priceMax, imageUrl,
    isActive, sortOrder,
  } = body

  if (!bundleId) return NextResponse.json({ error: "bundleId is required" }, { status: 400 })
  if (!descriptorName) return NextResponse.json({ error: "descriptorName is required" }, { status: 400 })
  if (!productTitle) return NextResponse.json({ error: "productTitle is required" }, { status: 400 })

  // Validate with bundle item validation helper
  const validation = validateBundleItem({
    descriptor_name: descriptorName,
    product_title: productTitle,
    product_description: productDescription,
    product_type: productType || "physical_good",
    shipping_required: shippingRequired,
    tracking_expected: trackingExpected,
  })

  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join("; "), errors: validation.errors }, { status: 400 })
  }

  const sql = getSql()

  // Validate bundle exists and get tenant_id from it
  const bundleCheck = await sql`SELECT id, tenant_id FROM payment_identity_bundles WHERE id = ${bundleId}`
  if (bundleCheck.length === 0) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 400 })
  }
  const tenantId = bundleCheck[0].tenant_id

  const rows = await sql`
    INSERT INTO payment_identity_bundle_items (
      tenant_id, bundle_id, descriptor_name, product_slug, product_title,
      product_description, product_type, shipping_required, tracking_expected,
      price_min, price_max, image_url, is_active, sort_order
    ) VALUES (
      ${tenantId}, ${bundleId}, ${descriptorName}, ${productSlug || null}, ${productTitle},
      ${productDescription || null}, ${productType || "physical_good"},
      ${shippingRequired !== false}, ${trackingExpected !== false},
      ${priceMin ?? null}, ${priceMax ?? null}, ${imageUrl || null},
      ${isActive !== false}, ${sortOrder ?? 0}
    ) RETURNING id
  `

  log.info("identity_bundle_item.created", `Item created: ${descriptorName}`, {
    tenantId,
    bundleId,
    itemId: rows[0].id,
  })

  return NextResponse.json({
    success: true,
    itemId: rows[0].id,
    warnings: validation.warnings,
  })
}

// ─── PATCH: Update an existing item ──────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  // Validate if descriptor/title fields are present
  if (fields.descriptorName || fields.productTitle) {
    const validation = validateBundleItem({
      descriptor_name: fields.descriptorName || "placeholder",
      product_title: fields.productTitle || "placeholder",
      product_description: fields.productDescription,
      product_type: fields.productType || "physical_good",
      shipping_required: fields.shippingRequired,
      tracking_expected: fields.trackingExpected,
    })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; "), errors: validation.errors }, { status: 400 })
    }
  }

  const sql = getSql()

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
      vals.push(val === "" ? null : val ?? null)
    }
  }

  if (setClauses.length === 0) return NextResponse.json({ success: true })

  setClauses.push("updated_at = NOW()")
  vals.push(id)

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`UPDATE payment_identity_bundle_items SET ${setClauses.join(", ")} WHERE id = $${idx}`, vals)
  } finally {
    client.release()
  }

  log.info("identity_bundle_item.updated", `Item updated: ${id}`, { itemId: id })

  return NextResponse.json({ success: true })
}

// ─── DELETE: Soft-delete item ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const sql = getSql()
  await sql`UPDATE payment_identity_bundle_items SET is_active = false, updated_at = NOW() WHERE id = ${id}`

  log.info("identity_bundle_item.disabled", `Item disabled: ${id}`, { itemId: id })

  return NextResponse.json({ success: true })
}
