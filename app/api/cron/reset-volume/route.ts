/**
 * GET /api/cron/reset-volume
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  DAILY VOLUME RESET — Vercel Cron Job                              │
 * │                                                                     │
 * │  Runs at 00:00 UTC daily. Resets current_volume to 0 on all        │
 * │  merchant_accounts that haven't been reset in the last 23 hours.   │
 * │                                                                     │
 * │  Security: Protected by CRON_SECRET header verification.           │
 * │  Vercel injects `Authorization: Bearer <CRON_SECRET>` on cron      │
 * │  invocations automatically.                                         │
 * │                                                                     │
 * │  Audit: Every run is logged to the `system_logs` table.            │
 * └─────────────────────────────────────────────────────────────────────┘
 */
import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"

function isStrictProduction(): boolean {
  return process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResetRow {
  id:             string
  tenant_id:      string
  name:           string
  previous_volume: string
}

// ─── Security: Verify CRON_SECRET ─────────────────────────────────────────────

function verifyCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    if (isStrictProduction()) {
      console.error("[cron/reset-volume] CRON_SECRET is missing in production — rejecting request")
      return false
    }

    console.warn("[cron/reset-volume] CRON_SECRET not set — accepting request outside production")
    return true
  }

  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization")
  if (!authHeader) return false

  const token = authHeader.replace(/^Bearer\s+/i, "")
  return token === cronSecret
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Authenticate ────────────────────────────────────────────────────────
  if (!verifyCronSecret(req)) {
    console.error("[cron/reset-volume] Unauthorized cron request rejected")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const sql = getSql()

  try {
    // ── Step 1: Reset volumes ───────────────────────────────────────────
    // Only reset accounts where volume_reset_at is null or older than 23 hours.
    // Using 23 hours (not 24) provides a 1-hour buffer to prevent edge-case
    // skips if the cron fires slightly before midnight.
    const resetRows = (await sql`
      UPDATE merchant_accounts
      SET
        current_volume  = 0,
        volume_reset_at = NOW(),
        updated_at      = NOW()
      WHERE
        (volume_reset_at IS NULL OR volume_reset_at < NOW() - INTERVAL '23 hours')
        AND current_volume > 0
      RETURNING id, tenant_id, name, current_volume AS previous_volume
    `) as unknown as ResetRow[]

    const accountsReset = resetRows.length
    const totalVolumeCleared = resetRows.reduce(
      (sum, row) => sum + parseFloat(row.previous_volume),
      0
    )

    // ── Step 2: Build per-tenant summary ────────────────────────────────
    const tenantSummary: Record<string, { accounts: number; volumeCleared: number }> = {}
    for (const row of resetRows) {
      if (!tenantSummary[row.tenant_id]) {
        tenantSummary[row.tenant_id] = { accounts: 0, volumeCleared: 0 }
      }
      tenantSummary[row.tenant_id].accounts++
      tenantSummary[row.tenant_id].volumeCleared += parseFloat(row.previous_volume)
    }

    // ── Step 3: Count accounts already at 0 (no reset needed) ───────────
    const zeroVolumeResult = await sql`
      SELECT COUNT(*) AS count
      FROM merchant_accounts
      WHERE current_volume = 0
    `
    const alreadyZero = parseInt(
      (zeroVolumeResult as unknown as { count: string }[])[0]?.count ?? "0",
      10
    )

    // ── Step 4: Log to system_logs ──────────────────────────────────────
    const durationMs = Date.now() - startTime
    const logMetadata = {
      accounts_reset:       accountsReset,
      accounts_already_zero: alreadyZero,
      total_volume_cleared: Math.round(totalVolumeCleared * 100) / 100,
      tenant_summary:       tenantSummary,
      duration_ms:          durationMs,
      triggered_at:         new Date().toISOString(),
      reset_details:        resetRows.map((r) => ({
        account_id:      r.id,
        account_name:    r.name,
        tenant_id:       r.tenant_id,
        previous_volume: parseFloat(r.previous_volume),
      })),
    }

    await sql`
      INSERT INTO system_logs (action, status, metadata)
      VALUES (
        'VOLUME_RESET',
        'OK',
        ${JSON.stringify(logMetadata)}::jsonb
      )
    `

    console.log(
      `[cron/reset-volume] ✅ Reset ${accountsReset} account(s), ` +
      `cleared $${totalVolumeCleared.toFixed(2)} total volume in ${durationMs}ms`
    )

    // ── Response ────────────────────────────────────────────────────────
    return NextResponse.json({
      status: "ok",
      accounts_reset: accountsReset,
      accounts_already_zero: alreadyZero,
      total_volume_cleared: Math.round(totalVolumeCleared * 100) / 100,
      duration_ms: durationMs,
    })
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    // Log failure to system_logs
    try {
      await sql`
        INSERT INTO system_logs (action, status, metadata)
        VALUES (
          'VOLUME_RESET',
          'ERROR',
          ${JSON.stringify({
            error: errorMessage,
            duration_ms: durationMs,
            triggered_at: new Date().toISOString(),
          })}::jsonb
        )
      `
    } catch (logError) {
      console.error("[cron/reset-volume] Failed to write error log:", logError)
    }

    console.error("[cron/reset-volume] ❌ Reset failed:", error)
    return NextResponse.json(
      { error: "Volume reset failed", details: errorMessage },
      { status: 500 }
    )
  }
}
