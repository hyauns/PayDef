import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { processDueWebhookEvents } from "@/lib/webhook-delivery"
import { processExpiredTransactions } from "@/lib/gateway-recovery"
import { describeError, isTransientConnectionError } from "@/lib/error-describe"

/** One retry only: the next scheduled run is 60s away and picks up anything missed. */
const SWEEP_MAX_ATTEMPTS = 2
/** Long enough for a suspended Neon compute to accept a connection, short enough
 *  that the job still finishes well inside its own one-minute slot. */
const SWEEP_RETRY_DELAY_MS = 1_500

function isStrictProduction(): boolean {
  return process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
}

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (isStrictProduction()) {
      console.error("[cron/recovery] CRON_SECRET is missing in production")
      return false
    }

    console.warn("[cron/recovery] CRON_SECRET not set outside production")
    return true
  }

  const authHeader = req.headers.get("authorization")
  if (!authHeader) return false

  const token = authHeader.replace(/^Bearer\s+/i, "")
  return token === cronSecret
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sql = getSql()
  const startedAt = Date.now()

  let deliveries: Awaited<ReturnType<typeof processDueWebhookEvents>> | null = null
  let expirations: Awaited<ReturnType<typeof processExpiredTransactions>> | null = null
  let lastError: unknown
  let attempts = 0

  // Neon suspends an idle compute, so the first connection after a quiet spell
  // can fail outright — the sole cause of every recorded failure of this job.
  // Waiting for the next minute's run costs up to 60s of webhook-delivery delay;
  // a single short retry usually clears it, and both sweeps are safe to re-enter
  // (the delivery lease and SKIP LOCKED keep a re-run from doubling any work).
  for (let attempt = 1; attempt <= SWEEP_MAX_ATTEMPTS; attempt++) {
    attempts = attempt
    try {
      ;[deliveries, expirations] = await Promise.all([
        processDueWebhookEvents(50),
        processExpiredTransactions(50),
      ])
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      const worthRetrying =
        attempt < SWEEP_MAX_ATTEMPTS && isTransientConnectionError(error)
      if (!worthRetrying) break
      await new Promise((resolve) => setTimeout(resolve, SWEEP_RETRY_DELAY_MS))
    }
  }

  const durationMs = Date.now() - startedAt

  if (deliveries && expirations) {
    await sql`
      INSERT INTO system_logs (action, status, level, metadata)
      VALUES (
        'RECOVERY_SWEEP',
        'OK',
        'info',
        ${JSON.stringify({
          deliveries_processed: deliveries.length,
          expired_sessions: expirations.expiredSessions,
          expired_authorizations: expirations.expiredAuthorizations,
          duration_ms: durationMs,
          attempts,
          triggered_at: new Date().toISOString(),
        })}::jsonb
      )
    `

    return NextResponse.json({
      status: "ok",
      deliveries_processed: deliveries.length,
      expired_sessions: expirations.expiredSessions,
      expired_authorizations: expirations.expiredAuthorizations,
      duration_ms: durationMs,
      attempts,
    })
  }

  // describeError walks the cause chain: the outer Error thrown by the Neon
  // driver frequently has an empty message, which is why so many recorded
  // failures used to read {"error": ""} and could not be diagnosed at all.
  const message = describeError(lastError)
  const transient = isTransientConnectionError(lastError)

  try {
    await sql`
      INSERT INTO system_logs (action, status, level, metadata)
      VALUES (
        'RECOVERY_SWEEP',
        ${transient ? "PARTIAL" : "ERROR"},
        ${transient ? "warning" : "error"},
        ${JSON.stringify({
          error: message,
          transient,
          attempts,
          duration_ms: durationMs,
          triggered_at: new Date().toISOString(),
        })}::jsonb
      )
    `
  } catch {
    // ignore secondary log failures
  }

  return NextResponse.json(
    { error: "Recovery sweep failed", details: message, transient, attempts },
    { status: 500 }
  )
}
