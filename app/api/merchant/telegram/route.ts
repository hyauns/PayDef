/**
 * GET  /api/merchant/telegram — Fetch tenant's Telegram config
 * POST /api/merchant/telegram — Save tenant's Telegram config
 *
 * Reads/writes telegram_bot_token and telegram_chat_id on the tenants table.
 * Tenant-scoped via session.user.tenantId.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sql = getSql()
  const rows = await sql`
    SELECT telegram_bot_token, telegram_chat_id
    FROM tenants
    WHERE id = ${session.user.tenantId}
    LIMIT 1
  `

  const tenant = rows[0] as { telegram_bot_token: string | null; telegram_chat_id: string | null } | undefined

  return NextResponse.json({
    telegram: {
      botToken: tenant?.telegram_bot_token ?? "",
      chatId: tenant?.telegram_chat_id ?? "",
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { botToken?: string; chatId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { botToken, chatId } = body

  if (typeof botToken !== "string" || typeof chatId !== "string") {
    return NextResponse.json({ error: "botToken and chatId are required strings" }, { status: 400 })
  }

  const sql = getSql()
  await sql`
    UPDATE tenants
    SET telegram_bot_token = ${botToken.trim() || null},
        telegram_chat_id = ${chatId.trim() || null},
        updated_at = NOW()
    WHERE id = ${session.user.tenantId}
  `

  return NextResponse.json({ message: "Telegram configuration saved" })
}
