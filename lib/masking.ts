/**
 * lib/masking.ts — PayPal Payload Masking & Shielding
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  SECURITY INVARIANT                                                │
 * │  No original product name, store name, merchant identity, or      │
 * │  customer-identifiable data may appear in any PayPal API payload.  │
 * │  Every outbound string is replaced with a neutral, enterprise-     │
 * │  grade descriptor that reveals nothing about the underlying good.  │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Functions:
 *  • maskItemName()      — replaces real product names with neutral descriptors
 *  • maskBrandName()     — returns a generic enterprise brand for PayPal checkout
 *  • sanitizeForPayPal() — strips any field that could leak sensitive data
 *  • buildShieldUrls()   — constructs return/cancel URLs via the shield domain
 */

// ─── Masked Descriptors ──────────────────────────────────────────────────────
// Broad, neutral terms that could apply to any business.  Intentionally varied
// to avoid triggering PayPal's pattern-matching on repeated identical names.

const MASKED_DESCRIPTORS = [
  "Technical Support",
  "Service Extension",
  "Business Consultation",
  "Professional Services",
  "Support Package",
  "Account Maintenance",
  "Platform Services",
  "Service Subscription",
  "Enterprise Solution",
  "Managed Services",
  "IT Consultation",
  "System Integration",
  "Cloud Services",
  "Infrastructure Support",
  "Compliance Review",
  "Advisory Services",
] as const

// ─── Masked Brand Names ──────────────────────────────────────────────────────
// Generic enterprise brand names shown on the PayPal checkout page.
// None of them reference the actual merchant or store.

const MASKED_BRANDS = [
  "Secure Checkout",
  "Global Services",
  "Enterprise Solutions",
  "Merchant Services",
  "Business Gateway",
  "Commerce Platform",
  "Payment Services",
  "Digital Commerce",
] as const

// ─── Masked Descriptions ─────────────────────────────────────────────────────
// PayPal's purchase_units[].description field — kept vague.

const MASKED_DESCRIPTIONS = [
  "Service agreement — reference included",
  "Enterprise service delivery",
  "Professional engagement",
  "Business transaction",
  "Service fulfilment",
] as const

// ─── Hash Utility ─────────────────────────────────────────────────────────────
// Deterministic-ish mapping: the same input always picks the same masked output
// within a given descriptor pool, avoiding visible randomness per-session.

function simpleHash(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0  // int32 wraparound
  }
  return Math.abs(hash)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Replaces a real product name with a neutral enterprise descriptor.
 *
 * Mapping is deterministic: the same `realName` always produces the same
 * masked output.  This avoids confusing repeat customers who see different
 * names for the same product across sessions.
 *
 * @param realName — the actual product name (NEVER sent to PayPal)
 * @param fakeProductName — optional per-account custom fake name; if provided,
 *                          this takes priority over the deterministic pool.
 * @returns a safe, generic descriptor
 */
export function maskItemName(realName: string, fakeProductName?: string | null): string {
  // Per-account custom fake name takes priority
  if (fakeProductName?.trim()) return fakeProductName.trim()
  if (!realName?.trim()) return MASKED_DESCRIPTORS[0]
  return MASKED_DESCRIPTORS[simpleHash(realName) % MASKED_DESCRIPTORS.length]
}

/**
 * Returns a neutral brand name for PayPal's checkout page.
 *
 * Can optionally be seeded with the merchant account ID for consistent
 * per-merchant branding (still fully generic).
 *
 * @param seed — optional seed for deterministic selection
 */
export function maskBrandName(seed?: string): string {
  if (!seed) return MASKED_BRANDS[0]
  return MASKED_BRANDS[simpleHash(seed) % MASKED_BRANDS.length]
}

/**
 * Returns a neutral description for PayPal purchase_units.
 *
 * @param seed — optional seed for deterministic selection
 */
export function maskDescription(seed?: string): string {
  if (!seed) return MASKED_DESCRIPTIONS[0]
  return MASKED_DESCRIPTIONS[simpleHash(seed) % MASKED_DESCRIPTIONS.length]
}

/**
 * Sanitises a string that will appear in PayPal API payloads.
 *
 * Strips anything that could leak sensitive data:
 *  • URLs, email addresses, phone numbers
 *  • Characters that could enable injection (angle brackets, quotes)
 *  • Trims to PayPal's 127-char field limit
 *
 * @param raw — the string to sanitize
 * @param maxLength — maximum allowed length (default 127 for PayPal fields)
 */
export function sanitizePayPalField(raw: string, maxLength = 127): string {
  return raw
    .replace(/https?:\/\/[^\s]+/gi, "")    // strip URLs
    .replace(/[\w.-]+@[\w.-]+/gi, "")       // strip emails
    .replace(/[<>"'`]/g, "")                // strip injection chars
    .replace(/\+?\d[\d\s\-()]{7,}/g, "")   // strip phone numbers
    .replace(/\s{2,}/g, " ")               // collapse whitespace
    .trim()
    .slice(0, maxLength)
}

// ─── Shield URLs ──────────────────────────────────────────────────────────────

/** Default fallback domain when no shield_domain is configured. */
const FALLBACK_SHIELD_DOMAIN = "checkout.service-portal.com"

/**
 * Builds return / cancel URLs using the merchant's shield domain.
 *
 * The shield domain masks the real store URL so the buyer's browser
 * never reveals the original e-commerce domain in PayPal's records.
 *
 * Security measures:
 *  • Falls back to a generic domain if shieldDomain is empty/missing
 *  • Strips path traversal and query injection attempts
 *  • Forces HTTPS
 *  • Transaction ID is used as an opaque reference (no other data in URL)
 *
 * @param shieldDomain — bare domain, e.g. "checkout.example.com"
 * @param transactionId — opaque UUID reference
 */
export function buildShieldUrls(
  shieldDomain: string | null | undefined,
  transactionId: string
): { returnUrl: string; cancelUrl: string } {
  // Sanitize domain: strip protocol, paths, query strings, whitespace
  let domain = (shieldDomain ?? "").trim()
  domain = domain.replace(/^https?:\/\//i, "")   // strip protocol
  domain = domain.replace(/[/?#].*$/, "")          // strip path/query/hash
  domain = domain.replace(/[^a-zA-Z0-9.\-]/g, "") // whitelist domain chars

  // Fallback to generic domain if empty or obviously invalid
  if (!domain || domain.length < 4 || !domain.includes(".")) {
    domain = FALLBACK_SHIELD_DOMAIN
  }

  const base = `https://${domain}`

  // Only expose an opaque transaction reference — no product or store data
  const safeRef = encodeURIComponent(transactionId)

  return {
    returnUrl: `${base}/order/success?ref=${safeRef}`,
    cancelUrl: `${base}/order/cancel?ref=${safeRef}`,
  }
}
