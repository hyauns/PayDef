/**
 * lib/db-retry.ts — Transient Neon DB retry wrapper
 *
 * Retries only on transient network/connection errors that are safe to retry.
 * Does NOT retry constraint violations, syntax errors, or business logic errors.
 *
 * Usage:
 *   const rows = await withDbRetry(() => sql`SELECT ...`, "checkout.preflight")
 */

const TRANSIENT_PATTERNS = [
  /fetch failed/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /UND_ERR_CONNECT_TIMEOUT/i,
  /connection terminated unexpectedly/i,
  /Connection terminated/i,
  /socket hang up/i,
  /network socket disconnected/i,
  /timeout expired/i,
  /AbortError/i,
]

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message + (err.cause ? ` ${String(err.cause)}` : "")
  return TRANSIENT_PATTERNS.some((p) => p.test(msg))
}

const BACKOFF_MS = [250, 750, 1500]

/**
 * Wraps a DB query function with retry logic for transient failures.
 *
 * @param fn     — async function that performs the DB operation
 * @param label  — short identifier for log messages (e.g. "checkout.preflight")
 * @param maxRetries — number of retries (default 2, so 3 total attempts)
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (!isTransientError(err) || attempt >= maxRetries) {
        throw err
      }

      const delayMs = BACKOFF_MS[attempt] ?? 1500
      console.warn(
        `[db-retry] Transient error on "${label}" (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms: ${err instanceof Error ? err.message : String(err)}`
      )
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError
}
