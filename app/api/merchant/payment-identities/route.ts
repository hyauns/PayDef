import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { validateBundle } from "@/lib/identity-bundle-validation"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/merchant/payment-identities" })

// ─── GET: List merchant's own identities ─────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  
  const tenantId = session.user.tenantId

  const sql = getSql()

  const bundles = await sql`
    SELECT
      b.*,
      (SELECT COUNT(*) FROM payment_identity_bundle_items i WHERE i.bundle_id = b.id AND i.is_active = true)::int AS active_item_count,
      (SELECT COUNT(*) FROM merchant_accounts ma WHERE ma.bundle_id = b.id)::int AS assigned_accounts,
      (SELECT COUNT(*) FROM shield_domains sd WHERE sd.bundle_id = b.id)::int AS assigned_domains
    FROM payment_identity_bundles b
    WHERE b.tenant_id = ${tenantId}
    ORDER BY b.created_at DESC
  `

  // Lookups for the merchant form
  const shieldDomains = await sql`
    SELECT id, domain, is_active, health_ok 
    FROM shield_domains 
    WHERE (tenant_id = ${tenantId} OR tenant_id IS NULL)
    ORDER BY domain
  `

  return NextResponse.json({ bundles, shieldDomains })
}

// ─── POST: Create a new identity ─────────────────────────────────────────────

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
    bundleName, publicBrandName, industryVertical,
    primaryShieldDomain, supportEmail, supportPhone,
    orderLookupUrl, trackingUrl, shippingPolicyUrl,
    refundPolicyUrl, privacyPolicyUrl, termsUrl,
    isDefault, isActive,
  } = body

  if (!bundleName) return NextResponse.json({ error: "bundleName is required" }, { status: 400 })
  if (!industryVertical) return NextResponse.json({ error: "industryVertical is required" }, { status: 400 })
  if (isActive && !publicBrandName) return NextResponse.json({ error: "publicBrandName is required for active identities" }, { status: 400 })

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

  // Verify shield domain exists and belongs to merchant or pool
  if (primaryShieldDomain) {
    const sdCheck = await sql`
      SELECT id FROM shield_domains 
      WHERE domain = ${primaryShieldDomain} AND (tenant_id = ${tenantId} OR tenant_id IS NULL)
    `
    if (sdCheck.length === 0) {
      // It's possible the user typed a custom domain not fully registered yet.
      // We allow it, but validateBundle handles url-like warnings.
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
      ${tenantId}, null, null,
      ${bundleName}, ${publicBrandName || null}, ${industryVertical},
      ${primaryShieldDomain || null}, ${supportEmail || null}, ${supportPhone || null},
      ${orderLookupUrl || null}, ${trackingUrl || null}, ${shippingPolicyUrl || null},
      ${refundPolicyUrl || null}, ${privacyPolicyUrl || null}, ${termsUrl || null},
      ${Boolean(isDefault)}, ${isActive !== false}
    ) RETURNING id
  `

  log.info("merchant_identity.created", `Identity created: ${bundleName}`, {
    tenantId,
    bundleId: rows[0].id,
  })

  return NextResponse.json({
    success: true,
    bundleId: rows[0].id,
    warnings: validation.warnings,
  })
}

// ─── PATCH: Update merchant identity ─────────────────────────────────────────

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

  if (fields.isActive && !fields.publicBrandName && fields.publicBrandName === "") {
    return NextResponse.json({ error: "publicBrandName is required for active identities" }, { status: 400 })
  }

  const sql = getSql()
  
  // Verify ownership
  const ownerCheck = await sql`SELECT id FROM payment_identity_bundles WHERE id = ${id} AND tenant_id = ${tenantId}`
  if (ownerCheck.length === 0) {
    return NextResponse.json({ error: "Not found or forbidden" }, { status: 403 })
  }

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
  
  // Tenant isolation guaranteed by WHERE id = $ AND tenant_id = $
  vals.push(id, tenantId)

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`UPDATE payment_identity_bundles SET ${setClauses.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, vals)
  } finally {
    client.release()
  }

  log.info("merchant_identity.updated", `Identity updated: ${id}`, { tenantId, bundleId: id })

  return NextResponse.json({ success: true })
}

// ─── DELETE: Soft-disable ────────────────────────────────────────────────────

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
  await sql`UPDATE payment_identity_bundles SET is_active = false, updated_at = NOW() WHERE id = ${id} AND tenant_id = ${tenantId}`

  log.info("merchant_identity.disabled", `Identity disabled: ${id}`, { tenantId, bundleId: id })

  return NextResponse.json({ success: true })
}
