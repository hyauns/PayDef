/**
 * lib/merchant-rotation.ts
 *
 * Intelligent Merchant Rotation Service
 * ──────────────────────────────────────
 *
 * Implements three rotation strategies:
 *   • VOLUME     — pick the account with the most remaining daily capacity
 *   • TIME       — rotate based on last_used timestamp and configured interval
 *   • SEQUENTIAL — round-robin through account list order (default)
 *
 * Fallback behaviour: if the primary strategy yields no result (e.g., only 1
 * account), it falls back to weighted random selection.
 *
 * Performance: tenant rotation settings are cached in-memory for 60 seconds
 * to avoid hitting the DB on every single checkout call.
 *
 * Features:
 *  • Fetches ACTIVE + WARMING_UP accounts for the given tenant
 *  • Filters out accounts that would exceed their daily_limit
 *  • Progressive warm-up daily ramp (Day 1: $100 → Day 7+: $500)
 *  • Per-transaction $50 cap for WARMING_UP accounts
 *  • Hourly smoothing: accounts with >5 recent orders get de-prioritised
 *  • Progressive de-weighting above soft_limit
 *  • Returns selected merchant credentials + shield_domain + proxyUrl
 *  • Throws a typed MerchantRotationError (403) when no accounts qualify
 */

import { type NeonQueryFunction } from "@neondatabase/serverless"
import { decrypt } from "@/lib/encryption"

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum single-transaction value for accounts in warm-up status. */
export const WARMUP_MAX_TRANSACTION = 50.0

/**
 * Progressive warm-up daily cap schedule.
 * The daily volume limit for WARMING_UP accounts ramps linearly:
 *   Day 0  (just created):    $100
 *   Day 7+ (mature warm-up):  $500
 */
const WARMUP_CAP_DAY_0 = 100.0
const WARMUP_CAP_DAY_7 = 500.0
const WARMUP_RAMP_DAYS = 7

/**
 * Hourly smoothing threshold.
 * If an account has processed more than this many orders in the last 60 min,
 * its effective priority is halved to avoid velocity-based detection.
 */
const HOURLY_ORDER_THRESHOLD = 5

/** Cache TTL for rotation settings (ms). */
const SETTINGS_CACHE_TTL = 60_000 // 1 minute

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a merchant_accounts row coming back from PostgreSQL. */
export interface MerchantAccountRow {
  id:                   string
  tenant_id:            string
  client_id:            string
  client_secret:        string
  shield_domain:        string | null
  proxy_url:            string | null
  daily_limit:          string   // NUMERIC comes back as string from pg
  soft_limit:           string | null
  daily_limit_override: string | null
  current_volume:       string
  priority:             number
  status:               string   // 'ACTIVE' | 'WARMING_UP' | 'PAUSED' | 'SUSPENDED'
  warmup_started_at:    string | null
  item_masking:         boolean
  fake_product_name:    string
  display_profile_id:   string | null
  // Hourly smoothing (joined from subquery)
  recent_order_count?:  string   // COUNT comes back as string from pg
}

/** Resolved credentials returned by the rotation service. */
export interface SelectedMerchant {
  accountId:    string
  clientId:     string
  clientSecret: string
  shieldDomain: string
  proxyUrl:     string | null
  status:       string
  /** The effective maximum allowed transaction amount for this selection. */
  effectiveMaxAmount: number
  /** Whether per-account item masking is enabled. */
  itemMasking:       boolean
  /** Custom fake product name (used if itemMasking is true). */
  fakeProductName:   string
}

/** Rotation strategy enum. */
export type RotationStrategy = "VOLUME" | "TIME" | "SEQUENTIAL"

/** Cached rotation settings for a tenant. */
interface RotationConfig {
  strategy:       RotationStrategy
  intervalMinutes: number
  lastIndex:      number
  lastRotationAt: string | null
  fetchedAt:      number // Date.now() when cached
}

/** Typed error for rotation failures — callers can inspect `statusCode`. */
export class MerchantRotationError extends Error {
  public readonly statusCode: number

