# Store Integration Contract

Gateway base URL:
- `https://www.gooytoy.com`

This document defines the hardened merchant-facing contract for checkout, webhook delivery, replay, reconciliation, and redirect return behavior.

## Merchant Credentials

Each store needs:
- `Store ID`
- `API Key`
- `Webhook URL`
- `Webhook Secret`
- optional `Success Return URL`
- optional `Cancel Return URL`

The main checkout endpoint is:
- `POST https://www.gooytoy.com/api/gateway/checkout`

The merchant-controlled webhook destination is any HTTPS endpoint they own, for example:
- `https://merchant-store.com/api/webhooks/payment-gateway`

## Supported Buyer Flows

### Popup + Shield Bridge

The storefront should:
1. Call `POST /api/gateway/checkout`
2. Open `popupUrl` when `flow === "POPUP_BRIDGE"`
3. Treat popup success as UX-only
4. Wait for webhook reconciliation or status lookup before fulfilling

### Redirect Fallback

The storefront should:
1. Call `POST /api/gateway/checkout`
2. Redirect to `approvalUrl` when `flow === "REDIRECT"`
3. Rely on webhook reconciliation for final server state

If the store configured `Success Return URL` or `Cancel Return URL`, the gateway shield pages will redirect the buyer back to the merchant site after success or cancel, including:
- `transaction_id`
- `status`
- optional `paypal_order_id`

## Event Identity

The gateway now sends explicit delivery identity:

| Field | Meaning |
| --- | --- |
| `event_id` | Stable logical event ID. Remains the same across retries and replays |
| `delivery_id` | Unique per delivery attempt. Changes for every retry or replay |

Merchant deduplication guidance:
- Use `event_id` as the primary idempotency key
- Use `delivery_id` only for delivery audit and support

## Gateway To Merchant Webhook Events

| Event | Meaning |
| --- | --- |
| `payment.authorization.created` | Buyer approved an `AUTHORIZE` payment and PayPal created an authorization |
| `payment.capture.completed` | Payment was captured successfully and should normally be marked paid |
| `payment.capture.denied` | PayPal denied capture |
| `payment.capture.refunded` | A captured payment was refunded |
| `payment.dispute.created` | PayPal opened a dispute |
| `payment.checkout.canceled` | Buyer returned through the shield cancel path before final payment completion |
| `payment.session.expired` | Checkout stayed pending past the gateway session expiry window |
| `payment.authorization.expired` | An authorization aged out before capture |

## Outbound Webhook Headers

Every gateway delivery includes:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Webhook-Source` | `payment-gateway` |
| `X-Webhook-Event` | explicit event name such as `payment.capture.completed` |
| `X-Webhook-Timestamp` | ISO 8601 timestamp used in signing |
| `X-Webhook-Signature` | `sha256=<hex digest>` |
| `X-Webhook-Event-ID` | stable logical event ID |
| `X-Webhook-Delivery-ID` | unique delivery attempt ID |
| `X-Webhook-Attempt` | delivery attempt number starting from `1` |

## Signature Verification

Signature format:

```txt
sha256=<hex_digest>
```

Signed message:

```txt
<X-Webhook-Timestamp>.<raw_request_body>
```

Algorithm:

```txt
HMAC-SHA256
```

Signing key:
- the store's `Webhook Secret`

Example verification:

```ts
import { createHmac, timingSafeEqual } from "crypto"

function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string) {
  const expected = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}
```

## Retry Policy

The gateway treats webhook delivery as durable and retryable.

Rules:
- any `2xx` response is final acknowledgment
- any non-`2xx` response is retried
- the gateway does not inspect the response body for semantic ack
- `200` with a body like `{ "matched": false }` still stops delivery

Retry schedule:
1. immediate first attempt
2. `+30s`
3. `+2m`
4. `+10m`
5. `+30m`
6. `+2h`
7. `+12h`
8. `+24h`

Delivery states:
- `pending`
- `retrying`
- `delivered`
- `dead_letter`
- `canceled`

## Example Payload

```json
{
  "event": "payment.capture.completed",
  "event_id": "2aa6b7df-3c7e-49b2-9df8-dc6ab7fd8a8b",
  "transaction_id": "7c1d8e1d-43f8-4c79-b6b1-bf1d11f8f4fd",
  "paypal_order_id": "8RX12345AB6789012",
  "amount": "49.99",
  "status": "COMPLETED",
  "timestamp": "2026-04-08T12:34:56.000Z",
  "paypal_event_type": "PAYMENT.CAPTURE.COMPLETED",
  "paypal_capture_id": "4XU12345CD6789012",
  "gateway_fee": "1.00",
  "net_amount": "48.99"
}
```

Additional optional fields may include:
- `authorization_id`
- `status_reason`
- `paypal_capture_id`
- `gateway_fee`
- `net_amount`
- `paypal_event_type`

## Reconciliation APIs

### Transaction Status Lookup

Authenticated with `X-Store-ID` and `X-API-Key`:

- `GET /api/gateway/transactions/:transactionId`

Returns:
- `transaction_id`
- `current_status`
- `paypal_order_id`
- `authorization_id`
- `paypal_capture_id`
- `amount`
- `currency`
- timestamps
- webhook event history summary

### Replay Latest Canonical Webhook

Authenticated with `X-Store-ID` and `X-API-Key`:

- `POST /api/gateway/transactions/:transactionId/replay`

Optional body:

```json
{
  "eventId": "optional-specific-event-id"
}
```

Replay behavior:
- preserves the same `event_id`
- creates a new `delivery_id`
- records a new delivery attempt
- is rate-limited by a replay cooldown

## Operational Guidance

Recommended merchant behavior:
- return `2xx` only when the event was accepted and persisted
- return non-`2xx` when the local order cannot be matched yet
- use status lookup if a webhook was missed
- use replay when support or operations need re-delivery
- treat webhook as the authoritative server-to-server source of truth

Recommended lifecycle handling:
- `payment.capture.completed` means paid
- `payment.authorization.created` means buyer approved but capture is deferred
- `payment.checkout.canceled` means buyer canceled on the shield flow
- `payment.session.expired` means pending checkout timed out
- `payment.authorization.expired` means manual capture window expired

## Dashboard Features

The gateway dashboard now exposes:
- integration copy fields in `Stores`
- configurable return URLs in `Stores`
- transaction detail with webhook delivery history
- `Manual Sync` in transaction detail
- `Replay Webhook` in transaction detail

## Final Notes

- Existing webhook fields were preserved where practical
- New headers and recovery endpoints are backward-compatible additions
- Popup success remains a UX signal only
- Webhook remains the canonical source of truth
