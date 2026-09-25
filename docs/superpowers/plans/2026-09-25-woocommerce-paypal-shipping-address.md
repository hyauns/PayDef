# WooCommerce → PayPal Shipping Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the buyer's shipping address appear on the PayPal order for payments started by the PayDef WooCommerce plugin, without changing PayPal behaviour for any other storefront (TireVix, TCG, Shopify, Stripe).

**Architecture:** Payload-driven opt-in, in three layers. The plugin starts sending a `shippingAddress` object; `/api/gateway/checkout` normalises it through a new `lib/shipping-address.ts` and passes it to `createPayPalOrder`; `lib/paypal.ts` emits `purchase_units[0].shipping` and flips `shipping_preference` to `SET_PROVIDED_ADDRESS` **only when that object survives validation**. Callers that send nothing (TireVix, TCG, Shopify, the dashboard) keep the exact payload they send today, so no migration and no store column are needed.

**Tech Stack:** Next.js 16 App Router + TypeScript (PayDef backend), PayPal Orders v2 REST, PHP 7.4+/WooCommerce (plugin), Node 24 native TS type-stripping for the verification harness, npm `php-parser` for PHP syntax checks, PowerShell + .NET `ZipFile` for plugin packaging.

**Spec:** inline — see "Spec — root cause & requirements" below. There is no separate spec document; this section is the spec and travels with the plan.

## Global Constraints

