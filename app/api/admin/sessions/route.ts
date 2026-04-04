/**
 * GET    /api/admin/sessions — List active login sessions (from system_logs)
 * DELETE /api/admin/sessions — Revoke a session by adding jti to token_blacklist
 *
 * Auth: SUPER_ADMIN only.
 *
 * Since NextAuth uses JWT (stateless), we track sessions via login events
 * in system_logs and implement revocation via a token_blacklist table.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface LoginLogRow {
  id:         string
  metadata:   {
    userId?: string
    email?:  string
    role?:   string
    jti?:    string
    device?: string
    ip?:     string
  }
  created_at: string
}

// ─── GET: List active sessions ────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  // Fetch login events from the last 8 hours (matching JWT maxAge)
  // Exclude sessions whose jti is already in the blacklist
  const rows = (await sql`
    SELECT sl.id, sl.metadata, sl.created_at
    FROM system_logs sl
    WHERE sl.action = 'USER_LOGIN'
      AND sl.status = 'OK'
      AND sl.created_at > NOW() - INTERVAL '8 hours'
      AND NOT EXISTS (
        SELECT 1 FROM token_blacklist tb
        WHERE tb.jti = sl.metadata->>'jti'
      )
    ORDER BY sl.created_at DESC
    LIMIT 20
  `) as unknown as LoginLogRow[]

  const sessions = rows.map((row) => {
    const meta = row.metadata ?? {}
    const loginTime = new Date(row.created_at)
    const expiresAt = new Date(loginTime.getTime() + 8 * 60 * 60 * 1000) // 8h TTL

    return {
      id:        row.id,
      jti:       meta.jti ?? null,
      email:     meta.email ?? "unknown",
      role:      meta.role ?? "MERCHANT",
      device:    meta.device ?? "Unknown Browser",
      ip:        meta.ip ?? "—",
      since:     row.created_at,
      expiresAt: expiresAt.toISOString(),
      isCurrent: meta.jti === (session as any)?.token?.jti,
    }
  })

  return NextResponse.json({ sessions })
}

// ─── DELETE: Revoke a session by jti ──────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { jti: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.jti) {
    return NextResponse.json({ error: "jti is required" }, { status: 400 })
  }

  const sql = getSql()

  // Add to blacklist (expires after JWT maxAge = 8 hours from now)
  await sql`
    INSERT INTO token_blacklist (jti, revoked_by, reason, expires_at)
    VALUES (
      ${body.jti},
      ${session.user.userId ?? null},
      'Revoked by Super Admin',
      NOW() + INTERVAL '8 hours'
    )
    ON CONFLICT (jti) DO NOTHING
  `

  // Log revocation
  await sql`
    INSERT INTO system_logs (action, status, level, metadata)
    VALUES (
      'SESSION_REVOKED',
      'OK',
      'warning',
      ${JSON.stringify({
        admin: session.user.email,
        revokedJti: body.jti,
        detail: "Admin revoked a user session",
      })}::jsonb
    )
  `

  return NextResponse.json({ ok: true })
}
