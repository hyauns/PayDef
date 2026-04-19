import { NextResponse } from "next/server"
import { getBrowserTransactionStatus } from "@/lib/gateway-recovery"

interface RouteContext {
  params: Promise<{ transactionId: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const { transactionId } = await context.params
  const status = await getBrowserTransactionStatus(transactionId)

  if (!status) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
  }

  console.info(`[browser-status] tx=${transactionId} status=${status.status} (this status will be carried in the redirect to the store)`)

  return NextResponse.json({
    transaction_id: status.transactionId,
    status: status.status,
    paypal_order_id: status.paypalOrderId,
    merchant_success_url: status.merchantSuccessUrl,
    merchant_cancel_url: status.merchantCancelUrl,
    updated_at: status.updatedAt,
    checkout_expires_at: status.checkoutExpiresAt,
    authorization_expires_at: status.authorizationExpiresAt,
  })
}
