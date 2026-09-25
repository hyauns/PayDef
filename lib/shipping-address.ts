import { sanitizePayPalField } from "@/lib/masking"
import type { PayPalShipping } from "@/lib/paypal"

/**
 * Shipping address as merchants send it on POST /api/gateway/checkout.
 * Deliberately flat and snake_case-free apart from postal_code, matching the
 * billingAddress shape the WooCommerce plugin has always sent.
 */
export interface ShippingAddressInput {
  name?:        string
  line1?:       string
  line2?:       string
  city?:        string
  state?:       string
  postal_code?: string
  country?:     string
}

// PayPal Orders v2 maximum lengths.
const MAX_LINE   = 300
const MAX_CITY   = 120
const MAX_STATE  = 300
const MAX_POSTAL = 60
const MAX_NAME   = 300

/**
 * sanitizePayPalField strips URLs, emails and injection characters. Its default
 * pass also deletes runs of 8+ digits as "phone numbers", which would eat house
 * numbers and long postcodes — so addresses always opt into keepNumbers.
 */
function clean(raw: unknown, maxLength: number): string {
  if (typeof raw !== "string") return ""
  return sanitizePayPalField(raw, maxLength, { keepNumbers: true })
}

/**
 * Turns untrusted merchant JSON into a PayPal shipping block, or null when the
 * address is unusable.
 *
 * null is a feature, not a failure: the caller then omits the block and PayPal
 * keeps the historical NO_SHIPPING behaviour. Guessing at a half-address would
 * earn a 422 from PayPal and cost the merchant the sale.
 */
export function buildPayPalShipping(input: unknown): PayPalShipping | null {
  if (!input || typeof input !== "object") return null

  const raw = input as ShippingAddressInput

  const addressLine1 = clean(raw.line1, MAX_LINE)
  if (!addressLine1) return null

  // Not run through clean(): truncating to 2 chars would turn "United States"
  // into a plausible-looking "UN". Only a real alpha-2 code is accepted.
  const countryCode = typeof raw.country === "string" ? raw.country.trim().toUpperCase() : ""
  if (!/^[A-Z]{2}$/.test(countryCode)) return null

  const address: PayPalShipping["address"] = {
    address_line_1: addressLine1,
    country_code:   countryCode,
  }

  const addressLine2 = clean(raw.line2, MAX_LINE)
  if (addressLine2) address.address_line_2 = addressLine2

  const city = clean(raw.city, MAX_CITY)
  if (city) address.admin_area_2 = city

  const state = clean(raw.state, MAX_STATE)
  if (state) address.admin_area_1 = state

  const postalCode = clean(raw.postal_code, MAX_POSTAL)
  if (postalCode) address.postal_code = postalCode

  const fullName = clean(raw.name, MAX_NAME)
  return fullName ? { name: { full_name: fullName }, address } : { address }
}