- **Do not change behaviour for other storefronts.** `lib/paypal.ts` `buildOrderPayload` and `/api/gateway/checkout` are shared by TireVix, TCG, the Shopify flow and the Stripe flow. Every change here must be a no-op when the caller sends no `shippingAddress` (same constraint that shaped the v1.2.1 void work and the v1.5.0 thank-you redirect).
- **No PayPal 4xx regressions.** An unusable address must degrade to today's behaviour (`NO_SHIPPING`, no `shipping` block) — never make PayPal reject the order. A failed checkout is worse than a missing address.
- **No new PII in logs.** Log only booleans and the 2-letter country code. Never log street, postcode, name or email from the shipping block.
- **PayPal field limits (Orders v2):** `address_line_1` / `address_line_2` ≤ 300, `admin_area_2` (city) ≤ 120, `admin_area_1` (state) ≤ 300, `postal_code` ≤ 60, `shipping.name.full_name` ≤ 300, `country_code` exactly 2 uppercase ISO-3166-1 alpha-2 letters.
- **Migrations:** none. Highest existing migration is `scripts/028-shopify-item-label.sql`; this plan adds no `029`.
- **Plugin version target:** `1.9.0`, built on top of the live `1.8.0` source at `C:\Users\ADMIN\Documents\Working\v0-payment-gateway-dashboard\v0-payment-gateway-dashboard\plugin woo\paydef-woocommerce\`. That folder is git-ignored (`.gitignore:61`) — plugin changes are never committed; the zip is the deliverable.
- **No PHP and no Python on this machine.** Syntax-check PHP with the npm `php-parser` package installed into the scratchpad; build the zip with PowerShell + .NET `ZipFile.Open` / `CreateEntryFromFile`, replacing `\` → `/` in entry names. **Never `Compress-Archive`** (writes backslash entry paths → WordPress cannot activate the plugin).
- **No test framework in the repo** (`package.json` has only dev/build/start/lint). Backend verification is (a) the Node TS harness defined in Task 1 and (b) `npx tsc --noEmit`.

---

## Spec — root cause & requirements

### Symptom

A buyer pays on a WooCommerce shop through the PayDef plugin (PayPal flow). The WooCommerce order has a full shipping address, but the corresponding order inside PayPal shows **no shipping address at all**.

### Root cause (verified 2026-09-25 against current code)

Three layers each drop the address; fixing only one changes nothing.

1. **`lib/paypal.ts:399` hardcodes `shipping_preference: "NO_SHIPPING"`** in `application_context` for every order PayPal ever receives from PayDef. With `NO_SHIPPING`, PayPal neither collects nor displays a shipping address, so the merchant's PayPal order is address-less by construction.
2. **No `shipping` block is ever built.** `buildOrderPayload` (`lib/paypal.ts:321-406`) emits `purchase_units[0]` with `custom_id`, `invoice_id`, `description`, `amount`, `items` — and nothing else. `CreateOrderParams` (`lib/paypal.ts:134-148`) has no address field, so even switching the preference would send an empty address.
3. **`/api/gateway/checkout` ignores the address the plugin already sends.** `CheckoutBody` (`app/api/gateway/checkout/route.ts:74-98`) declares no address field, and the destructure at `route.ts:227-235` takes only `amount, currency, itemName, intent, customerEmail, buyerIp, buyerCountry`. The plugin's `billingAddress` (built in `class-wc-gateway-paydef.php:421-428`) is silently discarded.

The plugin sends no shipping address at all today: `order_common_args()` (`class-wc-gateway-paydef.php:379-430`) reads only `get_billing_*`.

Reproduced with the Task 1 harness against unmodified code:

```
"shipping_preference": "NO_SHIPPING"
shipping block: null
```

### Why it matters beyond cosmetics

- **PayPal Seller Protection** requires a shipping address on the transaction. Every PayDef PayPal order is currently ineligible.
- Tracking sync (plugin v1.7.0 → `/api/gateway/tracking`) attaches a tracking number to a capture whose order carries no destination, which looks inconsistent to PayPal's risk models.
- `lib/identity-bundle-validation.ts:341-347` already warns `PHYSICAL_NO_SHIPPING` when a bundle declares `shipping_required=false` for a physical good — the payload we actually send contradicts the identity we declare.

### Decisions taken by the user (2026-09-25)

| # | Decision | Chosen |
|---|---|---|
| 1 | How to scope the change | **Payload-driven.** Only when the caller sends `shippingAddress`. No store column, no migration. |
| 2 | PayPal mode | **`SET_PROVIDED_ADDRESS`** — PayPal shows exactly the WooCommerce address and the buyer cannot edit it, so the PayPal order matches the shop order 1:1. |
| 3 | Orders without a shipping address (virtual / local pickup) | **Fall back to billing** in the plugin; if billing is unusable too, keep `NO_SHIPPING`. |

### Requirements

- R1 — `buildOrderPayload` emits `purchase_units[0].shipping` and `shipping_preference: "SET_PROVIDED_ADDRESS"` when and only when `CreateOrderParams.shipping` is present.
- R2 — With no `shipping` param, the payload is byte-identical to today's (`NO_SHIPPING`, no `shipping` key).
- R3 — A new pure function turns untrusted merchant JSON into either a valid PayPal `shipping` object or `null`. `null` whenever `line1` is blank or `country` is not exactly 2 alpha characters.
- R4 — Address strings are sanitised (URLs, emails, `<>"'` stripped) but **keep digits** (`keepNumbers: true`) — the default `sanitizePayPalField` phone-stripper would eat house numbers and postcodes.
- R5 — `/api/gateway/checkout` accepts `shippingAddress` on the body, normalises it once (outside the account-rotation retry loop) and passes it to `createPayPalOrder`.
- R6 — The Stripe and Shopify provider branches are untouched.
- R7 — Plugin v1.9.0 sends `shippingAddress` (shipping fields, falling back to billing) on the checkout call, and omits it from the mock-charge call.
- R8 — Logging records only `provided` (boolean) and `country`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/paypal.ts` | Modify (`134-148`, `363-406`) | Add `PayPalShipping` type + optional `shipping` param; emit the `shipping` block and pick the `shipping_preference`. Transport layer only — no validation here. |
| `lib/shipping-address.ts` | **Create** | Pure normaliser/validator: untrusted JSON → `PayPalShipping \| null`. Kept out of the 1300-line route and out of `paypal.ts` so it can be harness-tested on its own. |
| `app/api/gateway/checkout/route.ts` | Modify (`74-98`, `227-235`, ~`358` insertion, `1094-1109`) | Accept `shippingAddress`, normalise once, pass it into `createPayPalOrder`, log the outcome without PII. |
| `plugin woo\paydef-woocommerce\includes\class-wc-gateway-paydef.php` | Modify (`379-430`, mock-charge `unset` at `472`) | Build `shippingAddress` from the WooCommerce order with billing fallback; keep it off the mock-charge payload. |
| `plugin woo\paydef-woocommerce\paydef-woocommerce.php` | Modify (`6`, `22`) | Version bump to 1.9.0. |
| `plugin woo\paydef-woocommerce\readme.txt` | Modify | Changelog entry for 1.9.0. |
| `<scratchpad>\paypal-shipping-harness\*` | **Create** (not committed) | Node 24 TS harness that runs the real `lib/` code: alias hook + resolver + proxy-agent stub + assertion scripts. |

---

### Task 1: Verification harness + the failing baseline

Sets up the only way to execute this repo's TypeScript (no jest/vitest/tsx installed) and captures the bug as a failing assertion before anything is changed.

**Files:**
- Create: `<SCRATCHPAD>/paypal-shipping-harness/alias-hook.mjs`
- Create: `<SCRATCHPAD>/paypal-shipping-harness/alias-resolver.mjs`
- Create: `<SCRATCHPAD>/paypal-shipping-harness/stub-proxy-agent.mjs`
- Create: `<SCRATCHPAD>/paypal-shipping-harness/test-paypal-payload.mjs`

`<SCRATCHPAD>` = this session's scratchpad directory. `<REPO>` = `C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard` (forward slashes; the path contains spaces — always quote it).

**Interfaces:**
- Consumes: nothing.
- Produces: `node --experimental-strip-types --import ./alias-hook.mjs <script>.mjs` as the runner for every later backend assertion, resolving `@/…` imports to `<REPO>/…(.ts)` and stubbing `https-proxy-agent`.

**Why the stub:** `lib/paypal.ts` imports `https-proxy-agent`, whose pnpm-style install in `node_modules` cannot resolve its own `debug` dependency under plain Node (`ERR_MODULE_NOT_FOUND`). The stub keeps the import graph loadable; nothing in these assertions performs network I/O.

- [ ] **Step 1: Create the loader hook**

`<SCRATCHPAD>/paypal-shipping-harness/alias-hook.mjs`:

```js
import { register } from "node:module"
register("./alias-resolver.mjs", import.meta.url)
```

`<SCRATCHPAD>/paypal-shipping-harness/alias-resolver.mjs`:

```js
import { pathToFileURL } from "node:url"

const ROOT = pathToFileURL("C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard/").href
const STUBS = { "https-proxy-agent": "./stub-proxy-agent.mjs" }

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return next(new URL(STUBS[specifier], import.meta.url).href, context)
  }
  if (specifier.startsWith("@/")) {
    let target = ROOT + specifier.slice(2)
    if (!/\.[a-z]+$/i.test(target)) target += ".ts"
    return next(target, context)
  }
  return next(specifier, context)
}
```

`<SCRATCHPAD>/paypal-shipping-harness/stub-proxy-agent.mjs`:

```js
export class HttpsProxyAgent {
  constructor(url) { this.url = url }
}
```

- [ ] **Step 2: Write the failing assertions**

`<SCRATCHPAD>/paypal-shipping-harness/test-paypal-payload.mjs`:

```js
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"

const ROOT = "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard/"
const { buildOrderPayload } = await import(pathToFileURL(ROOT + "lib/paypal.ts").href)

const BASE = {
  clientId: "x",
  clientSecret: "y",
  amount: "49.99",
  currencyCode: "USD",
  items: [{ name: "Winter Tire 205/55R16", quantity: "1", unitAmount: { currencyCode: "USD", value: "49.99" } }],
  returnUrl: "https://pay.example.com/ok",
  cancelUrl: "https://pay.example.com/no",
  customId: "11111111-2222-3333-4444-555555555555",
}

