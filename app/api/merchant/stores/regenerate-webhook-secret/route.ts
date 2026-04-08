import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { encrypt } from "@/lib/encryption"
import { generateWebhookSecret } from "@/lib/store-webhooks"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { tenantId, role } = session.user

    if (role !== "MERCHANT" || !tenantId) {
      return NextResponse.json({ error: "Only merchants can regenerate webhook secrets" }, { status: 403 })
    }

    let body: { storeId?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body.storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 })
    }

    const sql = getSql()
    const storeRows = await sql`
      SELECT id, name
      FROM stores
      WHERE id = ${body.storeId} AND tenant_id = ${tenantId}
      LIMIT 1
    `

    if (storeRows.length === 0) {
      return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
    }

    const webhookSecret = generateWebhookSecret()

    await sql`
      UPDATE stores
      SET webhook_secret = ${encrypt(webhookSecret)},
          updated_at = NOW()
      WHERE id = ${body.storeId} AND tenant_id = ${tenantId}
    `

    return NextResponse.json({
      storeId: body.storeId,
      storeName: storeRows[0].name,
      webhookSecret,
      message: "Webhook secret regenerated. Save it now - it cannot be retrieved again.",
    })
  } catch (error) {
    console.error("[merchant/stores/regenerate-webhook-secret] Failed to regenerate webhook secret", error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate webhook secret" },
      { status: 500 }
    )
  }
}
