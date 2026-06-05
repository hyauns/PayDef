import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/merchant/payment-identities/domains" })

// Manage which shield domains are linked to an identity (bundle) for the random
// shield-domain pool. Only the tenant's OWN domains can be assigned — shared
// pool domains (tenant_id IS NULL) are admin-managed.

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

  const ownerCheck = await sql`SELECT id FROM payment_identity_bundles WHERE id = ${bundleId} AND tenant_id = ${tenantId}`
  if (ownerCheck.length === 0) {
    return NextResponse.json({ error: "Forbidden or bundle not found" }, { status: 403 })
  }

  // The tenant's own shield domains + which bundle each is currently linked to.
  const domains = await sql`
    SELECT id, domain, is_active, health_ok, bundle_id
    FROM shield_domains
    WHERE tenant_id = ${tenantId}
    ORDER BY domain ASC
  `
  return NextResponse.json({ domains })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  let body: { bundleId?: string; domainId?: string; action?: "assign" | "unassign" }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { bundleId, domainId, action } = body
  if (!bundleId || !domainId || (action !== "assign" && action !== "unassign")) {
    return NextResponse.json({ error: "bundleId, domainId and action (assign|unassign) are required" }, { status: 400 })
  }

  const sql = getSql()

  // Verify the bundle belongs to this tenant.
  const ownerCheck = await sql`SELECT id FROM payment_identity_bundles WHERE id = ${bundleId} AND tenant_id = ${tenantId}`
  if (ownerCheck.length === 0) {
    return NextResponse.json({ error: "Forbidden or bundle not found" }, { status: 403 })
  }

  // Both UPDATEs are scoped to tenant_id so a merchant can only touch their own
  // domains (never a pool/other-tenant domain). unassign only clears the link if
  // it currently points at THIS bundle.
  const result =
    action === "assign"
      ? await sql`
          UPDATE shield_domains SET bundle_id = ${bundleId}, updated_at = NOW()
          WHERE id = ${domainId} AND tenant_id = ${tenantId}
          RETURNING id`
      : await sql`
          UPDATE shield_domains SET bundle_id = NULL, updated_at = NOW()
          WHERE id = ${domainId} AND tenant_id = ${tenantId} AND bundle_id = ${bundleId}
          RETURNING id`

  if (result.length === 0) {
    return NextResponse.json({ error: "Domain not found for this tenant (or not linked to this identity)" }, { status: 404 })
  }

  log.info("merchant_identity_domain.assignment", `Domain ${action} for bundle ${bundleId}`, {
    tenantId, bundleId, domainId, action,
  })
  return NextResponse.json({ success: true })
}