const SHIPPING = {
  name: { full_name: "Jane Buyer" },
  address: {
    address_line_1: "1600 Pennsylvania Ave NW",
    address_line_2: "Apt 4",
    admin_area_2: "Washington",
    admin_area_1: "DC",
    postal_code: "20500",
    country_code: "US",
  },
}

// 1. No shipping param → today's payload, untouched (protects TireVix / TCG).
const without = buildOrderPayload({ ...BASE })
assert.equal(without.application_context.shipping_preference, "NO_SHIPPING")
assert.equal("shipping" in without.purchase_units[0], false, "purchase_unit must have no shipping key")

// 2. With a shipping param → SET_PROVIDED_ADDRESS + the block, passed through verbatim.
const with_ = buildOrderPayload({ ...BASE, shipping: SHIPPING })
assert.equal(with_.application_context.shipping_preference, "SET_PROVIDED_ADDRESS")
assert.deepEqual(with_.purchase_units[0].shipping, SHIPPING)

// 3. Everything else is unchanged by the new param.
assert.equal(with_.purchase_units[0].amount.value, "49.99")
assert.equal(with_.purchase_units[0].custom_id, BASE.customId)
assert.equal(with_.application_context.user_action, "PAY_NOW")
assert.equal(with_.application_context.landing_page, "LOGIN")

console.log("PASS test-paypal-payload")
```

- [ ] **Step 3: Run it and confirm it fails on the real bug**

Run from `<SCRATCHPAD>/paypal-shipping-harness`:

```bash
node --experimental-strip-types --import ./alias-hook.mjs test-paypal-payload.mjs
```

Expected: assertion 2 fails — `AssertionError … 'NO_SHIPPING' !== 'SET_PROVIDED_ADDRESS'`. (Assertion 1 already passes; that is the regression guard, not the bug.) A `MODULE_TYPELESS_PACKAGE_JSON` warning and the `[paypal] Environment: sandbox …` line are normal noise.

- [ ] **Step 4: No commit**

The harness lives in the scratchpad and is deliberately not committed — the repo has no test runner to hang it off. Nothing to commit in this task.

---

### Task 2: `lib/paypal.ts` — accept and emit a shipping block

**Files:**
- Modify: `lib/paypal.ts:134-148` (`CreateOrderParams`), `lib/paypal.ts:363-406` (`buildOrderPayload` return)
- Test: `<SCRATCHPAD>/paypal-shipping-harness/test-paypal-payload.mjs` (from Task 1)

**Interfaces:**
- Consumes: the Task 1 runner.
- Produces:
  - `export interface PayPalShipping { name?: { full_name: string }; address: { address_line_1: string; address_line_2?: string; admin_area_2?: string; admin_area_1?: string; postal_code?: string; country_code: string } }`
  - `CreateOrderParams.shipping?: PayPalShipping` — consumed by Task 3 (`lib/shipping-address.ts` returns this exact type) and Task 4 (the route passes it).

- [ ] **Step 1: Add the type and the param**

Insert immediately above `export interface CreateOrderParams` (currently `lib/paypal.ts:134`):

```ts
/**
 * PayPal Orders v2 `purchase_units[].shipping`.
 *
 * Built by lib/shipping-address.ts from whatever the merchant sent — never
 * assembled inline, because an invalid address must degrade to NO_SHIPPING
 * instead of making PayPal reject the order.
 */
export interface PayPalShipping {
  name?: { full_name: string }
  address: {
    address_line_1:  string
    address_line_2?: string
    admin_area_2?:   string   // city
    admin_area_1?:   string   // state / province code
    postal_code?:    string
    country_code:    string   // ISO-3166-1 alpha-2, uppercase
  }
}
```

Then add the field to `CreateOrderParams`, after `invoiceId`:

```ts
  shipping?:     PayPalShipping  // optional — when present, PayPal is told
                                 // SET_PROVIDED_ADDRESS and shows this exact
                                 // address. Absent → NO_SHIPPING, i.e. the
                                 // historical behaviour every other storefront
                                 // still gets.
```

- [ ] **Step 2: Emit the block and choose the preference**

In `buildOrderPayload`'s return (currently `lib/paypal.ts:363-405`), add the `shipping` key to the purchase unit — place it directly after the `invoice_id` spread on line 368 so the ordering mirrors PayPal's own docs:

```ts
        ...(p.invoiceId ? { invoice_id: p.invoiceId.slice(0, 127) } : {}),
        ...(p.shipping ? { shipping: p.shipping } : {}),
```

and replace the hardcoded preference (currently line 399):

```ts
      shipping_preference: p.shipping ? "SET_PROVIDED_ADDRESS" : "NO_SHIPPING",
```

Nothing else in the function changes. Do **not** sanitise here — Task 3 owns that, and double-sanitising would risk mangling an already-valid address.

- [ ] **Step 3: Run the harness — expect PASS**

```bash
node --experimental-strip-types --import ./alias-hook.mjs test-paypal-payload.mjs
```

Expected: `PASS test-paypal-payload`.

- [ ] **Step 4: Type-check the repo**

Run from `<REPO>`:

```bash
npx tsc --noEmit
```

Expected: no new errors (compare against the pre-change run if the baseline is not clean).

- [ ] **Step 5: Commit**

```bash
git add lib/paypal.ts
git commit -m "$(cat <<'EOF'
feat(paypal): let a caller attach a shipping address to the order

PayPal was always told NO_SHIPPING, so no PayDef order has ever carried a
destination — the merchant's PayPal order shows no shipping address and the
transaction is ineligible for Seller Protection.

buildOrderPayload now emits purchase_units[0].shipping and switches
shipping_preference to SET_PROVIDED_ADDRESS when, and only when, the caller
passes one. Callers that pass nothing get a byte-identical payload to before,
so TireVix, TCG and the Shopify/Stripe flows are untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `lib/shipping-address.ts` — normalise untrusted merchant input

