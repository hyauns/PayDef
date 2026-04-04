/**
 * POST /api/merchant/telegram/test
 *
 * Sends a test notification using the tenant's own Telegram credentials
 * stored in the tenants table (telegram_bot_token, telegram_chat_id).
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { sendTelegramMessage } from "@/lib/telegram"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sql = getSql()
  const rows = await sql`
    SELECT telegram_bot_token, telegram_chat_id, name AS business_name
    FROM tenants
    WHERE id = ${session.user.tenantId}
    LIMIT 1
  `

  const tenant = rows[0] as {
    telegram_bot_token: string | null
    telegram_chat_id: string | null
    business_name: string | null
  } | undefined

  if (!tenant?.telegram_bot_token || !tenant?.telegram_chat_id) {
    return NextResponse.json(
      { error: "Telegram bot token or chat ID not configured. Please save your settings first." },
      { status: 400 }
    )
  }

  const testMessage = [
    "🔔 <b>Test Alert</b>",
    "",
    `Business: <b>${tenant.business_name ?? "Your Store"}</b>`,
    `Sent at: <code>${new Date().toISOString()}</code>`,
    "",
    "✅ Your Telegram notifications are working! You will receive a ping on every successful payment.",
  ].join("\n")

  const result = await sendTelegramMessage(
    tenant.telegram_bot_token,
    tenant.telegram_chat_id,
    testMessage
  )

  if (result.ok) {
    return NextResponse.json({ message: "Test alert sent successfully! Check your Telegram." })
  }

  return NextResponse.json(
    { error: `Telegram API error: ${result.error}` },
    { status: 502 }
  )
}
