import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { sanitizePayPalField } from "@/lib/masking"

const VALID_VERTICALS = [
  "automotive_tires", "electronics", "home_goods", "toys", "beauty", "apparel", "generic_ecommerce"
]
const VALID_MODES = ["REAL_SANITIZED", "SEMANTIC_ORDER", "BRAND_SEMANTIC", "LEGACY_GENERIC"]
const VALID_POLICIES = ["SINGLE_SEMANTIC_ITEM", "REAL_CART_ITEMS", "LEGACY_RANDOM_SPLIT"]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()
  // Fetch profiles with store name and tenant info
  const profiles = await sql`
    SELECT 
      p.id, p.tenant_id, p.store_id, p.profile_name, p.industry_vertical,
      p.public_brand_name, p.descriptor_prefix, p.display_mode,
      p.line_item_policy, p.is_default, p.is_active, p.created_at,
      s.name as store_name, t.name as tenant_name
    FROM payment_display_profiles p
    LEFT JOIN stores s ON p.store_id = s.id
    LEFT JOIN tenants t ON p.tenant_id = t.id
    ORDER BY p.created_at DESC
  `
  
  // Fetch all stores to allow creation
  const stores = await sql`
    SELECT s.id, s.name, s.tenant_id, t.name as tenant_name
    FROM stores s
    LEFT JOIN tenants t ON s.tenant_id = t.id
    ORDER BY t.name, s.name
  `

  return NextResponse.json({ profiles, stores })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { storeId, profileName, industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy, isDefault, isActive } = body

  if (!storeId || !profileName) return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  if (!VALID_VERTICALS.includes(industryVertical)) return NextResponse.json({ error: "Invalid vertical" }, { status: 400 })
  if (!VALID_MODES.includes(displayMode)) return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
  if (!VALID_POLICIES.includes(lineItemPolicy)) return NextResponse.json({ error: "Invalid policy" }, { status: 400 })

  const safeBrandName = publicBrandName ? sanitizePayPalField(publicBrandName) : null
  const safePrefix = descriptorPrefix ? sanitizePayPalField(descriptorPrefix) : null
  const safeProfileName = sanitizePayPalField(profileName)

  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Get tenantId from storeId
    const storeRes = await client.query("SELECT tenant_id FROM stores WHERE id = $1", [storeId])
    if (storeRes.rows.length === 0) throw new Error("Store not found")
    const tenantId = storeRes.rows[0].tenant_id

    const insertRes = await client.query(`
      INSERT INTO payment_display_profiles (
        tenant_id, store_id, profile_name, industry_vertical, public_brand_name, descriptor_prefix, display_mode, line_item_policy, is_default, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, [tenantId, storeId, safeProfileName, industryVertical, safeBrandName, safePrefix, displayMode, lineItemPolicy, Boolean(isDefault), Boolean(isActive)])

    const profileId = insertRes.rows[0].id

    if (isDefault) {
      // Unset other defaults for this store
      await client.query(`UPDATE payment_display_profiles SET is_default = false WHERE store_id = $1 AND id != $2`, [storeId, profileId])
      await client.query(`UPDATE stores SET default_display_profile_id = $1 WHERE id = $2`, [profileId, storeId])
    }

    await client.query("COMMIT")
    return NextResponse.json({ success: true, profileId })
  } catch (err) {
    await client.query("ROLLBACK")
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, profileName, industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy, isDefault, isActive } = body

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  
  const updates: string[] = []
  const values: any[] = []
  let idx = 1

  if (profileName !== undefined) {
    updates.push(`profile_name = $${idx++}`)
    values.push(sanitizePayPalField(profileName))
  }
  if (industryVertical !== undefined && VALID_VERTICALS.includes(industryVertical)) {
    updates.push(`industry_vertical = $${idx++}`)
    values.push(industryVertical)
  }
  if (publicBrandName !== undefined) {
    updates.push(`public_brand_name = $${idx++}`)
    values.push(publicBrandName ? sanitizePayPalField(publicBrandName) : null)
  }
  if (descriptorPrefix !== undefined) {
    updates.push(`descriptor_prefix = $${idx++}`)
    values.push(descriptorPrefix ? sanitizePayPalField(descriptorPrefix) : null)
  }
  if (displayMode !== undefined && VALID_MODES.includes(displayMode)) {
    updates.push(`display_mode = $${idx++}`)
    values.push(displayMode)
  }
  if (lineItemPolicy !== undefined && VALID_POLICIES.includes(lineItemPolicy)) {
    updates.push(`line_item_policy = $${idx++}`)
    values.push(lineItemPolicy)
  }
  if (isDefault !== undefined) {
    updates.push(`is_default = $${idx++}`)
    values.push(Boolean(isDefault))
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${idx++}`)
    values.push(Boolean(isActive))
  }

  if (updates.length === 0) return NextResponse.json({ success: true })

  updates.push(`updated_at = NOW()`)
  values.push(id)

  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Get store_id before updating
    const curRes = await client.query("SELECT store_id FROM payment_display_profiles WHERE id = $1", [id])
    if (curRes.rows.length === 0) throw new Error("Profile not found")
    const storeId = curRes.rows[0].store_id

    await client.query(`UPDATE payment_display_profiles SET ${updates.join(", ")} WHERE id = $${idx}`, values)

    if (isDefault === true) {
      await client.query(`UPDATE payment_display_profiles SET is_default = false WHERE store_id = $1 AND id != $2`, [storeId, id])
      await client.query(`UPDATE stores SET default_display_profile_id = $1 WHERE id = $2`, [id, storeId])
    } else if (isDefault === false) {
       // if we unset the default, clear it from store
       await client.query(`UPDATE stores SET default_display_profile_id = NULL WHERE id = $1 AND default_display_profile_id = $2`, [storeId, id])
    }

    await client.query("COMMIT")
    return NextResponse.json({ success: true })
  } catch (err) {
    await client.query("ROLLBACK")
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  } finally {
    client.release()
  }
}
