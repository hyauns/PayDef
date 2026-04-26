/**
 * lib/circuit-breaker.ts — Distributed Circuit Breaker for PayPal Merchant Accounts
 *
 * Uses Upstash Redis to track PayPal API failures per merchant account.
 * When an account accumulates 3 failures within 5 minutes, the circuit
 * "opens" and the account is paused for 15 minutes.
 *
 * IMPORTANT NOTES:
 *  - Scope: Only affects NEW checkout account selection. Does NOT affect
 *    /execute, /capture, /refund, /void, webhooks, or cron routes.
 *  - Mode: Controlled by CIRCUIT_BREAKER_MODE env var (shadow | enforce).
 *    Shadow (default) = log only, never filter.
 *    Enforce = filter open circuits from checkout routing.
 *  - Fail-open: If Redis is unreachable, all accounts are treated as eligible.
 *  - Alert anti-spam: Circuit open alert is sent only once per open window
 *    via the Redis key itself (set + TTL = one alert per window).
 *  - Threshold wording: "3 failures within 5 minutes" (not strictly consecutive).
 *    Each failure increments a counter with a 5-minute TTL. If the counter
 *    reaches 3 before the TTL expires, the circuit opens.
 *
 * SECURITY: Never log credentials, secrets, tokens, or full PayPal data.
 */

import { Redis } from "@upstash/redis"
import { sendTelegramMessage } from "@/lib/telegram"
import { getSql } from "@/lib/neon"

// ─── Redis Singleton ──────────────────────────────────────────────────────────

let _redis: Redis | null = null
let _redisDisabledLogged = false

function getRedis(): Redis | null {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!_redisDisabledLogged) {
      console.warn("[circuit-breaker] UPSTASH env vars missing — circuit breaker disabled")
      _redisDisabledLogged = true
    }
    return null
  }
  _redis = new Redis({ url, token })
  return _redis
}

function getCircuitBreakerMode(): "shadow" | "enforce" {
  const mode = process.env.CIRCUIT_BREAKER_MODE?.trim().toLowerCase()
  return mode === "enforce" ? "enforce" : "shadow"
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ERROR_KEY_PREFIX = "cb:err:"     // Counter key: cb:err:{accountId}
const OPEN_KEY_PREFIX = "cb:open:"     // Open circuit key: cb:open:{accountId}
const ERROR_WINDOW_TTL = 300           // 5 minutes (seconds)
const OPEN_CIRCUIT_TTL = 900           // 15 minutes (seconds)
const FAILURE_THRESHOLD = 3            // 3 failures within window

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Records a PayPal API failure for a merchant account.
 * If the failure count reaches the threshold, opens the circuit.
 *
 * @param accountId - Merchant account ID
 * @param reason - Safe error classification (e.g. "429", "5xx", "timeout", "403_ambiguous")
 * @param tenantId - For Telegram alert lookup (optional)
 */
export async function recordPayPalError(
  accountId: string,
  reason: string,
  tenantId?: string
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const errorKey = `${ERROR_KEY_PREFIX}${accountId}`
    const openKey = `${OPEN_KEY_PREFIX}${accountId}`

    // Increment error count within the sliding window
    const count = await redis.incr(errorKey)
    if (count === 1) {
      // First failure — set the window TTL
      await redis.expire(errorKey, ERROR_WINDOW_TTL)
    }

    if (count >= FAILURE_THRESHOLD) {
      // Threshold reached — open the circuit
      await redis.set(openKey, "1", { ex: OPEN_CIRCUIT_TTL })
      await redis.del(errorKey)

      console.warn(
        `[circuit-breaker] opened account=${accountId} reason=${reason} ttl=${OPEN_CIRCUIT_TTL}`
      )

      // Send ONE Telegram alert per open window (the Redis key ensures no duplicates)
      if (tenantId) {
        sendCircuitBreakerAlert(accountId, reason, tenantId).catch(() => {
          // Alert failure must never block checkout
        })
      }
    }
  } catch (err) {
    // Fail-open: Redis error → ignore, checkout proceeds normally
    console.error("[circuit-breaker] Redis error in recordPayPalError (fail-open):", err)
  }
}

/**
 * Filters out accounts with open circuits from the eligible list.
 *
 * In shadow mode: logs which accounts WOULD be filtered, returns original array.
 * In enforce mode: removes accounts with open circuits.
 * If ALL accounts are filtered: fails open (returns original array + logs warning).
 *
 * CRITICAL: Preserves the exact order of the input array.
 *
 * @param accounts - Array of account objects with { id: string }
 * @param storeId - For logging only
 * @returns Filtered array (enforce) or original array (shadow/fail-open)
 */
export async function filterOpenCircuits<T extends { id: string }>(
  accounts: T[],
  storeId: string
): Promise<T[]> {
  if (accounts.length === 0) return accounts

  const redis = getRedis()
  if (!redis) return accounts // Fail-open: no Redis → no filtering

  const mode = getCircuitBreakerMode()

  try {
    // Batch check all accounts
    const openKeys = accounts.map((a) => `${OPEN_KEY_PREFIX}${a.id}`)
    const results = await redis.mget<(string | null)[]>(...openKeys)

    const openAccountIds = new Set<string>()
    for (let i = 0; i < accounts.length; i++) {
      if (results[i] !== null) {
        openAccountIds.add(accounts[i].id)
      }
    }

    if (openAccountIds.size === 0) return accounts // No open circuits

    if (mode === "shadow") {
      // Log only, never filter
      for (const id of openAccountIds) {
        console.info(`[circuit-breaker] mode=shadow account=${id} would_filter=true reason=open`)
      }
      return accounts
    }

    // Enforce mode — filter while preserving order
    const filtered = accounts.filter((a) => !openAccountIds.has(a.id))

    for (const id of openAccountIds) {
      console.info(`[circuit-breaker] mode=enforce account=${id} filtered=true reason=open`)
    }

    // All-open fail-open: if everything is filtered, return the original list
    if (filtered.length === 0) {
      console.warn(
        `[circuit-breaker] all eligible accounts are open for store=${storeId}`
      )
      return accounts
    }

    return filtered
  } catch (err) {
    // Fail-open: Redis error → return all accounts
    console.error("[circuit-breaker] Redis error in filterOpenCircuits (fail-open):", err)
    return accounts
  }
}

// ─── Telegram Alert (internal, non-blocking) ──────────────────────────────────

async function sendCircuitBreakerAlert(
  accountId: string,
  reason: string,
  tenantId: string
): Promise<void> {
  try {
    const sql = getSql()
    const rows = await sql`
      SELECT telegram_bot_token, telegram_chat_id
      FROM tenants WHERE id = ${tenantId} LIMIT 1
    `
    const tenant = rows[0] as { telegram_bot_token: string | null; telegram_chat_id: string | null } | undefined
    if (!tenant?.telegram_bot_token || !tenant?.telegram_chat_id) return

    const message = [
      "⚠️ <b>Circuit Breaker OPEN</b>",
      "",
      `Account: <code>${accountId}</code>`,
      `Reason: <b>${reason}</b> (3 failures in 5 min)`,
      `Auto-pause: <b>15 minutes</b>`,
      "",
      "Account will auto-recover after cooldown.",
    ].join("\n")

    const result = await sendTelegramMessage(tenant.telegram_bot_token, tenant.telegram_chat_id, message)
    if (!result.ok) {
      console.error(`[circuit-breaker] Telegram alert failed: ${result.error}`)
    }
  } catch (err) {
    console.error("[circuit-breaker] Telegram alert error (non-blocking):", err)
  }
}