  constructor(message: string, statusCode = 403) {
    super(message)
    this.name = "MerchantRotationError"
    this.statusCode = statusCode
  }
}

// ─── Rotation Settings Cache ──────────────────────────────────────────────────

const _settingsCache = new Map<string, RotationConfig>()

/**
 * Fetches the tenant's rotation settings with 60-second in-memory caching.
 * Avoids a DB call on every checkout when settings haven't changed.
 */
async function getRotationConfig(
  tenantId: string,
  sql: NeonQueryFunction<false, false>
): Promise<RotationConfig> {
  const cached = _settingsCache.get(tenantId)
  if (cached && Date.now() - cached.fetchedAt < SETTINGS_CACHE_TTL) {
    return cached
  }

  const rows = await sql`
    SELECT rotation_strategy, rotation_interval, last_rotation_index, last_rotation_at
    FROM tenants
    WHERE id = ${tenantId}
    LIMIT 1
  `

  const row = rows[0] as {
    rotation_strategy: string
    rotation_interval: number
    last_rotation_index: number
    last_rotation_at: string | null
  } | undefined

  const config: RotationConfig = {
    strategy:        (row?.rotation_strategy as RotationStrategy) ?? "SEQUENTIAL",
    intervalMinutes: row?.rotation_interval ?? 120,
    lastIndex:       row?.last_rotation_index ?? 0,
    lastRotationAt:  row?.last_rotation_at ?? null,
    fetchedAt:       Date.now(),
  }

  _settingsCache.set(tenantId, config)
  return config
}

/**
 * Clears the cached rotation config for a tenant.
 * Called when the tenant updates their settings via the API.
 */
export function clearRotationCache(tenantId: string): void {
  _settingsCache.delete(tenantId)
}

// ─── Warm-up Daily Cap Calculator ─────────────────────────────────────────────

/**
 * Computes the progressive daily volume cap for a WARMING_UP account.
 * Linear ramp from $100 (day 0) to $500 (day 7+).
 */
export function getWarmupDailyCap(warmupStartedAt: string | null): number {
  if (!warmupStartedAt) return WARMUP_CAP_DAY_0

  const startMs = new Date(warmupStartedAt).getTime()
  const nowMs   = Date.now()
  const daysSinceStart = Math.max(0, (nowMs - startMs) / (1000 * 60 * 60 * 24))

  if (daysSinceStart >= WARMUP_RAMP_DAYS) return WARMUP_CAP_DAY_7

  const progress = daysSinceStart / WARMUP_RAMP_DAYS
  return Math.round(WARMUP_CAP_DAY_0 + progress * (WARMUP_CAP_DAY_7 - WARMUP_CAP_DAY_0))
}

/**
 * Returns the effective daily limit for an account, considering:
 *  1. daily_limit_override (manual per-account cap — highest precedence)
 *  2. Warm-up progressive cap (if status is WARMING_UP)
 *  3. Default daily_limit column
 */
export function getEffectiveDailyLimit(account: MerchantAccountRow): number {
  if (account.daily_limit_override) {
    return parseFloat(account.daily_limit_override)
  }

  const baseDailyLimit = parseFloat(account.daily_limit)

  if (account.status === "WARMING_UP") {
    const warmupCap = getWarmupDailyCap(account.warmup_started_at)
    return Math.min(warmupCap, baseDailyLimit)
  }

  return baseDailyLimit
}

// ─── Strategy Selectors ───────────────────────────────────────────────────────

/**
 * VOLUME strategy: pick the account with the MOST remaining daily capacity.
 * This maximises coverage by always routing to the freshest account.
 */
function selectByVolume(candidates: MerchantAccountRow[]): MerchantAccountRow {
  let best = candidates[0]
  let bestHeadroom = -Infinity

  for (const account of candidates) {
    const headroom = getEffectiveDailyLimit(account) - parseFloat(account.current_volume)
    if (headroom > bestHeadroom) {
      bestHeadroom = headroom
      best = account
    }
  }

  return best
}

