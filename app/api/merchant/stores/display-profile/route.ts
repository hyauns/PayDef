import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { resolvePaymentDisplayProfile, buildPaymentDisplayName, INDUSTRY_DESCRIPTOR_POOLS } from "@/lib/payment-display-profiles"
import { createLogger } from "@/lib/logger"
import { validateProfileField } from "@/lib/profile-validation"

const moduleLog = createLogger({ route: "/api/merchant/stores/display-profile" })

// ─── Validation Helpers ────────────────────────────────────────────────────────

const VALID_VERTICALS = [
  "automotive_tires", "electronics", "home_goods", "toys", "beauty", "apparel", "generic_ecommerce"
]
const VALID_MODES = ["REAL_SANITIZED", "SEMANTIC_ORDER", "BRAND_SEMANTIC", "LEGACY_GENERIC"]
const VALID_POLICIES = ["SINGLE_SEMANTIC_ITEM", "REAL_CART_ITEMS", "LEGACY_RANDOM_SPLIT"]

// Removed sanitizeText in favor of validateProfileField

// ─── Ownership Guard ───────────────────────────────────────────────────────────

async function assertMerchantCanAccessStore(session: any, storeId: string, sql: any): Promise<boolean> {
  if (!session?.user || !storeId) return false
  const { tenantId, role } = session.user
  
  if (role === "SUPER_ADMIN") return true
  if (!tenantId) return false
  
  const rows = await sql`SELECT id FROM stores WHERE id = ${storeId} AND tenant_id = ${tenantId}`
  return rows.length > 0
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const storeId = url.searchParams.get("storeId")

  if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 })

  const sql = getSql()
  
  if (!(await assertMerchantCanAccessStore(session, storeId, sql))) {
    moduleLog.warn("payment_display_profile.ownership_denied", "GET denied", {
      storeId,
      userId: session.user.userId || session.user.email,
      reason: "Foreign store GET access denied"
    })
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }
  
  const storeRows = await sql`SELECT id, name, tenant_id FROM stores WHERE id = ${storeId}`
  if (storeRows.length === 0) return NextResponse.json({ error: "Store not found" }, { status: 404 })
  
  const storeName = storeRows[0].name
  const actualTenantId = storeRows[0].tenant_id

  const profile = await resolvePaymentDisplayProfile({
    tenantId: actualTenantId,
    storeId,
    storeName
  })

  let rawProfile = null
  if (profile.profileId) {
    const rows = await sql`
      SELECT id, industry_vertical, public_brand_name, descriptor_prefix, display_mode, line_item_policy
      FROM payment_display_profiles
      WHERE id = ${profile.profileId} AND tenant_id = ${actualTenantId}
    `
    if (rows.length > 0) rawProfile = rows[0]
  }

  return NextResponse.json({ profile, rawProfile })
}

