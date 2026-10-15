/**
 * lib/shield-health.ts — health probe for the shield hosts (pay.<brand>.com)
 * that PayPal orders return to.
 *
 * A shield host that does not answer means an approved PayPal order is never
 * captured (the buyer returns to /order/success on that host).
 *
 * The filter (filterHealthyShieldAccounts / applyShieldHealth) drops accounts
 * whose shield the probe has recently seen DOWN. SHIELD_HEALTH_MODE=shadow
 * (the default) only logs what would be skipped; enforce actually skips them.
 * Missing information fails open: no probe row, a NULL probe_up, a stale
 * probe_checked_at, or a failed lookup all count as healthy, so a monitoring
 * gap can never block checkout on its own.
 */

import { sendTelegramMessage } from "@/lib/telegram"

export const PROBE_PATH = "/api/health/shield-popup"
export const PROBE_BODY = "shield-popup-ok"
export const PROBE_TIMEOUT_MS = 5_000
export const DOWN_AFTER_FAILURES = 2
export const PROBE_STALE_MS = 5 * 60_000

export interface ProbeResult {
  ok: boolean
  status: number | null
  error: string | null
}

export function normalizeDomain(d: string | null | undefined): string {
  return (d ?? "").trim().toLowerCase().replace(/\.$/, "")
}

function shortError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string } } | null
  const code = e?.cause?.code
  const text = e?.name === "TimeoutError" ? `timeout after ${PROBE_TIMEOUT_MS} ms` : (e?.message || String(err))
  return (code ? `${code}: ${text}` : text).slice(0, 200)
}

/** GET https://<domain>/api/health/shield-popup — healthy only on 200 + the exact body. */
export async function probeShieldDomain(domain: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  try {
    const res = await fetchImpl(`https://${domain}${PROBE_PATH}`, {
      method: "GET",
      redirect: "manual", // a host redirecting elsewhere is not our shield
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "User-Agent": "PayLaz-ShieldHealthCheck/1.0" },
    })
    if (res.status !== 200) {
      // free the connection: the body is never read on a non-200
      try { await res.body?.cancel() } catch { /* ignore */ }
      return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    }
    const body = (await res.text()).trim()
    if (body !== PROBE_BODY) return { ok: false, status: 200, error: "unexpected body (not a PayLaz shield)" }
    return { ok: true, status: 200, error: null }
  } catch (err) {
    return { ok: false, status: null, error: shortError(err) }
  }
}

/** DOWN after DOWN_AFTER_FAILURES consecutive failures, UP after one success. */
export function nextHealth(
  prev: { probe_up: boolean | null; probe_failures: number },
  ok: boolean
): { probe_up: boolean | null; probe_failures: number; flipped: "down" | "up" | null } {
  if (ok) return { probe_up: true, probe_failures: 0, flipped: prev.probe_up === false ? "up" : null }
  const failures = prev.probe_failures + 1
  if (failures >= DOWN_AFTER_FAILURES) {
    return { probe_up: false, probe_failures: failures, flipped: prev.probe_up === false ? null : "down" }
  }
  return { probe_up: prev.probe_up, probe_failures: failures, flipped: null }
}

// ─── Using the state: which accounts may take a PayPal order ─────────────────

export type ShieldHealthMode = "shadow" | "enforce"
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>

export interface ShieldHealthRow {
  domain: string
  probe_up: boolean | null
  probe_checked_at: string | Date | null
}

export function getShieldHealthMode(): ShieldHealthMode {
  return process.env.SHIELD_HEALTH_MODE?.trim().toLowerCase() === "enforce" ? "enforce" : "shadow"
}

function knownDown(row: ShieldHealthRow | undefined, now: Date): boolean {
  if (!row || row.probe_up !== false || !row.probe_checked_at) return false
  return now.getTime() - new Date(row.probe_checked_at).getTime() < PROBE_STALE_MS
}

/**
 * Accounts behind a shield the probe has recently seen DOWN are skipped
 * (enforce) or only reported (shadow). Order is preserved — the rotation
 * pointer indexes this list. An empty result is never widened back.
 */
export function filterHealthyShieldAccounts<T extends { id: string; shield_domain: string | null }>(
  accounts: T[],
  health: ShieldHealthRow[],
  mode: ShieldHealthMode,
  now: Date
): { accounts: T[]; skipped: Array<{ accountId: string; domain: string }> } {
  const byDomain = new Map(health.map((h) => [normalizeDomain(h.domain), h]))
  const kept: T[] = []
  const skipped: Array<{ accountId: string; domain: string }> = []
  for (const a of accounts) {
    const domain = normalizeDomain(a.shield_domain)
    if (domain && knownDown(byDomain.get(domain), now)) {
      skipped.push({ accountId: a.id, domain })
      if (mode === "shadow") kept.push(a)
    } else {
      kept.push(a)
    }
  }
  return { accounts: kept, skipped }
}

