# Webhook Integration Guide

This guide shows how a storefront should receive and verify outbound webhooks from the Payment Gateway.

## Overview

The gateway sends a `POST` request to your configured `webhook_url`.

Important headers:

- `Content-Type: application/json`
- `X-Webhook-Source: payment-gateway`
- `X-Webhook-Event: payment.capture.completed`
- `X-Webhook-Timestamp: 2026-04-19T10:15:30.000Z`
- `X-Webhook-Event-ID: <event uuid>`
- `X-Webhook-Delivery-ID: <delivery uuid>`
- `X-Webhook-Attempt: 1`
- `X-Webhook-Signature: sha256=<hmac hex>`

Signature format:

- The gateway signs the string: `timestamp + "." + rawBody`
- Algorithm: `HMAC-SHA256`
- Secret: your store's `WEBHOOK_SECRET`

## Payload Schema

Example `payment.capture.completed` payload for a mock card transaction:

```json
{
  "event": "payment.capture.completed",
  "event_id": "1d1b8fd8-0ce4-4a53-96f1-fc21f2fd5933",
  "transaction_id": "9b96d6b0-7f40-4c02-b6b8-f73cdddc6f54",
  "paypal_order_id": null,
  "amount": "49.99",
  "currency": "USD",
  "status": "COMPLETED",
  "timestamp": "2026-04-19T10:15:30.000Z",
  "status_reason": "mock_charge_completed",
  "gateway_fee": "1.00",
  "net_amount": "48.99",
  "payment_method": "mock_card",
  "card_last_4": "1111",
  "card_brand": "VISA",
  "exp_month": "12",
  "exp_year": "2027",
  "buyer_name": "Test Buyer",
  "billing_address": {
    "line1": "123 Test Street",
    "city": "Bangkok",
    "state": "Bangkok",
    "postal_code": "10110",
    "country": "TH"
  }
}
```

Example `payment.capture.completed` payload for a normal PayPal transaction:

```json
{
  "event": "payment.capture.completed",
  "event_id": "d8f76b0c-8d70-4e09-b8a1-3d9e599e6016",
  "transaction_id": "f66d7c4b-f1a2-47fe-a9df-9f6dbd8ae6f0",
  "paypal_order_id": "9VF12345AB678901C",
  "amount": "49.99",
  "currency": "USD",
  "status": "COMPLETED",
  "timestamp": "2026-04-19T10:15:30.000Z",
  "paypal_capture_id": "7NL12345XY678901Z",
  "authorization_id": null,
  "gateway_fee": "1.00",
  "net_amount": "48.99"
}
```

## Next.js Receiver Route

Create this file in your storefront:

`app/api/webhooks/gateway/route.ts`

```ts
import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

type GatewayWebhookPayload = {
  event: string
  event_id: string
  transaction_id: string
  paypal_order_id: string | null
  amount: string
  currency?: string
  status: string
  timestamp: string
  status_reason?: string
  paypal_event_type?: string
  paypal_capture_id?: string
  authorization_id?: string
  gateway_fee?: string
  net_amount?: string
  payment_method?: "paypal" | "card" | "mock_card"
  card_last_4?: string
  card_brand?: string
  exp_month?: string
  exp_year?: string
  buyer_name?: string
  billing_address?: string | Record<string, unknown> | null
}

function verifyGatewaySignature(input: {
  rawBody: string
  timestamp: string
  signature: string
  secret: string
}) {
  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest("hex")

  const received = input.signature.replace(/^sha256=/, "")

  const expectedBuffer = Buffer.from(expected, "hex")
  const receivedBuffer = Buffer.from(received, "hex")

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[gateway-webhook] Missing WEBHOOK_SECRET")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  const signature = req.headers.get("X-Webhook-Signature")
  const timestamp = req.headers.get("X-Webhook-Timestamp")
  const eventName = req.headers.get("X-Webhook-Event")

  if (!signature || !timestamp) {
    return NextResponse.json(
      { error: "Missing webhook signature headers" },
      { status: 400 }
    )
  }

  // IMPORTANT:
  // Read the raw body first. Do not call req.json() before signature verification.
  const rawBody = await req.text()

  const isValid = verifyGatewaySignature({
    rawBody,
    timestamp,
    signature,
    secret: webhookSecret,
  })

  if (!isValid) {
    console.error("[gateway-webhook] Invalid signature")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: GatewayWebhookPayload
  try {
    payload = JSON.parse(rawBody) as GatewayWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  try {
    if (eventName === "payment.capture.completed") {
      const {
        transaction_id,
        amount,
        status,
        card_last_4,
        card_brand,
        buyer_name,
        billing_address,
      } = payload

      // Storefront persistence example:
      // 1. Find your local order/payment record using transaction_id
      // 2. Mark it paid / captured
      // 3. Save safe receipt metadata for display on the order confirmation page
      //
      // Example pseudo-code:
      //
      // await db.orderPayments.update({
      //   where: { gatewayTransactionId: transaction_id },
      //   data: {
      //     status,
      //     amount: Number(amount),
      //     cardLast4: card_last_4 ?? null,
      //     cardBrand: card_brand ?? null,
      //     buyerName: buyer_name ?? null,
      //     billingAddress: billing_address ?? null,
      //     paidAt: new Date(),
      //   },
      // })
      //
      // Important:
      // Only store safe metadata such as card_last_4 / card_brand.
      // Do not expect raw PAN or CVV in the webhook payload.
    }

    // Acknowledge successful receipt so the gateway stops retrying.
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error("[gateway-webhook] Processing error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
```

## Notes

- Always verify the signature against the exact raw request body.
- Always use the `X-Webhook-Timestamp` header in the signed message.
- Return `200 OK` only after your storefront has safely handled the event.
- If your route returns non-2xx, the gateway will treat delivery as failed and retry according to its retry policy.