/**
 * TIME strategy: rotate accounts based on elapsed time since last rotation.
 * If the configured interval has passed, pick the next account in list order.
 * Otherwise, stay on the current account (determined by last_rotation_index).
 *
 * Returns the selected account and whether the index needs updating.
 */
function selectByTime(
  candidates: MerchantAccountRow[],
  config: RotationConfig
): { account: MerchantAccountRow; newIndex: number; rotated: boolean } {
  const now = Date.now()
  const lastRotation = config.lastRotationAt
    ? new Date(config.lastRotationAt).getTime()
    : 0
  const intervalMs = config.intervalMinutes * 60_000
  const elapsed = now - lastRotation

  if (elapsed >= intervalMs) {
    // Interval expired — rotate to next account
    const newIndex = (config.lastIndex + 1) % candidates.length
    return { account: candidates[newIndex], newIndex, rotated: true }
  }

  // Stay on current account
  const currentIndex = config.lastIndex % candidates.length
  return { account: candidates[currentIndex], newIndex: config.lastIndex, rotated: false }
}

/**
 * SEQUENTIAL strategy: pure round-robin, increment index on every call.
 */
function selectSequential(
  candidates: MerchantAccountRow[],
  config: RotationConfig
): { account: MerchantAccountRow; newIndex: number } {
  const index = config.lastIndex % candidates.length
  const nextIndex = (config.lastIndex + 1) % candidates.length
  return { account: candidates[index], newIndex: nextIndex }
}

// ─── Weighted Random (fallback) ───────────────────────────────────────────────

/**
 * Selects one account using weighted random distribution.
 * Accounts with higher priority are proportionally more likely to be chosen.
 */
export function weightedRandomSelect(candidates: MerchantAccountRow[]): MerchantAccountRow {
  const totalWeight = candidates.reduce((sum, a) => sum + a.priority, 0)

  if (totalWeight <= 0) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  let rand = Math.random() * totalWeight
  for (const account of candidates) {
    rand -= account.priority
    if (rand <= 0) return account
  }

  return candidates[candidates.length - 1]
}

// ─── Hourly Smoothing ─────────────────────────────────────────────────────────

/**
 * Applies hourly smoothing: de-prioritise accounts with >5 recent orders.
 * Mutates priority transiently — the DB value is unchanged.
 */
function applyHourlySmoothing(accounts: MerchantAccountRow[]): MerchantAccountRow[] {
  return accounts.map((account) => {
    const recentOrders = parseInt(account.recent_order_count ?? "0", 10)
    if (recentOrders > HOURLY_ORDER_THRESHOLD) {
      return { ...account, priority: Math.max(1, Math.floor(account.priority / 2)) }
    }
    return account
  })
}

// ─── Pure Filtering ───────────────────────────────────────────────────────────

/**
 * Filters merchant accounts by warm-up cap and daily-limit headroom.
 * Also applies progressive de-weighting above soft_limit.
 */
export function filterEligibleAccounts(
  accounts: MerchantAccountRow[],
  requestedAmount: number
): MerchantAccountRow[] {
  return accounts
    .filter((account) => {
      // Warm-up guard: WARMING_UP accounts cannot process transactions > $50
      if (account.status === "WARMING_UP" && requestedAmount > WARMUP_MAX_TRANSACTION) {
        return false
      }

      // Daily limit guard (considers override + progressive warm-up cap)
      const currentVolume       = parseFloat(account.current_volume)
      const effectiveDailyLimit = getEffectiveDailyLimit(account)
      if (currentVolume + requestedAmount > effectiveDailyLimit) {
        return false
      }

      return true
    })
    .map((account) => {
      // Progressive de-weighting above soft_limit
      const currentVolume = parseFloat(account.current_volume)
      const hardLimit     = getEffectiveDailyLimit(account)
      const softLimit     = account.soft_limit
        ? parseFloat(account.soft_limit)
        : hardLimit * 0.8

      if (currentVolume >= softLimit && softLimit < hardLimit) {
        const range    = hardLimit - softLimit
        const overage  = currentVolume - softLimit
        const factor   = Math.max(0.1, 1.0 - (overage / range) * 0.9)
        const adjusted = Math.max(1, Math.round(account.priority * factor))
        return { ...account, priority: adjusted }
      }

      return account
    })
}

