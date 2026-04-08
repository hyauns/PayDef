import { NextRequest, NextResponse } from "next/server"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"
import { getTransactionDetail } from "@/lib/transaction-status"

interface RouteContext {
  params: Promise<{ transactionId: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { transactionId } = await context.params

  try {
    const store = await authenticateStoreHeaders(req)
    const detail = await getTransactionDetail(transactionId, {
      storeId: store.id,
      tenantId: store.tenantId,
    })

    if (!detail) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
    }

    return NextResponse.json({
      transaction_id: detail.transactionId,
      current_status: detail.status,
      amount: detail.amount,
      currency: detail.currency,
      paypal_order_id: detail.paypalOrderId,
      authorization_id: detail.authorizationId,
      paypal_capture_id: detail.paypalCaptureId,
      timestamps: {
        created_at: detail.createdAt,
        updated_at: detail.updatedAt,
        authorized_at: detail.authorizedAt,
        completed_at: detail.completedAt,
        failed_at: detail.failedAt,
        refunded_at: detail.refundedAt,
        disputed_at: detail.disputedAt,
        canceled_at: detail.canceledAt,
        checkout_expires_at: detail.checkoutExpiresAt,
        authorization_expires_at: detail.authorizationExpiresAt,
      },
      event_history: detail.eventHistory.map((event) => ({
        event_id: event.eventId,
        event: event.event,
        delivery_status: event.deliveryStatus,
        created_at: event.createdAt,
        delivered_at: event.deliveredAt,
        next_retry_at: event.nextRetryAt,
        attempt_count: event.attemptCount,
        latest_http_status: event.latestHttpStatus,
        latest_error: event.latestError,
        last_delivery_id: event.lastDeliveryId,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized"
    return NextResponse.json(
      { error: message },
      { status: message.includes("Missing") || message.includes("Invalid") || message.includes("inactive") ? 401 : 500 }
    )
  }
}
