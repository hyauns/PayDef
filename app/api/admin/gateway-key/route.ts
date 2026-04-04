/**
 * GET  /api/admin/gateway-key — Read the masked platform API key
 * POST /api/admin/gateway-key — Rotate: generate new 64-char key, invalidate old
 *
 * Auth: SUPER_ADMIN only.
 * The key is stored in system_settings → gateway_api_key.
 * All rotations are logged.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { randomBytes } from "crypto"

interface KeyRow {
  value: { key?: string }
}

function maskKey(key: string): string {
  if (!key || key.length < 16) return "••••••••"
  return key.slice(0, 8) + "•".repeat(key.length - 12) + key.slice(-4)
}

function generateApiKey(): string {
  // 64-character hex key with gw_live_ prefix
  const prefix = "gw_live_"
  const random = randomBytes(32).toString("hex").slice(0, 56) // 56 chars + 8 prefix = 64
  return `${prefix}${random}`
}

// ─── GET: Read masked key ─────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()
  const rows = (await sql`
    SELECT value FROM system_settings WHERE key = 'gateway_api_key'
  `) as unknown as KeyRow[]

  const raw = rows[0]?.value?.key ?? ""

  return NextResponse.json({
    maskedKey: maskKey(raw),
    hasKey: raw.length > 0,
  })
}

// ─── POST: Rotate key ────────────────────────────────────────────────────────

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()
  const newKey = generateApiKey()
  const jsonValue = JSON.stringify({ key: newKey })

  await sql`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('gateway_api_key', ${jsonValue}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = ${jsonValue}::jsonb, updated_at = NOW()
  `

  // Log rotation event
  await sql`
    INSERT INTO system_logs (action, status, level, metadata)
    VALUES (
      'API_KEY_ROTATED',
      'OK',
      'warning',
      ${JSON.stringify({
        admin: session.user.email,
        detail: "Gateway API key rotated — old key invalidated immediately",
      })}::jsonb
    )
  `

  return NextResponse.json({
    newKey,
    maskedKey: maskKey(newKey),
    message: "API key rotated. Save this key now — it will not be shown again.",
  })
}
