/**
 * POST /api/admin/settings/test-telegram
 *
 * Sends a test notification to the configured Telegram chat.
 * Admin only — uses Telegram credentials from system_settings.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { sendTelegramMessage } from "@/lib/telegram"

export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sql = getSql()

  // Fetch Telegram config from system_settings
  const rows = await sql`
    SELECT value FROM system_settings WHERE key = 'telegram' LIMIT 1
  `

  const telegramConfig = rows[0]?.value as { botToken?: string; chatId?: string } | undefined

  if (!telegramConfig?.botToken || !telegramConfig?.chatId) {
    return NextResponse.json(
      { error: "Telegram bot token or chat ID not configured. Please save your settings first." },
      { status: 400 }
    )
  }

  const testMessage = [
    "🔔 <b>Test Alert</b>",
    "",
    "This is a test notification from your Payment Gateway dashboard.",
    `Sent at: <code>${new Date().toISOString()}</code>`,
    "",
    "✅ If you see this, your Telegram integration is working correctly.",
  ].join("\n")

  const result = await sendTelegramMessage(
    telegramConfig.botToken,
    telegramConfig.chatId,
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
