import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import {
  getCheckoutPreferences,
  normalizeCheckoutFlow,
  resolveCheckoutFlow,
} from "@/lib/checkout-flow"

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  let body: { storeId?: string; checkoutFlow?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.storeId) {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 })
  }

  const nextCheckoutFlow = body.checkoutFlow === null
    ? null
    : normalizeCheckoutFlow(body.checkoutFlow)

  const sql = getSql()
  const existing = await sql`
    SELECT id, checkout_flow
    FROM stores
    WHERE id = ${body.storeId} AND tenant_id = ${tenantId}
    LIMIT 1
  `

  if (existing.length === 0) {
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }

  await sql`
    UPDATE stores
    SET checkout_flow = ${nextCheckoutFlow}, updated_at = NOW()
    WHERE id = ${body.storeId} AND tenant_id = ${tenantId}
  `

  const preferences = await getCheckoutPreferences(sql)

  return NextResponse.json({
    message: nextCheckoutFlow
      ? `Checkout flow updated to ${nextCheckoutFlow}`
      : "Checkout flow now uses the platform default",
    checkoutFlow: resolveCheckoutFlow(nextCheckoutFlow, preferences),
    checkoutFlowOverride: nextCheckoutFlow !== null,
  })
}
