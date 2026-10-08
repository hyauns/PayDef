/**
 * lib/button-session-create.ts — decide whether a store gets Smart Buttons for
 * a page render, and if so pin a merchant account in a button session.
 *
 * Account choice mirrors /api/gateway/checkout (eligibility → display-profile
 * preference → circuit breaker → rotation strategy) but is read-only: no row
 * lock, no volume change. Checkout re-checks the pinned account with the final
 * amount and answers 409 if it is no longer usable.
 *
 * Dependencies are injected so the decision is testable without DB / Redis;
 * app/api/gateway/button-session/route.ts wires the real ones.
 */

import type { AuthenticatedStore } from "@/lib/gateway-auth"
import type { MerchantAccountRow } from "@/lib/merchant-rotation"
import { filterEligibleAccounts } from "@/lib/merchant-rotation"
import { effectiveFlowForProvider, resolveCheckoutFlow, type PlatformDefaultFlow } from "@/lib/checkout-flow"
import { frameAncestorOrigins } from "@/lib/smart-buttons"
import { buildSessionEmbedUrl, sessionToken, type ButtonContext } from "@/lib/button-sessions"

export interface ButtonSessionDeps {
  loadAccounts(tenantId: string): Promise<MerchantAccountRow[]>
  preferredProfileId(): Promise<string | null>
  filterOpenCircuits(accounts: MerchantAccountRow[]): Promise<MerchantAccountRow[]>
  selectByStrategy(accounts: MerchantAccountRow[]): Promise<MerchantAccountRow>
  insertSession(row: NewButtonSession): Promise<{ id: string; expires_at: string | Date }>
}

export interface NewButtonSession {
  tenant_id:           string
  store_id:            string
  merchant_account_id: string
  shield_domain:       string | null
  context:             ButtonContext
  amount:              string
  currency:            string
  intent:              "CAPTURE" | "AUTHORIZE"
  allowed_origins:     string[]
}

export type ButtonSessionResult =
  | { enabled: false; reason: "flow" | "framing_not_configured" | "no_account" }
  | { enabled: true; sessionId: string; embedUrl: string; embedOrigin: string; expiresAt: string }

export async function createButtonSession(
  deps: ButtonSessionDeps,
  input: {
    store: AuthenticatedStore
    amount: number
    currency: string
    context: ButtonContext
    defaultFlow: PlatformDefaultFlow
  }
): Promise<ButtonSessionResult> {
  const { store } = input

  const flow = effectiveFlowForProvider(
    resolveCheckoutFlow(store.checkoutFlow, { defaultFlow: input.defaultFlow }),
    store.providerType
  )
  if (flow !== "SMART_BUTTONS") return { enabled: false, reason: "flow" }

  const allowedOrigins = frameAncestorOrigins([store.successReturnUrl, store.cancelReturnUrl])
  if (allowedOrigins.length === 0) return { enabled: false, reason: "framing_not_configured" }

  const eligible = filterEligibleAccounts(await deps.loadAccounts(store.tenantId), input.amount)

  const profileId = await deps.preferredProfileId()
  const profileMatched = profileId ? eligible.filter((a) => a.display_profile_id === profileId) : []
  const preferred = profileMatched.length > 0 ? profileMatched : eligible

  const open = preferred.length > 0 ? await deps.filterOpenCircuits(preferred) : []
  if (open.length === 0) return { enabled: false, reason: "no_account" }

  const account = await deps.selectByStrategy(open)

  const saved = await deps.insertSession({
    tenant_id:           store.tenantId,
    store_id:            store.id,
    merchant_account_id: account.id,
    shield_domain:       account.shield_domain,
    context:             input.context,
    amount:              input.amount.toFixed(2),
    currency:            input.currency.toUpperCase(),
    intent:              store.captureMode === "MANUAL" ? "AUTHORIZE" : "CAPTURE",
    allowed_origins:     allowedOrigins,
  })

  const embedUrl = buildSessionEmbedUrl(account.shield_domain, saved.id, sessionToken(saved.id))
  return {
    enabled:     true,
    sessionId:   saved.id,
    embedUrl,
    embedOrigin: new URL(embedUrl).origin,
    expiresAt:   new Date(saved.expires_at).toISOString(),
  }
}
