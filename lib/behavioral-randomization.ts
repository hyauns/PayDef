/**
 * lib/behavioral-randomization.ts — PayPal Payload Behavioral Randomization
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  PURPOSE                                                           │
 * │                                                                     │
 * │  Breaks detectable patterns in PayPal order payloads to prevent    │
 * │  risk engine fingerprinting. Four randomization vectors:           │
 * │                                                                     │
 * │  1. Amount Jitter    — ±$0.01 to ±$0.03 variance on unit prices   │
 * │  2. Category Rotation — DIGITAL_GOODS / PHYSICAL_GOODS switching   │
 * │  3. Item Splitting   — high-value single items → 2-3 line items   │
 * │  4. Time Jitter      — 500ms-2500ms delay before API call         │
 * │                                                                     │
 * │  INVARIANT: The total purchase_units[].amount.value ALWAYS equals  │
 * │  the original requested amount exactly. The jitter affects only    │
 * │  individual line item prices and the item_total breakdown.         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { createHash } from "crypto"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItem {
  name:       string
  quantity:   string
  unitAmount: {
    currencyCode: string
    value:        string  // 2-decimal string
  }
  category:   "DIGITAL_GOODS" | "PHYSICAL_GOODS"
}

export interface RandomizedResult {
  /** Line items with jittered prices that sum to `totalAmount` */
  items:       LineItem[]
  /** The item_total for breakdown (sum of all line item values) */
  itemTotal:   string
  /** Amount of time jitter to apply before API call (ms) */
  timeJitterMs: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum absolute jitter per unit (in dollars) */
const JITTER_MAX = 0.03
const JITTER_MIN = 0.01

/** Minimum item value after splitting ($) */
const MIN_SPLIT_ITEM_VALUE = 5.00

/** Threshold above which items are eligible for splitting ($) */
const SPLIT_THRESHOLD = 20.00

/** Time jitter range (ms) */
const TIME_JITTER_MIN = 500
const TIME_JITTER_MAX = 2500

