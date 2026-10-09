/**
 * lib/shield-health.ts — health probe for the shield hosts (pay.<brand>.com)
 * that PayPal orders return to.
 *
 * A shield host that does not answer means an approved PayPal order is never
 * captured (the buyer returns to /order/success on that host).
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
