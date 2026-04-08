import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getTransactionDetail } from "@/lib/transaction-status"
import { replayWebhookEvent } from "@/lib/webhook-delivery"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  let body: { eventId?: string } = {}
  try {
    body = (await req.json()) as { eventId?: string }
  } catch {
    body = {}
  }

  const detail = await getTransactionDetail(id, {
    tenantId: session.user.role === "SUPER_ADMIN" ? undefined : session.user.tenantId ?? undefined,
  })

  if (!detail) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
  }

  const targetEventId = body.eventId ?? detail.eventHistory[0]?.eventId
  if (!targetEventId) {
    return NextResponse.json({ error: "No webhook event found for this transaction." }, { status: 404 })
  }

  const eventExists = detail.eventHistory.some((event) => event.eventId === targetEventId)
  if (!eventExists) {
    return NextResponse.json({ error: "Webhook event not found on this transaction." }, { status: 404 })
  }

  try {
    const replay = await replayWebhookEvent(
      targetEventId,
      session.user.role === "SUPER_ADMIN" ? "admin" : "merchant"
    )

    return NextResponse.json({
      event_id: targetEventId,
      transaction_id: id,
      delivery_id: replay.deliveryId,
      delivery_status: replay.finalStatus,
      next_retry_at: replay.nextRetryAt,
      delivered_at: replay.deliveredAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay failed"
    return NextResponse.json(
      { error: message },
      { status: message.toLowerCase().includes("cooling") ? 429 : 500 }
    )
  }
}
