/**
 * Phase 3 Test: Profile-Driven PayPal Line Item Builder
 * 
 * Tests SINGLE_SEMANTIC_ITEM, REAL_CART_ITEMS, LEGACY_RANDOM_SPLIT,
 * shadow mode, enforce mode, and the amount invariant.
 */

import {
  buildPayPalLineItemsForProfile,
  buildPaymentDisplayName,
  type ResolvedPaymentDisplayProfile,
  type CheckoutItem,
  INDUSTRY_DESCRIPTOR_POOLS,
} from "../lib/payment-display-profiles"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockProfile(overrides: Partial<ResolvedPaymentDisplayProfile> = {}): ResolvedPaymentDisplayProfile {
  return {
    profileId: "prof-1",
    industryVertical: "automotive_tires",
    displayMode: "BRAND_SEMANTIC",
    lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
    publicBrandName: "TireVix",
    descriptorPrefix: "TireVix Auto",
    source: "store_default",
    descriptorPool: INDUSTRY_DESCRIPTOR_POOLS.automotive_tires,
    ...overrides,
  }
}

const legacyMasker = (_name: string) => "Technical Support"

function sumCents(items: { quantity: string; unitAmount: { value: string } }[]): number {
  return items.reduce(
    (s, it) => s + Math.round(parseFloat(it.unitAmount.value) * 100) * parseInt(it.quantity, 10),
    0
  )
}

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
    passed++
  } catch (e: any) {
    console.log(`FAIL  ${name}: ${e.message}`)
    failed++
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ── Test 1: SINGLE_SEMANTIC_ITEM ─────────────────────────────────────────────

test("1. SINGLE_SEMANTIC_ITEM - one item, quantity 1, total exact", () => {
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ lineItemPolicy: "SINGLE_SEMANTIC_ITEM" }),
    originalItems: [{
      name: "Wrangler DuraTrac RT 275/65R20",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "302.41" },
    }],
    checkoutTotal: "302.41",
    currency: "USD",
    transactionId: "tx-test-001",
    mode: "enforce",
    legacyMasker,
  })

  assert(result.profileItems.length === 1, `Expected 1 profile item, got ${result.profileItems.length}`)
  assert(result.profileItems[0].quantity === "1", `Expected quantity 1, got ${result.profileItems[0].quantity}`)
  assert(result.profileItems[0].unitAmount.value === "302.41", `Expected 302.41, got ${result.profileItems[0].unitAmount.value}`)
  assert(result.selectedItems === result.profileItems, "Enforce mode should select profileItems")
  assert(result.amountInvariantPassed === true, "Amount invariant should pass")
  assert(result.skipRandomization === true, "Should skip randomization")
  assert(result.lineItemPolicy === "SINGLE_SEMANTIC_ITEM", "Policy should be SINGLE_SEMANTIC_ITEM")
  // Name should contain TireVix (brand semantic)
  assert(result.profileItems[0].name.includes("TireVix"), `Expected name to contain TireVix, got "${result.profileItems[0].name}"`)
})

// ── Test 2: REAL_CART_ITEMS ──────────────────────────────────────────────────

test("2. REAL_CART_ITEMS - two items, no fake extras, total exact", () => {
  const items: CheckoutItem[] = [
    { name: "Tire A", quantity: "2", unitAmount: { currencyCode: "USD", value: "100.00" } },
    { name: "Tire B", quantity: "1", unitAmount: { currencyCode: "USD", value: "102.41" } },
  ]
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ lineItemPolicy: "REAL_CART_ITEMS" }),
    originalItems: items,
    checkoutTotal: "302.41",
    currency: "USD",
    transactionId: "tx-test-002",
    mode: "enforce",
    legacyMasker,
  })

  assert(result.profileItems.length === 2, `Expected 2 profile items, got ${result.profileItems.length}`)
  assert(result.amountInvariantPassed === true, `Amount invariant should pass`)
  const totalCents = sumCents(result.profileItems)
  assert(totalCents === 30241, `Expected 30241 cents, got ${totalCents}`)
  assert(result.skipRandomization === true, "Should skip randomization")
})

// ── Test 3: LEGACY_RANDOM_SPLIT ──────────────────────────────────────────────

test("3. LEGACY_RANDOM_SPLIT - preserves old split behavior", () => {
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ lineItemPolicy: "LEGACY_RANDOM_SPLIT" }),
    originalItems: [{
      name: "Wrangler DuraTrac RT 275/65R20",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "302.41" },
    }],
    checkoutTotal: "302.41",
    currency: "USD",
    transactionId: "tx-test-003",
    mode: "enforce",
    legacyMasker,
  })

  // Legacy items are used, randomization NOT skipped
  assert(result.skipRandomization === false, "Should NOT skip randomization for LEGACY_RANDOM_SPLIT")
  assert(result.profileItems.length >= 1, "Should have at least 1 item")
  assert(result.lineItemPolicy === "LEGACY_RANDOM_SPLIT", "Policy should be LEGACY_RANDOM_SPLIT")
})