/** Probe state for the given shield hosts. Never throws: no data = healthy. */
export async function loadShieldHealth(sql: SqlTag, domains: Array<string | null>): Promise<ShieldHealthRow[]> {
  const list = [...new Set(domains.map(normalizeDomain).filter(Boolean))]
  if (list.length === 0) return []
  try {
    return (await sql`
      SELECT domain, probe_up, probe_checked_at
      FROM shield_domains
      WHERE LOWER(domain) = ANY(${list}) AND is_active = true
    `) as ShieldHealthRow[]
  } catch (err) {
    console.warn("[shield-health] health lookup failed (treated as healthy):", err instanceof Error ? err.message : err)
    return []
  }
}

/** Load + filter + log, for the account pipelines of checkout and button-session. */
export async function applyShieldHealth<T extends { id: string; shield_domain: string | null }>(
  accounts: T[],
  sql: SqlTag,
  ctx: { storeId: string; tenantId: string },
  mode: ShieldHealthMode = getShieldHealthMode(),
  now: Date = new Date()
): Promise<{ accounts: T[]; skipped: Array<{ accountId: string; domain: string }>; refusedAll: boolean }> {
  if (accounts.length === 0) return { accounts, skipped: [], refusedAll: false }
  const health = await loadShieldHealth(sql, accounts.map((a) => a.shield_domain))
  const r = filterHealthyShieldAccounts(accounts, health, mode, now)
  for (const s of r.skipped) {
    console.warn(
      `[shield-health] ${mode === "enforce" ? "skipped" : "would_skip"} account=${s.accountId} shield=${s.domain} store=${ctx.storeId} tenant=${ctx.tenantId}`
    )
  }
  return { ...r, refusedAll: mode === "enforce" && r.accounts.length === 0 }
}

// ─── The probe run (recovery cron, every minute) ─────────────────────────────

interface DomainStateRow {
  id: string
  domain: string
  probe_up: boolean | null
  probe_failures: number
  probe_changed_at: string | Date | null
}

interface AlertAccount {
  id: string
  name: string
  tenant_id: string
  shield_domain: string | null
  tenant_name: string
  telegram_bot_token: string | null
  telegram_chat_id: string | null
}

interface Flip {
  domain: string
  to: "down" | "up"
  error: string | null
  downSince: Date | null // set for "up": when it went down
}

export interface ShieldProbeSummary {
  probed: number
  down: string[]
  flips: Array<{ domain: string; to: "down" | "up" }>
  alerts: number
}

type Sender = (botToken: string, chatId: string, text: string) => Promise<{ ok: boolean; error?: string }>

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60} min` : ""}`
}

/** One message per tenant (with a Telegram bot) that has an account behind a flipped shield. */
export function buildShieldAlerts(input: {
  flips: Flip[]
  accounts: AlertAccount[]
  upByDomain: Map<string, boolean | null>
  mode: ShieldHealthMode
  now: Date
}): Array<{ tenantId: string; botToken: string; chatId: string; text: string }> {
  const out: Array<{ tenantId: string; botToken: string; chatId: string; text: string }> = []
  const tenants = new Map<string, AlertAccount[]>()
  for (const a of input.accounts) {
    if (!a.telegram_bot_token || !a.telegram_chat_id) continue
    tenants.set(a.tenant_id, [...(tenants.get(a.tenant_id) ?? []), a])
  }
  for (const [tenantId, accts] of tenants) {
    const lines: string[] = []
    for (const f of input.flips) {
      const users = accts.filter((a) => normalizeDomain(a.shield_domain) === f.domain)
      if (users.length === 0) continue
      const names = users.map((a) => escapeHtml(a.name)).join(", ")
      if (f.to === "down") {
        const effect = input.mode === "enforce" ? "skipped for new PayPal orders" : "shadow mode: NOT skipped"
        lines.push(`🔴 <b>Shield DOWN</b>: <code>${escapeHtml(f.domain)}</code> — ${escapeHtml(f.error ?? "unknown error")}\nAccounts: ${names} (${effect})`)
      } else {
        const down = f.downSince ? ` (down ${duration(input.now.getTime() - new Date(f.downSince).getTime())})` : ""
        lines.push(`✅ <b>Shield back UP</b>: <code>${escapeHtml(f.domain)}</code>${down}\nAccounts: ${names}`)
      }
    }
    if (lines.length === 0) continue
    const healthy = accts.some((a) => input.upByDomain.get(normalizeDomain(a.shield_domain)) !== false)
    if (!healthy) {
      const what = input.mode === "enforce" ? "PayPal checkout is refused" : "PayPal is still routed to them (shadow mode)"
      lines.push(`⛔ No PayPal account of ${escapeHtml(accts[0].tenant_name)} has a working shield — ${what}.`)
    }
    out.push({ tenantId, botToken: accts[0].telegram_bot_token!, chatId: accts[0].telegram_chat_id!, text: lines.join("\n\n") })
  }
  return out
}

