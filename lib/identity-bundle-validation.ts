/**
 * lib/identity-bundle-validation.ts — Phase 5B
 *
 * Input validation and compliance helpers for Payment Identity Bundles.
 *
 * Rules:
 *   • Reject HTML/script injection in user-facing text fields
 *   • Validate email format in support_email
 *   • Restrict URLs to URL-only fields
 *   • Reject email/phone/URL in descriptor_name and product_title
 *   • Validate product_type allowlist
 *   • Return warnings (not hard failures) for compliance mismatch
 *
 * Does NOT:
 *   • Change checkout behavior
 *   • Modify PayPal payloads
 *   • Affect existing Payment Display Profiles
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BundleProductType = "physical_good" | "digital_good" | "service" | "category"

export interface BundleValidationWarning {
  field: string
  code: string
  message: string
}

export interface BundleValidationResult {
  valid: boolean
  errors: string[]
  warnings: BundleValidationWarning[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_PRODUCT_TYPES: ReadonlySet<string> = new Set([
  "physical_good",
  "digital_good",
  "service",
  "category",
])

/** Patterns that indicate service-style descriptors (for physical goods warning) */
const SERVICE_STYLE_PATTERNS = [
  /\btechnical\s+support\b/i,
  /\bservice\s+extension\b/i,
  /\benterprise\s+solution\b/i,
  /\bdigital\s+access\b/i,
  /\bcloud\s+services?\b/i,
  /\bmanaged\s+services?\b/i,
  /\bit\s+consultation\b/i,
  /\binfrastructure\s+support\b/i,
  /\bcompliance\s+review\b/i,
  /\badvisory\s+services?\b/i,
  /\bplatform\s+services?\b/i,
  /\bservice\s+subscription\b/i,
  /\baccount\s+maintenance\b/i,
  /\bprofessional\s+services?\b/i,
  /\bbusiness\s+consultation\b/i,
  /\bsupport\s+package\b/i,
]

// ─── HTML / Script Injection Detection ────────────────────────────────────────

/**
 * Returns true if the input contains HTML tags, script injection,
 * or other dangerous content patterns.
 */
