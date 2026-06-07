/**
 * lib/shopify.ts — Shopify Draft Order invoice integration (per-store account)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  PROVIDER ISOLATION                                                  │
 * │                                                                     │
 * │  This module is the Shopify equivalent of lib/stripe.ts. It is used  │
 * │  ONLY by stores whose provider_type = 'SHOPIFY'.                     │
 * │                                                                     │
 * │  • One Shopify store PER PayDef store — credentials come from the    │
 * │    store record (stores.shopify_*), so there is NO rotation and NO   │
 * │    dependency on merchant_accounts. The PayPal rotation logic and    │
 * │    the Stripe / mock-charge flows are never touched by this module.  │
 * │  • The buyer pays on Shopify's hosted checkout (Shopify Payments +   │
 * │    Shop Pay). We create a Draft Order with a SINGLE custom line item │
 * │    priced at the full checkout total and tax_exempt = true, so the   │
 * │    amount charged on Shopify equals the amount PayDef received.      │
 * │  • Item Masking is reused: the line-item title is pre-masked by the  │
 * │    shared Payment Display Profile machinery before it reaches here.  │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * NOTE — return URL limitation: Shopify's draft-order invoice checkout does NOT
 * support a custom post-purchase redirect (unlike Stripe Checkout's success_url).
 * After paying, the buyer lands on Shopify's order-status page. The PayDef
 * transaction is completed asynchronously by the orders/paid webhook.
 */

import { createHmac, timingSafeEqual } from "crypto"

/** Pinned Admin API version. Override per-deploy with SHOPIFY_API_VERSION. */
const DEFAULT_API_VERSION = "2024-10"

export class ShopifyApiError extends Error {
  public readonly statusCode: number
  public readonly operation: string

  constructor(operation: string, statusCode: number, message: string) {
    super(`Shopify ${operation} error [${statusCode}]: ${message}`)
    this.name = "ShopifyApiError"
    this.operation = operation
    this.statusCode = statusCode
  }
}

/**
 * Normalises a store domain to the bare `*.myshopify.com` host:
 * strips protocol, path, and trailing slashes. Throws if nothing usable remains.
 */
export function normalizeShopDomain(raw: string): string {
  const trimmed = (raw || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim()
  if (!trimmed) {
    throw new ShopifyApiError("config", 500, "Missing Shopify store domain.")
  }
  return trimmed.toLowerCase()
}

function apiVersion(): string {
  return process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_API_VERSION
}

export interface CreateDraftOrderParams {
  shopDomain: string // decrypted/plaintext, e.g. "my-store.myshopify.com"
  accessToken: string // decrypted Admin API access token (shpat_...)
  currency: string // ISO 4217, e.g. "USD"
  /** Pre-masked title shown to the buyer on the Shopify checkout. */
  itemTitle: string
  /** Full checkout total as a 2-decimal string, e.g. "49.99". */
  amount: string
  customerEmail?: string | null
  /** PayDef transaction id — carried in note_attributes for webhook matching. */
  transactionId: string
}

export interface CreateDraftOrderResult {
  draftOrderId: string // numeric Shopify Draft Order id (as string)
  invoiceUrl: string // hosted checkout URL the buyer is redirected to
}

/**
 * Creates a Shopify Draft Order via the Admin REST API and returns its
 * invoice_url (the hosted checkout link).
 *
 * The draft order uses ONE custom line item (title + price, no variant) at the
 * full amount with tax_exempt = true, so Shopify charges exactly `amount` and
 * never decrements the niche store's real inventory. The PayDef transaction id
 * is stored in note_attributes so the orders/paid webhook can reconcile it back.
 */
export async function createDraftOrder(
  p: CreateDraftOrderParams
): Promise<CreateDraftOrderResult> {
  const domain = normalizeShopDomain(p.shopDomain)
  const token = p.accessToken?.trim()
  if (!token) {
    throw new ShopifyApiError("config", 500, "Missing Shopify access token for this store.")
  }

  const endpoint = `https://${domain}/admin/api/${apiVersion()}/draft_orders.json`

  const draftOrderBody = {
    draft_order: {
      line_items: [
        {
          title: p.itemTitle,
          price: p.amount,
          quantity: 1,
          taxable: false,
          requires_shipping: false,
        },
      ],
      tax_exempt: true,
      ...(p.customerEmail ? { email: p.customerEmail } : {}),
      note: `PayDef transaction ${p.transactionId}`,
      note_attributes: [{ name: "paydef_txn", value: p.transactionId }],
      tags: "paydef",
      use_customer_default_address: false,
    },
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify(draftOrderBody),
    })
  } catch (err) {
    throw new ShopifyApiError("create draft order", 502, (err as Error).message)
  }

  const text = await res.text()
  if (!res.ok) {
    throw new ShopifyApiError("create draft order", res.status, text.slice(0, 500))
  }

  let parsed: { draft_order?: { id?: number | string; invoice_url?: string | null } }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ShopifyApiError("create draft order", 502, "Shopify returned a non-JSON response.")
  }

  const draftOrder = parsed.draft_order
  const invoiceUrl = draftOrder?.invoice_url
  if (!draftOrder?.id || !invoiceUrl) {
    throw new ShopifyApiError("create draft order", 502, "Shopify did not return an invoice URL.")
  }

  return { draftOrderId: String(draftOrder.id), invoiceUrl }
}

