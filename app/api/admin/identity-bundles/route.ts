import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { validateBundle } from "@/lib/identity-bundle-validation"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/admin/identity-bundles" })

// ─── GET: List all bundles with counts ───────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  const bundles = await sql`
    SELECT
      b.*,
      t.name AS tenant_name,
      s.name AS store_name,
      pdp.profile_name AS display_profile_name,
      (SELECT COUNT(*) FROM payment_identity_bundle_items i WHERE i.bundle_id = b.id AND i.is_active = true)::int AS active_item_count,
      (SELECT COUNT(*) FROM merchant_accounts ma WHERE ma.bundle_id = b.id)::int AS assigned_accounts,
      (SELECT COUNT(*) FROM shield_domains sd WHERE sd.bundle_id = b.id)::int AS assigned_domains
    FROM payment_identity_bundles b
    LEFT JOIN tenants t ON b.tenant_id = t.id
    LEFT JOIN stores s ON b.store_id = s.id
    LEFT JOIN payment_display_profiles pdp ON b.display_profile_id = pdp.id
    ORDER BY b.created_at DESC
  `

  // Also fetch lookup data for create/edit forms
  const tenants = await sql`SELECT id, name FROM tenants ORDER BY name`
  const stores = await sql`SELECT id, name, tenant_id FROM stores ORDER BY name`
  const profiles = await sql`SELECT id, profile_name, tenant_id, store_id FROM payment_display_profiles WHERE is_active = true ORDER BY profile_name`

  return NextResponse.json({ bundles, tenants, stores, profiles })
}

// ─── POST: Create a new bundle ───────────────────────────────────────────────

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
    tenantId, storeId, displayProfileId,
    bundleName, publicBrandName, industryVertical,
    primaryShieldDomain, supportEmail, supportPhone,
    orderLookupUrl, trackingUrl, shippingPolicyUrl,
    refundPolicyUrl, privacyPolicyUrl, termsUrl,
    isDefault, isActive,
  } = body

  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 })
  if (!bundleName) return NextResponse.json({ error: "bundleName is required" }, { status: 400 })
  if (!industryVertical) return NextResponse.json({ error: "industryVertical is required" }, { status: 400 })

  // Validate with bundle validation helper
  const validation = validateBundle({
    bundle_name: bundleName,
    public_brand_name: publicBrandName,
    industry_vertical: industryVertical,
    primary_shield_domain: primaryShieldDomain,
    support_email: supportEmail,
    support_phone: supportPhone,
    order_lookup_url: orderLookupUrl,
    tracking_url: trackingUrl,
    shipping_policy_url: shippingPolicyUrl,
    refund_policy_url: refundPolicyUrl,
    privacy_policy_url: privacyPolicyUrl,
    terms_url: termsUrl,
  })

  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join("; "), errors: validation.errors }, { status: 400 })
  }

  const sql = getSql()

  // Validate tenant exists
  const tenantCheck = await sql`SELECT id FROM tenants WHERE id = ${tenantId}`
  if (tenantCheck.length === 0) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 400 })
  }

  // Validate store belongs to tenant if provided
  if (storeId) {
    const storeCheck = await sql`SELECT id FROM stores WHERE id = ${storeId} AND tenant_id = ${tenantId}`
    if (storeCheck.length === 0) {
      return NextResponse.json({ error: "Store not found or does not belong to tenant" }, { status: 400 })
    }
  }

  // Validate display profile belongs to same context if provided
  if (displayProfileId) {
    const dpCheck = await sql`SELECT id FROM payment_display_profiles WHERE id = ${displayProfileId} AND tenant_id = ${tenantId}`
    if (dpCheck.length === 0) {
      return NextResponse.json({ error: "Display profile not found or does not belong to tenant" }, { status: 400 })
    }
  }

  const rows = await sql`
    INSERT INTO payment_identity_bundles (
      tenant_id, store_id, display_profile_id,
      bundle_name, public_brand_name, industry_vertical,
      primary_shield_domain, support_email, support_phone,
      order_lookup_url, tracking_url, shipping_policy_url,
      refund_policy_url, privacy_policy_url, terms_url,
      is_default, is_active
    ) VALUES (
      ${tenantId}, ${storeId || null}, ${displayProfileId || null},
      ${bundleName}, ${publicBrandName || null}, ${industryVertical},
      ${primaryShieldDomain || null}, ${supportEmail || null}, ${supportPhone || null},
      ${orderLookupUrl || null}, ${trackingUrl || null}, ${shippingPolicyUrl || null},
      ${refundPolicyUrl || null}, ${privacyPolicyUrl || null}, ${termsUrl || null},
      ${Boolean(isDefault)}, ${isActive !== false}
    ) RETURNING id
  `

  log.info("identity_bundle.created", `Bundle created: ${bundleName}`, {
    tenantId,
    storeId,
    bundleId: rows[0].id,
  })

  return NextResponse.json({
    success: true,
    bundleId: rows[0].id,
    warnings: validation.warnings,
  })
}

// ─── PATCH: Update an existing bundle ────────────────────────────────────────

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

  // Validate with bundle validation helper if text fields are present
  if (fields.bundleName || fields.publicBrandName || fields.supportEmail) {
    const validation = validateBundle({
      bundle_name: fields.bundleName || "placeholder",
      public_brand_name: fields.publicBrandName,
      industry_vertical: fields.industryVertical || "generic_ecommerce",
      support_email: fields.supportEmail,
      order_lookup_url: fields.orderLookupUrl,
      tracking_url: fields.trackingUrl,
      shipping_policy_url: fields.shippingPolicyUrl,
      refund_policy_url: fields.refundPolicyUrl,
      privacy_policy_url: fields.privacyPolicyUrl,
      terms_url: fields.termsUrl,
    })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; "), errors: validation.errors }, { status: 400 })
    }
  }

  const sql = getSql()

  // Build dynamic SET clause
  const setClauses: string[] = []
  const vals: any[] = []
  let idx = 1

  const fieldMap: Record<string, string> = {
    bundleName: "bundle_name",
    publicBrandName: "public_brand_name",
    industryVertical: "industry_vertical",
    primaryShieldDomain: "primary_shield_domain",
    supportEmail: "support_email",
    supportPhone: "support_phone",
    orderLookupUrl: "order_lookup_url",
    trackingUrl: "tracking_url",
    shippingPolicyUrl: "shipping_policy_url",
    refundPolicyUrl: "refund_policy_url",
    privacyPolicyUrl: "privacy_policy_url",
    termsUrl: "terms_url",
    displayProfileId: "display_profile_id",
    storeId: "store_id",
    isDefault: "is_default",
    isActive: "is_active",
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
  vals.push(id)

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`UPDATE payment_identity_bundles SET ${setClauses.join(", ")} WHERE id = $${idx}`, vals)
  } finally {
    client.release()
  }

  log.info("identity_bundle.updated", `Bundle updated: ${id}`, { bundleId: id })

  return NextResponse.json({ success: true })
}

// ─── DELETE: Soft-delete (set is_active = false) ─────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const sql = getSql()
  await sql`UPDATE payment_identity_bundles SET is_active = false, updated_at = NOW() WHERE id = ${id}`

  log.info("identity_bundle.disabled", `Bundle disabled: ${id}`, { bundleId: id })

  return NextResponse.json({ success: true })
}