// ─── Strategy-Aware Selection ─────────────────────────────────────────────────

/**
 * Selects a merchant account using the tenant's configured rotation strategy.
 *
 * This is the primary function called by the checkout route.
 * It fetches the tenant's strategy from cache, then applies the appropriate
 * selection algorithm on the pre-filtered candidate list.
 *
 * After selection it optionally updates the tenant's rotation index/timestamp
 * for SEQUENTIAL and TIME strategies.
 *
 * @param candidates — pre-filtered eligible accounts (from filterEligibleAccounts)
 * @param tenantId   — the tenant whose strategy to use
 * @param sql        — Neon SQL tagged template for DB operations
 * @returns the selected MerchantAccountRow
 */
export async function selectByStrategy(
  candidates: MerchantAccountRow[],
  tenantId: string,
  sql: NeonQueryFunction<false, false>
): Promise<MerchantAccountRow> {
  if (candidates.length === 1) return candidates[0]

  const config = await getRotationConfig(tenantId, sql)

  switch (config.strategy) {
    case "VOLUME": {
      return selectByVolume(candidates)
    }

    case "TIME": {
      const { account, newIndex, rotated } = selectByTime(candidates, config)

      if (rotated) {
        // Update the index and timestamp in DB (fire-and-forget for speed)
        sql`
          UPDATE tenants
          SET last_rotation_index = ${newIndex},
              last_rotation_at = NOW()
          WHERE id = ${tenantId}
        `.catch(() => { /* silent */ })

        // Update cache immediately
        _settingsCache.set(tenantId, {
          ...config,
          lastIndex: newIndex,
          lastRotationAt: new Date().toISOString(),
          fetchedAt: Date.now(),
        })
      }

      return account
    }

    case "SEQUENTIAL": {
      const { account, newIndex } = selectSequential(candidates, config)

      // Update the round-robin pointer (fire-and-forget)
      sql`
        UPDATE tenants
        SET last_rotation_index = ${newIndex}
        WHERE id = ${tenantId}
      `.catch(() => { /* silent */ })

      // Update cache immediately
      _settingsCache.set(tenantId, {
        ...config,
        lastIndex: newIndex,
        fetchedAt: Date.now(),
      })

      return account
    }

    default: {
      // Unknown strategy — fall back to weighted random
      return weightedRandomSelect(candidates)
    }
  }
}

// ─── Core Service ─────────────────────────────────────────────────────────────

export interface RotationOptions {
  /** The tenant whose merchant pool we're selecting from. */
  tenantId: string
  /** The store making the transaction. */
  storeId?: string
  /** The requested transaction amount in the base currency. */
  requestedAmount: number
  /** Preferred Payment Display Profile ID to match against merchant_accounts. */
  preferredProfileId?: string | null
  /** Neon tagged-template SQL function. */
  sql: NeonQueryFunction<false, false>
}

/**
 * Selects the best available merchant account for a transaction.
 *
 * Steps:
 *  1. Fetch all ACTIVE and WARMING_UP accounts for the tenant
 *     — includes a LEFT JOIN subquery for recent order counts (hourly smoothing)
 *  2. Apply warm-up cap — if status is WARMING_UP and amount > $50, exclude
 *  3. Filter by effective daily limit (considers override + progressive cap)
 *  4. Apply hourly smoothing to de-prioritise high-velocity accounts
 *  5. Prioritise ACTIVE for high-value orders ($100+) — push WARMING_UP down
 *  6. Apply tenant-specific rotation strategy (VOLUME / TIME / SEQUENTIAL)
 *  7. Return the selected merchant's credentials and shield_domain
 *
 * @throws {MerchantRotationError} 403 when no accounts qualify
 */
