import { getSql } from "@/lib/neon"
import { resolveShieldBaseUrl } from "@/lib/masking"
import { buildSmartButtonsUrl } from "@/lib/smart-buttons"

export const CHECKOUT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE", "SMART_BUTTONS"] as const

export type CheckoutFlow = (typeof CHECKOUT_FLOW_VALUES)[number]

export const DEFAULT_CHECKOUT_FLOW: CheckoutFlow = "REDIRECT"

// The platform-wide default may only be a flow that works for every store and
// every existing integration with no storefront change. SMART_BUTTONS needs the
// storefront to frame embedUrl and exists only for PayPal, so it is a per-store
// opt-in and never a default.
export const PLATFORM_DEFAULT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE"] as const

export type PlatformDefaultFlow = (typeof PLATFORM_DEFAULT_FLOW_VALUES)[number]

export interface CheckoutPreferences {
  defaultFlow: PlatformDefaultFlow
}

interface SettingsRow {
  value: Record<string, unknown> | null
}

export function normalizeCheckoutFlow(value: unknown): CheckoutFlow {
  return CHECKOUT_FLOW_VALUES.includes(value as CheckoutFlow)
    ? (value as CheckoutFlow)
    : DEFAULT_CHECKOUT_FLOW
}

export function normalizePlatformDefaultFlow(value: unknown): PlatformDefaultFlow {
  return PLATFORM_DEFAULT_FLOW_VALUES.includes(value as PlatformDefaultFlow)
    ? (value as PlatformDefaultFlow)
    : "REDIRECT"
}

export async function getCheckoutPreferences(sql: ReturnType<typeof getSql>): Promise<CheckoutPreferences> {
  try {
    const rows = (await sql`
      SELECT value
      FROM system_settings
      WHERE key = 'checkout_preferences'
      LIMIT 1
    `) as unknown as SettingsRow[]

    return {
      defaultFlow: normalizePlatformDefaultFlow(rows[0]?.value?.defaultFlow),
    }
  } catch {
    return { defaultFlow: "REDIRECT" }
  }
}

// Stripe and Shopify have no embeddable button page; a store that was switched
// to SMART_BUTTONS and later moved to one of them keeps working as a redirect.
const PROVIDERS_WITHOUT_SMART_BUTTONS = new Set(["STRIPE", "SHOPIFY"])

export function effectiveFlowForProvider(
  flow: CheckoutFlow,
  providerType: string | null | undefined
): CheckoutFlow {
  if (flow !== "SMART_BUTTONS") return flow
  return PROVIDERS_WITHOUT_SMART_BUTTONS.has(String(providerType ?? "").toUpperCase())
    ? "REDIRECT"
    : flow
}

export function resolveCheckoutFlow(
  storeFlow: unknown,
  preferences?: Partial<CheckoutPreferences> | null
): CheckoutFlow {
  if (storeFlow === null || storeFlow === undefined || storeFlow === "") {
    return normalizeCheckoutFlow(preferences?.defaultFlow)
  }

  return normalizeCheckoutFlow(storeFlow)
}

export function buildPopupBridgeUrl(
  shieldDomain: string | null | undefined,
  approvalUrl: string,
  transactionId: string
): string {
  const base = resolveShieldBaseUrl(shieldDomain)
  const params = new URLSearchParams({
    ref: transactionId,
    approval: approvalUrl,
  })

  return `${base}/checkout/popup?${params.toString()}`
}

/**
 * Presentation URLs for one checkout. approvalUrl is never altered: every
 * flow still returns it, so integrations that ignore popupUrl/embedUrl keep
 * redirecting exactly as before.
 */
export function buildFlowUrls(input: {
  flow: CheckoutFlow
  shieldDomain: string | null | undefined
  approvalUrl: string
  transactionId: string
  executeToken: string | null
}): { popupUrl: string | null; popupOrigin: string | null; embedUrl: string | null; embedOrigin: string | null } {
  if (input.flow === "POPUP_BRIDGE") {
    const popupUrl = buildPopupBridgeUrl(input.shieldDomain, input.approvalUrl, input.transactionId)
    return { popupUrl, popupOrigin: new URL(popupUrl).origin, embedUrl: null, embedOrigin: null }
  }
  if (input.flow === "SMART_BUTTONS") {
    const embedUrl = buildSmartButtonsUrl(input.shieldDomain, input.transactionId, input.executeToken)
    return { popupUrl: null, popupOrigin: null, embedUrl, embedOrigin: new URL(embedUrl).origin }
  }
  return { popupUrl: null, popupOrigin: null, embedUrl: null, embedOrigin: null }
}