**Files:**
- Create: `lib/shipping-address.ts`
- Test: `<SCRATCHPAD>/paypal-shipping-harness/test-shipping-address.mjs`

**Interfaces:**
- Consumes: `PayPalShipping` from Task 2; `sanitizePayPalField(raw, maxLength, { keepNumbers })` from `lib/masking.ts:321`.
- Produces:
  - `export interface ShippingAddressInput { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string }`
  - `export function buildPayPalShipping(input: unknown): PayPalShipping | null` — used by Task 4.

- [ ] **Step 1: Write the failing test**

`<SCRATCHPAD>/paypal-shipping-harness/test-shipping-address.mjs`:

```js
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"

const ROOT = "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard/"
const { buildPayPalShipping } = await import(pathToFileURL(ROOT + "lib/shipping-address.ts").href)

// Happy path: WooCommerce-shaped input → PayPal-shaped output.
assert.deepEqual(
  buildPayPalShipping({
    name: "Jane Buyer",
    line1: "1600 Pennsylvania Ave NW",
    line2: "Apt 4",
    city: "Washington",
    state: "DC",
    postal_code: "20500",
    country: "us",
  }),
  {
    name: { full_name: "Jane Buyer" },
    address: {
      address_line_1: "1600 Pennsylvania Ave NW",
      address_line_2: "Apt 4",
      admin_area_2: "Washington",
      admin_area_1: "DC",
      postal_code: "20500",
      country_code: "US",
    },
  },
  "lowercase country is upper-cased; optional parts map to admin_area_*"
)

// House numbers and postcodes must survive sanitisation (keepNumbers).
const digits = buildPayPalShipping({ line1: "12345678 Long Number Road", postal_code: "123456789", country: "US" })
assert.equal(digits.address.address_line_1, "12345678 Long Number Road")
assert.equal(digits.address.postal_code, "123456789")

// Optional keys are omitted, not sent empty.
const minimal = buildPayPalShipping({ line1: "5 Main St", country: "GB" })
assert.deepEqual(minimal, { address: { address_line_1: "5 Main St", country_code: "GB" } })

// Degrade to null (→ NO_SHIPPING) rather than let PayPal reject the order.
assert.equal(buildPayPalShipping(undefined), null, "missing input")
assert.equal(buildPayPalShipping(null), null, "null input")
assert.equal(buildPayPalShipping("1600 Penn Ave"), null, "non-object input")
assert.equal(buildPayPalShipping({ line1: "  ", country: "US" }), null, "blank line1")
assert.equal(buildPayPalShipping({ line1: "5 Main St" }), null, "missing country")
assert.equal(buildPayPalShipping({ line1: "5 Main St", country: "United States" }), null, "country not alpha-2")
assert.equal(buildPayPalShipping({ line1: "5 Main St", country: "U1" }), null, "country not alphabetic")

// Injection / leak vectors are stripped.
const dirty = buildPayPalShipping({
  name: 'Jane "Q" <b>Buyer</b>',
  line1: "5 Main St https://real-shop.example.com",
  city: "Reno jane@example.com",
  country: "US",
})
assert.equal(dirty.name.full_name.includes("<"), false)
assert.equal(dirty.name.full_name.includes('"'), false)
assert.equal(dirty.address.address_line_1.includes("http"), false)
assert.equal(dirty.address.admin_area_2.includes("@"), false)

// Over-long values are truncated to PayPal's limits, not rejected.
const long = buildPayPalShipping({ line1: "A".repeat(400), city: "B".repeat(200), country: "US" })
assert.equal(long.address.address_line_1.length, 300)
assert.equal(long.address.admin_area_2.length, 120)

console.log("PASS test-shipping-address")
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --experimental-strip-types --import ./alias-hook.mjs test-shipping-address.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `lib/shipping-address.ts`.

- [ ] **Step 3: Write the implementation**

Create `lib/shipping-address.ts`:

```ts
import { sanitizePayPalField } from "@/lib/masking"
import type { PayPalShipping } from "@/lib/paypal"

/**
 * Shipping address as merchants send it on POST /api/gateway/checkout.
 * Deliberately flat and snake_case-free apart from postal_code, matching the
 * billingAddress shape the WooCommerce plugin has always sent.
 */
export interface ShippingAddressInput {
  name?:        string
  line1?:       string
  line2?:       string
  city?:        string
  state?:       string
  postal_code?: string
  country?:     string
}

// PayPal Orders v2 maximum lengths.
const MAX_LINE   = 300
const MAX_CITY   = 120
const MAX_STATE  = 300
const MAX_POSTAL = 60
const MAX_NAME   = 300

/**
 * sanitizePayPalField strips URLs, emails and injection characters. Its default
 * pass also deletes runs of 8+ digits as "phone numbers", which would eat house
 * numbers and long postcodes — so addresses always opt into keepNumbers.
 */
function clean(raw: unknown, maxLength: number): string {
  if (typeof raw !== "string") return ""
  return sanitizePayPalField(raw, maxLength, { keepNumbers: true })
}

/**
 * Turns untrusted merchant JSON into a PayPal shipping block, or null when the
 * address is unusable.
 *
 * null is a feature, not a failure: the caller then omits the block and PayPal
 * keeps the historical NO_SHIPPING behaviour. Guessing at a half-address would
 * earn a 422 from PayPal and cost the merchant the sale.
 */
