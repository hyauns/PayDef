/**
 * lib/button-sessions.ts — "button sessions" for Smart Buttons shown directly on
 * the checkout, cart and product pages.
 *
 * The PayPal JS SDK needs the account's client-id when the buttons render, but
 * the PayPal order is only created when the buyer clicks. A button session pins
 * the PayDef-selected merchant account at render time (read-only — volume is
 * still counted at execute); /api/gateway/checkout later creates the order on
 * exactly that account and re-checks its limits with the final amount.
 *
 * Pure functions only. Routes: app/api/gateway/button-session,
 * app/api/gateway/checkout, app/checkout/buttons.
 */

import { resolveShieldBaseUrl } from "@/lib/masking"
import { generateExecuteToken, verifyExecuteToken } from "@/lib/execute-token"
import { BUTTONS_PATH, toSdkIntent } from "@/lib/smart-buttons"

export const BUTTON_CONTEXTS = ["checkout", "cart", "product"] as const
export type ButtonContext = (typeof BUTTON_CONTEXTS)[number]

export function isButtonContext(value: unknown): value is ButtonContext {
  return BUTTON_CONTEXTS.includes(value as ButtonContext)
}

// The session id is the secret-bearing reference on the iframe URL, signed with
// the same HMAC key as execute tokens (shadow / enforce semantics included).
const TOKEN_PREFIX = "button-session:"

export function sessionToken(sessionId: string): string | null {
  return generateExecuteToken(TOKEN_PREFIX + sessionId)
}

export function verifySessionToken(sessionId: string, token: string | null | undefined) {
  return verifyExecuteToken(TOKEN_PREFIX + sessionId, token)
}

export function buildSessionEmbedUrl(
  shieldDomain: string | null | undefined,
  sessionId: string,
  token: string | null
): string {
  const params = new URLSearchParams({ session: sessionId })
  if (token) params.set("st", token)
  return `${resolveShieldBaseUrl(shieldDomain)}${BUTTONS_PATH}?${params.toString()}`
}

/** The pinned account, if it is still among the eligible ones. */
export function pickPinnedAccount<T extends { id: string }>(
  eligible: T[],
  session: { merchant_account_id: string }
): T | null {
  return eligible.find((account) => account.id === session.merchant_account_id) ?? null
}

export interface ButtonSessionRow {
  id:                  string
  store_id:            string
  merchant_account_id: string
  shield_domain:       string | null
  context:             string
  amount:              string
  currency:            string
  intent:              string
  allowed_origins:     string[]
  expires_at:          string | Date
  client_id:           string
}

export interface SessionPageConfig {
  sessionId: string
  clientId:  string
  currency:  string
  intent:    "capture" | "authorize"
  // Cart / product pages: no address yet, so the page relays PayPal's
  // onShippingAddressChange to the shop to price shipping.
  express:   boolean
}

export type SessionPageDecision =
  | { kind: "render"; config: SessionPageConfig; allowedOrigins: string[] }
  | {
      kind: "error"
      status: number
      code: "not_found" | "invalid_token" | "expired" | "framing_not_configured"
      allowedOrigins: string[]
    }

export function decideSessionPage(input: {
  row: ButtonSessionRow | null
  tokenShouldBlock: boolean
  now: Date
}): SessionPageDecision {
  const { row } = input
  if (!row) return { kind: "error", status: 404, code: "not_found", allowedOrigins: [] }

  const allowedOrigins = row.allowed_origins ?? []
  if (input.tokenShouldBlock) return { kind: "error", status: 403, code: "invalid_token", allowedOrigins }
  if (new Date(row.expires_at).getTime() <= input.now.getTime()) {
    return { kind: "error", status: 410, code: "expired", allowedOrigins }
  }
  if (allowedOrigins.length === 0) {
    return { kind: "error", status: 409, code: "framing_not_configured", allowedOrigins }
  }

  return {
    kind: "render",
    allowedOrigins,
    config: {
      sessionId: row.id,
      clientId:  row.client_id.trim(),
      currency:  (row.currency || "USD").toUpperCase(),
      intent:    toSdkIntent(row.intent),
      express:   row.context !== "checkout",
    },
  }
}

// ─── /api/gateway/checkout with a button session ──────────────────────────────

export interface CheckoutSessionRow {
  id:                  string
  store_id:            string
  merchant_account_id: string
  context:             string
  amount:              string
  currency:            string
  expires_at:          string | Date
}

export function resolveCheckoutSession(
  row: CheckoutSessionRow | null,
  storeId: string,
  now: Date
): { ok: true; session: CheckoutSessionRow } | { ok: false; status: 409; code: "button_session_invalid" } {
  if (!row || row.store_id !== storeId || new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, status: 409, code: "button_session_invalid" }
  }
  return { ok: true, session: row }
}

/** Express (PayPal collects the address) = a cart / product session that asked for it. */
export function isExpressCheckout(body: { express?: unknown }, session: { context: string } | null): boolean {
  return body.express === true && !!session && session.context !== "checkout"
}
