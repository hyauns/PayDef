/**
 * GET /api/admin/audit — Returns recent admin activity log entries
 *
 * Filters system_logs for admin-relevant actions: login, setting changes,
 * key rotations, session revocations, tenant management, etc.
 *
 * Auth: SUPER_ADMIN only.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

// Admin-relevant action types to include in the audit log
const ADMIN_ACTIONS = [
  "USER_LOGIN",
  "GATEWAY_CONTROL_CHANGE",
  "API_KEY_ROTATED",
  "SESSION_REVOKED",
  "TENANT_CREATED",
  "TENANT_SUSPENDED",
  "TENANT_UNSUSPENDED",
  "SETTING_CHANGED",
  "ACCOUNT_UPDATED",
  "DOMAIN_ROTATED",
  "FRAUD_BLOCKLIST_CLEARED",
  "DAILY_COUNTERS_RESET",
  "IPN_QUEUE_FLUSHED",
  "WELCOME_EMAIL_SENT",
  "WELCOME_EMAIL_FAILED",
]

interface AuditRow {
  id:         string
  action:     string
  status:     string
  level:      string
  metadata:   Record<string, unknown>
  created_at: string
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))

  const sql = getSql()

  // Build the action filter as a SQL array
  const rows = (await sql`
    SELECT id, action, status, level, metadata, created_at
    FROM system_logs
    WHERE action = ANY(${ADMIN_ACTIONS})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as unknown as AuditRow[]

  const entries = rows.map((row) => {
    const meta = row.metadata ?? {}
    return {
      id:        row.id,
      action:    row.action,
      status:    row.status,
      level:     row.level,
      admin:     (meta.admin as string) ?? (meta.email as string) ?? "system",
      detail:    formatAuditDetail(row.action, meta),
      createdAt: row.created_at,
    }
  })

  return NextResponse.json({ entries })
}

// ─── Format human-readable audit descriptions ─────────────────────────────────

function formatAuditDetail(action: string, meta: Record<string, unknown>): string {
  switch (action) {
    case "USER_LOGIN":
      return `Login by ${meta.email ?? "unknown"} (${meta.role ?? "MERCHANT"})`
    case "GATEWAY_CONTROL_CHANGE": {
      const changes = meta.changes as string[] | undefined
      return changes?.join(", ") ?? "Gateway controls updated"
    }
    case "API_KEY_ROTATED":
      return meta.detail as string ?? "Gateway API key rotated"
    case "SESSION_REVOKED":
      return meta.detail as string ?? "User session revoked"
    case "TENANT_CREATED":
      return `New tenant created: ${meta.tenantName ?? "unknown"}`
    case "TENANT_SUSPENDED":
      return `Tenant suspended: ${meta.tenantName ?? "unknown"}`
    case "TENANT_UNSUSPENDED":
      return `Tenant restored: ${meta.tenantName ?? "unknown"}`
    case "SETTING_CHANGED":
      return meta.detail as string ?? "Settings updated"
    case "WELCOME_EMAIL_SENT":
      return `Welcome email sent to ${meta.recipientEmail ?? "unknown"}`
    case "WELCOME_EMAIL_FAILED":
      return `Welcome email failed for ${meta.recipientEmail ?? "unknown"}: ${meta.error ?? "unknown error"}`
    case "DOMAIN_ROTATED":
      return meta.detail as string ?? `Shield domain rotated to ${meta.newDomain ?? "unknown"}`
    case "IPN_QUEUE_FLUSHED":
      return meta.detail as string ?? "IPN queue flushed"
    case "FRAUD_BLOCKLIST_CLEARED":
      return meta.detail as string ?? "Fraud blocklist cleared"
    case "DAILY_COUNTERS_RESET":
      return meta.detail as string ?? "Daily counters manually reset"
    default:
      return meta.detail as string ?? action.replace(/_/g, " ").toLowerCase()
  }
}
