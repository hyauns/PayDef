import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { processDueWebhookEvents } from "@/lib/webhook-delivery"
import { processExpiredTransactions } from "@/lib/gateway-recovery"

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

  try {
    const [deliveries, expirations] = await Promise.all([
      processDueWebhookEvents(50),
      processExpiredTransactions(50),
    ])

    const durationMs = Date.now() - startedAt

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
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"

    try {
      await sql`
        INSERT INTO system_logs (action, status, level, metadata)
        VALUES (
          'RECOVERY_SWEEP',
          'ERROR',
          'error',
          ${JSON.stringify({
            error: message,
            triggered_at: new Date().toISOString(),
          })}::jsonb
        )
      `
    } catch {
      // ignore secondary log failures
    }

    return NextResponse.json(
      { error: "Recovery sweep failed", details: message },
      { status: 500 }
    )
  }
}
