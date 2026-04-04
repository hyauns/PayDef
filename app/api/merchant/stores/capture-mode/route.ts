/**
 * PATCH /api/merchant/stores/capture-mode
 *
 * Updates the capture_mode setting for a specific store.
 * Body: { storeId: string, captureMode: "INSTANT" | "MANUAL" }
 *
 * Security: tenant-scoped via session.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

const VALID_MODES = ["INSTANT", "MANUAL"] as const

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  let body: { storeId?: string; captureMode?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { storeId, captureMode } = body

  if (!storeId) {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 })
  }

  if (!captureMode || !(VALID_MODES as readonly string[]).includes(captureMode)) {
    return NextResponse.json(
      { error: `captureMode must be one of: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    )
  }

  const sql = getSql()

  // Verify ownership
  const existing = await sql`
    SELECT id FROM stores
    WHERE id = ${storeId} AND tenant_id = ${tenantId}
    LIMIT 1
  `

  if (existing.length === 0) {
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }

  await sql`
    UPDATE stores
    SET capture_mode = ${captureMode}, updated_at = NOW()
    WHERE id = ${storeId} AND tenant_id = ${tenantId}
  `

  return NextResponse.json({
    message: `Capture mode updated to ${captureMode}`,
    captureMode,
  })
}
