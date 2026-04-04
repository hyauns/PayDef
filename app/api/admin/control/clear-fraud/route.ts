/**
 * POST /api/admin/control/clear-fraud
 *
 * Clears all entries from the fraud_blocklist table.
 * This removes all blocked IP addresses, resetting fraud prevention.
 *
 * Auth: SUPER_ADMIN only.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  // Count before clearing (for the audit log)
  const countResult = (await sql`
    SELECT COUNT(*) AS total FROM fraud_blocklist
  `) as unknown as { total: string }[]
  const removedCount = parseInt(countResult[0]?.total ?? "0", 10)

  // Truncate the blocklist
  if (removedCount > 0) {
    await sql`TRUNCATE TABLE fraud_blocklist`
  }

  // Log to audit
  await sql`
    INSERT INTO system_logs (action, status, level, metadata)
    VALUES (
      'FRAUD_BLOCKLIST_CLEARED',
      'OK',
      'warning',
      ${JSON.stringify({
        admin: session.user.email,
        removedCount,
        detail: removedCount > 0
          ? `Cleared ${removedCount} blocked IP addresses from fraud blocklist`
          : "Fraud blocklist was already empty",
      })}::jsonb
    )
  `

  return NextResponse.json({
    ok: true,
    removedCount,
    message: removedCount > 0
      ? `Cleared ${removedCount} blocked IP address${removedCount === 1 ? "" : "es"}`
      : "Fraud blocklist was already empty",
  })
}
