/**
 * POST /api/admin/control/flush-ipn
 *
 * Reprocesses failed PayPal IPN/webhook events from the last 24 hours.
 * Queries system_logs for failed webhook entries and marks them for retry.
 *
 * Auth: SUPER_ADMIN only.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface FailedIpnRow {
  id:         string
  metadata:   Record<string, unknown>
  created_at: string
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  // Find failed webhook/IPN events in the last 24 hours
  const failedEntries = (await sql`
    SELECT id, metadata, created_at
    FROM system_logs
    WHERE action IN ('WEBHOOK_FAILED', 'IPN_FAILED', 'PAYPAL_WEBHOOK_ERROR')
      AND status = 'ERROR'
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
  `) as unknown as FailedIpnRow[]

  const retriedCount = failedEntries.length

  // Mark each failed entry as requeued (update status)
  if (retriedCount > 0) {
    const ids = failedEntries.map(e => e.id)
    await sql`
      UPDATE system_logs
      SET status = 'REQUEUED',
          metadata = metadata || '{"requeued": true}'::jsonb
      WHERE id = ANY(${ids})
    `
  }

  // Log the flush action
  await sql`
    INSERT INTO system_logs (action, status, level, metadata)
    VALUES (
      'IPN_QUEUE_FLUSHED',
      'OK',
      'info',
      ${JSON.stringify({
        admin: session.user.email,
        retriedCount,
        timeRange: "last 24 hours",
        detail: retriedCount > 0
          ? `Requeued ${retriedCount} failed IPN entries for reprocessing`
          : "No failed IPN entries found in the last 24 hours",
      })}::jsonb
    )
  `

  return NextResponse.json({
    ok: true,
    retriedCount,
    message: retriedCount > 0
      ? `Requeued ${retriedCount} failed IPN entr${retriedCount === 1 ? "y" : "ies"} for reprocessing`
      : "No failed IPN entries found in the last 24 hours — queue is clean",
  })
}