export interface RefundShopifyOrderParams {
  shopDomain: string // decrypted/plaintext, e.g. "my-store.myshopify.com"
  accessToken: string // decrypted Admin API access token (shpat_...)
  orderId: string // numeric Shopify Order id (the REAL order, not the draft)
  /** Full amount to refund as a 2-decimal string, e.g. "49.99". */
  amount: string
  currency: string // ISO 4217, e.g. "USD"
  /** Optional note shown on the Shopify refund. */
  note?: string
}

export interface RefundShopifyOrderResult {
  refundId: string // numeric Shopify Refund id (as string)
  /** True when Shopify reports the order had nothing left to refund. */
  alreadyRefunded: boolean
}

interface ShopifyTransaction {
  id?: number | string
  kind?: string
  status?: string
  gateway?: string
  parent_id?: number | string | null
}

/**
 * Issues a FULL refund against a paid Shopify Order via the Admin REST API.
 *
 * Flow (mirrors what Shopify's admin UI does for a "Refund"):
 *   1. GET the order's transactions and locate the successful parent
 *      sale/capture transaction (we need its id + gateway to attach the refund).
 *   2. POST a refund whose single transaction reverses the full amount.
 *
 * Our Shopify draft orders carry ONE custom line item priced at the full
 * checkout total, so a money-only refund of `amount` drives the order's
 * financial_status to "refunded" without needing per-line restock data.
 *
 * Idempotency: if the order has no successful parent transaction left to refund
 * (already fully refunded), this resolves with alreadyRefunded = true instead of
 * throwing, so the caller can treat a repeat request as success.
 */
export async function refundShopifyOrder(
  p: RefundShopifyOrderParams
): Promise<RefundShopifyOrderResult> {
  const domain = normalizeShopDomain(p.shopDomain)
  const token = p.accessToken?.trim()
  if (!token) {
    throw new ShopifyApiError("config", 500, "Missing Shopify access token for this store.")
  }
  const orderId = (p.orderId || "").trim()
  if (!orderId) {
    throw new ShopifyApiError("config", 500, "Missing Shopify order id for refund.")
  }

  const base = `https://${domain}/admin/api/${apiVersion()}`
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  }

  // ── Step 1. Find the successful parent sale/capture transaction ─────────────
  let txRes: Response
  try {
    txRes = await fetch(`${base}/orders/${orderId}/transactions.json`, { method: "GET", headers })
  } catch (err) {
    throw new ShopifyApiError("refund order", 502, (err as Error).message)
  }
  const txText = await txRes.text()
  if (!txRes.ok) {
    throw new ShopifyApiError("refund order", txRes.status, txText.slice(0, 500))
  }

  let txParsed: { transactions?: ShopifyTransaction[] }
  try {
    txParsed = JSON.parse(txText)
  } catch {
    throw new ShopifyApiError("refund order", 502, "Shopify returned a non-JSON transactions response.")
  }

  const transactions = Array.isArray(txParsed.transactions) ? txParsed.transactions : []
  const parent = transactions.find(
    (t) =>
      (t.kind === "sale" || t.kind === "capture") &&
      String(t.status).toLowerCase() === "success"
  )

  if (!parent?.id) {
    // No money captured on this order — nothing to refund. Treat as idempotent.
    return { refundId: "", alreadyRefunded: true }
  }

  // ── Step 2. Create the refund (money-only, full amount) ─────────────────────
  const refundBody = {
    refund: {
      currency: p.currency,
      notify: false,
      note: p.note || "PayDef refund",
      transactions: [
        {
          parent_id: parent.id,
          amount: p.amount,
          kind: "refund",
          gateway: parent.gateway,
        },
      ],
    },
  }

  let res: Response
  try {
    res = await fetch(`${base}/orders/${orderId}/refunds.json`, {
      method: "POST",
      headers,
      body: JSON.stringify(refundBody),
    })
  } catch (err) {
    throw new ShopifyApiError("refund order", 502, (err as Error).message)
  }

  const text = await res.text()
  if (!res.ok) {
    // Shopify returns 422 when there is nothing left to refund — treat as success.
    if (res.status === 422 && /refund|already|exceed/i.test(text)) {
      return { refundId: "", alreadyRefunded: true }
    }
    throw new ShopifyApiError("refund order", res.status, text.slice(0, 500))
  }

  let parsed: { refund?: { id?: number | string } }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ShopifyApiError("refund order", 502, "Shopify returned a non-JSON refund response.")
  }

  const refundId = parsed.refund?.id
  if (!refundId) {
    throw new ShopifyApiError("refund order", 502, "Shopify did not return a refund id.")
  }

  return { refundId: String(refundId), alreadyRefunded: false }
}

/**
 * Verifies a Shopify webhook HMAC.
 *
 * Shopify signs webhook bodies with base64( HMAC-SHA256(rawBody, secret) ) in the
 * `X-Shopify-Hmac-Sha256` header. The secret is the store's webhook signing
 * secret (Settings → Notifications) or the app's API secret key for
 * API-created webhooks. Comparison is timing-safe.
 */
export function verifyShopifyWebhook(
  rawBody: string | Buffer,
  hmacHeader: string | null | undefined,
  secret: string
): boolean {
  if (!hmacHeader || !secret) return false

  const digest = createHmac("sha256", secret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest() // raw bytes

  let received: Buffer
  try {
    received = Buffer.from(hmacHeader, "base64")
  } catch {
    return false
  }

  if (received.length !== digest.length) return false
  return timingSafeEqual(received, digest)
}
