import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/admin/identity-bundles/assignments" })

// ─── GET: Fetch assignable accounts and domains for a bundle ─────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const bundleId = searchParams.get("bundleId")
  if (!bundleId) return NextResponse.json({ error: "bundleId is required" }, { status: 400 })

  const sql = getSql()

  // Get the bundle's tenant_id
  const bundleRows = await sql`SELECT tenant_id FROM payment_identity_bundles WHERE id = ${bundleId}`
  if (bundleRows.length === 0) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 })
  }
  const tenantId = bundleRows[0].tenant_id

  // Fetch merchant accounts for this tenant with current bundle_id
  const accounts = await sql`
    SELECT ma.id, ma.name, ma.email, ma.status, ma.bundle_id, ma.display_profile_id,
           pdp.profile_name AS display_profile_name
    FROM merchant_accounts ma
    LEFT JOIN payment_display_profiles pdp ON ma.display_profile_id = pdp.id
    WHERE ma.tenant_id = ${tenantId}
    ORDER BY ma.name
  `

  // Fetch shield domains for this tenant with current bundle_id
  const domains = await sql`
    SELECT sd.id, sd.domain, sd.is_active, sd.health_ok, sd.tenant_id, sd.bundle_id, sd.display_profile_id,
           t.name AS tenant_name
    FROM shield_domains sd
    LEFT JOIN tenants t ON sd.tenant_id = t.id
    WHERE sd.tenant_id = ${tenantId} OR sd.tenant_id IS NULL
    ORDER BY sd.domain
  `

  return NextResponse.json({ accounts, domains, tenantId })
}

// ─── POST: Assign or unassign bundle from accounts/domains ───────────────────

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

  const { bundleId, type, targetId, action } = body

  if (!bundleId || !type || !targetId || !action) {
    return NextResponse.json({ error: "Missing required fields: bundleId, type, targetId, action" }, { status: 400 })
  }

  if (!["merchant_account", "shield_domain"].includes(type)) {
    return NextResponse.json({ error: "type must be merchant_account or shield_domain" }, { status: 400 })
  }

  if (!["assign", "unassign"].includes(action)) {
    return NextResponse.json({ error: "action must be assign or unassign" }, { status: 400 })
  }

  const sql = getSql()

  // Validate bundle exists
  const bundleRows = await sql`SELECT tenant_id, is_active FROM payment_identity_bundles WHERE id = ${bundleId}`
  if (bundleRows.length === 0) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 })
  }
  const bundleTenantId = bundleRows[0].tenant_id

  if (action === "assign" && !bundleRows[0].is_active) {
    return NextResponse.json({ error: "Cannot assign an inactive bundle" }, { status: 400 })
  }

  if (type === "merchant_account") {
    // Validate same tenant
    const maRows = await sql`SELECT tenant_id FROM merchant_accounts WHERE id = ${targetId}`
    if (maRows.length === 0) {
      return NextResponse.json({ error: "Merchant account not found" }, { status: 404 })
    }
    if (maRows[0].tenant_id !== bundleTenantId) {
      return NextResponse.json({ error: "Cross-tenant assignment is not allowed" }, { status: 403 })
    }

    if (action === "assign") {
      await sql`UPDATE merchant_accounts SET bundle_id = ${bundleId}, updated_at = NOW() WHERE id = ${targetId}`
    } else {
      await sql`UPDATE merchant_accounts SET bundle_id = NULL, updated_at = NOW() WHERE id = ${targetId}`
    }

    log.info("identity_bundle.assignment", `${action} bundle ${bundleId} to merchant account ${targetId}`, {
      bundleId, targetId, type, action,
    })
  }

  if (type === "shield_domain") {
    // Validate same tenant (or shared pool with null tenant)
    const sdRows = await sql`SELECT tenant_id FROM shield_domains WHERE id = ${targetId}`
    if (sdRows.length === 0) {
      return NextResponse.json({ error: "Shield domain not found" }, { status: 404 })
    }
    if (sdRows[0].tenant_id && sdRows[0].tenant_id !== bundleTenantId) {
      return NextResponse.json({ error: "Cross-tenant assignment is not allowed" }, { status: 403 })
    }

    if (action === "assign") {
      await sql`UPDATE shield_domains SET bundle_id = ${bundleId}, updated_at = NOW() WHERE id = ${targetId}`
    } else {
      await sql`UPDATE shield_domains SET bundle_id = NULL, updated_at = NOW() WHERE id = ${targetId}`
    }

    log.info("identity_bundle.assignment", `${action} bundle ${bundleId} to shield domain ${targetId}`, {
      bundleId, targetId, type, action,
    })
  }

  return NextResponse.json({ success: true })
}
