import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { resolvePaymentDisplayProfile, buildPaymentDisplayName, INDUSTRY_DESCRIPTOR_POOLS } from "@/lib/payment-display-profiles"
import { sanitizePayPalField } from "@/lib/masking"

// ─── Validation Helpers ────────────────────────────────────────────────────────

const VALID_VERTICALS = [
  "automotive_tires", "electronics", "home_goods", "toys", "beauty", "apparel", "generic_ecommerce"
]
const VALID_MODES = ["REAL_SANITIZED", "SEMANTIC_ORDER", "BRAND_SEMANTIC", "LEGACY_GENERIC"]
const VALID_POLICIES = ["SINGLE_SEMANTIC_ITEM", "REAL_CART_ITEMS", "LEGACY_RANDOM_SPLIT"]

function sanitizeText(text: string): string {
  if (!text) return ""
  return sanitizePayPalField(text)
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { tenantId } = session.user
  const url = new URL(req.url)
  const storeId = url.searchParams.get("storeId")

  if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 })

  const sql = getSql()
  
  // Verify store belongs to tenant
  const storeRows = await sql`SELECT id, name FROM stores WHERE id = ${storeId} AND tenant_id = ${tenantId}`
  if (storeRows.length === 0) return NextResponse.json({ error: "Store not found" }, { status: 404 })
  
  const storeName = storeRows[0].name

  const profile = await resolvePaymentDisplayProfile({
    tenantId,
    storeId,
    storeName
  })

  // Additionally fetch the raw DB row if one exists to populate the form accurately
  // If the source is 'store_profile' or 'store_default', we have a specific row.
  let rawProfile = null
  if (profile.profileId) {
    const rows = await sql`
      SELECT id, industry_vertical, public_brand_name, descriptor_prefix, display_mode, line_item_policy
      FROM payment_display_profiles
      WHERE id = ${profile.profileId} AND tenant_id = ${tenantId}
    `
    if (rows.length > 0) rawProfile = rows[0]
  }

  return NextResponse.json({ profile, rawProfile })
}

// ─── PATCH Handler (Save) ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { tenantId, role } = session.user
  if (role !== "MERCHANT") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { storeId, industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy } = body

  if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 })
  
  if (!VALID_VERTICALS.includes(industryVertical)) return NextResponse.json({ error: "Invalid industry vertical" }, { status: 400 })
  if (!VALID_MODES.includes(displayMode)) return NextResponse.json({ error: "Invalid display mode" }, { status: 400 })
  if (!VALID_POLICIES.includes(lineItemPolicy)) return NextResponse.json({ error: "Invalid line item policy" }, { status: 400 })

  const safeBrandName = publicBrandName ? sanitizeText(publicBrandName) : null
  const safePrefix = descriptorPrefix ? sanitizeText(descriptorPrefix) : null

  const sql = getSql()
  
  // Verify store belongs to tenant
  const storeRows = await sql`SELECT id FROM stores WHERE id = ${storeId} AND tenant_id = ${tenantId}`
  if (storeRows.length === 0) return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const pool = getPool()
  const client = await pool.connect()
  let profileId

  try {
    await client.query("BEGIN")
    
    // Check if there is an existing profile for this store
    const existingProfiles = await client.query(`
      SELECT id FROM payment_display_profiles
      WHERE store_id = $1 AND tenant_id = $2
    `, [storeId, tenantId])

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
      `, [tenantId, storeId, industryVertical, safeBrandName, safePrefix, displayMode, lineItemPolicy])
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

  const { industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy, realItemName } = body

  const safeBrandName = publicBrandName ? sanitizeText(publicBrandName) : null
  const safePrefix = descriptorPrefix ? sanitizeText(descriptorPrefix) : null

  // Create a mock resolved profile based on inputs
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
