/**
 * Item Masking — obfuscates product names before they appear in PayPal orders.
 *
 * Strategy: replace the item name with a neutral, generic descriptor that
 * gives no indication of the actual product category or merchant.
 */

const MASKED_DESCRIPTORS = [
  "Digital Service",
  "Online Subscription",
  "Digital Content",
  "Premium Access",
  "Digital Download",
  "Service Package",
  "Digital Product",
  "Premium Content",
]

/**
 * Returns a deterministic-ish masked name based on the input string so the
 * same real item always maps to the same descriptor within a session.
 * Falls back to "Digital Service" for empty inputs.
 */
export function maskItemName(realName: string): string {
  if (!realName?.trim()) return "Digital Service"
  // Simple hash: sum char codes mod descriptor count
  const hash = [...realName].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return MASKED_DESCRIPTORS[hash % MASKED_DESCRIPTORS.length]
}

/**
 * Builds return / cancel URLs from the merchant's shield domain.
 * shieldDomain should be a bare domain, e.g. "checkout.example.com"
 */
export function buildShieldUrls(
  shieldDomain: string,
  transactionId: string
): { returnUrl: string; cancelUrl: string } {
  const base = shieldDomain.startsWith("http")
    ? shieldDomain.replace(/\/$/, "")
    : `https://${shieldDomain.replace(/\/$/, "")}`

  return {
    returnUrl: `${base}/order/success?ref=${transactionId}`,
    cancelUrl: `${base}/order/cancel?ref=${transactionId}`,
  }
}
