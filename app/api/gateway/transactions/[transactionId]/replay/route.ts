import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"
import { replayWebhookEvent } from "@/lib/webhook-delivery"

interface RouteContext {
  params: Promise<{ transactionId: string }>
}

type EventRow = {
  id: string
  transaction_id: string
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { transactionId } = await context.params

  try {
    const store = await authenticateStoreHeaders(req)

    let body: { eventId?: string } = {}
    try {
      body = (await req.json()) as { eventId?: string }
    } catch {
      body = {}
    }

    const sql = getSql()
    const rows = body.eventId
      ? (await sql`
          SELECT id, transaction_id
          FROM webhook_events
          WHERE id = ${body.eventId}
            AND transaction_id = ${transactionId}
            AND store_id = ${store.id}
          LIMIT 1
        `)
      : (await sql`
          SELECT id, transaction_id
          FROM webhook_events
          WHERE transaction_id = ${transactionId}
            AND store_id = ${store.id}
          ORDER BY created_at DESC
          LIMIT 1
        `)

    const event = (rows as unknown as EventRow[])[0] ?? null
    if (!event) {
      return NextResponse.json({ error: "No webhook event found for this transaction." }, { status: 404 })
    }

    const replay = await replayWebhookEvent(event.id, "merchant")

    return NextResponse.json({
      event_id: event.id,
      transaction_id: transactionId,
      delivery_id: replay.deliveryId,
      delivery_status: replay.finalStatus,
      next_retry_at: replay.nextRetryAt,
      delivered_at: replay.deliveredAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized"
    const status = message.includes("Cooling") || message.includes("cooling")
      ? 429
      : message.includes("Missing") || message.includes("Invalid") || message.includes("inactive")
      ? 401
      : 500

    return NextResponse.json({ error: message }, { status })
  }
}
