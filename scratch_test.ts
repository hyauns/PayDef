type BillingAddress = Record<string, unknown> | string | null

function normalizeBillingAddress(value: BillingAddress) {
  if (value == null) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const address = value as Record<string, unknown>
    const normalized = {
      line1: typeof address.line1 === "string" ? address.line1.trim() : undefined,
      line2: typeof address.line2 === "string" ? address.line2.trim() : undefined,
      city: typeof address.city === "string" ? address.city.trim() : undefined,
      state: typeof address.state === "string" ? address.state.trim() : undefined,
      postal_code: typeof address.postal_code === "string" ? address.postal_code.trim() : undefined,
      country: typeof address.country === "string" ? address.country.trim() : undefined,
    }

    return Object.values(normalized).some((part) => typeof part === "string" && part.length > 0)
      ? normalized
      : null
  }
  return null
}

const payload = {
  billingAddress: {
    line1: "123 Street",
    city: "NY",
    state: "NY",
    postal_code: "10001",
    country: "US"
  }
}

console.log(normalizeBillingAddress(payload.billingAddress));
