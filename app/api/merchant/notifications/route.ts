/**
 * GET /api/merchant/notifications
 *
 * Returns the most recent buyer/payment transaction updates for the logged-in
 * user. This intentionally excludes low-level operational logs such as user
 * logins, webhook delivery internals, and admin control events.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

type NotificationType = "success" | "failed" | "warning"

interface TransactionNotificationRow {
  id: string
  status: string
  original_amount: string
  store_name: string | null
  updated_at: string
}

function mapStatusToNotification(row: TransactionNotificationRow) {
  const amount = Number.parseFloat(row.original_amount)
  const storeName = row.store_name ?? "Unknown store"

  let type: NotificationType = "warning"
  let title = "Transaction Updated"
  let description = `${storeName}`

  switch (row.status) {
    case "COMPLETED":
      type = "success"
      title = "Payment Completed"
      description = `${storeName} payment captured successfully`
      break
    case "AUTHORIZED":
      type = "warning"
      title = "Payment Authorized"
      description = `${storeName} is awaiting capture`
      break
    case "FAILED":
      type = "failed"
      title = "Payment Failed"
      description = `${storeName} payment could not be completed`
      break
    case "REFUNDED":
      type = "warning"
      title = "Payment Refunded"
      description = `${storeName} payment was refunded`
      break
    case "DISPUTED":
      type = "failed"
      title = "Dispute Opened"
      description = `${storeName} payment is under dispute`
      break
    case "CANCELED":
      type = "warning"
      title = "Checkout Canceled"
      description = `${storeName} buyer canceled checkout`
      break
    case "EXPIRED":
      type = "warning"
      title = "Checkout Expired"
      description = `${storeName} checkout session expired`
      break
    default:
      type = "warning"
      title = "Transaction Pending"
      description = `${storeName} transaction is still processing`
      break
  }

  return {
    id: row.id,
    type,
    title,
    description,
    amount: Number.isFinite(amount) ? amount : undefined,
    timeMs: new Date(row.updated_at).getTime(),
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
      ? ((await sql`
          SELECT
            t.id,
            t.status,
            t.original_amount,
            s.name AS store_name,
            t.updated_at
          FROM transactions t
          LEFT JOIN stores s ON s.id = t.store_id
          WHERE t.status IN ('COMPLETED', 'AUTHORIZED', 'FAILED', 'REFUNDED', 'DISPUTED', 'CANCELED', 'EXPIRED')
          ORDER BY t.updated_at DESC
          LIMIT 10
        `) as unknown as TransactionNotificationRow[])
      : ((await sql`
          SELECT
            t.id,
            t.status,
            t.original_amount,
            s.name AS store_name,
            t.updated_at
          FROM transactions t
          LEFT JOIN stores s ON s.id = t.store_id
          WHERE t.tenant_id = ${tenantId}
            AND t.status IN ('COMPLETED', 'AUTHORIZED', 'FAILED', 'REFUNDED', 'DISPUTED', 'CANCELED', 'EXPIRED')
          ORDER BY t.updated_at DESC
          LIMIT 10
        `) as unknown as TransactionNotificationRow[])

    return NextResponse.json({
      notifications: rows.map(mapStatusToNotification),
    })
  } catch (error) {
    console.warn("[notifications] Query failed, returning empty:", error instanceof Error ? error.message : error)
    return NextResponse.json({ notifications: [] })
  }
}