export function buildPayPalShipping(input: unknown): PayPalShipping | null {
  if (!input || typeof input !== "object") return null

  const raw = input as ShippingAddressInput

  const addressLine1 = clean(raw.line1, MAX_LINE)
  if (!addressLine1) return null

  // Not run through clean(): truncating to 2 chars would turn "United States"
  // into a plausible-looking "UN". Only a real alpha-2 code is accepted.
  const countryCode = typeof raw.country === "string" ? raw.country.trim().toUpperCase() : ""
  if (!/^[A-Z]{2}$/.test(countryCode)) return null

  const address: PayPalShipping["address"] = {
    address_line_1: addressLine1,
    country_code:   countryCode,
  }

  const addressLine2 = clean(raw.line2, MAX_LINE)
  if (addressLine2) address.address_line_2 = addressLine2

  const city = clean(raw.city, MAX_CITY)
  if (city) address.admin_area_2 = city

  const state = clean(raw.state, MAX_STATE)
  if (state) address.admin_area_1 = state

  const postalCode = clean(raw.postal_code, MAX_POSTAL)
  if (postalCode) address.postal_code = postalCode

  const fullName = clean(raw.name, MAX_NAME)
  return fullName ? { name: { full_name: fullName }, address } : { address }
}
```

- [ ] **Step 4: Run both harness scripts — expect PASS**

```bash
node --experimental-strip-types --import ./alias-hook.mjs test-shipping-address.mjs
node --experimental-strip-types --import ./alias-hook.mjs test-paypal-payload.mjs
```

Expected: `PASS test-shipping-address` then `PASS test-paypal-payload`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/shipping-address.ts
git commit -m "$(cat <<'EOF'
feat(gateway): normalise a merchant shipping address for PayPal

buildPayPalShipping maps the flat address merchants send onto PayPal's
admin_area_* shape, truncates to Orders v2 limits and strips URLs, emails and
injection characters while keeping digits, so house numbers and postcodes
survive.

It returns null for anything unusable — blank street, missing or non-alpha-2
country — because the caller then sends no shipping block at all. Degrading to
the old NO_SHIPPING payload is always better than a PayPal 422 on a live
checkout.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire `shippingAddress` through `/api/gateway/checkout`

**Files:**
- Modify: `app/api/gateway/checkout/route.ts` — `CheckoutBody` (`74-98`), the destructure (`227-235`), a new normalisation block after the SHOPIFY branch (~`358`), the `createPayPalOrder(...)` call (`1094-1109`)
- Test: `<SCRATCHPAD>/paypal-shipping-harness/test-route-shipping-wiring.mjs`

**Interfaces:**
- Consumes: `buildPayPalShipping` (Task 3), `CreateOrderParams.shipping` (Task 2).
- Produces: the public contract `POST /api/gateway/checkout` now accepts `shippingAddress: { name?, line1?, line2?, city?, state?, postal_code?, country? }`. Task 5's plugin sends exactly these keys.

**Note on placement:** `createPayPalOrder` is called inside the merchant-account rotation retry loop, so the address must be normalised **once, before the loop** — re-normalising per attempt would repeat the work and the log line on every retry.

- [ ] **Step 1: Write the failing test**

`<SCRATCHPAD>/paypal-shipping-harness/test-route-shipping-wiring.mjs` — a static check, since the route needs Postgres, Redis and PayPal to run:

```js
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const ROOT = "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard/"
const src = readFileSync(ROOT + "app/api/gateway/checkout/route.ts", "utf8")

