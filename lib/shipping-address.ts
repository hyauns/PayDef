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

// Countries where PayPal's Seller Protection and delivery both depend on a
// real two-letter state/province code, and where WooCommerce is known to
// already send one (e.g. "CA", "ON"). Restricted to these two so the rest of
// the world keeps free-text state, since most countries have no such code
// (or a legitimate multi-word one, e.g. "Noord-Holland").
const STATE_CODE_COUNTRIES = new Set(["US", "CA"])

/**
 * sanitizePayPalField strips URLs, emails and injection characters. Its default
 * pass also deletes runs of 8+ digits as "phone numbers", which would eat house
 * numbers and long postcodes — so addresses always opt into keepNumbers. It also
 * strips bare apostrophes by default; addresses opt into keepApostrophes so a
 * real name or street like "O'Connor" reaches PayPal unmangled, since PayPal
 * keeps this exact string as its own record for Seller Protection. `<`, `>`
 * and `"` are still stripped either way.
 */
function clean(raw: unknown, maxLength: number): string {
  if (typeof raw !== "string") return ""
  return sanitizePayPalField(raw, maxLength, { keepNumbers: true, keepApostrophes: true })
}

/**
 * Turns untrusted merchant JSON into a PayPal shipping block, or null when the
 * address is unusable.
 *
 * null is a feature, not a failure: the caller then omits the block and PayPal
 * keeps the historical NO_SHIPPING behaviour.
 *
 * The gate below is deliberately strict, and it only ever gets stricter, never
 * looser: once a non-null result is sent to PayPal it goes out as
 * SET_PROVIDED_ADDRESS, and PayPal validates that block server-side. An
 * address that's missing a city, postcode, or (for US/CA) a real state code
 * doesn't fail soft — PayPal rejects the order outright, which in this route
 * becomes a ROLLBACK and a 502 on every retry, i.e. the merchant loses the
 * sale. A rejected checkout is strictly worse than one with no shipping block
 * at all, so any field we're not confident PayPal will accept must push the
 * whole address back to null rather than go out half-built. That also means
 * no numeric coercion anywhere: clean()'s string-only guard is itself part of
 * this safety property, so a JSON number (e.g. a postal_code sent as 12345
 * instead of "12345") makes the whole address fall back to NO_SHIPPING rather
 * than being silently dropped from an otherwise-accepted block. One accepted
 * side effect: countries with no postcode system (Hong Kong, Ireland, UAE,
 * Panama, …) will never pass this gate and always keep NO_SHIPPING — that is
 * today's (safe) behaviour, not a regression, and a per-country postcode
 * exemption list is intentionally out of scope here.
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

  // A city and postcode are required for every country we accept: PayPal
  // validates SET_PROVIDED_ADDRESS server-side, and an address missing either
  // is exactly the shape that gets rejected. See the function doc for why
  // that must fail closed to null instead of going out half-built.
  const city = clean(raw.city, MAX_CITY)
  if (!city) return null

  const postalCode = clean(raw.postal_code, MAX_POSTAL)
  if (!postalCode) return null

  // US and CA specifically require a real two-letter state/province code,
  // upper-cased ("ca" -> "CA"). WooCommerce already sends codes like "CA" or
  // "ON" for these countries, so anything else (a full state name, a missing
  // state, a 3-letter code) is treated as unusable rather than guessed at.
  // Every other country keeps free-text state exactly as before, since most
  // have no such code and some legitimate values are multi-word
  // (e.g. "Noord-Holland").
  let state: string
  if (STATE_CODE_COUNTRIES.has(countryCode)) {
    const stateCode = typeof raw.state === "string" ? raw.state.trim().toUpperCase() : ""
    if (!/^[A-Z]{2}$/.test(stateCode)) return null
    state = stateCode
  } else {
    state = clean(raw.state, MAX_STATE)
  }

  const address: PayPalShipping["address"] = {
    address_line_1: addressLine1,
    admin_area_2:   city,
    postal_code:    postalCode,
    country_code:   countryCode,
  }

  const addressLine2 = clean(raw.line2, MAX_LINE)
  if (addressLine2) address.address_line_2 = addressLine2

  if (state) address.admin_area_1 = state

  const fullName = clean(raw.name, MAX_NAME)
  return fullName ? { name: { full_name: fullName }, address } : { address }
}
