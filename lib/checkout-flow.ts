import { getSql } from "@/lib/neon"
import { resolveShieldBaseUrl } from "@/lib/masking"

export const CHECKOUT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE"] as const

export type CheckoutFlow = (typeof CHECKOUT_FLOW_VALUES)[number]

export const DEFAULT_CHECKOUT_FLOW: CheckoutFlow = "REDIRECT"

export interface CheckoutPreferences {
  defaultFlow: CheckoutFlow
}

interface SettingsRow {
  value: Record<string, unknown> | null
}

export function normalizeCheckoutFlow(value: unknown): CheckoutFlow {
  return CHECKOUT_FLOW_VALUES.includes(value as CheckoutFlow)
    ? (value as CheckoutFlow)
    : DEFAULT_CHECKOUT_FLOW
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
      defaultFlow: normalizeCheckoutFlow(rows[0]?.value?.defaultFlow),
    }
  } catch {
    return { defaultFlow: DEFAULT_CHECKOUT_FLOW }
  }
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