// ── Test 4: Shadow mode ──────────────────────────────────────────────────────

test("4. Shadow mode - selectedItems = legacyItems, PayPal unchanged", () => {
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ lineItemPolicy: "SINGLE_SEMANTIC_ITEM" }),
    originalItems: [{
      name: "Wrangler DuraTrac RT 275/65R20",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "302.41" },
    }],
    checkoutTotal: "302.41",
    currency: "USD",
    transactionId: "tx-test-004",
    mode: "shadow",
    legacyMasker,
  })

  assert(result.selectedItems === result.legacyItems, "Shadow mode should select legacyItems")
  assert(result.legacyItems[0].name === "Technical Support", `Legacy name should be 'Technical Support', got '${result.legacyItems[0].name}'`)
  // Profile items still built for logging
  assert(result.profileItems.length === 1, "profileItems should still be built")
  assert(result.skipRandomization === false, "Shadow mode should NOT skip randomization")
})

// ── Test 5: Enforce mode ─────────────────────────────────────────────────────

test("5. Enforce mode - selectedItems = profileItems", () => {
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ lineItemPolicy: "SINGLE_SEMANTIC_ITEM" }),
    originalItems: [{
      name: "Wrangler DuraTrac RT 275/65R20",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "99.99" },
    }],
    checkoutTotal: "99.99",
    currency: "USD",
    transactionId: "tx-test-005",
    mode: "enforce",
    legacyMasker,
  })

  assert(result.selectedItems === result.profileItems, "Enforce mode should select profileItems")
  assert(result.skipRandomization === true, "Enforce SINGLE_SEMANTIC_ITEM should skip randomization")
})

// ── Test 6: Amount invariant enforcement ─────────────────────────────────────

test("6. Amount invariant - mismatched items trigger fallback", () => {
  // Create a scenario with items that don't sum to checkoutTotal
  // We'll test by passing items with quantities that don't match total
  const items: CheckoutItem[] = [
    { name: "Item A", quantity: "1", unitAmount: { currencyCode: "USD", value: "100.00" } },
    { name: "Item B", quantity: "1", unitAmount: { currencyCode: "USD", value: "50.00" } },
  ]
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ lineItemPolicy: "REAL_CART_ITEMS" }),
    originalItems: items,
    checkoutTotal: "200.00",  // Items sum to 150.00, not 200.00
    currency: "USD",
    transactionId: "tx-test-006",
    mode: "enforce",
    legacyMasker,
  })

  // REAL_CART_ITEMS tries drift correction: last item becomes 150.00 (100+50=150 cents drift)
  // 200.00 - 150.00 = 50.00 drift, so last item goes from 50.00 to 100.00
  // Sum = 100.00 + 100.00 = 200.00 — invariant passes with drift correction
  const totalCents = sumCents(result.profileItems)
  assert(totalCents === 20000, `After drift correction, sum should be 20000 cents, got ${totalCents}`)
  assert(result.amountInvariantPassed === true, "Invariant should pass after drift correction")
})

// ── Test 7: Amount exact match for SINGLE_SEMANTIC_ITEM ──────────────────────

test("7. SINGLE_SEMANTIC_ITEM amount is always exact", () => {
  const amounts = ["0.01", "1.00", "19.99", "302.41", "9999.99"]
  for (const amt of amounts) {
    const result = buildPayPalLineItemsForProfile({
      profile: makeMockProfile({ lineItemPolicy: "SINGLE_SEMANTIC_ITEM" }),
      originalItems: [{ name: "Test", quantity: "1", unitAmount: { currencyCode: "USD", value: amt } }],
      checkoutTotal: amt,
      currency: "USD",
      transactionId: `tx-test-7-${amt}`,
      mode: "enforce",
      legacyMasker,
    })
    assert(result.profileItems[0].unitAmount.value === amt, `Expected ${amt}, got ${result.profileItems[0].unitAmount.value}`)
    assert(result.amountInvariantPassed, `Invariant should pass for ${amt}`)
  }
})

// ── Test 8: Display mode variations ──────────────────────────────────────────

test("8. SEMANTIC_ORDER display mode - no brand prefix", () => {
  const result = buildPayPalLineItemsForProfile({
    profile: makeMockProfile({ displayMode: "SEMANTIC_ORDER", lineItemPolicy: "SINGLE_SEMANTIC_ITEM" }),
    originalItems: [{ name: "Test", quantity: "1", unitAmount: { currencyCode: "USD", value: "50.00" } }],
    checkoutTotal: "50.00",
    currency: "USD",
    transactionId: "tx-test-008",
    mode: "enforce",
    legacyMasker,
  })

  // SEMANTIC_ORDER should NOT have brand prefix
  assert(!result.profileItems[0].name.includes("TireVix"), `SEMANTIC_ORDER should not contain brand, got "${result.profileItems[0].name}"`)
  assert(result.profileItems[0].name.length > 0, "Name should not be empty")
})

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
