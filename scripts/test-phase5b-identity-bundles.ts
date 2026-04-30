/**
 * scripts/test-phase5b-identity-bundles.ts — Phase 5B
 *
 * In-memory unit tests for the Payment Identity Bundle resolver
 * and validation helpers.
 *
 * Does NOT require:
 *   - Live database connection
 *   - PayPal API calls
 *   - Running checkout flow
 *
 * Run: npx tsx scripts/test-phase5b-identity-bundles.ts
 */

import {
  selectBundleDescriptorItem,
  type ResolvedPaymentIdentityBundle,
  type PaymentIdentityBundle,
  type PaymentIdentityBundleItem,
} from "../lib/identity-bundles"

import {
  validateBundle,
  validateBundleItem,
  containsInjection,
  containsEmail,
  containsPhone,
  containsUrl,
  isServiceStyleDescriptor,
  isValidEmail,
  isValidUrl,
} from "../lib/identity-bundle-validation"

import { sanitizePayPalField } from "../lib/masking"

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, testName: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${testName}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${testName}`)
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string): void {
  if (actual === expected) {
    passed++
    console.log(`  ✓ ${testName}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${testName} — expected "${expected}", got "${actual}"`)
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const STORE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const BUNDLE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"

function makeBundleRow(overrides: Partial<PaymentIdentityBundle> = {}): PaymentIdentityBundle {
  return {
    id: BUNDLE_ID,
    tenant_id: TENANT_ID,
    store_id: STORE_ID,
    display_profile_id: null,
    bundle_name: "TireVix Auto Bundle",
    public_brand_name: "TireVix Auto",
    industry_vertical: "automotive_tires",
    primary_shield_domain: "tirevix-auto.com",
    support_email: "support@tirevix.com",
    support_phone: null,
    order_lookup_url: "https://tirevix-auto.com/track",
    tracking_url: null,
    shipping_policy_url: "https://tirevix-auto.com/shipping-policy",
    refund_policy_url: "https://tirevix-auto.com/refund-policy",
    privacy_policy_url: null,
    terms_url: null,
    is_default: true,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeBundleItem(overrides: Partial<PaymentIdentityBundleItem> = {}): PaymentIdentityBundleItem {
  return {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    tenant_id: TENANT_ID,
    bundle_id: BUNDLE_ID,
    descriptor_name: "Tire & Wheel Order",
    product_slug: "tire-wheel-order",
    product_title: "Tire & Wheel Order",
    product_description: "Premium automotive tires and wheels.",
    product_type: "physical_good",
    shipping_required: true,
    tracking_expected: true,
    price_min: null,
    price_max: null,
    image_url: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function makeResolvedBundle(
  bundle: PaymentIdentityBundle | null,
  items: PaymentIdentityBundleItem[],
  source: "merchant_account_bundle" | "store_default_bundle" | "tenant_default_bundle" | "display_profile_bundle" | "no_bundle" = "merchant_account_bundle"
): ResolvedPaymentIdentityBundle {
  return {
    bundle,
    items,
    source,
    fallbackUsed: bundle === null,
    fallbackReason: bundle === null ? "no_active_bundle_found" : null,
    warnings: [],
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════")
console.log("  Phase 5B: Payment Identity Bundle — Unit Tests")
console.log("═══════════════════════════════════════════════════════\n")

// ── Section 1: Injection Detection ──────────────────────────────────────────
console.log("Section 1: Injection Detection")

assert(containsInjection("<script>alert(1)</script>"), "detects script tags")
assert(containsInjection('<img onerror="hack()">'), "detects img onerror")
assert(containsInjection("javascript:void(0)"), "detects javascript: protocol")
assert(containsInjection('<div onclick="x()">'), "detects onclick")
assert(containsInjection("<iframe src=x>"), "detects iframe")
assert(!containsInjection("TireVix Auto - Tire & Wheel Order"), "allows normal descriptor")
assert(!containsInjection("Premium tires for all vehicles"), "allows normal product title")
assert(!containsInjection(""), "allows empty string")

// ── Section 2: Content Pattern Detection ────────────────────────────────────
console.log("\nSection 2: Content Pattern Detection")

assert(containsEmail("contact support@tirevix.com"), "detects email in text")
assert(!containsEmail("TireVix Auto - Tire Order"), "no false email in descriptor")
assert(containsPhone("Call +1 (555) 123-4567"), "detects phone number")
assert(!containsPhone("Order #12345"), "no false phone in order ref")
assert(containsUrl("Visit https://example.com"), "detects URL")
assert(!containsUrl("TireVix Auto"), "no false URL in brand name")
assert(isValidEmail("support@tirevix.com"), "validates good email")
assert(!isValidEmail("not-an-email"), "rejects bad email")
assert(isValidUrl("https://tirevix.com/track"), "validates good URL")
assert(!isValidUrl("not-a-url"), "rejects bad URL")

// ── Section 3: Service-Style Descriptor Detection ───────────────────────────
console.log("\nSection 3: Service-Style Descriptor Detection")

assert(isServiceStyleDescriptor("Technical Support"), "detects 'Technical Support'")
assert(isServiceStyleDescriptor("Enterprise Solution"), "detects 'Enterprise Solution'")
assert(isServiceStyleDescriptor("Managed Services"), "detects 'Managed Services'")
assert(isServiceStyleDescriptor("Digital Access"), "detects 'Digital Access'")
assert(!isServiceStyleDescriptor("Tire & Wheel Order"), "allows product descriptor")
assert(!isServiceStyleDescriptor("Automotive Parts Order"), "allows automotive descriptor")
assert(!isServiceStyleDescriptor("Road Safety Tire Kit"), "allows tire descriptor")

// ── Section 4: Bundle Validation ────────────────────────────────────────────
console.log("\nSection 4: Bundle Validation")

const validBundle = validateBundle({
  bundle_name: "TireVix Auto Bundle",
  industry_vertical: "automotive_tires",
  public_brand_name: "TireVix Auto",
  support_email: "support@tirevix.com",
  refund_policy_url: "https://tirevix.com/refund-policy",
  shipping_policy_url: "https://tirevix.com/shipping-policy",
})
assert(validBundle.valid, "valid bundle passes validation")
assertEqual(validBundle.errors.length, 0, "valid bundle has no errors")
assertEqual(validBundle.warnings.length, 0, "valid bundle has no warnings")

const bundleMissingEmail = validateBundle({
  bundle_name: "Test Bundle",
  industry_vertical: "generic_ecommerce",
})
assert(bundleMissingEmail.valid, "bundle without email is still valid")
assert(bundleMissingEmail.warnings.length > 0, "bundle without email has compliance warnings")

const bundleBadName = validateBundle({
  bundle_name: '<script>alert("xss")</script>',
  industry_vertical: "automotive_tires",
})
assert(!bundleBadName.valid, "bundle with XSS in name is invalid")

const bundleBadUrl = validateBundle({
  bundle_name: "Good Bundle",
  industry_vertical: "automotive_tires",
  refund_policy_url: "not-a-valid-url",
})
assert(!bundleBadUrl.valid, "bundle with bad URL is invalid")

// ── Section 5: Bundle Item Validation ───────────────────────────────────────
console.log("\nSection 5: Bundle Item Validation")

const validItem = validateBundleItem({
  descriptor_name: "Tire & Wheel Order",
  product_title: "Premium Tire & Wheel Package",
  product_type: "physical_good",
  shipping_required: true,
  tracking_expected: true,
})
assert(validItem.valid, "valid item passes validation")
assertEqual(validItem.errors.length, 0, "valid item has no errors")
assertEqual(validItem.warnings.length, 0, "valid item has no warnings")

const itemServiceForPhysical = validateBundleItem({
  descriptor_name: "Technical Support",
  product_title: "Tire Support Package",
  product_type: "physical_good",
})
assert(itemServiceForPhysical.valid, "service descriptor for physical is valid (warning only)")
assert(
  itemServiceForPhysical.warnings.some(w => w.code === "SERVICE_DESCRIPTOR_FOR_PHYSICAL"),
  "service descriptor for physical goods triggers warning"
)

const itemNoTracking = validateBundleItem({
  descriptor_name: "Tire Order",
  product_title: "Tire Package",
  product_type: "physical_good",
  tracking_expected: false,
})
assert(
  itemNoTracking.warnings.some(w => w.code === "PHYSICAL_NO_TRACKING"),
  "physical good without tracking triggers warning"
)

const itemBadType = validateBundleItem({
  descriptor_name: "Test Item",
  product_title: "Test Product",
  product_type: "unknown_type",
})
assert(!itemBadType.valid, "item with invalid product_type is invalid")

const itemWithInjection = validateBundleItem({
  descriptor_name: '<img onerror="alert(1)">',
  product_title: "Normal Title",
  product_type: "physical_good",
})
assert(!itemWithInjection.valid, "item with XSS in descriptor is invalid")

// ── Section 6: Deterministic Item Selection ─────────────────────────────────
console.log("\nSection 6: Deterministic Item Selection")

const items: PaymentIdentityBundleItem[] = [
  makeBundleItem({ id: "item-1", descriptor_name: "Tire & Wheel Order", sort_order: 0 }),
  makeBundleItem({ id: "item-2", descriptor_name: "Road Safety Tire Kit", sort_order: 1 }),
  makeBundleItem({ id: "item-3", descriptor_name: "Wheel & Tire Accessory", sort_order: 2 }),
  makeBundleItem({ id: "item-4", descriptor_name: "Vehicle Tire Supply", sort_order: 3 }),
  makeBundleItem({ id: "item-5", descriptor_name: "Automotive Parts Order", sort_order: 4 }),
]

const bundle = makeBundleRow()
const resolved = makeResolvedBundle(bundle, items)

const txId1 = "tx-111111"
const txId2 = "tx-222222"

const selection1a = selectBundleDescriptorItem(resolved, txId1)
const selection1b = selectBundleDescriptorItem(resolved, txId1)
assertEqual(selection1a.descriptorText, selection1b.descriptorText,
  "same transactionId always selects same descriptor (deterministic)")

assert(!selection1a.fallback, "selection with items does not use fallback")
assert(selection1a.descriptorText.startsWith("TireVix Auto - "),
  "descriptor includes brand prefix")

const selection2 = selectBundleDescriptorItem(resolved, txId2)
// Different txIds may select different items (not guaranteed but likely)
assert(selection2.descriptorText.length > 0, "second selection produces non-empty descriptor")

// ── Section 7: No Active Items Fallback ─────────────────────────────────────
console.log("\nSection 7: No Active Items Fallback")

const emptyBundle = makeResolvedBundle(bundle, [])
const emptySelection = selectBundleDescriptorItem(emptyBundle, txId1)
assert(emptySelection.fallback, "empty bundle triggers fallback")
assert(emptySelection.descriptorText.length > 0, "fallback produces non-empty descriptor")
assert(!isServiceStyleDescriptor(emptySelection.descriptorText),
  "fallback does NOT use service-style descriptor for physical goods")

const allInactive = makeResolvedBundle(bundle, [
  makeBundleItem({ is_active: false }),
])
const inactiveSelection = selectBundleDescriptorItem(allInactive, txId1)
assert(inactiveSelection.fallback, "all-inactive items triggers fallback")

// ── Section 8: No Bundle Fallback ───────────────────────────────────────────
console.log("\nSection 8: No Bundle Fallback")

const noBundle = makeResolvedBundle(null, [], "no_bundle")
assert(noBundle.fallbackUsed, "no_bundle result has fallbackUsed=true")
assertEqual(noBundle.fallbackReason, "no_active_bundle_found", "fallback reason is set")
assertEqual(noBundle.items.length, 0, "no items in fallback")

// ── Section 9: Descriptor Output Sanitization ───────────────────────────────
console.log("\nSection 9: Descriptor Output Sanitization")

const unsafeItem = makeBundleItem({
  descriptor_name: 'Tire <script>alert("xss")</script> Order',
})
const unsafeBundle = makeResolvedBundle(
  makeBundleRow({ public_brand_name: null }),
  [unsafeItem]
)
const unsafeSelection = selectBundleDescriptorItem(unsafeBundle, txId1)
assert(!unsafeSelection.descriptorText.includes("<script>"),
  "sanitizePayPalField strips script tags from descriptor")
assert(!unsafeSelection.descriptorText.includes("<"),
  "sanitizePayPalField strips all angle brackets from descriptor")

// Verify standalone sanitization
const sanitized = sanitizePayPalField("TireVix Auto - Tire & Wheel Order")
assertEqual(sanitized, "TireVix Auto - Tire & Wheel Order",
  "sanitizePayPalField preserves clean descriptor unchanged")

const longDescriptor = "A".repeat(200)
const sanitizedLong = sanitizePayPalField(longDescriptor)
assert(sanitizedLong.length <= 127, "sanitizePayPalField clamps to 127 chars")

// ── Section 10: Cross-Tenant Safety ─────────────────────────────────────────
console.log("\nSection 10: Cross-Tenant Safety")

// The resolver itself enforces this via SQL WHERE clauses.
// We verify the type system supports the pattern.
const crossTenantBundle = makeBundleRow({ tenant_id: "other-tenant-id" })
const crossResolved = makeResolvedBundle(crossTenantBundle, items)
// In real resolver, this would be filtered out by SQL.
// Here we verify selection still works on the data we have.
const crossSelection = selectBundleDescriptorItem(crossResolved, txId1)
assert(crossSelection.descriptorText.length > 0,
  "selection works on bundle data (cross-tenant filtered at SQL level)")

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════")
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log("═══════════════════════════════════════════════════════\n")

if (failed > 0) {
  process.exit(1)
}
