/**
 * lib/telegram.ts — Telegram Bot API notification helper
 *
 * Sends real-time alerts to a Telegram chat/group when payments are captured.
 * All calls are fire-and-forget — they never block the HTTP response.
 *
 * Usage:
 *   sendTransactionAlert(tenantId, amount, storeName, accountName)
 */

import { getSql } from "@/lib/neon"

// ─── Core sender ──────────────────────────────────────────────────────────────

/**
 * Send a message via Telegram Bot API.
 * Returns true on success, false on failure (never throws).
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (res.ok) {
      return { ok: true }
    }

    const body = await res.text().catch(() => "")
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { ok: false, error: "Telegram API timed out (5s)" }
    }
    return { ok: false, error: err.message?.slice(0, 200) ?? "Unknown error" }
  }
}

// ─── Transaction alert (fire-and-forget) ──────────────────────────────────────

/**
 * Sends a "💰 Success!" notification to the tenant's configured Telegram chat.
 *
 * This is called asynchronously from the capture route — it does NOT await
 * the result and will never delay the customer's response.
 *
 * @param tenantId    — the tenant whose Telegram config to use
 * @param amount      — captured amount in USD
 * @param storeName   — the store that processed the transaction
 * @param accountName — the PayPal account used for routing
 */
export function sendTransactionAlert(
  tenantId: string,
  amount: number,
  storeName: string,
  accountName: string
): void {
  // Fire-and-forget: run in background, catch all errors silently
  ;(async () => {
    try {
      const sql = getSql()
      const rows = await sql`
        SELECT telegram_bot_token, telegram_chat_id
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `

      const tenant = rows[0] as { telegram_bot_token: string | null; telegram_chat_id: string | null } | undefined
      if (!tenant?.telegram_bot_token || !tenant?.telegram_chat_id) return

      const message = [
        `💰 <b>Success!</b> Received <b>$${amount.toFixed(2)}</b>`,
        `from <b>${escapeHtml(storeName)}</b>.`,
        `Account: <b>${escapeHtml(accountName)}</b>.`,
      ].join(" ")

      await sendTelegramMessage(
        tenant.telegram_bot_token,
        tenant.telegram_chat_id,
        message
      )
    } catch {
      // Silent — never break the main flow
    }
  })()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
