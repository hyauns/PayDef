/**
 * POST /api/merchant/stores/regenerate-key
 * Regenerates the API key for a store owned by the logged-in merchant.
 * Returns the new plaintext key (only time it's ever shown).
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"

function generateApiKey(): string {
  const prefix = "sk_live_"
  const random = randomBytes(24).toString("base64url")
  return `${prefix}${random}`
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { tenantId, role } = session.user

    if (role !== "MERCHANT" || !tenantId) {
      return NextResponse.json({ error: "Only merchants can regenerate keys" }, { status: 403 })
    }

    let body: { storeId?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { storeId } = body

    if (!storeId || typeof storeId !== "string") {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 })
    }

    const sql = getSql()
    const storeCheck = await sql`
      SELECT id, name
      FROM stores
      WHERE id = ${storeId} AND tenant_id = ${tenantId}
    `

    if (storeCheck.length === 0) {
      return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
    }

    const newApiKey = generateApiKey()
    const newApiKeyHash = await bcrypt.hash(newApiKey, 12)

    await sql`
      UPDATE stores
      SET api_key_hash = ${newApiKeyHash}, updated_at = NOW()
      WHERE id = ${storeId} AND tenant_id = ${tenantId}
    `

    return NextResponse.json({
      storeId,
      storeName: storeCheck[0].name,
      apiKey: newApiKey,
      message: "API key regenerated successfully. Save this key securely - it cannot be retrieved again.",
    })
  } catch (error) {
    console.error("[merchant/stores/regenerate-key] Failed to regenerate API key", error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate API key" },
      { status: 500 }
    )
  }
}
