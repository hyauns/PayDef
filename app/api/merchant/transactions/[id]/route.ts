import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getTransactionDetail } from "@/lib/transaction-status"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const detail = await getTransactionDetail(id, {
    tenantId: session.user.role === "SUPER_ADMIN" ? undefined : session.user.tenantId ?? undefined,
  })

  if (!detail) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
  }

  return NextResponse.json({
    transaction_id: detail.transactionId,
    tenant_id: detail.tenantId,
    store_id: detail.storeId,
    merchant_id: detail.merchantId,
    store_name: detail.storeName,
    account_name: detail.accountName,
    shield_domain: detail.shieldDomain,
    amount: detail.amount,
    currency: detail.currency,
    original_item_name: detail.originalItemName,
    masked_item_name: detail.maskedItemName,
    gateway_fee: detail.gatewayFee,
    status: detail.status,
    paypal_order_id: detail.paypalOrderId,
    paypal_capture_id: detail.paypalCaptureId,
    authorization_id: detail.authorizationId,
    customer_email: detail.customerEmail,
    buyer_ip: detail.buyerIp,
    buyer_country: detail.buyerCountry,
    ip_address: detail.ipAddress,
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
    status_reason: detail.statusReason,
    merchant_success_url: detail.merchantSuccessUrl,
    merchant_cancel_url: detail.merchantCancelUrl,
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
      source: event.source,
      trigger_origin: event.triggerOrigin,
      deliveries: event.deliveries.map((delivery) => ({
        delivery_id: delivery.deliveryId,
        attempt_number: delivery.attemptNumber,
        trigger_origin: delivery.triggerOrigin,
        final_status: delivery.finalStatus,
        http_status: delivery.httpStatus,
        response_snippet: delivery.responseSnippet,
        error_message: delivery.errorMessage,
        next_retry_at: delivery.nextRetryAt,
        delivered_at: delivery.deliveredAt,
        created_at: delivery.createdAt,
      })),
    })),
  })
}
