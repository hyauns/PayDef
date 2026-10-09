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
      headers: { "User-Agent": "PayDef-ShieldHealthCheck/1.0" },
    })
    if (res.status !== 200) return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    const body = (await res.text()).trim()
    if (body !== PROBE_BODY) return { ok: false, status: 200, error: "unexpected body (not a PayDef shield)" }
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
      WHERE LOWER(domain) = ANY(${list})
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
