export function validateProfileField(fieldName: string, rawValue: string | null | undefined, isRequired: boolean = false): { valid: boolean; value?: string; error?: string } {
  // A. Normalize only whitespace
  if (rawValue === null || rawValue === undefined) {
    if (isRequired) return { valid: false, error: `${fieldName} is required.` }
    return { valid: true, value: "" }
  }

  const normalized = String(rawValue).replace(/\s+/g, " ").trim()

  if (!normalized) {
    if (isRequired) return { valid: false, error: `${fieldName} is required.` }
    return { valid: true, value: "" }
  }

  // B. Validate raw value
  if (normalized.length > 127) {
    return { valid: false, error: `${fieldName} exceeds maximum length of 127 characters.` }
  }

  if (/[<>]/.test(normalized)) {
    return { valid: false, error: `${fieldName} cannot contain HTML tags or angle brackets (< or >).` }
  }

  // reject if contains email pattern
  if (/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/.test(normalized)) {
    return { valid: false, error: `${fieldName} cannot contain email addresses.` }
  }

  const lower = normalized.toLowerCase()

  // reject if contains URL/domain pattern
  if (/https?:\/\//i.test(lower) || /www\./i.test(lower) || /\.(com|net|org|io|co|biz|info)\b/i.test(lower)) {
    return { valid: false, error: `${fieldName} cannot contain URLs.` }
  }

  // reject if contains phone number pattern
  if (/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(normalized)) {
    return { valid: false, error: `${fieldName} cannot contain phone numbers.` }
  }

  // reject if contains dangerous keywords/patterns
  if (
    lower.includes("script") ||
    lower.includes("/script") ||
    lower.includes("javascript:") ||
    lower.includes("onerror=") ||
    lower.includes("onclick=") ||
    lower.includes("iframe") ||
    lower.includes("style=") ||
    lower.includes("svg") ||
    lower.includes("alert(")
  ) {
    return { valid: false, error: `${fieldName} contains blocked scripts or dangerous keywords.` }
  }

  // C. Only after validation passes: return the cleaned/safe value
  return { valid: true, value: normalized }
}