// The body type documents the new field.
assert.match(src, /shippingAddress\?:\s*\{/, "CheckoutBody must declare shippingAddress")

// It is actually destructured off the body.
const destructure = src.match(/const \{\s*\n\s*amount,[\s\S]*?\n\s*\} = body/)
assert.ok(destructure, "body destructure block not found — did the route change shape?")
assert.match(destructure[0], /shippingAddress,/, "shippingAddress must be destructured from body")

// Normalised exactly once, via the shared helper.
assert.match(src, /import \{ buildPayPalShipping \} from "@\/lib\/shipping-address"/)
assert.equal((src.match(/buildPayPalShipping\(/g) ?? []).length, 1, "normalise once, before the retry loop")

// Handed to PayPal.
assert.match(src, /shipping:\s*paypalShipping \?\? undefined/, "createPayPalOrder must receive the shipping block")

// Normalisation happens before the rotation loop, not inside it.
assert.ok(
  src.indexOf("buildPayPalShipping(shippingAddress)") < src.indexOf("paypalOrder = await createPayPalOrder("),
  "shipping must be normalised before the createPayPalOrder call site"
)

// No address PII in logs: the log call may mention country and a boolean only.
const logLine = src.match(/checkout\.shipping_address[\s\S]{0,400}?\n\s*\)/)
assert.ok(logLine, "expected a checkout.shipping_address log call")
for (const forbidden of ["line1", "address_line_1", "postal", "full_name", "admin_area"]) {
  assert.equal(logLine[0].includes(forbidden), false, `log must not include ${forbidden}`)
}

console.log("PASS test-route-shipping-wiring")
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --experimental-strip-types --import ./alias-hook.mjs test-route-shipping-wiring.mjs
```

Expected: fails on the first assertion — `CheckoutBody must declare shippingAddress`.

- [ ] **Step 3: Declare the field on `CheckoutBody`**

Append inside `interface CheckoutBody` (after the `items?` entry that currently ends at `route.ts:98`):

```ts
  shippingAddress?: {
    name?:        string
    line1?:       string
    line2?:       string
    city?:        string
    state?:       string
    postal_code?: string
    country?:     string
  }
                          // optional buyer destination. When it carries at
                          // least a street line and an ISO alpha-2 country,
                          // PayPal is sent SET_PROVIDED_ADDRESS and shows this
                          // exact address on the order (needed for Seller
                          // Protection). Anything unusable, or the field
                          // omitted, leaves the historical NO_SHIPPING payload
                          // untouched — see lib/shipping-address.ts.
```

- [ ] **Step 4: Import the helper and destructure the field**

Add next to the other `@/lib` imports at the top of the file (the block ending around `route.ts:76`):

```ts
import { buildPayPalShipping } from "@/lib/shipping-address"
```

and add the field to the destructure at `route.ts:227-235`:

```ts
  const {
    amount,
    currency = "USD",
    itemName,
    intent: rawIntent,
    customerEmail,
    buyerIp,
    buyerCountry,
    shippingAddress,
  } = body
```

- [ ] **Step 5: Normalise once, after the provider routing**

Insert immediately after the `if (store.providerType === "SHOPIFY") { … }` block and before the `// ── Pre-resolve Payment Display Profile …` comment (currently `route.ts:358`):

```ts
  // ── Buyer destination for PayPal ───────────────────────────────────────────
  // Only PAYPAL stores reach this point. Merchants that send no usable address
  // (or none at all) keep the historical NO_SHIPPING payload; buildPayPalShipping
  // returns null for those. Normalised once here, outside the account-rotation
  // retry loop below.
  const paypalShipping = buildPayPalShipping(shippingAddress)
  log.info(
    "checkout.shipping_address",
    `Shipping address ${paypalShipping ? "accepted" : "absent/unusable"} for store=${storeId}`,
    {
      storeId: storeId ?? undefined,
      provided: !!paypalShipping,
      country: paypalShipping?.address.country_code,
    }
  )
```

- [ ] **Step 6: Pass it to PayPal**

In the `createPayPalOrder({ … })` call (`route.ts:1094-1109`), add after `invoiceId`:

```ts
        shipping:      paypalShipping ?? undefined,
```

- [ ] **Step 7: Run the wiring test and the whole harness**

```bash
node --experimental-strip-types --import ./alias-hook.mjs test-route-shipping-wiring.mjs
node --experimental-strip-types --import ./alias-hook.mjs test-shipping-address.mjs
node --experimental-strip-types --import ./alias-hook.mjs test-paypal-payload.mjs
```

Expected: three `PASS` lines.

- [ ] **Step 8: Type-check and lint**

```bash
npx tsc --noEmit
npx eslint app/api/gateway/checkout/route.ts lib/shipping-address.ts lib/paypal.ts
```

Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add app/api/gateway/checkout/route.ts
git commit -m "$(cat <<'EOF'
feat(gateway): accept a shipping address on checkout and forward it to PayPal

The WooCommerce plugin has been sending billingAddress since day one and the
route never read it, so the buyer's destination was dropped before it could
reach PayPal.

checkout now takes an optional shippingAddress, normalises it once before the
merchant-account rotation loop and hands the result to createPayPalOrder. The
log line records only whether an address was accepted and its country code —
never the address itself. Stripe and Shopify branches return earlier and are
unaffected.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: WooCommerce plugin v1.9.0 — send the address

**Files:**
- Modify: `<PLUGIN>/includes/class-wc-gateway-paydef.php` (`order_common_args` at `379-430`; the mock-charge `unset` at `472`)
- Modify: `<PLUGIN>/paydef-woocommerce.php` (`Version:` header line 6, `PAYDEF_WC_VERSION` line 22)
- Modify: `<PLUGIN>/readme.txt` (changelog)
- Create: `C:\Users\ADMIN\Documents\Working\v0-payment-gateway-dashboard\v0-payment-gateway-dashboard\plugin woo\paydef-woocommerce-1.9.0.zip`
- Test: `<SCRATCHPAD>/paypal-shipping-harness/check-plugin.mjs`

`<PLUGIN>` = `C:\Users\ADMIN\Documents\Working\v0-payment-gateway-dashboard\v0-payment-gateway-dashboard\plugin woo\paydef-woocommerce` — the **live 1.8.0 source**. Do not edit the 1.2.1 copy inside the PayDef repo or the one under `Tire2\public\`.

**Interfaces:**
- Consumes: the `shippingAddress` contract from Task 4 — keys `name`, `line1`, `line2`, `city`, `state`, `postal_code`, `country`.
- Produces: `paydef-woocommerce-1.9.0.zip`, the artefact the user uploads.

- [ ] **Step 1: Write the check script**

`<SCRATCHPAD>/paypal-shipping-harness/check-plugin.mjs` — asserts against the **built zip**, because the zip is what ships and a forward-slash/entry mistake is the one packaging bug that has bitten this plugin before:

```js
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

const ZIP = "C:\\Users\\ADMIN\\Documents\\Working\\v0-payment-gateway-dashboard\\v0-payment-gateway-dashboard\\plugin woo\\paydef-woocommerce-1.9.0.zip"

const ps = (script) => execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" })

const listing = ps(`
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead('${ZIP}')
$z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()
`)
const entries = listing.split(/\r?\n/).filter(Boolean)
assert.equal(entries.some(e => e.includes("\\")), false, "zip entries must use forward slashes")
assert.ok(entries.includes("paydef-woocommerce/paydef-woocommerce.php"), "bootstrap missing from zip")
assert.ok(entries.includes("paydef-woocommerce/includes/class-wc-gateway-paydef.php"), "gateway class missing from zip")

const readEntry = (name) => ps(`
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead('${ZIP}')
$e = $z.GetEntry('${name}')
$r = New-Object System.IO.StreamReader($e.Open())
$r.ReadToEnd()
$r.Dispose(); $z.Dispose()
`)

const bootstrap = readEntry("paydef-woocommerce/paydef-woocommerce.php")
assert.match(bootstrap, /^\s*\*\s*Version:\s*1\.9\.0\s*$/m, "header version must be 1.9.0")
assert.match(bootstrap, /define\( 'PAYDEF_WC_VERSION', '1\.9\.0' \);/, "PAYDEF_WC_VERSION must be 1.9.0")

const gateway = readEntry("paydef-woocommerce/includes/class-wc-gateway-paydef.php")
assert.match(gateway, /'shippingAddress' => \$this->shipping_address_args\( \$order \)/, "checkout payload must carry shippingAddress")
assert.match(gateway, /private function shipping_address_args\( WC_Order \$order \)/, "builder method missing")
assert.match(gateway, /get_shipping_address_1\(\)/, "must read the shipping street")
assert.match(gateway, /unset\( \$args\['itemName'\], \$args\['orderId'\], \$args\['items'\], \$args\['shippingAddress'\] \);/,
  "mock-charge must not send shippingAddress")

console.log("PASS check-plugin")
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node check-plugin.mjs
```

Expected: throws — the 1.9.0 zip does not exist yet (`OpenRead` cannot find the file).

- [ ] **Step 3: Add the address builder to the gateway class**

In `<PLUGIN>/includes/class-wc-gateway-paydef.php`, add `shippingAddress` to the array returned by `order_common_args()` (after the `billingAddress` entry that currently ends at line 428):

```php
			'shippingAddress' => $this->shipping_address_args( $order ),
```

Then add this method directly after `order_common_args()` (i.e. after line 430):

```php
	/**
	 * Buyer destination for the PayPal order.
	 *
	 * PayDef sends this to PayPal as purchase_units[0].shipping with
	 * shipping_preference=SET_PROVIDED_ADDRESS, which is what makes the address
	 * visible on the merchant's PayPal order and the payment eligible for
	 * Seller Protection.
	 *
	 * WooCommerce leaves the shipping_* fields empty on virtual / local-pickup
	 * orders, so fall back to billing. When neither has a street or a country,
	 * PayDef drops the block and PayPal behaves exactly as it did before
	 * (NO_SHIPPING) — nothing to guard here.
	 */
	private function shipping_address_args( WC_Order $order ) {
		$use_shipping = '' !== trim( (string) $order->get_shipping_address_1() );

		$name = $use_shipping
			? trim( $order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name() )
			: '';
		if ( '' === $name ) {
			// Shipping name is optional in WooCommerce even when the street is set.
			$name = trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() );
		}

		if ( $use_shipping ) {
			return array(
				'name'        => $name,
				'line1'       => $order->get_shipping_address_1(),
				'line2'       => $order->get_shipping_address_2(),
				'city'        => $order->get_shipping_city(),
				'state'       => $order->get_shipping_state(),
				'postal_code' => $order->get_shipping_postcode(),
				'country'     => $order->get_shipping_country(),
			);
		}

		return array(
			'name'        => $name,
			'line1'       => $order->get_billing_address_1(),
			'line2'       => $order->get_billing_address_2(),
			'city'        => $order->get_billing_city(),
			'state'       => $order->get_billing_state(),
			'postal_code' => $order->get_billing_postcode(),
			'country'     => $order->get_billing_country(),
		);
	}
