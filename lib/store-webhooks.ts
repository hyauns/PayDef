import { createHmac, randomBytes } from "crypto"

export const STORE_WEBHOOK_EVENT_MAP = {
  "PAYMENT.AUTHORIZATION.CREATED": "payment.authorization.created",
  "PAYMENT.CAPTURE.COMPLETED": "payment.capture.completed",
  "PAYMENT.CAPTURE.DENIED": "payment.capture.denied",
  "PAYMENT.CAPTURE.REFUNDED": "payment.capture.refunded",
  "CUSTOMER.DISPUTE.CREATED": "payment.dispute.created",
} as const

export type PayPalWebhookEventType = keyof typeof STORE_WEBHOOK_EVENT_MAP
export type PayPalMappedStoreWebhookEvent = (typeof STORE_WEBHOOK_EVENT_MAP)[PayPalWebhookEventType]
export type StoreWebhookLifecycleEvent =
  | "payment.checkout.canceled"
  | "payment.session.expired"
  | "payment.authorization.expired"

export type StoreWebhookEvent = PayPalMappedStoreWebhookEvent | StoreWebhookLifecycleEvent

export interface StoreWebhookPayload {
  event: StoreWebhookEvent
  event_id: string
  transaction_id: string
  paypal_order_id: string | null
  amount: string
  status: string
  timestamp: string
  status_reason?: string
  paypal_event_type?: string
  paypal_capture_id?: string
  authorization_id?: string
  gateway_fee?: string
  net_amount?: string
}

export function resolveStoreWebhookEvent(eventType: string): StoreWebhookEvent | null {
  return STORE_WEBHOOK_EVENT_MAP[eventType as PayPalWebhookEventType] ?? null
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`
}

export function signStoreWebhook(body: string, timestamp: string, secret: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")

  return `sha256=${digest}`
}