// ─── PATCH Handler (Save) ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { storeId, industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy } = body

  // ── DEBUG: Log what the backend actually receives ──
  moduleLog.info("payment_display_profile.validation_debug", "PATCH body received", {
    route: "/api/merchant/stores/display-profile",
    method: "PATCH",
    fieldNamesPresent: Object.keys(body),
    descriptorPrefixPresent: descriptorPrefix !== undefined,
    descriptorPrefixType: typeof descriptorPrefix,
    descriptorPrefixLength: typeof descriptorPrefix === "string" ? descriptorPrefix.length : -1,
    descriptorPrefixContainsAt: typeof descriptorPrefix === "string" ? descriptorPrefix.includes("@") : false,
    descriptorPrefixContainsDot: typeof descriptorPrefix === "string" ? descriptorPrefix.includes(".") : false,
    publicBrandNamePresent: publicBrandName !== undefined,
    publicBrandNameLength: typeof publicBrandName === "string" ? publicBrandName.length : -1,
  })
  // ── END DEBUG ──

  if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 })
  
  if (!VALID_VERTICALS.includes(industryVertical)) return NextResponse.json({ error: "Invalid industry vertical" }, { status: 400 })
  if (!VALID_MODES.includes(displayMode)) return NextResponse.json({ error: "Invalid display mode" }, { status: 400 })
  if (!VALID_POLICIES.includes(lineItemPolicy)) return NextResponse.json({ error: "Invalid line item policy" }, { status: 400 })

  const brandValidation = validateProfileField("Public Brand Name", publicBrandName)
  moduleLog.info("payment_display_profile.validation_result", "Brand validation", { field: "publicBrandName", valid: brandValidation.valid, reason: brandValidation.error || "passed" })
  if (!brandValidation.valid) {
    return NextResponse.json({ error: brandValidation.error, field: "publicBrandName" }, { status: 400 })
  }
  const prefixValidation = validateProfileField("Descriptor Prefix", descriptorPrefix)
  moduleLog.info("payment_display_profile.validation_result", "Prefix validation", { field: "descriptorPrefix", valid: prefixValidation.valid, reason: prefixValidation.error || "passed" })
  if (!prefixValidation.valid) {
    return NextResponse.json({ error: prefixValidation.error, field: "descriptorPrefix" }, { status: 400 })
  }

  const safeBrandName = brandValidation.value || null
  const safePrefix = prefixValidation.value || null

  const sql = getSql()
  
  if (!(await assertMerchantCanAccessStore(session, storeId, sql))) {
    moduleLog.warn("payment_display_profile.ownership_denied", "PATCH denied", {
      storeId,
      userId: session.user.userId || session.user.email,
      reason: "Foreign store PATCH update denied"
    })
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }

  const storeRows = await sql`SELECT id, tenant_id FROM stores WHERE id = ${storeId}`
  if (storeRows.length === 0) return NextResponse.json({ error: "Store not found" }, { status: 404 })
  
  const actualTenantId = storeRows[0].tenant_id

  const pool = getPool()
  const client = await pool.connect()
  let profileId

  try {
    await client.query("BEGIN")
    
    const existingProfiles = await client.query(`
      SELECT id FROM payment_display_profiles
      WHERE store_id = $1 AND tenant_id = $2
    `, [storeId, actualTenantId])

    if (existingProfiles.rows.length > 0) {
      profileId = existingProfiles.rows[0].id
      await client.query(`
        UPDATE payment_display_profiles
        SET industry_vertical = $1,
            public_brand_name = $2,
            descriptor_prefix = $3,
            display_mode = $4,
            line_item_policy = $5,
            is_default = true,
            updated_at = NOW()
        WHERE id = $6
      `, [industryVertical, safeBrandName, safePrefix, displayMode, lineItemPolicy, profileId])
    } else {
      const inserted = await client.query(`
        INSERT INTO payment_display_profiles (
          tenant_id, store_id, profile_name, industry_vertical, public_brand_name, descriptor_prefix, display_mode, line_item_policy, is_default, is_active
        ) VALUES (
          $1, $2, 'Store Profile', $3, $4, $5, $6, $7, true, true
        ) RETURNING id
      `, [actualTenantId, storeId, industryVertical, safeBrandName, safePrefix, displayMode, lineItemPolicy])
      profileId = inserted.rows[0].id
    }

    // Ensure store's default_display_profile_id points to this profile
    await client.query(`UPDATE stores SET default_display_profile_id = $1 WHERE id = $2`, [profileId, storeId])

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }

  return NextResponse.json({ success: true, profileId, message: "Profile updated successfully" })
}

// ─── POST Handler (Preview) ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { storeId, industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy, realItemName } = body

  if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 })

  const sql = getSql()
  
  if (!(await assertMerchantCanAccessStore(session, storeId, sql))) {
    moduleLog.warn("payment_display_profile.ownership_denied", "POST preview denied", {
      storeId,
      userId: session.user.userId || session.user.email,
      reason: "Foreign store POST preview denied"
    })
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }

  const brandValidation = validateProfileField("Public Brand Name", publicBrandName)
  if (!brandValidation.valid) {
    moduleLog.warn("payment_display_profile.validation_failed", "Validation failed", { field: "Public Brand Name", reason: brandValidation.error, route: "/api/merchant/stores/display-profile" })
    return NextResponse.json({ error: brandValidation.error }, { status: 400 })
  }
  const prefixValidation = validateProfileField("Descriptor Prefix", descriptorPrefix)
  if (!prefixValidation.valid) {
    moduleLog.warn("payment_display_profile.validation_failed", "Validation failed", { field: "Descriptor Prefix", reason: prefixValidation.error, route: "/api/merchant/stores/display-profile" })
    return NextResponse.json({ error: prefixValidation.error }, { status: 400 })
  }

  const safeBrandName = brandValidation.value || null
  const safePrefix = prefixValidation.value || null

  // @ts-ignore
  const profile: any = {
    industryVertical: VALID_VERTICALS.includes(industryVertical) ? industryVertical : "generic_ecommerce",
    displayMode: VALID_MODES.includes(displayMode) ? displayMode : "LEGACY_GENERIC",
    lineItemPolicy: VALID_POLICIES.includes(lineItemPolicy) ? lineItemPolicy : "SINGLE_SEMANTIC_ITEM",
    publicBrandName: safeBrandName,
    descriptorPrefix: safePrefix,
    descriptorPool: INDUSTRY_DESCRIPTOR_POOLS[industryVertical as keyof typeof INDUSTRY_DESCRIPTOR_POOLS] || INDUSTRY_DESCRIPTOR_POOLS.generic_ecommerce
  }

  const previewName = buildPaymentDisplayName({
    profile,
    realItemName: realItemName || "Sample Real Product Description",
    seed: "preview_seed_123"
  })

  return NextResponse.json({ previewName })
}
