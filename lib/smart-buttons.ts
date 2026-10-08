/**
 * lib/smart-buttons.ts — PayPal Smart Payment Buttons framed from the shield
 * domain (stores.checkout_flow = SMART_BUTTONS).
 *
 * The merchant still calls /api/gateway/checkout with the final amount, so
 * account rotation, limits, masking and the PayPal order are produced exactly
 * as for REDIRECT. Only the approval step moves: instead of leaving for
 * approvalUrl, the storefront frames embedUrl, which renders PayPal's own
 * buttons with the client-id of the account that already owns the order.
 *
 * Pure functions only. The DB read lives in app/checkout/buttons/route.ts.
 */

import { resolveShieldBaseUrl } from "@/lib/masking"

export const BUTTONS_PATH = "/checkout/buttons"
export const MESSAGE_SOURCE = "paydef-buttons"

// PayPal requires an integration date whenever client-id changes dynamically
// (here: per rotated merchant account). Pin it; do not make it "today".
export const SDK_INTEGRATION_DATE = "2026-10-08"

export function buildSmartButtonsUrl(
  shieldDomain: string | null | undefined,
  transactionId: string,
  executeToken: string | null
): string {
  const params = new URLSearchParams({ ref: transactionId })
  if (executeToken) params.set("et", executeToken)
  return `${resolveShieldBaseUrl(shieldDomain)}${BUTTONS_PATH}?${params.toString()}`
}

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"])

/**
 * Origins allowed to frame the buttons page: the merchant's own return URLs.
 * https only, except plain-http local dev hosts.
 */
export function frameAncestorOrigins(urls: Array<string | null | undefined>): string[] {
  const origins = new Set<string>()
  for (const raw of urls) {
    if (!raw) continue
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    const allowed =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOCAL_DEV_HOSTS.has(url.hostname))
    if (allowed) origins.add(url.origin)
  }
  return [...origins]
}

export function frameAncestorsCsp(origins: string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(" ") : "'none'"}`
}

export function toSdkIntent(intent: string | null | undefined): "capture" | "authorize" {
  return intent === "AUTHORIZE" ? "authorize" : "capture"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isTransactionRef(ref: unknown): ref is string {
  return typeof ref === "string" && UUID_RE.test(ref)
}

export interface ButtonSessionRow {
  id:                   string
  status:               string
  intent:               string | null
  original_currency:    string | null
  paypal_order_id:      string | null
  checkout_expires_at:  string | Date | null
  merchant_success_url: string | null
  merchant_cancel_url:  string | null
  client_id:            string
}

export interface ButtonPageConfig {
  transactionId: string
  executeToken:  string | null
  paypalOrderId: string
  clientId:      string
  currency:      string
  intent:        "capture" | "authorize"
  successUrl:    string | null
  cancelUrl:     string | null
}

export type ButtonErrorCode =
  | "invalid_ref"
  | "not_found"
  | "invalid_token"
  | "not_pending"
  | "expired"
  | "no_paypal_order"
  | "framing_not_configured"

export type ButtonPageDecision =
  | { kind: "render"; config: ButtonPageConfig; allowedOrigins: string[] }
  | { kind: "error"; status: number; code: ButtonErrorCode; allowedOrigins: string[] }

export function decideButtonPage(input: {
  row: ButtonSessionRow | null
  executeToken: string | null
  tokenShouldBlock: boolean
  now: Date
}): ButtonPageDecision {
  const { row } = input
  if (!row) return { kind: "error", status: 404, code: "not_found", allowedOrigins: [] }

  const allowedOrigins = frameAncestorOrigins([row.merchant_success_url, row.merchant_cancel_url])
  const fail = (status: number, code: ButtonErrorCode): ButtonPageDecision =>
    ({ kind: "error", status, code, allowedOrigins })

  if (input.tokenShouldBlock) return fail(403, "invalid_token")
  if (row.status !== "PENDING") return fail(409, "not_pending")
  if (row.checkout_expires_at && new Date(row.checkout_expires_at).getTime() <= input.now.getTime()) {
    return fail(410, "expired")
  }
  if (!row.paypal_order_id) return fail(409, "no_paypal_order")
  if (allowedOrigins.length === 0) return fail(409, "framing_not_configured")

  return {
    kind: "render",
    allowedOrigins,
    config: {
      transactionId: row.id,
      executeToken:  input.executeToken,
      paypalOrderId: row.paypal_order_id,
      clientId:      row.client_id.trim(),
      currency:      (row.original_currency || "USD").toUpperCase(),
      intent:        toSdkIntent(row.intent),
      successUrl:    row.merchant_success_url,
      cancelUrl:     row.merchant_cancel_url,
    },
  }
}
