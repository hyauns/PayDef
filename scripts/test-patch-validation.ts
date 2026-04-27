/**
 * Test script: Simulates the exact PATCH handler logic locally
 * to verify that validation rejects emails/URLs/phones BEFORE any DB operation.
 * 
 * This does NOT call the HTTP endpoint — it directly exercises the same code path.
 */

import { validateProfileField } from "../lib/profile-validation"

// Simulate the exact body the UI sends
function simulatePatchValidation(body: any): { status: number; response: any } {
  const VALID_VERTICALS = [
    "automotive_tires", "electronics", "home_goods", "toys", "beauty", "apparel", "generic_ecommerce"
  ]
  const VALID_MODES = ["REAL_SANITIZED", "SEMANTIC_ORDER", "BRAND_SEMANTIC", "LEGACY_GENERIC"]
  const VALID_POLICIES = ["SINGLE_SEMANTIC_ITEM", "REAL_CART_ITEMS", "LEGACY_RANDOM_SPLIT"]

  const { storeId, industryVertical, publicBrandName, descriptorPrefix, displayMode, lineItemPolicy } = body

  if (!storeId) return { status: 400, response: { error: "Missing storeId" } }
  if (!VALID_VERTICALS.includes(industryVertical)) return { status: 400, response: { error: "Invalid industry vertical" } }
  if (!VALID_MODES.includes(displayMode)) return { status: 400, response: { error: "Invalid display mode" } }
  if (!VALID_POLICIES.includes(lineItemPolicy)) return { status: 400, response: { error: "Invalid line item policy" } }

  // This is the EXACT same validation the route does
  const brandValidation = validateProfileField("Public Brand Name", publicBrandName)
  if (!brandValidation.valid) return { status: 400, response: { error: brandValidation.error, field: "publicBrandName" } }
  
  const prefixValidation = validateProfileField("Descriptor Prefix", descriptorPrefix)
  if (!prefixValidation.valid) return { status: 400, response: { error: prefixValidation.error, field: "descriptorPrefix" } }

  const safeBrandName = brandValidation.value || null
  const safePrefix = prefixValidation.value || null

  // If we get here, validation passed — would proceed to DB
  return { status: 200, response: { success: true, message: "Profile updated successfully", safeBrandName, safePrefix } }
}

// ── Test Cases ──

const baseBody = {
  storeId: "test-store",
  industryVertical: "automotive_tires",
  displayMode: "BRAND_SEMANTIC",
  publicBrandName: "TireVix",
  lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
}

const testCases: [string, any, number][] = [
  ["A. email in descriptorPrefix", { ...baseBody, descriptorPrefix: "support@test.com" }, 400],
  ["B. embedded email", { ...baseBody, descriptorPrefix: "TireVix support@test.com" }, 400],
  ["C. URL", { ...baseBody, descriptorPrefix: "https://bad-site.com" }, 400],
  ["D. phone", { ...baseBody, descriptorPrefix: "323-329-7659" }, 400],
  ["E. valid", { ...baseBody, descriptorPrefix: "TireVix Auto" }, 200],
  ["F. empty (optional)", { ...baseBody, descriptorPrefix: "" }, 200],
  ["G. script tag", { ...baseBody, descriptorPrefix: "<script>alert(1)</script>" }, 400],
  ["H. email in publicBrandName", { ...baseBody, descriptorPrefix: "TireVix Auto", publicBrandName: "admin@evil.com" }, 400],
]

let allPassed = true
for (const [label, body, expectedStatus] of testCases) {
  const result = simulatePatchValidation(body)
  const passed = result.status === expectedStatus
  if (!passed) allPassed = false
  console.log(
    passed ? "PASS" : "***FAIL***",
    label.padEnd(35),
    `Expected ${expectedStatus}, Got ${result.status}`,
    JSON.stringify(result.response)
  )
}
console.log(allPassed ? "\nALL TESTS PASSED" : "\n*** SOME TESTS FAILED ***")
process.exit(allPassed ? 0 : 1)