```

- [ ] **Step 4: Keep the field off the mock-charge payload**

`process_mock_charge()` strips checkout-only keys before calling `/api/gateway/mock-charge`. Extend that `unset` (currently line 472):

```php
		unset( $args['itemName'], $args['orderId'], $args['items'], $args['shippingAddress'] );
```

- [ ] **Step 5: Bump the version**

In `<PLUGIN>/paydef-woocommerce.php`, line 6 and line 22:

```php
 * Version:     1.9.0
```

```php
define( 'PAYDEF_WC_VERSION', '1.9.0' );
```

Add to the top of the changelog section of `<PLUGIN>/readme.txt`:

```
= 1.9.0 =
* PayPal orders now carry the buyer's shipping address (SET_PROVIDED_ADDRESS),
  so it is visible on the PayPal order and the payment is eligible for Seller
  Protection. Virtual / local-pickup orders fall back to the billing address;
  orders with neither behave exactly as before. Requires the PayDef gateway to
  be running the matching backend change.
```

- [ ] **Step 6: Syntax-check the PHP**

No PHP binary on this machine — use the npm parser from the scratchpad:

```bash
cd "<SCRATCHPAD>" && npm install php-parser --no-save
```

Then `<SCRATCHPAD>/php-syntax.mjs`:

```js
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import Engine from "php-parser"

const SRC = "C:/Users/ADMIN/Documents/Working/v0-payment-gateway-dashboard/v0-payment-gateway-dashboard/plugin woo/paydef-woocommerce"
const parser = new Engine({ parser: { extractDoc: true }, ast: { withPositions: true } })

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = join(dir, entry)
  return statSync(full).isDirectory() ? walk(full) : full.endsWith(".php") ? [full] : []
})

let failed = false
for (const file of walk(SRC)) {
  try {
    parser.parseCode(readFileSync(file, "utf8"), file)
    console.log("OK  " + file)
  } catch (err) {
    failed = true
    console.error("ERR " + file + " :: " + err.message)
  }
}
process.exit(failed ? 1 : 0)
```

Run:

```bash
node php-syntax.mjs
```

Expected: `OK` for all 5 PHP files, exit 0.

- [ ] **Step 7: Build the 1.9.0 zip**

Forward-slash entry names via .NET — **never `Compress-Archive`**:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base = 'C:\Users\ADMIN\Documents\Working\v0-payment-gateway-dashboard\v0-payment-gateway-dashboard\plugin woo'
$src  = Join-Path $base 'paydef-woocommerce'
$zip  = Join-Path $base 'paydef-woocommerce-1.9.0.zip'
if (Test-Path $zip) { Remove-Item $zip }
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
  $entry = 'paydef-woocommerce/' + $_.FullName.Substring($src.Length + 1).Replace('\', '/')
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry)
}
$archive.Dispose()
(Get-Item $zip).Length
```

Expected: a size around 33 KB.

- [ ] **Step 8: Run the zip check — expect PASS**

```bash
node check-plugin.mjs
```

Expected: `PASS check-plugin`.

- [ ] **Step 9: Commit (backend repo only)**

`plugin woo/` is git-ignored, so there is nothing to stage from this task. Record the work in the plan's progress notes instead:

```bash
git status --short "plugin woo" ; echo "(expected: no output — folder is ignored)"
```

---

### Task 6: Deploy and verify end-to-end

The only proof that matters is a real PayPal order showing the address. Backend must go out **before** the plugin: 1.9.0 sends a field an un-deployed gateway ignores, which is harmless, whereas the reverse order proves nothing.

**Files:** none (deployment + verification).

**Interfaces:**
- Consumes: the commits from Tasks 2-4 and the zip from Task 5.
- Produces: verified live behaviour; a memory update.