export async function runShieldHealthProbe(
  sql: SqlTag,
  opts: { mode?: ShieldHealthMode; fetchImpl?: typeof fetch; now?: Date; send?: Sender } = {}
): Promise<ShieldProbeSummary> {
  const mode = opts.mode ?? getShieldHealthMode()
  const now = opts.now ?? new Date()
  const send = opts.send ?? sendTelegramMessage
  const enforce = mode === "enforce"

  const rows = (await sql`
    SELECT id, domain, probe_up, probe_failures, probe_changed_at
    FROM   shield_domains
    WHERE  is_active = true
  `) as DomainStateRow[]
  const accounts = (await sql`
    SELECT ma.id, ma.name, ma.tenant_id, ma.shield_domain,
           t.name AS tenant_name, t.telegram_bot_token, t.telegram_chat_id
    FROM   merchant_accounts ma
    JOIN   tenants t ON t.id = ma.tenant_id
    WHERE  ma.status IN ('ACTIVE', 'WARMING_UP')
  `) as AlertAccount[]

  const registered = new Set(rows.map((r) => normalizeDomain(r.domain)))
  for (const a of accounts) {
    const d = normalizeDomain(a.shield_domain)
    if (d && !registered.has(d)) console.warn(`[shield-health] unregistered_domain account=${a.id} shield=${d}`)
  }

  const results = await Promise.all(rows.map((r) => probeShieldDomain(normalizeDomain(r.domain), opts.fetchImpl)))
  const flips: Flip[] = []
  const upByDomain = new Map<string, boolean | null>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const res = results[i]
    const domain = normalizeDomain(row.domain)
    const next = nextHealth({ probe_up: row.probe_up, probe_failures: row.probe_failures }, res.ok)
    // health_ok (read by the rest of the system) only follows the probe in enforce.
    try {
      await sql`
      UPDATE shield_domains
      SET    probe_up         = ${next.probe_up},
             probe_failures   = ${next.probe_failures},
             probe_error      = ${res.error},
             probe_checked_at = NOW(),
             probe_changed_at = CASE WHEN ${next.flipped !== null} THEN NOW() ELSE probe_changed_at END,
             last_check       = NOW(),
             health_ok = CASE WHEN ${enforce} AND ${next.probe_up}::boolean IS NOT NULL THEN ${next.probe_up}::boolean ELSE health_ok END
      WHERE  id = ${row.id}
    `
    } catch (err) {
      // not persisted → the flip is not reported now; it happens again next run
      console.error(`[shield-health] state write failed domain=${domain} :`, err instanceof Error ? err.message : err)
      upByDomain.set(domain, row.probe_up)
      continue
    }
    upByDomain.set(domain, next.probe_up)
    if (next.flipped) flips.push({ domain, to: next.flipped, error: res.error, downSince: next.flipped === "up" ? (row.probe_changed_at ? new Date(row.probe_changed_at) : null) : null })
    if (next.flipped) console.warn(`[shield-health] ${domain} is ${next.flipped.toUpperCase()} (${res.error ?? "ok"}) mode=${mode}`)
  }

  let alerts = 0
  for (const m of buildShieldAlerts({ flips, accounts, upByDomain, mode, now })) {
    try {
      const r = await send(m.botToken, m.chatId, m.text)
      if (r.ok) alerts++
      else console.error(`[shield-health] Telegram alert failed tenant=${m.tenantId}: ${r.error}`)
    } catch (err) {
      console.error(`[shield-health] Telegram alert error tenant=${m.tenantId}:`, err instanceof Error ? err.message : err)
    }
  }

  return {
    probed: rows.length,
    down: [...upByDomain].filter(([, up]) => up === false).map(([d]) => d),
    flips: flips.map((f) => ({ domain: f.domain, to: f.to })),
    alerts,
  }
}

/** For the recovery cron: a failing probe must never fail the sweep. */
export async function safeRunShieldHealthProbe(
  sql: SqlTag,
  opts: Parameters<typeof runShieldHealthProbe>[1] = {}
): Promise<ShieldProbeSummary | { error: string }> {
  try {
    return await runShieldHealthProbe(sql, opts)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.warn("[shield-health] probe run failed:", error)
    return { error }
  }
}