/** Masked item name pool for split items */
const SPLIT_ITEM_NAMES = [
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

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

/**
 * Creates a deterministic-ish hash from a transaction seed.
 * Not cryptographic — just enough entropy to appear random to pattern matchers.
 */
function hashSeed(seed: string): number {
  const hash = createHash("sha256").update(seed).digest()
  // Use first 4 bytes as a 32-bit unsigned integer
  return hash.readUInt32BE(0)
}

/**
 * Returns a pseudo-random float in [0, 1) seeded by the transaction id + offset.
 * Different offsets produce different values for the same transaction.
 */
function seededRandom(transactionId: string, offset: number): number {
  return (hashSeed(`${transactionId}:${offset}`) % 1000000) / 1000000
}

// ─── Amount Jitter ────────────────────────────────────────────────────────────

/**
 * Applies a small random variance (±$0.01 to ±$0.03) to a unit price.
 *
 * The jitter is seeded by the transaction ID so it's deterministic for
 * retry scenarios but appears random across different transactions.
 *
 * @returns jittered price in cents (integer) for precise arithmetic
 */
function jitterAmountCents(
  originalCents: number,
  transactionId: string,
  itemIndex: number
): number {
  const r = seededRandom(transactionId, 100 + itemIndex)
  // Jitter magnitude: $0.01–$0.03 (1–3 cents)
  const magnitude = Math.floor(r * (JITTER_MAX * 100 - JITTER_MIN * 100 + 1)) + JITTER_MIN * 100
  // Direction: positive or negative
  const direction = seededRandom(transactionId, 200 + itemIndex) > 0.5 ? 1 : -1
  const jittered = originalCents + direction * magnitude

  // Guard: price must remain positive (minimum 1 cent)
  return Math.max(1, jittered)
}

// ─── Category Rotation ────────────────────────────────────────────────────────

/**
 * Rotates between DIGITAL_GOODS and PHYSICAL_GOODS based on a transaction hash.
 * This prevents pattern detection on a single repeated category.
 */
function selectCategory(
  transactionId: string,
  itemIndex: number
): "DIGITAL_GOODS" | "PHYSICAL_GOODS" {
  const r = seededRandom(transactionId, 300 + itemIndex)
  return r > 0.5 ? "DIGITAL_GOODS" : "PHYSICAL_GOODS"
}

// ─── Item Splitting ───────────────────────────────────────────────────────────

/**
 * Splits a single high-value item into 2–3 smaller line items whose
 * prices sum exactly to the original total.
 *
 * Strategy:
 *  1. Determine split count (2 or 3) based on transaction hash
 *  2. Allocate approximately equal portions
 *  3. Apply amount jitter to each portion
 *  4. Adjust the last item to guarantee exact sum
 *  5. Assign varied masked names + rotated categories
 *
 * Only splits if the original amount exceeds $20.00. Below that threshold,
 * splitting would create suspiciously small line items.
 *
 * @param totalCents — original total in cents
 * @param currencyCode — e.g. "USD"
 * @param transactionId — seed for deterministic randomization
 * @returns array of 2–3 line items summing exactly to totalCents
 */
function splitItem(
  totalCents: number,
  currencyCode: string,
  transactionId: string,
  originalName: string
): LineItem[] {
  // Determine split count: 2 or 3
  const splitCount = seededRandom(transactionId, 400) > 0.5 ? 3 : 2

  // Pick distinct masked names for each split
  const nameBase = hashSeed(transactionId)
  const names: string[] = []
  for (let i = 0; i < splitCount; i++) {
    names.push(SPLIT_ITEM_NAMES[(nameBase + i * 7) % SPLIT_ITEM_NAMES.length])
  }

  // Allocate base amounts (roughly equal with slight variation)
  const portions: number[] = []
  let remaining = totalCents

  for (let i = 0; i < splitCount - 1; i++) {
    // Each non-final portion is 25-45% of remaining (for 2-split) or varied for 3-split
    const fraction = 0.25 + seededRandom(transactionId, 500 + i) * 0.20
    let portion = Math.round(remaining * fraction)

    // Ensure minimum value
    portion = Math.max(Math.round(MIN_SPLIT_ITEM_VALUE * 100), portion)
    // Ensure enough remains for the last item(s)
    const minRemaining = (splitCount - 1 - i) * Math.round(MIN_SPLIT_ITEM_VALUE * 100)
    portion = Math.min(portion, remaining - minRemaining)

    portions.push(portion)
    remaining -= portion
  }
  // Last item gets the remainder — guarantees exact sum
  portions.push(remaining)

  // Build line items with category rotation
  return portions.map((cents, i) => ({
    name:       names[i],
    quantity:   "1",
    unitAmount: {
      currencyCode,
      value: (cents / 100).toFixed(2),
    },
    category: selectCategory(transactionId, i),
  }))
}

// ─── Time Jitter ──────────────────────────────────────────────────────────────

/**
 * Calculates a pseudo-random delay between 500ms and 2500ms.
 * This breaks rhythmic patterns (e.g., bot-like regular intervals).
 */
function calculateTimeJitter(transactionId: string): number {
  const r = seededRandom(transactionId, 600)
  return Math.round(TIME_JITTER_MIN + r * (TIME_JITTER_MAX - TIME_JITTER_MIN))
}

/**
 * Sleeps for the specified duration. Use before PayPal API calls.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Applies behavioral randomization to a set of PayPal order items.
 *
 * INVARIANT: The sum of all returned items' prices equals `totalAmount` exactly.
 *
 * @param totalAmount   — original order total (2-decimal string, e.g. "149.99")
 * @param currencyCode  — e.g. "USD"
 * @param items         — original line items (already masked)
 * @param transactionId — opaque UUID used to seed all randomization
 */
export function randomizePayload(
  totalAmount: string,
  currencyCode: string,
  items: { name: string; quantity: string; unitAmount: { currencyCode: string; value: string } }[],
  transactionId: string
): RandomizedResult {
  const totalCents = Math.round(parseFloat(totalAmount) * 100)

  // ── Decision: should we split? ────────────────────────────────────────────
  // Split only if: single item AND value > $20 AND random trigger (~60% chance)
  const shouldSplit =
    items.length === 1 &&
    totalCents > SPLIT_THRESHOLD * 100 &&
    seededRandom(transactionId, 700) > 0.40

  let finalItems: LineItem[]

  if (shouldSplit) {
    // ── Path A: Item Splitting ────────────────────────────────────────────
    // Splitting already handles category rotation and name selection.
    // No additional jitter on split items — the split itself IS the randomization.
    finalItems = splitItem(totalCents, currencyCode, transactionId, items[0].name)
  } else {
    // ── Path B: Jitter existing items ─────────────────────────────────────
    // Apply amount jitter to each item, then correct the last item to
    // ensure the total remains exact.
    const jitteredCents: number[] = items.map((item, i) => {
      const originalCents = Math.round(parseFloat(item.unitAmount.value) * 100)
      return jitterAmountCents(originalCents, transactionId, i)
    })

    // Correct rounding: adjust last item so sum === totalCents
    const currentSum = jitteredCents.reduce((a, b) => a + b, 0)
    const drift = totalCents - currentSum
    jitteredCents[jitteredCents.length - 1] += drift

    // Guard: ensure last item stays positive after drift correction
    if (jitteredCents[jitteredCents.length - 1] < 1) {
      // If correction would make it negative, skip jitter entirely
      // and use original amounts (safety fallback)
      finalItems = items.map((item, i) => ({
        name:       item.name,
        quantity:   item.quantity,
        unitAmount: {
          currencyCode: item.unitAmount.currencyCode,
          value:        item.unitAmount.value,
        },
        category: selectCategory(transactionId, i),
      }))
    } else {
      finalItems = items.map((item, i) => ({
        name:       item.name,
        quantity:   item.quantity,
        unitAmount: {
          currencyCode: item.unitAmount.currencyCode,
          value:        (jitteredCents[i] / 100).toFixed(2),
        },
        category: selectCategory(transactionId, i),
      }))
    }
  }

  // ── Verify invariant ──────────────────────────────────────────────────────
  const computedTotal = finalItems
    .reduce((sum, item) => sum + Math.round(parseFloat(item.unitAmount.value) * 100), 0)
  if (computedTotal !== totalCents) {
    // Critical safety: if rounding broke the invariant, fall back to original
    console.error(
      `[behavioral-randomization] Total mismatch: expected ${totalCents}c, got ${computedTotal}c. Falling back to original.`
    )
    return {
      items: items.map((item, i) => ({
        ...item,
        category: selectCategory(transactionId, i),
      })),
      itemTotal: totalAmount,
      timeJitterMs: calculateTimeJitter(transactionId),
    }
  }

  return {
    items:       finalItems,
    itemTotal:   (computedTotal / 100).toFixed(2),
    timeJitterMs: calculateTimeJitter(transactionId),
  }
}
