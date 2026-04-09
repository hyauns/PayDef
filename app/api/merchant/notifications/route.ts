/**
 * GET /api/merchant/notifications
 *
 * Returns the 10 most recent actionable events for the logged-in merchant's
 * tenant from the `system_logs` table, transformed into the Notification shape
 * expected by the NotificationBell component.
 *
 * Falls back to an empty list if the table doesn't exist or query fails.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface LogRow {
  id:         string
  action:     string
  level:      string
  status:     string
  metadata:   Record<string, unknown> | null
  created_at: string
}

function mapLogToNotification(row: LogRow) {
  const meta    = row.metadata ?? {}
  const timeMs  = new Date(row.created_at).getTime()
  const action  = row.action ?? ""
  const level   = (row.level ?? "info").toLowerCase()

  // Determine type
  let type: "success" | "failed" | "warning" = "success"
  if (level === "error" || row.status === "ERROR") type = "failed"
  else if (level === "warning" || row.status === "WARN") type = "warning"

  // Build human-readable title + description
  let title       = "System Event"
  let description = action.replace(/_/g, " ").toLowerCase()
  let amount: number | undefined

  switch (action) {
    case "TRANSACTION_COMPLETED":
    case "PAYMENT_CAPTURED":
      title       = "Payment Captured"
      description = `Store: ${meta.storeName ?? meta.storeId ?? "Unknown"}`
      amount      = typeof meta.amount === "number" ? meta.amount
                  : typeof meta.amount === "string" ? parseFloat(meta.amount) : undefined
      type = "success"
      break
    case "TRANSACTION_FAILED":
    case "PAYMENT_FAILED":
      title       = "Payment Failed"
      description = `${meta.storeName ?? meta.storeId ?? "Unknown"} — ${meta.reason ?? "declined"}`
      type = "failed"
      break
    case "CHECKOUT_CANCELED":
      title       = "Checkout Canceled"
      description = `Buyer canceled — ${meta.storeName ?? meta.storeId ?? "Unknown"}`
      type = "warning"
      break
    case "CHECKOUT_EXPIRED":
      title       = "Checkout Expired"
      description = `Session timed out — ${meta.storeName ?? meta.storeId ?? "Unknown"}`
      type = "warning"
      break
    case "AUTHORIZATION_EXPIRED":
      title       = "Authorization Expired"
      description = `Capture window missed — ${meta.storeName ?? meta.storeId ?? "Unknown"}`
      type = "warning"
      break
    case "STORE_CREATED":
      title       = "New Store Connected"
      description = `${meta.storeName ?? "A new store"} joined the gateway`
      type = "success"
      break
    case "MERCHANT_ACCOUNT_ADDED":
      title       = "Merchant Account Added"
      description = `${meta.accountName ?? meta.email ?? "New PayPal account"} added to rotation`
      type = "success"
      break
    case "ACCOUNT_LIMIT_WARNING":
    case "DAILY_LIMIT_WARNING":
      title       = "Account Limit Warning"
      description = `${meta.accountName ?? "A PayPal account"} is at ${meta.percentUsed ?? "high"}% daily limit`
      type = "warning"
      break
    case "DISPUTE_OPENED":
      title       = "Dispute Opened"
      description = `${meta.storeName ?? "Unknown"} — ${meta.reason ?? "buyer dispute"}`
      type = "failed"
      break
    case "REFUND_ISSUED":
      title       = "Refund Issued"
      description = `${meta.storeName ?? "Unknown"}`
      type = "warning"
      amount = typeof meta.amount === "number" ? meta.amount : undefined
      break
    default:
      title       = action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      description = typeof meta.storeName === "string" ? meta.storeName : ""
  }

  return {
    id:          row.id,
    type,
    title,
    description,
    amount,
    timeMs,
    read: false,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user
  const isSuperAdmin = role === "SUPER_ADMIN"

  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ notifications: [] })
  }

  try {
    const sql = getSql()

    const rows = isSuperAdmin
      ? (await sql`
          SELECT id, action, level, status, metadata, created_at
          FROM system_logs
          WHERE level IN ('error', 'warning', 'info')
          ORDER BY created_at DESC
          LIMIT 10
        `) as unknown as LogRow[]
      : (await sql`
          SELECT id, action, level, status, metadata, created_at
          FROM system_logs
          WHERE tenant_id = ${tenantId}
            AND level IN ('error', 'warning', 'info')
          ORDER BY created_at DESC
          LIMIT 10
        `) as unknown as LogRow[]

    const notifications = (rows ?? []).map(mapLogToNotification)
    return NextResponse.json({ notifications })
  } catch (err) {
    // Table may not exist yet — return empty list gracefully
    console.warn("[notifications] Query failed, returning empty:", err instanceof Error ? err.message : err)
    return NextResponse.json({ notifications: [] })
  }
}
