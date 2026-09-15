/**
 * Turning a thrown value into something a human can act on later.
 *
 * `error.message` alone is not enough. Neon's serverless driver wraps the real
 * failure in `error.cause`, and the outer Error often carries an empty message —
 * which is how 384 of the 805 recorded RECOVERY_SWEEP failures ended up in
 * system_logs as `{"error": ""}`: logged, counted, and completely undiagnosable.
 *
 * describeError walks the cause chain so the detail that actually identifies the
 * failure survives into the log.
 */

const MAX_CAUSE_DEPTH = 5

function readCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null
  const code = (value as { code?: unknown }).code
  return typeof code === "string" && code.trim() !== "" ? code : null
}

/**
 * Flattens an error and its `cause` chain into one line, e.g.
 *   "Error <- TypeError: fetch failed <- Error: connect ETIMEDOUT (ETIMEDOUT)"
 * An Error with a blank message still contributes its name, so a link in the
 * chain is never silently dropped.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    const raw = String(error).trim()
    return raw === "" ? "Unknown error" : raw
  }

  const parts: string[] = []
  let current: unknown = error

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
    const name = current.name?.trim() || "Error"
    const message = current.message?.trim() ?? ""
    const code = readCode(current)

    let part = message === "" ? name : `${name}: ${message}`
    if (code && !part.includes(code)) part += ` (${code})`
    parts.push(part)

    current = (current as { cause?: unknown }).cause
  }

  // A non-Error tail (a string, a plain object with a code) still carries detail.
  if (current !== undefined && current !== null && !(current instanceof Error)) {
    const code = readCode(current)
    const tail = code ?? String(current).trim()
    if (tail && tail !== "[object Object]") parts.push(tail)
  }

  return parts.join(" <- ") || "Unknown error"
}

/**
 * Whether a failure is the database being briefly unreachable rather than
 * something wrong with our code.
 *
 * Neon suspends an idle compute, so the first connection after a quiet spell can
 * fail outright. A per-minute job hits that regularly: on this deployment the
 * recovery sweep failed on 0.14%-8% of runs depending on the day, every single
 * one of them a connection failure. Those runs are harmless — the sweep is
 * idempotent and the next minute picks the work up — so they should not be
 * recorded at the same severity as a real fault, or they bury it.
 */
const TRANSIENT_PATTERNS = [
  /fetch failed/i,
  /error connecting to database/i,
  /connection terminated/i,
  /connect(ion)? timeout/i,
  /socket hang up/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /EAI_AGAIN/,
  /ENOTFOUND/,
  /UND_ERR_/,
]

export function isTransientConnectionError(error: unknown): boolean {
  const described = describeError(error)
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(described))
}