- [ ] **Step 1: Push the backend commits**

```bash
git log --oneline -3
git push origin main
```

`git push` is blocked by the auto-mode classifier — **ask the user to run it** (`! git push origin main`).

- [ ] **Step 2: Redeploy on Coolify**

Coolify auto-deploy does not fire on this project — the user must click **Deploy** manually. Ask for it, then confirm the new code is live:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://paylaz.nl/api/health
```

Expected: `200`. (Domain per memory: `paylaz.nl` is the production host.)

- [ ] **Step 3: Upload the plugin**

Ask the user to upload `paydef-woocommerce-1.9.0.zip` via WP admin → Plugins → Add New → Upload → *Replace current with uploaded*, then confirm **Settings → Payments → PayDef Gateway → Debug** is on for this test.

- [ ] **Step 4: Place a real test order**

Ask the user to place one low-value order on the shop through the PayDef PayPal flow, with a full shipping address, then check in the PayPal merchant account that the order now shows the **shipping address** — the primary acceptance criterion.

- [ ] **Step 5: Confirm from the logs which branch ran**

WooCommerce → Status → Logs, source `paydef`: the `checkout → order <id> amount <total>` line must be present and the payment must have completed as before (no new failure notice).

On the gateway side, the structured log `checkout.shipping_address` must read `accepted` with the right `country`. Look it up in the platform logs UI, or in the DB if that is where `txLog`/`log` lands:

```sql
-- adjust the table name to the one the log helper writes to
SELECT created_at, event, message
FROM   gateway_logs
WHERE  event = 'checkout.shipping_address'
ORDER  BY created_at DESC
LIMIT  5;
```

Expected: one row per checkout, `provided=true`.

- [ ] **Step 6: Verify the no-address path still works**

Ask the user to place a second order for a **virtual product** (no shipping address collected). Expected: the order goes through PayPal exactly as before. With the billing fallback it will normally still carry an address; if billing is empty too, the order must simply complete with no shipping block and no error.

- [ ] **Step 7: Record the outcome in memory**

Update `paydef-woocommerce-plugin.md` (add a v1.9.0 paragraph: what shipped, the three-layer root cause, that it needed the first shared-`lib/paypal.ts` change in this series, and the verification result) and add a line to the `MEMORY.md` index only if a new file was created.

- [ ] **Step 8: Commit any doc/plan progress**

```bash
git add docs/superpowers/plans/2026-09-25-woocommerce-paypal-shipping-address.md
git commit -m "$(cat <<'EOF'
docs: plan + outcome for the WooCommerce→PayPal shipping address fix

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Rollback

Each layer is independently reversible:

- **Backend:** `git revert` the Task 2-4 commits and redeploy. `shipping_preference` returns to the hardcoded `NO_SHIPPING`; a plugin still sending `shippingAddress` is simply ignored again.
- **Plugin:** re-upload `paydef-woocommerce-1.8.0.zip` (kept alongside 1.9.0 in `plugin woo\`).
- **Fastest mitigation without a deploy:** none — this is deliberate. Because the behaviour is payload-driven with no store flag, the kill switch is the plugin: downgrading to 1.8.0 stops the address being sent, and the gateway falls back to `NO_SHIPPING` on the very next checkout.

## Risks

| Risk | Mitigation |
|---|---|
| PayPal 422 on an address it dislikes (bad state code for a country, unsupported country) → checkout fails for a live shop | `buildPayPalShipping` returns `null` for anything structurally wrong; Task 6 Step 4 is a single low-value order, so a 422 shows up on a test, not on a wave of customers. If PayPal still 422s, revert the plugin (Rollback) — the gateway needs no change. |
| A masking regression: the shipping block leaks the real shop identity | The block carries only buyer data. URLs and emails are stripped by `sanitizePayPalField`, which is exactly how a pasted storefront URL in an address line would otherwise reach PayPal. Merchant identity (brand name, return URLs, item names) is untouched. |
| Address PII in logs / DB | Only `provided` + `country_code` are logged. No new column stores the address. |
| Someone later "cleans up" `shipping_preference` back to a constant | The Task 1 harness asserts both branches; keep the harness scripts with the plan so the next session can re-run them. |
| The 1.2.1 copy inside the PayDef repo gets edited by mistake | Task 5 names the live source path explicitly and the zip check asserts version 1.9.0 from the built artefact. |
| PayPal's rejection body can echo a submitted address value into the console | `PayPalApiError.message` embeds PayPal's raw error body, so a 4xx on a `SET_PROVIDED_ADDRESS` order can carry an address fragment into stdout — this is pre-existing gateway error-logging behaviour, not new code, and the sink is console-only (nothing persists it). Known limitation, deliberately not addressed here: blunting PayPal's error bodies would damage diagnosability. The Finding-1 gate tightening (`lib/shipping-address.ts`) removes the class of incomplete addresses that would trigger this rejection in the first place, so the practical exposure is now near zero. |

## Self-Review

- **Spec coverage:** R1, R2 → Task 2 (+ Task 1 assertions). R3, R4 → Task 3. R5, R6 → Task 4 (Stripe/Shopify branches return before the new code). R7 → Task 5. R8 → Task 4 Step 5, asserted in Task 4 Step 1. Decisions 1-3 → payload-driven (no migration anywhere in the plan), `SET_PROVIDED_ADDRESS` (Task 2 Step 2), billing fallback (Task 5 Step 3).
- **Placeholders:** none — every code step carries the literal code, every run step the literal command and expected output.
- **Type consistency:** `PayPalShipping` is defined once (Task 2) and imported by `lib/shipping-address.ts` (Task 3); `buildPayPalShipping(input: unknown): PayPalShipping | null` is used with that exact name and signature in Task 4; the JSON keys `name/line1/line2/city/state/postal_code/country` match across `ShippingAddressInput` (Task 3), `CheckoutBody.shippingAddress` (Task 4) and the plugin's `shipping_address_args()` (Task 5).
