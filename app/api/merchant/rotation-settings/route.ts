/**
 * PATCH /api/merchant/rotation-settings
 *
 * Updates the rotation configuration for the logged-in merchant's tenant.
 *
 * Body:
 *   { strategy: "VOLUME" | "TIME" | "SEQUENTIAL", interval?: number }
 *
 * Security:
 *   • Tenant-scoped via session.user.tenantId
 *   • SUPER_ADMIN can also update (for testing)
 *
 * GET: Returns current rotation settings for the tenant.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { clearRotationCache } from "@/lib/merchant-rotation"

const VALID_STRATEGIES = ["VOLUME", "TIME", "SEQUENTIAL"] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const sql = getSql()
  const rows = await sql`
    SELECT rotation_strategy, rotation_interval
    FROM tenants
    WHERE id = ${tenantId}
    LIMIT 1
  `

  const tenant = rows[0] as { rotation_strategy: string; rotation_interval: number } | undefined

  return NextResponse.json({
    strategy: tenant?.rotation_strategy ?? "SEQUENTIAL",
    interval: tenant?.rotation_interval ?? 120,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  let body: { strategy?: string; interval?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { strategy, interval } = body

  // Validate strategy
  if (!strategy || !(VALID_STRATEGIES as readonly string[]).includes(strategy)) {
    return NextResponse.json(
      { error: `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}` },
      { status: 400 }
    )
  }

  // Validate interval (1–1440 minutes = 1 minute to 24 hours)
  const intervalMins = typeof interval === "number" ? Math.max(1, Math.min(1440, interval)) : 120

  const sql = getSql()
  await sql`
    UPDATE tenants
    SET rotation_strategy = ${strategy},
        rotation_interval = ${intervalMins},
        updated_at = NOW()
    WHERE id = ${tenantId}
  `

  // Invalidate the in-memory cache for this tenant
  clearRotationCache(tenantId)

  return NextResponse.json({
    message: "Rotation strategy updated",
    strategy,
    interval: intervalMins,
  })
}