export function containsInjection(input: string): boolean {
  if (!input) return false
  const lower = input.toLowerCase()

  // HTML tags
  if (/<[a-z/!]/i.test(input)) return true
  // Script patterns
  if (/\bjavascript\s*:/i.test(input)) return true
  if (/\bonerror\b/i.test(input)) return true
  if (/\bonclick\b/i.test(input)) return true
  if (/\bonload\b/i.test(input)) return true
  if (/\bonmouseover\b/i.test(input)) return true
  // Dangerous tags even without brackets
  if (lower.includes("<script")) return true
  if (lower.includes("<iframe")) return true
  if (lower.includes("<svg")) return true
  if (lower.includes("<img")) return true
  if (/\balert\s*\(/i.test(input)) return true
  if (/\beval\s*\(/i.test(input)) return true
  if (/\bdocument\s*\./i.test(input)) return true
  if (/\bwindow\s*\./i.test(input)) return true

  return false
}

// ─── Content Pattern Detection ────────────────────────────────────────────────

const EMAIL_REGEX = /[\w.+-]+@[\w.-]+\.\w{2,}/
const PHONE_REGEX = /\+?\d[\d\s\-()]{7,}/
const URL_REGEX = /https?:\/\/[^\s]+/i

export function containsEmail(input: string): boolean {
  return EMAIL_REGEX.test(input)
}

export function containsPhone(input: string): boolean {
  return PHONE_REGEX.test(input)
}

export function containsUrl(input: string): boolean {
  return URL_REGEX.test(input)
}

export function isValidEmail(email: string): boolean {
  if (!email) return false
  // Basic email validation — intentionally not overly strict
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

export function isValidUrl(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

// ─── Service-Style Descriptor Detection ───────────────────────────────────────

/**
 * Returns true if the descriptor text looks like a service-style descriptor
 * that should NOT be used for physical goods shipping with tracking.
 */
export function isServiceStyleDescriptor(descriptorName: string): boolean {
  if (!descriptorName) return false
  return SERVICE_STYLE_PATTERNS.some(p => p.test(descriptorName))
}

// ─── Text Field Validation ────────────────────────────────────────────────────

/**
 * Validates a plain text field (bundle_name, descriptor_name, product_title).
 * Rejects injection and disallowed content.
 */
export function validateTextField(
  fieldName: string,
  value: string,
  opts?: { allowUrl?: boolean; allowEmail?: boolean; maxLength?: number }
): { errors: string[]; warnings: BundleValidationWarning[] } {
  const errors: string[] = []
  const warnings: BundleValidationWarning[] = []
  const maxLen = opts?.maxLength ?? 127

  if (!value || !value.trim()) {
    errors.push(`${fieldName} is required`)
    return { errors, warnings }
  }

  if (value.length > maxLen) {
    errors.push(`${fieldName} exceeds maximum length of ${maxLen} characters`)
  }

  if (containsInjection(value)) {
    errors.push(`${fieldName} contains disallowed HTML or script content`)
  }

  if (!opts?.allowEmail && containsEmail(value)) {
    errors.push(`${fieldName} must not contain email addresses`)
  }

  if (containsPhone(value)) {
    errors.push(`${fieldName} must not contain phone numbers`)
  }

  if (!opts?.allowUrl && containsUrl(value)) {
    errors.push(`${fieldName} must not contain URLs`)
  }

  return { errors, warnings }
}

// ─── URL Field Validation ─────────────────────────────────────────────────────

export function validateUrlField(
  fieldName: string,
  value: string | null | undefined
): { errors: string[]; warnings: BundleValidationWarning[] } {
  const errors: string[] = []
  const warnings: BundleValidationWarning[] = []

  if (!value || !value.trim()) return { errors, warnings } // optional

  if (containsInjection(value)) {
    errors.push(`${fieldName} contains disallowed content`)
    return { errors, warnings }
  }

  if (!isValidUrl(value)) {
    errors.push(`${fieldName} must be a valid URL`)
  }

  return { errors, warnings }
}

// ─── Bundle Validation ────────────────────────────────────────────────────────

export interface BundleInput {
  bundle_name: string
  public_brand_name?: string | null
  industry_vertical: string
  primary_shield_domain?: string | null
  support_email?: string | null
  support_phone?: string | null
  order_lookup_url?: string | null
  tracking_url?: string | null
  shipping_policy_url?: string | null
  refund_policy_url?: string | null
  privacy_policy_url?: string | null
  terms_url?: string | null
}

export function validateBundle(input: BundleInput): BundleValidationResult {
  const errors: string[] = []
  const warnings: BundleValidationWarning[] = []

  // bundle_name
  const nameResult = validateTextField("bundle_name", input.bundle_name, { maxLength: 200 })
  errors.push(...nameResult.errors)
  warnings.push(...nameResult.warnings)

  // public_brand_name (optional)
  if (input.public_brand_name) {
    const brandResult = validateTextField("public_brand_name", input.public_brand_name, { maxLength: 100 })
    errors.push(...brandResult.errors)
    warnings.push(...brandResult.warnings)
  }

  // industry_vertical
  if (!input.industry_vertical || !input.industry_vertical.trim()) {
    errors.push("industry_vertical is required")
  }

  // support_email
  if (input.support_email && !isValidEmail(input.support_email)) {
    errors.push("support_email must be a valid email address")
  }

  // URL fields
  const urlFields = [
    "order_lookup_url", "tracking_url", "shipping_policy_url",
    "refund_policy_url", "privacy_policy_url", "terms_url",
  ] as const
  for (const field of urlFields) {
    const v = input[field]
    if (v) {
      const urlResult = validateUrlField(field, v)
      errors.push(...urlResult.errors)
      warnings.push(...urlResult.warnings)
    }
  }

  // Compliance warnings (not errors)
  if (!input.support_email) {
    warnings.push({
      field: "support_email",
      code: "MISSING_SUPPORT_EMAIL",
      message: "Bundle has no support email — recommended for compliance",
    })
  }
  if (!input.refund_policy_url) {
    warnings.push({
      field: "refund_policy_url",
      code: "MISSING_REFUND_POLICY",
      message: "Bundle has no refund policy URL — recommended for compliance",
    })
  }
  if (!input.shipping_policy_url) {
    warnings.push({
      field: "shipping_policy_url",
      code: "MISSING_SHIPPING_POLICY",
      message: "Bundle has no shipping policy URL — recommended for compliance",
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ─── Bundle Item Validation ───────────────────────────────────────────────────

export interface BundleItemInput {
  descriptor_name: string
  product_title: string
  product_description?: string | null
  product_type: string
  shipping_required?: boolean
  tracking_expected?: boolean
}

export function validateBundleItem(input: BundleItemInput): BundleValidationResult {
  const errors: string[] = []
  const warnings: BundleValidationWarning[] = []

  // descriptor_name
  const descResult = validateTextField("descriptor_name", input.descriptor_name, { maxLength: 127 })
  errors.push(...descResult.errors)
  warnings.push(...descResult.warnings)

  // product_title
  const titleResult = validateTextField("product_title", input.product_title, { maxLength: 200 })
  errors.push(...titleResult.errors)
  warnings.push(...titleResult.warnings)

  // product_description (optional)
  if (input.product_description) {
    if (containsInjection(input.product_description)) {
      errors.push("product_description contains disallowed HTML or script content")
    }
  }

  // product_type
  if (!VALID_PRODUCT_TYPES.has(input.product_type)) {
    errors.push(`product_type must be one of: ${[...VALID_PRODUCT_TYPES].join(", ")}`)
  }

  // Physical goods compliance checks
  if (input.product_type === "physical_good") {
    if (input.tracking_expected === false) {
      warnings.push({
        field: "tracking_expected",
        code: "PHYSICAL_NO_TRACKING",
        message: "Physical good has tracking_expected=false — unusual for shipped products",
      })
    }
    if (input.shipping_required === false) {
      warnings.push({
        field: "shipping_required",
        code: "PHYSICAL_NO_SHIPPING",
        message: "Physical good has shipping_required=false — unusual for physical products",
      })
    }
    if (isServiceStyleDescriptor(input.descriptor_name)) {
      warnings.push({
        field: "descriptor_name",
        code: "SERVICE_DESCRIPTOR_FOR_PHYSICAL",
        message: "Physical good uses a service-style descriptor — should use product/category-style names",
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
