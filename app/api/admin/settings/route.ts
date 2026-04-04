/**
 * GET  /api/admin/settings — Read all system_settings rows
 * POST /api/admin/settings — Upsert settings into system_settings
 *
 * Auth: SUPER_ADMIN only for writes. MERCHANT can read (limited by frontend).
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

// ─── Row shape from system_settings table ─────────────────────────────────────
interface SettingsRow {
  key:        string
  value:      Record<string, unknown>
  updated_at: string
}

// ─── GET: Read all settings ───────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sql = getSql()

  const rows = (await sql`
    SELECT key, value, updated_at FROM system_settings ORDER BY key
  `) as unknown as SettingsRow[]

  // Build a structured response from key-value rows
  const settings: Record<string, unknown> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }

  return NextResponse.json({ settings })
}

// ─── POST: Upsert settings ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Only SUPER_ADMIN can modify global settings
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sql = getSql()

  // Upsert each settings key
  const allowedKeys = ["rotation_rules", "telegram", "security", "gateway_controls", "gateway_api_key"]
  const results: Record<string, boolean> = {}

  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const jsonValue = JSON.stringify(body[key])
      await sql`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (${key}, ${jsonValue}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = ${jsonValue}::jsonb,
            updated_at = NOW()
      `
      results[key] = true
    }
  }

  return NextResponse.json({ ok: true, updated: results })
}
