/**
 * Phase 3 Integration Test: Proves buildOrderPayload respects skipRandomization
 * 
 * This test calls the REAL buildOrderPayload function and verifies the final
 * PayPal JSON payload — the actual data that would be sent to PayPal.
 */

import { buildOrderPayload, type CreateOrderParams } from "../lib/paypal"

const LEGACY_DESCRIPTORS = [
  "Technical Support", "Service Extension", "Business Consultation",
  "Professional Services", "Support Package", "Account Maintenance",
  "Platform Services", "Service Subscription", "Enterprise Solution",
  "Managed Services", "IT Consultation", "System Integration",
  "Cloud Services", "Infrastructure Support", "Compliance Review",
  "Advisory Services",
]

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

// ── Test 1: skipRandomization=true → 1 item, no splitting ────────────────────

test("1. skipRandomization=true: payload has exactly 1 item, no legacy names", () => {
  const params: CreateOrderParams = {
    clientId:      "test-client-id",
    clientSecret:  "test-client-secret",
    amount:        "302.41",
    currencyCode:  "USD",
    items: [{
      name:     "TireVix Auto - Tire & Wheel Order",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "302.41" },
    }],
    returnUrl:     "https://example.com/success",
    cancelUrl:     "https://example.com/cancel",
    customId:      "tx-integration-test-001",
    merchantAccId: "merchant-001",
    skipRandomization: true,
  }

  const payload = buildOrderPayload(params)
  const items = payload.purchase_units[0].items
  const itemTotal = payload.purchase_units[0].amount.breakdown.item_total.value

  // Must have exactly 1 item
  assert(items.length === 1, `Expected 1 item, got ${items.length}`)

  // Item name must contain profile descriptor, not legacy
  const itemName = items[0].name
  const isLegacy = LEGACY_DESCRIPTORS.some(d => itemName === d)
  assert(!isLegacy, `Item name "${itemName}" is a legacy descriptor — should be profile name`)
  assert(itemName.includes("TireVix"), `Item name "${itemName}" should contain "TireVix"`)

  // Amount must be exact
  assert(items[0].unit_amount.value === "302.41", `Expected unit_amount 302.41, got ${items[0].unit_amount.value}`)
  assert(itemTotal === "302.41", `Expected item_total 302.41, got ${itemTotal}`)

  // Category should be PHYSICAL_GOODS
  assert(items[0].category === "PHYSICAL_GOODS", `Expected PHYSICAL_GOODS, got ${items[0].category}`)

  // No time jitter
  assert(payload.__timeJitterMs === 0, `Expected 0 time jitter, got ${payload.__timeJitterMs}`)

  console.log(`     → Item name: "${itemName}"`)
  console.log(`     → Item total: ${itemTotal}`)
  console.log(`     → Time jitter: ${payload.__timeJitterMs}ms`)
})

// ── Test 2: skipRandomization=false → randomization runs, possibly 2-3 items ─

test("2. skipRandomization=false: randomization runs (may split)", () => {
  const params: CreateOrderParams = {
    clientId:      "test-client-id",
    clientSecret:  "test-client-secret",
    amount:        "302.41",
    currencyCode:  "USD",
    items: [{
      name:     "Technical Support",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "302.41" },
    }],
    returnUrl:     "https://example.com/success",
    cancelUrl:     "https://example.com/cancel",
    customId:      "tx-integration-test-002",
    merchantAccId: "merchant-001",
    skipRandomization: false,
  }

  const payload = buildOrderPayload(params)
  const items = payload.purchase_units[0].items
  const itemTotal = payload.purchase_units[0].amount.breakdown.item_total.value

  // Randomization may produce 1-3 items for >$20 single item
  assert(items.length >= 1 && items.length <= 3, `Expected 1-3 items, got ${items.length}`)

  // All items should have legacy descriptors
  for (const item of items) {
    const isLegacy = LEGACY_DESCRIPTORS.some(d => item.name === d)
    assert(isLegacy, `Item name "${item.name}" should be a legacy descriptor`)
  }

  // Item total must match amount
  assert(itemTotal === "302.41", `Expected item_total 302.41, got ${itemTotal}`)

  // Time jitter should be > 0
  assert(payload.__timeJitterMs > 0, `Expected time jitter > 0, got ${payload.__timeJitterMs}`)

  console.log(`     → ${items.length} items: ${items.map(i => `"${i.name}" $${i.unit_amount.value}`).join(", ")}`)
  console.log(`     → Item total: ${itemTotal}`)
  console.log(`     → Time jitter: ${payload.__timeJitterMs}ms`)
})

// ── Test 3: skipRandomization=undefined (not set) → defaults to randomization ─

test("3. skipRandomization=undefined: defaults to legacy randomization", () => {
  const params: CreateOrderParams = {
    clientId:      "test-client-id",
    clientSecret:  "test-client-secret",
    amount:        "302.41",
    currencyCode:  "USD",
    items: [{
      name:     "Technical Support",
      quantity: "1",
      unitAmount: { currencyCode: "USD", value: "302.41" },
    }],
    returnUrl:     "https://example.com/success",
    cancelUrl:     "https://example.com/cancel",
    customId:      "tx-integration-test-003",
    merchantAccId: "merchant-001",
    // skipRandomization not set
  }

  const payload = buildOrderPayload(params)
  const items = payload.purchase_units[0].items

  // Without skipRandomization, randomization should run
  assert(items.length >= 1, `Expected at least 1 item, got ${items.length}`)

  // Time jitter should be > 0 (randomization produces jitter)
  assert(payload.__timeJitterMs > 0, `Expected time jitter > 0 (randomization active), got ${payload.__timeJitterMs}`)

  console.log(`     → ${items.length} items, time jitter: ${payload.__timeJitterMs}ms`)
})

// ── Test 4: skipRandomization=true with 2 profile items → no splitting ───────

test("4. skipRandomization=true with 2 items: both preserved, no splitting", () => {
  const params: CreateOrderParams = {
    clientId:      "test-client-id",
    clientSecret:  "test-client-secret",
    amount:        "302.41",
    currencyCode:  "USD",
    items: [
      { name: "TireVix Auto - Tire & Wheel Order", quantity: "2", unitAmount: { currencyCode: "USD", value: "100.00" } },
      { name: "TireVix Auto - Auto Parts Checkout", quantity: "1", unitAmount: { currencyCode: "USD", value: "102.41" } },
    ],
    returnUrl:     "https://example.com/success",
    cancelUrl:     "https://example.com/cancel",
    customId:      "tx-integration-test-004",
    merchantAccId: "merchant-001",
    skipRandomization: true,
  }

  const payload = buildOrderPayload(params)
  const items = payload.purchase_units[0].items

  assert(items.length === 2, `Expected 2 items, got ${items.length}`)
  assert(items[0].name.includes("TireVix"), `First item should be profile name, got "${items[0].name}"`)
  assert(items[1].name.includes("TireVix"), `Second item should be profile name, got "${items[1].name}"`)
  assert(payload.__timeJitterMs === 0, `Expected 0 time jitter, got ${payload.__timeJitterMs}`)

  const itemTotal = payload.purchase_units[0].amount.breakdown.item_total.value
  assert(itemTotal === "302.41", `Expected item_total 302.41, got ${itemTotal}`)

  console.log(`     → 2 items: "${items[0].name}" $${items[0].unit_amount.value} × ${items[0].quantity}, "${items[1].name}" $${items[1].unit_amount.value} × ${items[1].quantity}`)
})

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