export async function selectMerchant(opts: RotationOptions): Promise<SelectedMerchant> {
  const { tenantId, storeId, requestedAmount, preferredProfileId, sql } = opts

  // ── Step 1: Fetch eligible accounts with hourly order counts ────────────
  const accounts = (await sql`
    SELECT
      ma.id, ma.tenant_id, ma.client_id, ma.client_secret,
      ma.shield_domain, ma.proxy_url,
      ma.daily_limit, ma.soft_limit, ma.daily_limit_override,
      ma.current_volume, ma.priority, ma.status,
      ma.warmup_started_at,
      ma.item_masking, ma.fake_product_name,
      ma.display_profile_id,
      COALESCE(ho.cnt, 0)::TEXT AS recent_order_count
    FROM merchant_accounts ma
    LEFT JOIN (
      SELECT merchant_id, COUNT(*) AS cnt
      FROM   transactions
      WHERE  created_at > NOW() - INTERVAL '1 hour'
      GROUP BY merchant_id
    ) ho ON ho.merchant_id = ma.id
    WHERE ma.tenant_id = ${tenantId}
      AND ma.status IN ('ACTIVE', 'WARMING_UP')
    ORDER BY ma.priority DESC
  `) as unknown as MerchantAccountRow[]

  if (accounts.length === 0) {
    throw new MerchantRotationError(
      "System Overloaded — no active payment accounts available for this tenant.",
      403
    )
  }

  // ── Step 2 & 3: Filter by warm-up cap + effective daily limit ──────────
  let eligible = filterEligibleAccounts(accounts, requestedAmount)

  if (eligible.length === 0) {
    throw new MerchantRotationError(
      "Volume Limits Reached — all active accounts are maxed out for today.",
      403
    )
  }

  // ── Step 3.5: Payment Display Profile Consistency (Phase 4) ─────────────
  let usedProfileMatchedAccounts = false
  let fallbackReason = "no_profile_requested"
  let matchingAccountCount = 0

  if (preferredProfileId) {
    const matched = eligible.filter(a => a.display_profile_id === preferredProfileId)
    matchingAccountCount = matched.length
    if (matched.length > 0) {
      eligible = matched
      usedProfileMatchedAccounts = true
      fallbackReason = "none"
    } else {
      fallbackReason = "no_matched_accounts_available"
    }
    
    // Log the filtering event safely without exposing secrets
    console.info(JSON.stringify({
      event: "payment_display_profile.account_filter",
      tenantId,
      storeId,
      resolvedProfileId: preferredProfileId,
      eligibleAccountCount: eligible.length + (usedProfileMatchedAccounts ? 0 : matchingAccountCount), // Original eligible count
      matchingAccountCount,
      usedProfileMatchedAccounts,
      fallbackReason,
    }))
  }
  // ── Step 4: Hourly smoothing — de-prioritise high-velocity accounts ────
  eligible = applyHourlySmoothing(eligible)

  // ── Step 5: Prioritise ACTIVE for high-value orders ────────────────────
  if (requestedAmount >= 100) {
    eligible = eligible.map((a) => {
      if (a.status === "ACTIVE") {
        return { ...a, priority: a.priority * 3 }
      }
      return { ...a, priority: 1 }  // WARMING_UP gets minimum weight
    })
  }

  // ── Step 6: Strategy-aware selection ────────────────────────────────────
  const selected = await selectByStrategy(eligible, tenantId, sql)

  // ── Step 7: Build result ────────────────────────────────────────────────
  const effectiveLimit  = getEffectiveDailyLimit(selected)
  const currentVolume   = parseFloat(selected.current_volume)
  const headroom        = effectiveLimit - currentVolume

  const effectiveMax = selected.status === "WARMING_UP"
    ? Math.min(WARMUP_MAX_TRANSACTION, headroom)
    : headroom

  return {
    accountId:          selected.id,
    clientId:           selected.client_id,
    clientSecret:       decrypt(selected.client_secret),
    shieldDomain:       selected.shield_domain ?? "",
    proxyUrl:           selected.proxy_url ?? null,
    status:             selected.status,
    effectiveMaxAmount: Math.max(0, effectiveMax),
    itemMasking:        selected.item_masking ?? false,
    fakeProductName:    selected.fake_product_name ?? "Digital Service Upgrade",
  }
}
