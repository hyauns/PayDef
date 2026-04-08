import { NextRequest, NextResponse } from "next/server"
import {
  getBrowserTransactionStatus,
  markCheckoutCanceled,
} from "@/lib/gateway-recovery"

export async function POST(req: NextRequest) {
  let body: { transactionId?: string; result?: "success" | "cancel" }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const transactionId = body.transactionId?.trim()
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId is required." }, { status: 400 })
  }

  if (body.result === "cancel") {
    const result = await markCheckoutCanceled(transactionId)
    if (!result?.status) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
    }

    return NextResponse.json({
      changed: result.changed,
      transaction_id: result.status.transactionId,
      status: result.status.status,
      merchant_success_url: result.status.merchantSuccessUrl,
      merchant_cancel_url: result.status.merchantCancelUrl,
      paypal_order_id: result.status.paypalOrderId,
      updated_at: result.status.updatedAt,
    })
  }

  const status = await getBrowserTransactionStatus(transactionId)
  if (!status) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 })
  }

  return NextResponse.json({
    transaction_id: status.transactionId,
    status: status.status,
    merchant_success_url: status.merchantSuccessUrl,
    merchant_cancel_url: status.merchantCancelUrl,
    paypal_order_id: status.paypalOrderId,
    updated_at: status.updatedAt,
  })
}
