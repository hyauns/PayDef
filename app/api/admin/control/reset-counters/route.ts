/**
 * POST /api/admin/control/reset-counters
 *
 * Manually resets all merchant account daily volume counters to zero.
 * This is the admin-triggered equivalent of the daily cron job.
 *
 * Auth: SUPER_ADMIN only.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface ResetRow {
  id:              string
  name:            string
  tenant_id:       string
  previous_volume: string
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  // Reset all accounts with volume > 0
  const resetRows = (await sql`
    UPDATE merchant_accounts
    SET
      current_volume  = 0,
      volume_reset_at = NOW(),
      updated_at      = NOW()
    WHERE current_volume > 0
    RETURNING id, name, tenant_id, current_volume AS previous_volume
  `) as unknown as ResetRow[]

  const accountsReset = resetRows.length
  const totalVolumeCleared = resetRows.reduce(
    (sum, row) => sum + parseFloat(row.previous_volume),
    0
  )

  // Log to audit with details
  await sql`
    INSERT INTO system_logs (action, status, level, metadata)
    VALUES (
      'DAILY_COUNTERS_RESET',
      'OK',
      'warning',
      ${JSON.stringify({
        admin: session.user.email,
        trigger: "manual",
        accountsReset,
        totalVolumeCleared: Math.round(totalVolumeCleared * 100) / 100,
        detail: accountsReset > 0
          ? `Manually reset ${accountsReset} accounts, cleared $${totalVolumeCleared.toFixed(2)} volume`
          : "No accounts had volume to reset",
        resetDetails: resetRows.slice(0, 20).map(r => ({
          accountId: r.id,
          name: r.name,
          previousVolume: parseFloat(r.previous_volume),
        })),
      })}::jsonb
    )
  `

  return NextResponse.json({
    ok: true,
    accountsReset,
    totalVolumeCleared: Math.round(totalVolumeCleared * 100) / 100,
    message: accountsReset > 0
      ? `Reset ${accountsReset} account${accountsReset === 1 ? "" : "s"}, cleared $${totalVolumeCleared.toFixed(2)} total volume`
      : "All accounts were already at zero volume",
  })
}
