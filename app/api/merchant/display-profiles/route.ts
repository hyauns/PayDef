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

  const sql = getSql()
  
  const profiles = role === "SUPER_ADMIN" 
    ? await sql`
        SELECT id, profile_name, industry_vertical, public_brand_name, descriptor_prefix, display_mode, line_item_policy, store_id, is_default, is_active, tenant_id
        FROM payment_display_profiles
        ORDER BY created_at DESC
      `
    : await sql`
        SELECT id, profile_name, industry_vertical, public_brand_name, descriptor_prefix, display_mode, line_item_policy, store_id, is_default, is_active
        FROM payment_display_profiles
        WHERE tenant_id = ${tenantId} AND is_active = true
        ORDER BY created_at DESC
      `

  return NextResponse.json({ profiles })
}
