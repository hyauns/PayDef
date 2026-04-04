/**
 * GET  /api/admin/gateway-controls — Read current gateway control states
 * POST /api/admin/gateway-controls — Update rotation/maintenance toggles
 *
 * Auth: SUPER_ADMIN only.
 * Writes to system_settings key 'gateway_controls'.
 * All changes are logged to system_logs for audit trail.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface SettingsRow {
  value: { rotationEnabled?: boolean; maintenanceMode?: boolean }
}

// ─── GET: Read current gateway controls ───────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()
  const rows = (await sql`
    SELECT value FROM system_settings WHERE key = 'gateway_controls'
  `) as unknown as SettingsRow[]

  const controls = rows[0]?.value ?? { rotationEnabled: true, maintenanceMode: false }

  return NextResponse.json({ controls })
}

// ─── POST: Update gateway controls ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { rotationEnabled?: boolean; maintenanceMode?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sql = getSql()

  // Read current values
  const current = (await sql`
    SELECT value FROM system_settings WHERE key = 'gateway_controls'
  `) as unknown as SettingsRow[]

  const prev = current[0]?.value ?? { rotationEnabled: true, maintenanceMode: false }

  // Merge with incoming changes
  const next = {
    rotationEnabled: body.rotationEnabled ?? prev.rotationEnabled ?? true,
    maintenanceMode: body.maintenanceMode ?? prev.maintenanceMode ?? false,
  }

  const jsonValue = JSON.stringify(next)

  await sql`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('gateway_controls', ${jsonValue}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = ${jsonValue}::jsonb, updated_at = NOW()
  `

  // Log the change to system_logs
  const changes: string[] = []
  if (body.rotationEnabled !== undefined && body.rotationEnabled !== prev.rotationEnabled) {
    changes.push(`Global Rotation ${body.rotationEnabled ? "enabled" : "disabled"}`)
  }
  if (body.maintenanceMode !== undefined && body.maintenanceMode !== prev.maintenanceMode) {
    changes.push(`Maintenance Mode ${body.maintenanceMode ? "ACTIVATED" : "deactivated"}`)
  }

  if (changes.length > 0) {
    await sql`
      INSERT INTO system_logs (action, status, level, metadata)
      VALUES (
        'GATEWAY_CONTROL_CHANGE',
        'OK',
        'info',
        ${JSON.stringify({
          changes,
          admin: session.user.email,
          previous: prev,
          current: next,
        })}::jsonb
      )
    `
  }

  return NextResponse.json({ ok: true, controls: next })
}
