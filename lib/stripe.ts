/**
 * lib/stripe.ts — Stripe Checkout Session integration (per-store account)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  PROVIDER ISOLATION                                                │
 * │                                                                     │
 * │  This module is the Stripe equivalent of lib/paypal.ts. It is used  │
 * │  ONLY by stores whose provider_type = 'STRIPE'.                     │
 * │                                                                     │
 * │  • One Stripe account PER STORE — credentials come from the store   │
 * │    record (stores.stripe_secret_key), so there is NO rotation and   │
 * │    NO dependency on merchant_accounts. The PayPal account-rotation  │
 * │    logic is never touched by this provider.                         │
 * │  • Item Masking is reused: line-item names and the statement        │
 * │    descriptor are pre-masked by the shared Payment Display Profile  │
 * │    machinery before they reach this module.                         │
 * │  • Shield Domain is reused: success_url / cancel_url are built by    │
 * │    lib/masking.buildShieldUrls() exactly like the PayPal flow.       │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import Stripe from "stripe"

export class StripeApiError extends Error {
  public readonly statusCode: number
  public readonly operation: string

  constructor(operation: string, statusCode: number, message: string) {
    super(`Stripe ${operation} error [${statusCode}]: ${message}`)
    this.name = "StripeApiError"
    this.operation = operation
    this.statusCode = statusCode
  }
}

/** Lightweight masked line item — same shape produced by the display-profile builder. */
export interface StripeMaskedItem {
  name: string // MUST be pre-masked
  quantity: string // e.g. "1"
  unitAmount: {
    currencyCode: string
    value: string // 2-decimal string, e.g. "49.99"
  }
}

export interface CreateCheckoutSessionParams {
  secretKey: string // decrypted Stripe secret key for this store
  currency: string // ISO 4217, e.g. "USD"
  items: StripeMaskedItem[] // pre-masked line items
  statementDescriptorSuffix?: string // pre-masked brand/descriptor (will be sanitized)
  successUrl: string // shield-domain success URL
  cancelUrl: string // shield-domain cancel URL
  transactionId: string // our internal opaque UUID
  customerEmail?: string | null
}

export interface CreateCheckoutSessionResult {
  id: string // Stripe Checkout Session id (cs_...)
  url: string // hosted Checkout URL the buyer is redirected to
  paymentIntentId: string | null // pi_... (may be null until completion)
}

/**
 * Sanitizes a string into a Stripe `statement_descriptor_suffix`.
 *
 * Stripe constraints: 1–22 characters, must contain at least one latin
 * character, and must NOT contain any of: < > \ ' " *
 * We strip disallowed characters, collapse whitespace, and clamp length.
 * Returns undefined when nothing usable remains (Stripe then uses the
 * account default descriptor).
 */
export function sanitizeStatementDescriptor(
  value: string | null | undefined
): string | undefined {
  if (!value) return undefined
  const cleaned = value
    .replace(/[<>\\'"*]/g, "") // Stripe-disallowed characters
    .replace(/[^\x20-\x7E]/g, "") // strip non-printable / non-ASCII
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 22)
    .trim()
  // Stripe requires at least one latin letter in the suffix.
  if (!/[a-zA-Z]/.test(cleaned)) return undefined
  return cleaned || undefined
}

function getStripe(secretKey: string): Stripe {
  const key = secretKey?.trim()
  if (!key) {
    throw new StripeApiError("init", 500, "Missing Stripe secret key for this store.")
  }
  // No explicit apiVersion → use the SDK's pinned default for Stripe v22.
  return new Stripe(key)
}

function toUnitAmountCents(value: string): number {
  return Math.round(parseFloat(value) * 100)
}

/**
 * Creates a Stripe Checkout Session (mode: 'payment').
 *
 * Masked item names map to line_items[].price_data.product_data.name and the
 * masked brand maps to payment_intent_data.statement_descriptor_suffix — this
 * is how Item Masking is enforced for Stripe. The shield-domain URLs become
 * success_url / cancel_url.
 */
export async function createCheckoutSession(
  p: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripe(p.secretKey)
  const currency = p.currency.toLowerCase()

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = p.items.map((item) => ({
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    price_data: {
      currency: item.unitAmount.currencyCode.toLowerCase() || currency,
      unit_amount: toUnitAmountCents(item.unitAmount.value),
      product_data: { name: item.name },
    },
  }))

  const suffix = sanitizeStatementDescriptor(p.statementDescriptorSuffix)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      client_reference_id: p.transactionId,
      customer_email: p.customerEmail || undefined,
      metadata: { transaction_id: p.transactionId },
      payment_intent_data: {
        metadata: { transaction_id: p.transactionId },
        ...(suffix ? { statement_descriptor_suffix: suffix } : {}),
      },
    })

    if (!session.url) {
      throw new StripeApiError("create session", 502, "Stripe did not return a Checkout URL.")
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null

    return { id: session.id, url: session.url, paymentIntentId }
  } catch (err) {
    if (err instanceof StripeApiError) throw err
    const e = err as { statusCode?: number; message?: string }
    throw new StripeApiError("create session", e?.statusCode ?? 502, e?.message ?? String(err))
  }
}

// ─── Refund ──────────────────────────────────────────────────────────────────

export interface RefundPaymentParams {
  secretKey: string // decrypted Stripe secret key for this store
  paymentIntentId: string // pi_... captured by the original Checkout Session
}

export interface RefundPaymentResult {
  id: string // Stripe refund id (re_...)
  status: string | null // 'succeeded' | 'pending' | 'failed' | 'canceled' | null
  alreadyRefunded: boolean // true when Stripe reports the charge was already fully refunded
}

/**
 * Issues a FULL refund for a captured PaymentIntent.
 *
 * Empty `amount` ⇒ Stripe refunds the entire remaining captured amount. This is
 * the Stripe equivalent of lib/paypal.refundCapture (full refund only).
 *
 * Idempotency: if Stripe reports the charge has already been fully refunded
 * (`charge_already_refunded`), we treat it as success and flag alreadyRefunded
 * so the caller can sync its DB without erroring — mirroring how the PayPal
 * path treats CAPTURE_FULLY_REFUNDED.
 */
export async function refundPayment(
  p: RefundPaymentParams
): Promise<RefundPaymentResult> {
  const stripe = getStripe(p.secretKey)
  const paymentIntentId = p.paymentIntentId?.trim()
  if (!paymentIntentId) {
    throw new StripeApiError("refund", 422, "Missing payment intent id for refund.")
  }

  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId })
    return { id: refund.id, status: refund.status ?? null, alreadyRefunded: false }
  } catch (err) {
    const e = err as { code?: string; statusCode?: number; message?: string }
    // Stripe raises `charge_already_refunded` when the charge has no remaining
    // amount to refund — treat as idempotent success.
    if (e?.code === "charge_already_refunded") {
      return { id: "", status: "succeeded", alreadyRefunded: true }
    }
    if (err instanceof StripeApiError) throw err
    throw new StripeApiError("refund", e?.statusCode ?? 502, e?.message ?? String(err))
  }
}

/**
 * Verifies a Stripe webhook signature and returns the parsed event.
 * Throws StripeApiError(400) when the signature is invalid.
 */
export function verifyStripeWebhook(
  secretKey: string,
  rawBody: string | Buffer,
  signatureHeader: string,
  webhookSecret: string
): Stripe.Event {
  const stripe = getStripe(secretKey)
  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)
  } catch (err) {
    throw new StripeApiError("webhook signature", 400, (err as Error).message)
  }
}
