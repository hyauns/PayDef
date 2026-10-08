# PayPal Smart Payment Buttons (iframe) — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third per-store checkout mode, **Smart Buttons (iframe)**, next to the existing Classic Redirect and Popup + Shield Bridge modes. When it is on, the storefront embeds PayPal's own payment buttons in an iframe served from the shield domain instead of sending the buyer away to `approvalUrl`. The merchant can switch it on or off per store from the dashboard.

**Architecture:** The merchant backend still calls `POST /api/gateway/checkout` with the final amount, so account rotation, daily/warm-up limits, item masking, identity bundles and the PayPal order itself are produced exactly as today. The one difference is presentation. For `checkout_flow = SMART_BUTTONS`, the response additionally carries `embedUrl`, a new shield-domain page (`/checkout/buttons`). That page renders the PayPal JS SDK with the `client-id` of the account that already owns the order, hands PayPal the pre-created order id, and on approval calls the existing `/api/gateway/execute` and `browser-status` endpoints. It then `postMessage`s the result to the parent page. `approvalUrl` is always still returned, so an integration that ignores `embedUrl` (every integration live today, including the WooCommerce plugin) keeps redirecting and nothing breaks.

**Tech Stack:** Next.js 16 App Router + TypeScript, Neon Postgres, PayPal Orders v2 REST + PayPal JS SDK v5 (`https://www.paypal.com/sdk/js`), Node 24 `--experimental-strip-types` for the verification harness (no test runner in the repo).

**Spec:** inline. See "Spec" below. There is no separate spec document; this section is the spec and travels with the plan. Background and the sandbox proof are in memory `express-checkout-spike.md` and in `scratch/prototype-paypal-iframe.mjs`.

## Global Constraints

- **Existing integrations must not change behaviour.** `/api/gateway/checkout` keeps returning `approvalUrl`, `flow`, `popupUrl`, `popupOrigin` exactly as today. The new `embedUrl` and `embedOrigin` fields are additive and `null` unless the store's flow is `SMART_BUTTONS`.
- **SMART_BUTTONS is per-store opt-in only.** The platform-wide default (`system_settings.checkout_preferences.defaultFlow`) may only be `REDIRECT` or `POPUP_BRIDGE`. A stored `SMART_BUTTONS` default normalises to `REDIRECT`.
- **PayPal only.** For `provider_type` `STRIPE` or `SHOPIFY`, a stored `SMART_BUTTONS` behaves as `REDIRECT`. The dashboard disables the option for those stores.
- **Never X-Frame-Options on `/checkout/buttons`.** Framing is controlled only by `Content-Security-Policy: frame-ancestors <origins>`. The origins come from the transaction's own `merchant_success_url` / `merchant_cancel_url`: `https:` always, `http:` only for `localhost` / `127.0.0.1`. No origins → `frame-ancestors 'none'` and an error page.
- **postMessage is never sent to `"*"`.** It goes to each allowed origin explicitly; the browser drops the ones that do not match the parent.
- **Buyer cancel inside the PayPal popup must not cancel the transaction.** The buyer can click the button again, and PayPal reuses the same order. Expiry stays with the existing 30-minute sweep.
- **No secrets in the page.** Only `client_id` (public by design in the PayPal SDK), the PayPal order id, the transaction id and the execute token, which is already in today's return URL, reach the browser. `client_secret` never does.
- **Migration:** `scripts/029-checkout-flow-smart-buttons.sql`. Highest existing migration is `028-shopify-item-label.sql`. ⚠️ `.env.local` points at the **PRODUCTION** DB (`ep-billowing-meadow`). Running the migration is a Task 12 step that needs the user's go-ahead; no other task touches a database.
- **SDK integration date:** `integration-date=2026-10-08`. PayPal requires an integration date when the `client-id` changes dynamically.
- **No test framework in the repo.** Verification is (a) the Node TS harness from Task 1, (b) `npx tsc --noEmit` compared against the baseline captured in Task 1 (the repo has **244 pre-existing errors**, mostly radix typings in `app/stores/page.tsx`; the bar is *no new errors*), and (c) the sandbox end-to-end run in Task 11.
- **Out of scope (later phases, separate plans):** the WooCommerce plugin embedding the iframe (Phase 1b), and buttons on product/cart pages before an order exists, i.e. express checkout with `GET_FROM_FILE` and pay-first order creation (Phase 2).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on a branch (`feat/paypal-smart-buttons`), never on `main`.

## Review Focus

1. **Buyer cancels the PayPal popup, then clicks the button again.** Expected: the same PayPal order is reused and the transaction is still `PENDING`. Pinned by Task 5 (rendered page never calls `/api/gateway/browser-result`).
2. **Hostile or odd values reaching the inline script** (order id, currency, return URLs containing `</script>` or quotes). Expected: the page stays well-formed and nothing executes. Pinned by Task 5 (injection assertions).
3. **Store switched to SMART_BUTTONS while its storefront still runs an old integration** (WooCommerce plugin ≤ 1.9). Expected: checkout still returns `approvalUrl`, and the buyer is redirected exactly as before. Pinned by Task 6 (`buildFlowUrls` never touches `approvalUrl`; the route keeps returning it).
4. **Iframe reloaded after the payment finished or after the 30-minute expiry.** Expected: an error page that tells the parent (`type: "error"`), not a second set of live buttons. Pinned by Task 4 (`not_pending`, `expired`) and Task 5 (error page posts `error`).
5. **Someone frames the page from a site that is not the merchant's.** Expected: the browser refuses to render it. Pinned by Task 4 (CSP header value) and Task 11 (negative e2e from a third origin).

---

## Spec

### Why this exists

The user wants PayPal's own payment buttons shown on the storefront instead of sending the buyer to PayPal. They want to keep account rotation and item masking, and to be able to switch between this and the existing redirect per store.

### What was proven before this plan (2026-10-08, sandbox)

`scratch/prototype-paypal-iframe.mjs` framed a shield origin (`127.0.0.1:4102`) inside a merchant origin (`localhost:4101`). In both a plain iframe and a `sandbox`-attributed one:

- the SDK loaded and the buttons rendered;
- the approval popup opened;
- the user approved with the sandbox buyer;
- `onApprove` fired and the capture returned `COMPLETED`;
- with `GET_FROM_FILE`, PayPal returned the buyer's shipping address into the iframe.

**Not yet proven, closed by Task 11:** a server-created order whose `client-id` is supplied dynamically, with `integration-date`, rendered by our own page.

### Phasing (agreed direction, this plan = Phase 1)

| Phase | What the buyer sees | Account choice | Status |
|---|---|---|---|
| **1 (this plan)** | PayPal buttons in an iframe at the point where the merchant would have redirected (checkout / pay step) | Unchanged: picked by `/api/gateway/checkout` with the final amount, so limits stay exact | planned here |
| 1b | Same, inside WooCommerce, via plugin | Unchanged | separate plan |
| 2 | Buttons on product and cart pages before an order exists; address pulled from PayPal | Pinned when the iframe renders; limit re-checked at create-order with a fallback | separate plan; needs the plugin flow inverted (pay first, then build the order) |

Phase 1 builds every piece Phase 2 needs: the shield page, the dynamic client-id, framing headers, the postMessage contract and the dashboard toggle. It changes none of the money-moving logic.

### Decisions (proposed by the assistant on 2026-10-08; confirm when reviewing)

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | How the toggle is modelled | A third value `SMART_BUTTONS` of the existing per-store `checkout_flow`, shown as a third option in the existing "Checkout Experience" picker | The setting, API, migration pattern and UI already exist; the user asked to choose iframe *or* redirect, which is exactly this picker |
| D2 | Where the page lives | Route Handler `app/checkout/buttons/route.ts` returning raw HTML | A page component cannot set per-request `Content-Security-Policy`; a route handler can. Same shape as the proven prototype |
| D3 | Who may frame it | Origins of the transaction's `merchant_success_url` / `merchant_cancel_url` | Already per-order and already validated by `lib/return-url-guard.ts`; no new store field |
| D4 | What the buttons pay | The PayPal order created by `/api/gateway/checkout` (`createOrder` returns `paypal_order_id`) | Rotation, limits and masking stay byte-identical to REDIRECT |
| D5 | Finishing the payment | Same endpoints the shield success page already uses: `/api/gateway/execute` then `/api/gateway/browser-status/:id` | Already idempotent and production-proven |
| D6 | Getting the buyer back to the shop | `postMessage({type:"approved", redirectUrl})` to the parent, plus a visible `target="_top"` "Continue" link as fallback | A cross-origin iframe cannot reliably navigate the top window after an async call |
| D7 | Errors in the iframe | `postMessage({type:"error"})`; the merchant snippet falls back to `approvalUrl` | That is the "use iframe or redirect" fallback the user asked for |

### Requirements

- R1. `CHECKOUT_FLOW_VALUES` gains `SMART_BUTTONS`. The DB CHECK constraint allows it (migration 029).
- R2. The platform default can never be `SMART_BUTTONS`.
- R3. Stripe and Shopify stores get `REDIRECT` when their stored flow is `SMART_BUTTONS`.
- R4. For PayPal stores with `SMART_BUTTONS`, checkout returns `embedUrl = https://<finalShieldDomain>/checkout/buttons?ref=<txId>&et=<executeToken>` and `embedOrigin`. Both are `null` for the other flows.
- R5. `GET /checkout/buttons` renders buttons only for a `PENDING`, unexpired transaction that has a PayPal order and at least one allowed frame origin, and whose execute token passes `verifyExecuteToken` (respecting shadow/enforce). Otherwise it returns an error page with the right status.
- R6. Every response from `/checkout/buttons` carries `Content-Security-Policy: frame-ancestors …` and `Cache-Control: no-store`.
- R7. The page posts `ready`, `resize`, `cancelled`, `approved`, `failed`, `pending` and `error` messages, with `source: "paydef-buttons"` and `transactionId`.
- R8. The shield-domain middleware lets `/checkout/buttons` through.
- R9. The dashboard shows the third option in both places that edit the flow: the Stores slide-over and the Settings store cards. It is disabled for Stripe/Shopify, and warns when no return URL is set. EN + VI copy.
- R10. `/docs/api` documents `SMART_BUTTONS`, `embedUrl`, the snippet and the message contract.

### UI design

**Stores → edit slide-over → "Checkout Experience"** (vertical list, same card style as today):

```
CHECKOUT EXPERIENCE
┌──────────────────────────────────────────────────────────────┐
│ ○ Classic Redirect                                           │
│   Buyer leaves the storefront and completes approval on      │
│   PayPal in the same tab.                                    │
├──────────────────────────────────────────────────────────────┤
│ ○ Popup + Shield Bridge                                      │
│   Buyer approves in a popup while the shield domain handles  │
│   the return and cancel flow.                                │
├──────────────────────────────────────────────────────────────┤
│ ● Smart Buttons (iframe)                          [PayPal]   │
│   PayPal buttons appear inside the storefront in an iframe   │
│   from the shield domain. Buyer never leaves the page.       │
└──────────────────────────────────────────────────────────────┘
Existing API clients remain compatible because the gateway still
returns the classic approvalUrl.
ℹ Smart Buttons needs the storefront to embed embedUrl (see API
  docs). Until it does, buyers keep getting the redirect.  [API docs →]
⚠ Smart Buttons needs a Success or Cancel return URL: the iframe
  only loads on that site.                    (shown when both empty)
```

On a Stripe/Shopify store, the third card is greyed out and disabled, with the caption "Available for PayPal stores only."

**Settings → per-store card → "Checkout Experience"** (today: 3 cards in a row; becomes 4, `sm:grid-cols-2 lg:grid-cols-4`): `Use Platform Default` · `Classic Redirect` · `Popup + Shield Bridge` · `Smart Buttons (iframe)`. The "Currently using …" line names whichever flow the platform default resolves to. The super-admin **Default Checkout Experience** block stays at two options.

### The merchant-side contract (what `/docs/api` will publish)

```html
<div id="paydef-buttons"></div>
<script>
(function () {
  // Both values come from your backend's POST /api/gateway/checkout response.
  var embedUrl = "{{embedUrl}}";
  var approvalUrl = "{{approvalUrl}}";
  if (!embedUrl) { window.location.href = approvalUrl; return; }

  var origin = new URL(embedUrl).origin;
  var frame = document.createElement("iframe");
  frame.src = embedUrl;
  frame.allow = "payment";
  frame.title = "PayPal";
  frame.style.cssText = "width:100%;border:0;height:160px;";
  document.getElementById("paydef-buttons").appendChild(frame);

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.origin !== origin || !m || m.source !== "paydef-buttons") return;
    if (m.type === "resize" && m.height) frame.style.height = m.height + "px";
    if ((m.type === "approved" || m.type === "failed") && m.redirectUrl) window.location.href = m.redirectUrl;
    if (m.type === "error") window.location.href = approvalUrl; // fall back to the classic redirect
  });
})();
</script>
```

| `type` | Extra fields | Meaning |
|---|---|---|
| `ready` | — | Buttons rendered |
| `resize` | `height` | Iframe content height in px |
| `cancelled` | — | Buyer closed the PayPal popup; transaction still `PENDING`, buttons still usable |
| `approved` | `status`, `redirectUrl` | Payment `COMPLETED` or `AUTHORIZED` |
| `failed` | `status`, `redirectUrl` | Payment ended `FAILED`/`CANCELED`/`EXPIRED`/… |
| `pending` | — | Execute ran but no final status after ~30 s; rely on the webhook |
| `error` | `code`, `message?` | Page cannot offer buttons; fall back to `approvalUrl` |

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/checkout-flow.ts` | Modify | Flow values (+`SMART_BUTTONS`), platform-default normaliser, `effectiveFlowForProvider`, `buildFlowUrls` (per-flow popup/embed URLs) |
| `lib/smart-buttons.ts` | **Create** | Pure: embed URL, frame origins, CSP value, SDK URL, request decision, HTML rendering of the buttons page and the error page |
| `app/checkout/buttons/route.ts` | **Create** | GET handler: one DB read, `verifyExecuteToken`, `decideButtonPage`, respond with HTML + headers |
| `middleware.ts` | Modify (`53-60`) | Add `/checkout/buttons` to `SHIELD_PASSTHROUGH_PREFIXES` |
| `app/api/gateway/checkout/route.ts` | Modify (`52-56`, `346-379`, `417-420`, `1268-1272`, `1355-1368`) | Map flow for Stripe/Shopify; build and return `embedUrl` / `embedOrigin` |
| `scripts/029-checkout-flow-smart-buttons.sql` | **Create** | Widen `stores_checkout_flow_check` |
| `scripts/run-029-migration.cjs` | **Create** | Apply + verify 029, printing the DB host first |
| `lib/i18n/stores.ts`, `lib/i18n/settings.ts` | Modify | EN + VI copy for the new option |
| `app/stores/page.tsx` | Modify (`40-55`, `1438-1470`) | Third option, provider gating, hints |
| `app/settings/page.tsx` | Modify (`42-53`, `80-106`, `612-623`, `876-920`) | Third option on store cards, provider gating; platform default untouched |
| `app/docs/api/page.tsx` | Modify | Response fields, flow rule, new "Smart Buttons" section |
| `<SCRATCHPAD>/smart-buttons-harness/*` | **Create** (not committed) | Alias loader + assertion scripts + sandbox e2e server |

`<SCRATCHPAD>` = the executing session's scratchpad directory. `<REPO>` = `C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard`. The path contains spaces, so always quote it.

---

### Task 1: Verification harness + TypeScript baseline

**Files:**
- Create: `<SCRATCHPAD>/smart-buttons-harness/alias-hook.mjs`
- Create: `<SCRATCHPAD>/smart-buttons-harness/alias-resolver.mjs`
- Create: `<SCRATCHPAD>/smart-buttons-harness/stub-proxy-agent.mjs`
- Create: `<SCRATCHPAD>/smart-buttons-harness/stub-neon.mjs`
- Create: `<SCRATCHPAD>/smart-buttons-harness/tsc-new-errors.sh`
- Create: `<SCRATCHPAD>/smart-buttons-harness/tsc-baseline.txt` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: the runner `node --experimental-strip-types --import ./alias-hook.mjs <script>.mjs` (run from the harness dir), which resolves `@/…` to `<REPO>/…(.ts)` and stubs `https-proxy-agent`; and `bash tsc-new-errors.sh`, which prints only TypeScript errors not present in the baseline and exits 1 if there are any.

- [ ] **Step 1: Create the loader**

`alias-hook.mjs`:

```js
import { register } from "node:module"
register("./alias-resolver.mjs", import.meta.url)
```

`alias-resolver.mjs`:

```js
import { pathToFileURL } from "node:url"

const ROOT = pathToFileURL("C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard/").href
const STUBS = { "https-proxy-agent": "./stub-proxy-agent.mjs", "@/lib/neon": "./stub-neon.mjs" }

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

`stub-proxy-agent.mjs` (the real package's pnpm install cannot resolve `debug` under plain Node; nothing here does network I/O through a proxy):

```js
export class HttpsProxyAgent {
  constructor(url) { this.url = url }
}
```

`stub-neon.mjs` (`lib/checkout-flow.ts` imports `@/lib/neon`, whose `pg` dependency cannot resolve `pg-types` under plain Node; verified 2026-10-08. None of the tested functions touch the DB, so any DB call in a test is a bug and should throw):

```js
const noDb = () => { throw new Error("harness: no database") }
export const getSql = noDb
export const getPool = noDb
```

- [ ] **Step 2: Create the "no new TypeScript errors" checker**

`tsc-new-errors.sh`:

```bash
#!/usr/bin/env bash
# Prints TypeScript errors that are not in tsc-baseline.txt. Exit 1 if any.
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard"
npx tsc --noEmit -p . 2>/dev/null | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > "$HERE/tsc-now.txt"
NEW=$(comm -13 "$HERE/tsc-baseline.txt" "$HERE/tsc-now.txt")
if [ -n "$NEW" ]; then echo "NEW TypeScript errors:"; echo "$NEW"; exit 1; fi
echo "tsc: no new errors ($(wc -l < "$HERE/tsc-now.txt") total, baseline $(wc -l < "$HERE/tsc-baseline.txt"))"
```

Line/column numbers are stripped so that pre-existing errors that only move when a file grows do not count as new.

- [ ] **Step 3: Capture the baseline on the unmodified branch**

```bash
cd "<SCRATCHPAD>/smart-buttons-harness"
(cd "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard" && npx tsc --noEmit -p . 2>/dev/null) | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > tsc-baseline.txt
wc -l tsc-baseline.txt
bash tsc-new-errors.sh
```

Expected: `244 tsc-baseline.txt` (±, if `main` moved since 2026-10-08), then `tsc: no new errors (244 total, baseline 244)`.

- [ ] **Step 4: Smoke-test the loader against the current code**

`smoke.mjs`:

```js
const m = await import("@/lib/checkout-flow")
console.log("flows:", m.CHECKOUT_FLOW_VALUES.join(","))
```

Run: `node --experimental-strip-types --import ./alias-hook.mjs smoke.mjs`
Expected: `flows: REDIRECT,POPUP_BRIDGE`. A `MODULE_TYPELESS_PACKAGE_JSON` warning is normal noise.

- [ ] **Step 5: No commit.** The harness lives in the scratchpad on purpose (no test runner in the repo).

---

### Task 2: `lib/checkout-flow.ts` — the `SMART_BUTTONS` value and its guards

**Files:**
- Modify: `lib/checkout-flow.ts:1-52`
- Test: `<SCRATCHPAD>/smart-buttons-harness/test-checkout-flow.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `CHECKOUT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE", "SMART_BUTTONS"] as const`; `type CheckoutFlow` widens accordingly.
  - `PLATFORM_DEFAULT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE"] as const`; `type PlatformDefaultFlow`.
  - `normalizePlatformDefaultFlow(value: unknown): PlatformDefaultFlow`
  - `CheckoutPreferences.defaultFlow: PlatformDefaultFlow`
  - `effectiveFlowForProvider(flow: CheckoutFlow, providerType: string | null | undefined): CheckoutFlow`

- [ ] **Step 1: Write the failing test**

`test-checkout-flow.mjs`:

```js
import assert from "node:assert/strict"
const m = await import("@/lib/checkout-flow")

// R1 — the new value is accepted per store
assert.equal(m.normalizeCheckoutFlow("SMART_BUTTONS"), "SMART_BUTTONS")
assert.equal(m.normalizeCheckoutFlow("bogus"), "REDIRECT")
assert.equal(m.resolveCheckoutFlow("SMART_BUTTONS", { defaultFlow: "REDIRECT" }), "SMART_BUTTONS")
assert.equal(m.resolveCheckoutFlow(null, { defaultFlow: "POPUP_BRIDGE" }), "POPUP_BRIDGE")

// R2 — never as the platform default
assert.equal(m.normalizePlatformDefaultFlow("SMART_BUTTONS"), "REDIRECT")
assert.equal(m.normalizePlatformDefaultFlow("POPUP_BRIDGE"), "POPUP_BRIDGE")
assert.equal(m.normalizePlatformDefaultFlow(undefined), "REDIRECT")
assert.deepEqual([...m.PLATFORM_DEFAULT_FLOW_VALUES], ["REDIRECT", "POPUP_BRIDGE"])

// R3 — PayPal only
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "STRIPE"), "REDIRECT")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "SHOPIFY"), "REDIRECT")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "shopify"), "REDIRECT")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", "PAYPAL"), "SMART_BUTTONS")
assert.equal(m.effectiveFlowForProvider("SMART_BUTTONS", null), "SMART_BUTTONS")
assert.equal(m.effectiveFlowForProvider("POPUP_BRIDGE", "STRIPE"), "POPUP_BRIDGE")
assert.equal(m.effectiveFlowForProvider("REDIRECT", "SHOPIFY"), "REDIRECT")

console.log("PASS test-checkout-flow")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-checkout-flow.mjs`
Expected: FAIL. `AssertionError … 'REDIRECT' !== 'SMART_BUTTONS'` on the first assertion.

- [ ] **Step 3: Implement**

In `lib/checkout-flow.ts`, replace lines 4-41 (from `export const CHECKOUT_FLOW_VALUES` through the end of `getCheckoutPreferences`) with:

```ts
export const CHECKOUT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE", "SMART_BUTTONS"] as const

export type CheckoutFlow = (typeof CHECKOUT_FLOW_VALUES)[number]

export const DEFAULT_CHECKOUT_FLOW: CheckoutFlow = "REDIRECT"

// The platform-wide default may only be a flow that works for every store and
// every existing integration with no storefront change. SMART_BUTTONS needs the
// storefront to frame embedUrl and exists only for PayPal, so it is a per-store
// opt-in and never a default.
export const PLATFORM_DEFAULT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE"] as const

export type PlatformDefaultFlow = (typeof PLATFORM_DEFAULT_FLOW_VALUES)[number]

export interface CheckoutPreferences {
  defaultFlow: PlatformDefaultFlow
}

interface SettingsRow {
  value: Record<string, unknown> | null
}

export function normalizeCheckoutFlow(value: unknown): CheckoutFlow {
  return CHECKOUT_FLOW_VALUES.includes(value as CheckoutFlow)
    ? (value as CheckoutFlow)
    : DEFAULT_CHECKOUT_FLOW
}

export function normalizePlatformDefaultFlow(value: unknown): PlatformDefaultFlow {
  return PLATFORM_DEFAULT_FLOW_VALUES.includes(value as PlatformDefaultFlow)
    ? (value as PlatformDefaultFlow)
    : "REDIRECT"
}

export async function getCheckoutPreferences(sql: ReturnType<typeof getSql>): Promise<CheckoutPreferences> {
  try {
    const rows = (await sql`
      SELECT value
      FROM system_settings
      WHERE key = 'checkout_preferences'
      LIMIT 1
    `) as unknown as SettingsRow[]

    return {
      defaultFlow: normalizePlatformDefaultFlow(rows[0]?.value?.defaultFlow),
    }
  } catch {
    return { defaultFlow: "REDIRECT" }
  }
}

// Stripe and Shopify have no embeddable button page; a store that was switched
// to SMART_BUTTONS and later moved to one of them keeps working as a redirect.
const PROVIDERS_WITHOUT_SMART_BUTTONS = new Set(["STRIPE", "SHOPIFY"])

export function effectiveFlowForProvider(
  flow: CheckoutFlow,
  providerType: string | null | undefined
): CheckoutFlow {
  if (flow !== "SMART_BUTTONS") return flow
  return PROVIDERS_WITHOUT_SMART_BUTTONS.has(String(providerType ?? "").toUpperCase())
    ? "REDIRECT"
    : flow
}
```

Leave `resolveCheckoutFlow` and `buildPopupBridgeUrl` unchanged.

- [ ] **Step 4: Run the test and the type check**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-checkout-flow.mjs`
Expected: `PASS test-checkout-flow`

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`. If `app/api/merchant/stores/route.ts` complains about `defaultFlow` types, the fix is to type its parameter as `PlatformDefaultFlow`. Ledger it as a ruling.

- [ ] **Step 5: Commit**

```bash
git add lib/checkout-flow.ts
git commit -m "feat(checkout-flow): add SMART_BUTTONS as a per-store-only PayPal flow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Migration 029 — allow `SMART_BUTTONS` in the DB

**Files:**
- Create: `scripts/029-checkout-flow-smart-buttons.sql`
- Create: `scripts/run-029-migration.cjs`

**Interfaces:**
- Consumes: the constraint name `stores_checkout_flow_check` from `scripts/018-checkout-flow.sql`.
- Produces: a DB where `stores.checkout_flow` accepts `SMART_BUTTONS`. **Not applied in this task** (Task 12).

- [ ] **Step 1: Write the SQL**

`scripts/029-checkout-flow-smart-buttons.sql`:

```sql
-- 029-checkout-flow-smart-buttons.sql
-- Allows the per-store PayPal Smart Buttons (iframe) checkout flow.
-- Widening only: every existing row (REDIRECT / POPUP_BRIDGE / NULL) stays valid.

ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS stores_checkout_flow_check;

ALTER TABLE stores
  ADD CONSTRAINT stores_checkout_flow_check
  CHECK (checkout_flow IN ('REDIRECT', 'POPUP_BRIDGE', 'SMART_BUTTONS'));
```

`NULL` passes a `CHECK … IN (…)` constraint, so stores that use the platform default are unaffected.

- [ ] **Step 2: Write the runner**

`scripts/run-029-migration.cjs` (pattern copied from `run-026-migration.cjs`; it prints the host and refuses to run without `--yes`, because `.env.local` points at production):

```js
// Run migration 029: allow stores.checkout_flow = 'SMART_BUTTONS'
// Usage: node scripts/run-029-migration.cjs          (dry run: prints target host + SQL)
//        node scripts/run-029-migration.cjs --yes    (applies it)
// Reads DATABASE_URL_UNPOOLED || DATABASE_URL from .env.local — which is PRODUCTION.

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=["']?(.*?)["']?\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
}

async function migrate() {
  const connStr = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connStr) {
    console.error("No DATABASE_URL found");
    process.exit(1);
  }
  const host = new URL(connStr).hostname;
  console.log("Target DB host:", host);

  const ddl = fs.readFileSync(path.join(__dirname, "029-checkout-flow-smart-buttons.sql"), "utf-8");
  if (!process.argv.includes("--yes")) {
    console.log("Dry run. SQL that would run:\n" + ddl + "\nRe-run with --yes to apply.");
    return;
  }

  const sql = neon(connStr);
  try {
    await sql`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_checkout_flow_check`;
    await sql`ALTER TABLE stores ADD CONSTRAINT stores_checkout_flow_check
              CHECK (checkout_flow IN ('REDIRECT', 'POPUP_BRIDGE', 'SMART_BUTTONS'))`;

    const rows = await sql`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'stores_checkout_flow_check'
    `;
    console.log("Constraint after migration:", rows[0]?.def);
    if (!rows[0] || !String(rows[0].def).includes("SMART_BUTTONS")) {
      console.error("Migration verification FAILED");
      process.exit(1);
    }
    console.log("Migration 029 complete!");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
```

- [ ] **Step 3: Verify the dry run only touches nothing**

Run: `node scripts/run-029-migration.cjs`
Expected: `Target DB host: ep-billowing-meadow-…` followed by `Dry run. SQL that would run:` and the SQL. **Do not pass `--yes` here.**

- [ ] **Step 4: Commit**

```bash
git add scripts/029-checkout-flow-smart-buttons.sql scripts/run-029-migration.cjs
git commit -m "feat(db): migration 029 allows the SMART_BUTTONS checkout flow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `lib/smart-buttons.ts` — URLs, frame origins, CSP and the request decision

**Files:**
- Create: `lib/smart-buttons.ts`
- Test: `<SCRATCHPAD>/smart-buttons-harness/test-smart-buttons-decide.mjs`

**Interfaces:**
- Consumes: `resolveShieldBaseUrl(shieldDomain): string` from `lib/masking.ts:352`.
- Produces (all exported from `lib/smart-buttons.ts`):
  - `BUTTONS_PATH = "/checkout/buttons"`, `MESSAGE_SOURCE = "paydef-buttons"`, `SDK_INTEGRATION_DATE = "2026-10-08"`
  - `buildSmartButtonsUrl(shieldDomain: string | null | undefined, transactionId: string, executeToken: string | null): string`
  - `frameAncestorOrigins(urls: Array<string | null | undefined>): string[]`
  - `frameAncestorsCsp(origins: string[]): string`
  - `toSdkIntent(intent: string | null | undefined): "capture" | "authorize"`
  - `isTransactionRef(ref: unknown): ref is string`
  - `interface ButtonSessionRow { id; status; intent; original_currency; paypal_order_id; checkout_expires_at; merchant_success_url; merchant_cancel_url; client_id }`
  - `interface ButtonPageConfig { transactionId; executeToken: string | null; paypalOrderId; clientId; currency; intent: "capture" | "authorize"; successUrl: string | null; cancelUrl: string | null }`
  - `type ButtonErrorCode = "invalid_ref" | "not_found" | "invalid_token" | "not_pending" | "expired" | "no_paypal_order" | "framing_not_configured"`
  - `type ButtonPageDecision = { kind: "render"; config: ButtonPageConfig; allowedOrigins: string[] } | { kind: "error"; status: number; code: ButtonErrorCode; allowedOrigins: string[] }`
  - `decideButtonPage(input: { row: ButtonSessionRow | null; executeToken: string | null; tokenShouldBlock: boolean; now: Date }): ButtonPageDecision`

- [ ] **Step 1: Write the failing test**

`test-smart-buttons-decide.mjs`:

```js
import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")

const TX = "11111111-2222-3333-4444-555555555555"

// buildSmartButtonsUrl
assert.equal(
  sb.buildSmartButtonsUrl("pay.example.com", TX, "abc"),
  `https://pay.example.com/checkout/buttons?ref=${TX}&et=abc`
)
assert.equal(
  sb.buildSmartButtonsUrl("pay.example.com", TX, null),
  `https://pay.example.com/checkout/buttons?ref=${TX}`
)
assert.ok(sb.buildSmartButtonsUrl(null, TX, null).startsWith("https://checkout.service-portal.com/checkout/buttons?"))

// frameAncestorOrigins — https always, http only for local dev hosts, dedupe, junk ignored
assert.deepEqual(
  sb.frameAncestorOrigins([
    "https://shop.example.com/checkout/order-received/12?key=x",
    "https://shop.example.com/cart",
    "http://evil.example.com/",
    "http://localhost:4101/thanks",
    "http://127.0.0.1:8080/",
    "javascript:alert(1)",
    "not a url",
    null,
    undefined,
    "",
  ]),
  ["https://shop.example.com", "http://localhost:4101", "http://127.0.0.1:8080"]
)

// frameAncestorsCsp
assert.equal(sb.frameAncestorsCsp(["https://a.com", "https://b.com"]), "frame-ancestors https://a.com https://b.com")
assert.equal(sb.frameAncestorsCsp([]), "frame-ancestors 'none'")

// toSdkIntent
assert.equal(sb.toSdkIntent("AUTHORIZE"), "authorize")
assert.equal(sb.toSdkIntent("CAPTURE"), "capture")
assert.equal(sb.toSdkIntent(null), "capture")

// isTransactionRef
assert.equal(sb.isTransactionRef(TX), true)
assert.equal(sb.isTransactionRef("1; DROP TABLE"), false)
assert.equal(sb.isTransactionRef(null), false)

// decideButtonPage
const NOW = new Date("2026-10-08T12:00:00Z")
const ROW = {
  id: TX,
  status: "PENDING",
  intent: "AUTHORIZE",
  original_currency: "EUR",
  paypal_order_id: "5O190127TN364715T",
  checkout_expires_at: "2026-10-08T12:20:00Z",
  merchant_success_url: "https://shop.example.com/thanks",
  merchant_cancel_url: "https://shop.example.com/cart",
  client_id: "AbCdClientId",
}
const ok = sb.decideButtonPage({ row: ROW, executeToken: "tok", tokenShouldBlock: false, now: NOW })
assert.equal(ok.kind, "render")
assert.deepEqual(ok.allowedOrigins, ["https://shop.example.com"])
assert.deepEqual(ok.config, {
  transactionId: TX,
  executeToken: "tok",
  paypalOrderId: "5O190127TN364715T",
  clientId: "AbCdClientId",
  currency: "EUR",
  intent: "authorize",
  successUrl: "https://shop.example.com/thanks",
  cancelUrl: "https://shop.example.com/cart",
})

const err = (input) => {
  const d = sb.decideButtonPage({ row: ROW, executeToken: "tok", tokenShouldBlock: false, now: NOW, ...input })
  assert.equal(d.kind, "error")
  return [d.status, d.code]
}
assert.deepEqual(err({ row: null }), [404, "not_found"])
assert.deepEqual(err({ tokenShouldBlock: true }), [403, "invalid_token"])
assert.deepEqual(err({ row: { ...ROW, status: "COMPLETED" } }), [409, "not_pending"])
assert.deepEqual(err({ row: { ...ROW, checkout_expires_at: "2026-10-08T11:59:59Z" } }), [410, "expired"])
assert.deepEqual(err({ row: { ...ROW, paypal_order_id: null } }), [409, "no_paypal_order"])
assert.deepEqual(
  err({ row: { ...ROW, merchant_success_url: null, merchant_cancel_url: "http://shop.example.com/" } }),
  [409, "framing_not_configured"]
)
// error decisions still carry the origins so the error page can tell the parent
assert.deepEqual(
  sb.decideButtonPage({ row: { ...ROW, status: "COMPLETED" }, executeToken: null, tokenShouldBlock: false, now: NOW }).allowedOrigins,
  ["https://shop.example.com"]
)
// currency fallback
const noCur = sb.decideButtonPage({ row: { ...ROW, original_currency: null }, executeToken: null, tokenShouldBlock: false, now: NOW })
assert.equal(noCur.config.currency, "USD")

console.log("PASS test-smart-buttons-decide")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-smart-buttons-decide.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/smart-buttons.ts`.

- [ ] **Step 3: Implement**

`lib/smart-buttons.ts`:

```ts
/**
 * lib/smart-buttons.ts — PayPal Smart Payment Buttons framed from the shield
 * domain (stores.checkout_flow = SMART_BUTTONS).
 *
 * The merchant still calls /api/gateway/checkout with the final amount, so
 * account rotation, limits, masking and the PayPal order are produced exactly
 * as for REDIRECT. Only the approval step moves: instead of leaving for
 * approvalUrl, the storefront frames embedUrl, which renders PayPal's own
 * buttons with the client-id of the account that already owns the order.
 *
 * Pure functions only. The DB read lives in app/checkout/buttons/route.ts.
 */

import { resolveShieldBaseUrl } from "@/lib/masking"

export const BUTTONS_PATH = "/checkout/buttons"
export const MESSAGE_SOURCE = "paydef-buttons"

// PayPal requires an integration date whenever client-id changes dynamically
// (here: per rotated merchant account). Pin it; do not make it "today".
export const SDK_INTEGRATION_DATE = "2026-10-08"

export function buildSmartButtonsUrl(
  shieldDomain: string | null | undefined,
  transactionId: string,
  executeToken: string | null
): string {
  const params = new URLSearchParams({ ref: transactionId })
  if (executeToken) params.set("et", executeToken)
  return `${resolveShieldBaseUrl(shieldDomain)}${BUTTONS_PATH}?${params.toString()}`
}

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"])

/**
 * Origins allowed to frame the buttons page: the merchant's own return URLs.
 * https only, except plain-http local dev hosts.
 */
export function frameAncestorOrigins(urls: Array<string | null | undefined>): string[] {
  const origins = new Set<string>()
  for (const raw of urls) {
    if (!raw) continue
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    const allowed =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOCAL_DEV_HOSTS.has(url.hostname))
    if (allowed) origins.add(url.origin)
  }
  return [...origins]
}

export function frameAncestorsCsp(origins: string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(" ") : "'none'"}`
}

export function toSdkIntent(intent: string | null | undefined): "capture" | "authorize" {
  return intent === "AUTHORIZE" ? "authorize" : "capture"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isTransactionRef(ref: unknown): ref is string {
  return typeof ref === "string" && UUID_RE.test(ref)
}

export interface ButtonSessionRow {
  id:                   string
  status:               string
  intent:               string | null
  original_currency:    string | null
  paypal_order_id:      string | null
  checkout_expires_at:  string | Date | null
  merchant_success_url: string | null
  merchant_cancel_url:  string | null
  client_id:            string
}

export interface ButtonPageConfig {
  transactionId: string
  executeToken:  string | null
  paypalOrderId: string
  clientId:      string
  currency:      string
  intent:        "capture" | "authorize"
  successUrl:    string | null
  cancelUrl:     string | null
}

export type ButtonErrorCode =
  | "invalid_ref"
  | "not_found"
  | "invalid_token"
  | "not_pending"
  | "expired"
  | "no_paypal_order"
  | "framing_not_configured"

export type ButtonPageDecision =
  | { kind: "render"; config: ButtonPageConfig; allowedOrigins: string[] }
  | { kind: "error"; status: number; code: ButtonErrorCode; allowedOrigins: string[] }

export function decideButtonPage(input: {
  row: ButtonSessionRow | null
  executeToken: string | null
  tokenShouldBlock: boolean
  now: Date
}): ButtonPageDecision {
  const { row } = input
  if (!row) return { kind: "error", status: 404, code: "not_found", allowedOrigins: [] }

  const allowedOrigins = frameAncestorOrigins([row.merchant_success_url, row.merchant_cancel_url])
  const fail = (status: number, code: ButtonErrorCode): ButtonPageDecision =>
    ({ kind: "error", status, code, allowedOrigins })

  if (input.tokenShouldBlock) return fail(403, "invalid_token")
  if (row.status !== "PENDING") return fail(409, "not_pending")
  if (row.checkout_expires_at && new Date(row.checkout_expires_at).getTime() <= input.now.getTime()) {
    return fail(410, "expired")
  }
  if (!row.paypal_order_id) return fail(409, "no_paypal_order")
  if (allowedOrigins.length === 0) return fail(409, "framing_not_configured")

  return {
    kind: "render",
    allowedOrigins,
    config: {
      transactionId: row.id,
      executeToken:  input.executeToken,
      paypalOrderId: row.paypal_order_id,
      clientId:      row.client_id.trim(),
      currency:      (row.original_currency || "USD").toUpperCase(),
      intent:        toSdkIntent(row.intent),
      successUrl:    row.merchant_success_url,
      cancelUrl:     row.merchant_cancel_url,
    },
  }
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-smart-buttons-decide.mjs`
Expected: `PASS test-smart-buttons-decide`

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`

- [ ] **Step 5: Commit**

```bash
git add lib/smart-buttons.ts
git commit -m "feat(smart-buttons): decide whether a transaction may show framed PayPal buttons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `lib/smart-buttons.ts` — render the buttons page and the error page

**Files:**
- Modify: `lib/smart-buttons.ts` (append)
- Test: `<SCRATCHPAD>/smart-buttons-harness/test-smart-buttons-render.mjs`

**Interfaces:**
- Consumes: `ButtonPageConfig`, `ButtonErrorCode`, `MESSAGE_SOURCE`, `SDK_INTEGRATION_DATE` (Task 4).
- Produces:
  - `buildSdkUrl(c: Pick<ButtonPageConfig, "clientId" | "currency" | "intent">): string`
  - `renderButtonsPage(config: ButtonPageConfig, allowedOrigins: string[]): string`
  - `renderButtonsErrorPage(code: ButtonErrorCode, allowedOrigins: string[]): string`

- [ ] **Step 1: Write the failing test**

`test-smart-buttons-render.mjs`:

```js
import assert from "node:assert/strict"
const sb = await import("@/lib/smart-buttons")

const CFG = {
  transactionId: "11111111-2222-3333-4444-555555555555",
  executeToken: "tok123",
  paypalOrderId: "5O190127TN364715T",
  clientId: "AbC-d_123",
  currency: "EUR",
  intent: "authorize",
  successUrl: "https://shop.example.com/thanks",
  cancelUrl: "https://shop.example.com/cart",
}
const ORIGINS = ["https://shop.example.com"]

// SDK URL
const sdk = sb.buildSdkUrl(CFG)
const u = new URL(sdk)
assert.equal(u.origin + u.pathname, "https://www.paypal.com/sdk/js")
assert.equal(u.searchParams.get("client-id"), "AbC-d_123")
assert.equal(u.searchParams.get("currency"), "EUR")
assert.equal(u.searchParams.get("intent"), "authorize")
assert.equal(u.searchParams.get("components"), "buttons")
assert.equal(u.searchParams.get("integration-date"), "2026-10-08")

// Page
const html = sb.renderButtonsPage(CFG, ORIGINS)
assert.ok(html.startsWith("<!doctype html>"))
assert.ok(html.includes(sdk.replace(/&/g, "&amp;")), "SDK src must be the HTML-escaped SDK URL")
assert.ok(html.includes('"paypalOrderId":"5O190127TN364715T"'))
assert.ok(html.includes('["https://shop.example.com"]'))
assert.ok(html.includes("/api/gateway/execute"))
assert.ok(html.includes("/api/gateway/browser-status/"))
assert.ok(html.includes('id="paydef-buttons"'))
assert.ok(html.includes('target="_top"'), "fallback Continue link must navigate the top window")
// Review Focus 1: a cancel in the PayPal popup must NOT cancel the transaction
assert.equal(html.includes("browser-result"), false)
// Never broadcast
assert.equal(/postMessage\([^)]*["']\*["']/.test(html), false)

// Review Focus 2: hostile values cannot break out of the inline script or attribute
const evil = sb.renderButtonsPage(
  { ...CFG, paypalOrderId: '</script><script>alert(1)</script>', successUrl: 'https://x.com/"><img src=x onerror=alert(2)>', clientId: 'a"b<c' },
  ORIGINS
)
assert.equal(evil.includes("</script><script>alert(1)"), false)
assert.equal(evil.includes("<img src=x"), false)
assert.equal(evil.includes('client-id=a"b'), false)
assert.equal((evil.match(/<\/script>/g) || []).length, (html.match(/<\/script>/g) || []).length)

// Error page (Review Focus 4)
const errHtml = sb.renderButtonsErrorPage("expired", ORIGINS)
assert.ok(errHtml.includes('"expired"'))
assert.ok(errHtml.includes('"error"'))
assert.ok(errHtml.includes('["https://shop.example.com"]'))
assert.equal(errHtml.includes("paypal.com/sdk"), false)

console.log("PASS test-smart-buttons-render")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-smart-buttons-render.mjs`
Expected: FAIL with `TypeError: sb.buildSdkUrl is not a function`.

- [ ] **Step 3: Implement (append to `lib/smart-buttons.ts`)**

```ts
// ─── HTML rendering ───────────────────────────────────────────────────────────

export function buildSdkUrl(c: Pick<ButtonPageConfig, "clientId" | "currency" | "intent">): string {
  const params = new URLSearchParams({
    "client-id":        c.clientId,
    currency:           c.currency,
    intent:             c.intent,
    components:         "buttons",
    "integration-date": SDK_INTEGRATION_DATE,
  })
  return `https://www.paypal.com/sdk/js?${params.toString()}`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// JSON that is safe inside an inline <script>: no "</script>", no HTML comment
// openers, no JS line terminators.
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

const PAGE_STYLE =
  "html,body{margin:0;padding:0;background:transparent;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#333}" +
  "#paydef-status{margin:6px 2px 0;min-height:1em;font-size:13px;color:#555}" +
  "#paydef-continue{display:inline-block;margin-top:8px}"

// Shared by both pages: posts to every allowed origin explicitly (never "*");
// the browser silently drops the ones that are not the parent.
const POST_FN = `
  function post(msg) {
    msg.source = ${scriptJson(MESSAGE_SOURCE)};
    msg.transactionId = CFG.transactionId;
    for (var i = 0; i < ORIGINS.length; i++) {
      try { window.parent.postMessage(msg, ORIGINS[i]); } catch (e) {}
    }
  }`

export function renderButtonsPage(config: ButtonPageConfig, allowedOrigins: string[]): string {
  const sdkSrc = escapeAttr(buildSdkUrl(config))
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div id="paydef-buttons"></div>
<p id="paydef-status" role="status"></p>
<a id="paydef-continue" target="_top" hidden>Continue</a>
<script src="${sdkSrc}"></script>
<script>
(function () {
  var CFG = ${scriptJson(config)};
  var ORIGINS = ${scriptJson(allowedOrigins)};
  var SUCCESS = ["AUTHORIZED", "COMPLETED"];
  var FAILURE = ["FAILED", "REFUNDED", "DISPUTED", "CANCELED", "EXPIRED"];
  var statusEl = document.getElementById("paydef-status");
  var busy = false;
${POST_FN}
  function say(text) { statusEl.textContent = text; }
  function returnUrl(base, s) {
    if (!base) return null;
    try {
      var u = new URL(base);
      u.searchParams.set("transaction_id", s.transaction_id);
      u.searchParams.set("status", s.status);
      if (s.paypal_order_id) u.searchParams.set("paypal_order_id", s.paypal_order_id);
      return u.toString();
    } catch (e) { return null; }
  }
  function showContinue(url) {
    if (!url) return;
    var a = document.getElementById("paydef-continue");
    a.href = url;
    a.hidden = false;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function finalStatus() {
    for (var i = 0; i < 20; i++) {
      try {
        var r = await fetch("/api/gateway/browser-status/" + encodeURIComponent(CFG.transactionId), { cache: "no-store" });
        var s = await r.json();
        if (r.ok && (SUCCESS.indexOf(s.status) >= 0 || FAILURE.indexOf(s.status) >= 0)) return s;
      } catch (e) {}
      await sleep(1500);
    }
    return null;
  }
  async function execute() {
    say("Confirming payment\\u2026");
    try {
      await fetch("/api/gateway/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ transactionId: CFG.transactionId, executeToken: CFG.executeToken || undefined })
      });
    } catch (e) {}
    var s = await finalStatus();
    if (!s) { say("Payment is still processing."); post({ type: "pending" }); return; }
    var ok = SUCCESS.indexOf(s.status) >= 0;
    var url = returnUrl(ok ? CFG.successUrl : CFG.cancelUrl, s);
    say(ok ? "Payment confirmed." : "Payment was not completed.");
    showContinue(url);
    post({ type: ok ? "approved" : "failed", status: s.status, redirectUrl: url });
  }

  if (!window.paypal || !window.paypal.Buttons) {
    say("PayPal could not be loaded.");
    post({ type: "error", code: "sdk_load_failed" });
    return;
  }

  window.paypal.Buttons({
    // The order already exists (created by /api/gateway/checkout on this exact
    // account), so the button just hands PayPal its id.
    createOrder: function () { return CFG.paypalOrderId; },
    onApprove: function () {
      if (busy) return;
      busy = true;
      return execute();
    },
    // Deliberately NOT /api/gateway/browser-result: the buyer may click again
    // and PayPal reuses the same order. Expiry is the 30-minute sweep's job.
    onCancel: function () { post({ type: "cancelled" }); },
    onError: function (err) {
      say("PayPal reported an error.");
      post({ type: "error", code: "paypal_error", message: String((err && err.message) || err).slice(0, 200) });
    }
  }).render("#paydef-buttons").then(function () {
    post({ type: "ready" });
  }).catch(function () {
    post({ type: "error", code: "render_failed" });
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      post({ type: "resize", height: document.documentElement.scrollHeight });
    }).observe(document.body);
  }
})();
</script>
</body>
</html>`
}

export function renderButtonsErrorPage(code: ButtonErrorCode, allowedOrigins: string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<p id="paydef-status" role="status">This checkout session is no longer available.</p>
<script>
(function () {
  var CFG = { transactionId: null };
  var ORIGINS = ${scriptJson(allowedOrigins)};
${POST_FN}
  post({ type: "error", code: ${scriptJson(code)} });
})();
</script>
</body>
</html>`
}
```

Note: inside the template literal, `\\u2026` is written with a double backslash so that the emitted JS contains the escape `\u2026` (…), not a raw character.

- [ ] **Step 4: Run both smart-buttons tests and the type check**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-smart-buttons-render.mjs && node --experimental-strip-types --import ./alias-hook.mjs test-smart-buttons-decide.mjs`
Expected: `PASS test-smart-buttons-render` then `PASS test-smart-buttons-decide`

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`

- [ ] **Step 5: Commit**

```bash
git add lib/smart-buttons.ts
git commit -m "feat(smart-buttons): render the framed PayPal buttons page and its error page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Checkout returns `embedUrl` for SMART_BUTTONS; Stripe/Shopify fall back to REDIRECT

**Files:**
- Modify: `lib/checkout-flow.ts` (append `buildFlowUrls`)
- Modify: `app/api/gateway/checkout/route.ts:52-56` (imports), `:346-379` (provider branches), `:417-420` (locals), `:1268-1272` (URL building), `:1355-1368` (response)
- Test: `<SCRATCHPAD>/smart-buttons-harness/test-flow-urls.mjs`

**Interfaces:**
- Consumes: `buildPopupBridgeUrl` (existing), `buildSmartButtonsUrl` (Task 4), `effectiveFlowForProvider` (Task 2).
- Produces: `buildFlowUrls(input: { flow: CheckoutFlow; shieldDomain: string | null | undefined; approvalUrl: string; transactionId: string; executeToken: string | null }): { popupUrl: string | null; popupOrigin: string | null; embedUrl: string | null; embedOrigin: string | null }`. The checkout response gains `embedUrl` and `embedOrigin`.

- [ ] **Step 1: Write the failing test**

`test-flow-urls.mjs`:

```js
import assert from "node:assert/strict"
const { buildFlowUrls } = await import("@/lib/checkout-flow")

const TX = "11111111-2222-3333-4444-555555555555"
const base = { shieldDomain: "pay.example.com", approvalUrl: "https://www.paypal.com/checkoutnow?token=X", transactionId: TX, executeToken: "et1" }

assert.deepEqual(buildFlowUrls({ ...base, flow: "REDIRECT" }), { popupUrl: null, popupOrigin: null, embedUrl: null, embedOrigin: null })

const popup = buildFlowUrls({ ...base, flow: "POPUP_BRIDGE" })
assert.ok(popup.popupUrl.startsWith("https://pay.example.com/checkout/popup?"))
assert.equal(popup.popupOrigin, "https://pay.example.com")
assert.equal(popup.embedUrl, null)
assert.equal(popup.embedOrigin, null)

const sb = buildFlowUrls({ ...base, flow: "SMART_BUTTONS" })
assert.equal(sb.embedUrl, `https://pay.example.com/checkout/buttons?ref=${TX}&et=et1`)
assert.equal(sb.embedOrigin, "https://pay.example.com")
assert.equal(sb.popupUrl, null)
assert.equal(sb.popupOrigin, null)

console.log("PASS test-flow-urls")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-flow-urls.mjs`
Expected: FAIL. `TypeError: buildFlowUrls is not a function`

- [ ] **Step 3: Implement `buildFlowUrls`**

In `lib/checkout-flow.ts`, add the import under the existing ones:

```ts
import { buildSmartButtonsUrl } from "@/lib/smart-buttons"
```

and append:

```ts
/**
 * Presentation URLs for one checkout. approvalUrl is never altered: every
 * flow still returns it, so integrations that ignore popupUrl/embedUrl keep
 * redirecting exactly as before.
 */
export function buildFlowUrls(input: {
  flow: CheckoutFlow
  shieldDomain: string | null | undefined
  approvalUrl: string
  transactionId: string
  executeToken: string | null
}): { popupUrl: string | null; popupOrigin: string | null; embedUrl: string | null; embedOrigin: string | null } {
  if (input.flow === "POPUP_BRIDGE") {
    const popupUrl = buildPopupBridgeUrl(input.shieldDomain, input.approvalUrl, input.transactionId)
    return { popupUrl, popupOrigin: new URL(popupUrl).origin, embedUrl: null, embedOrigin: null }
  }
  if (input.flow === "SMART_BUTTONS") {
    const embedUrl = buildSmartButtonsUrl(input.shieldDomain, input.transactionId, input.executeToken)
    return { popupUrl: null, popupOrigin: null, embedUrl, embedOrigin: new URL(embedUrl).origin }
  }
  return { popupUrl: null, popupOrigin: null, embedUrl: null, embedOrigin: null }
}
```

- [ ] **Step 4: Run the test**

Run: `node --experimental-strip-types --import ./alias-hook.mjs test-flow-urls.mjs`
Expected: `PASS test-flow-urls`. Also re-run `test-checkout-flow.mjs`: `PASS`.

- [ ] **Step 5: Wire it into the checkout route**

`app/api/gateway/checkout/route.ts`:

(a) Imports, lines 52-56. Replace:

```ts
import {
  buildPopupBridgeUrl,
  getCheckoutPreferences,
  resolveCheckoutFlow,
} from "@/lib/checkout-flow"
```

with:

```ts
import {
  buildFlowUrls,
  effectiveFlowForProvider,
  getCheckoutPreferences,
  resolveCheckoutFlow,
} from "@/lib/checkout-flow"
```

(b) Provider branches. In the `handleStripeCheckout({ … })` call (around line 347) and the `handleShopifyCheckout({ … })` call (around line 366), replace the line `      flow,` in each with:

```ts
      flow: effectiveFlowForProvider(flow, store.providerType),
```

(c) Locals, around line 419. Directly after `let popupOrigin:   string | null = null` add:

```ts
  let embedUrl:      string | null = null
  let embedOrigin:   string | null = null
```

(d) URL building, around lines 1268-1272. Replace:

```ts
    approvalUrl = getApprovalUrl(paypalOrder)
    if (flow === "POPUP_BRIDGE") {
      popupUrl = buildPopupBridgeUrl(finalShieldDomain, approvalUrl, transactionId)
      popupOrigin = new URL(popupUrl).origin
    }
```

with:

```ts
    approvalUrl = getApprovalUrl(paypalOrder)
    ;({ popupUrl, popupOrigin, embedUrl, embedOrigin } = buildFlowUrls({
      flow,
      shieldDomain: finalShieldDomain,
      approvalUrl,
      transactionId,
      executeToken,
    }))
```

(`executeToken` is the `const` from line 973 in the same loop iteration; `finalShieldDomain` is the domain the return URLs were built from, so the iframe is served from the same shield host PayPal will see.)

(e) Response, around line 1355. In the success `NextResponse.json({ … })`, directly after `popupOrigin,` add:

```ts
      embedUrl,
      embedOrigin,
```

- [ ] **Step 6: Type check**

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`. Then: `grep -n "buildPopupBridgeUrl" app/api/gateway/checkout/route.ts` should print nothing (the import is gone and nothing else uses it).

- [ ] **Step 7: Commit**

```bash
git add lib/checkout-flow.ts app/api/gateway/checkout/route.ts
git commit -m "feat(gateway): return embedUrl for SMART_BUTTONS stores, keep approvalUrl for all

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `GET /checkout/buttons` route + shield-domain passthrough

**Files:**
- Create: `app/checkout/buttons/route.ts`
- Modify: `middleware.ts:53-60`

**Interfaces:**
- Consumes: `getSql` (`lib/neon.ts`), `createLogger` (`lib/logger.ts`), `verifyExecuteToken(transactionId, token): { valid; reason; shouldBlock }` (`lib/execute-token.ts`), and from Task 4/5: `isTransactionRef`, `decideButtonPage`, `frameAncestorsCsp`, `renderButtonsPage`, `renderButtonsErrorPage`, `ButtonSessionRow`.
- Produces: `GET /checkout/buttons?ref=<uuid>&et=<token>` → `text/html` with `Content-Security-Policy: frame-ancestors …` and `Cache-Control: no-store`.

- [ ] **Step 1: Write the route**

`app/checkout/buttons/route.ts`:

```ts
/**
 * GET /checkout/buttons?ref=<transactionId>&et=<executeToken>
 *
 * Shield-domain page framed by the merchant storefront when the store's
 * checkout_flow is SMART_BUTTONS. Renders PayPal's own buttons for the order
 * /api/gateway/checkout already created, with that order's account client-id.
 *
 * A Route Handler (not a page) so every response can carry its own
 * frame-ancestors CSP, built from this transaction's merchant return URLs.
 * See lib/smart-buttons.ts.
 */

import { NextRequest } from "next/server"
import { getSql } from "@/lib/neon"
import { createLogger } from "@/lib/logger"
import { verifyExecuteToken } from "@/lib/execute-token"
import {
  type ButtonSessionRow,
  decideButtonPage,
  frameAncestorsCsp,
  isTransactionRef,
  renderButtonsErrorPage,
  renderButtonsPage,
} from "@/lib/smart-buttons"

export const dynamic = "force-dynamic"

const log = createLogger({ route: "/checkout/buttons" })

function htmlResponse(body: string, status: number, origins: string[]): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type":            "text/html; charset=utf-8",
      "Cache-Control":           "no-store",
      "Content-Security-Policy": frameAncestorsCsp(origins),
      "X-Content-Type-Options":  "nosniff",
    },
  })
}

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref")
  const et  = req.nextUrl.searchParams.get("et")

  if (!isTransactionRef(ref)) {
    return htmlResponse(renderButtonsErrorPage("invalid_ref", []), 400, [])
  }

  const rows = (await getSql()`
    SELECT t.id, t.status, t.intent, t.original_currency, t.paypal_order_id,
           t.checkout_expires_at, t.merchant_success_url, t.merchant_cancel_url,
           ma.client_id
    FROM   transactions t
    JOIN   merchant_accounts ma ON ma.id = t.merchant_id
    WHERE  t.id = ${ref}
    LIMIT  1
  `) as unknown as ButtonSessionRow[]

  const token = verifyExecuteToken(ref, et)
  const decision = decideButtonPage({
    row: rows[0] ?? null,
    executeToken: et,
    tokenShouldBlock: token.shouldBlock,
    now: new Date(),
  })

  if (decision.kind === "error") {
    log.warn("smart_buttons.refused", `Buttons page refused tx=${ref} code=${decision.code}`, {
      transactionId: ref,
      code: decision.code,
      tokenReason: token.reason,
    })
    return htmlResponse(
      renderButtonsErrorPage(decision.code, decision.allowedOrigins),
      decision.status,
      decision.allowedOrigins
    )
  }

  log.info("smart_buttons.rendered", `Buttons page rendered tx=${ref} intent=${decision.config.intent}`, {
    transactionId: ref,
    originCount: decision.allowedOrigins.length,
    tokenReason: token.reason,
  })
  return htmlResponse(renderButtonsPage(decision.config, decision.allowedOrigins), 200, decision.allowedOrigins)
}
```

- [ ] **Step 2: Let it through on shield hosts**

`middleware.ts`, the `SHIELD_PASSTHROUGH_PREFIXES` array (lines 53-60). Add `"/checkout/buttons",` directly after `"/checkout/popup",`:

```ts
const SHIELD_PASSTHROUGH_PREFIXES = [
  "/checkout/popup",
  "/checkout/buttons",
  "/order/success",
  "/order/cancel",
  "/api/gateway",
  "/api/webhook",
  "/api/health/shield-popup",
]
```

Without this, a shield host redirects `/checkout/buttons` to `/` (`redirectShieldToHome`), and the iframe shows the decoy storefront.

- [ ] **Step 3: Type check**

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`

- [ ] **Step 4: Check the no-DB path locally, without touching data**

⚠️ `npm run dev` reads the **production** DB. The request below hits only the `invalid_ref` branch, which returns before any query, so it is safe.

```bash
cd "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard"
npx next dev -p 3002   # in the background
curl -s -D - "http://localhost:3002/checkout/buttons?ref=nope" -o /dev/null
```

Expected headers include `HTTP/1.1 400`, `content-security-policy: frame-ancestors 'none'`, `cache-control: no-store`, and **no** `x-frame-options`. Stop the dev server afterwards.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/buttons/route.ts middleware.ts
git commit -m "feat(shield): serve framed PayPal buttons at /checkout/buttons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Stores slide-over — third option, provider gating, hints

**Files:**
- Modify: `lib/i18n/stores.ts` (EN block after line 85, VI block after line 246)
- Modify: `app/stores/page.tsx:40-55`, `:1438-1470`

**Interfaces:**
- Consumes: `/api/merchant/stores/[id]` PATCH (already passes `checkoutFlow` through `normalizeCheckoutFlow`, which accepts `SMART_BUTTONS` since Task 2).
- Produces: i18n keys `smartButtonsLabel`, `smartButtonsDesc`, `smartButtonsBadge`, `smartButtonsPaypalOnly`, `smartButtonsHowTo`, `smartButtonsDocsLink`, `smartButtonsNeedsReturnUrl`.

- [ ] **Step 1: Add the copy**

`lib/i18n/stores.ts`, EN block. Directly after the `checkoutExpWarning: …,` line (85) insert:

```ts
    smartButtonsLabel: "Smart Buttons (iframe)",
    smartButtonsDesc: "PayPal buttons appear inside the storefront in an iframe from the shield domain. The buyer never leaves the page.",
    smartButtonsBadge: "PayPal",
    smartButtonsPaypalOnly: "Available for PayPal stores only.",
    smartButtonsHowTo: "Smart Buttons needs the storefront to embed embedUrl (see the API docs). Until it does, buyers keep getting the redirect.",
    smartButtonsDocsLink: "API docs",
    smartButtonsNeedsReturnUrl: "Smart Buttons needs a Success or Cancel return URL: the iframe only loads on that site.",
```

VI block. Directly after its `checkoutExpWarning: …,` line (246) insert:

```ts
    smartButtonsLabel: "Smart Buttons (iframe)",
    smartButtonsDesc: "Nút PayPal hiện ngay trong trang cửa hàng qua iframe từ tên miền shield. Người mua không rời khỏi trang.",
    smartButtonsBadge: "PayPal",
    smartButtonsPaypalOnly: "Chỉ dùng được cho cửa hàng PayPal.",
    smartButtonsHowTo: "Smart Buttons cần cửa hàng nhúng embedUrl (xem tài liệu API). Khi chưa nhúng, người mua vẫn được chuyển hướng như cũ.",
    smartButtonsDocsLink: "Tài liệu API",
    smartButtonsNeedsReturnUrl: "Smart Buttons cần ít nhất một URL trả về (Success hoặc Cancel): iframe chỉ hiển thị trên đúng trang web đó.",
```

- [ ] **Step 2: Add the option**

`app/stores/page.tsx` line 40: replace

```ts
type CheckoutFlow = "REDIRECT" | "POPUP_BRIDGE"
```

with

```ts
type CheckoutFlow = "REDIRECT" | "POPUP_BRIDGE" | "SMART_BUTTONS"
```

and append a third entry to `CHECKOUT_FLOW_OPTIONS` (after the `POPUP_BRIDGE` entry, before `]`):

```ts
  {
    value: "SMART_BUTTONS",
    label: "Smart Buttons (iframe)",
    desc: "PayPal buttons appear inside the storefront in an iframe from the shield domain.",
  },
```

- [ ] **Step 3: Render it in the slide-over**

In `EditSlideOver`, replace the whole block from `<div className="grid grid-cols-1 gap-2">` (line ~1440) through the closing `)}` of the `checkoutExpWarning` paragraph (line ~1469) with:

```tsx
            <div className="grid grid-cols-1 gap-2">
              {CHECKOUT_FLOW_OPTIONS.map((option) => {
                const active = draft.checkoutFlow === option.value
                const unavailable =
                  option.value === "SMART_BUTTONS" &&
                  (draft.providerType === "STRIPE" || draft.providerType === "SHOPIFY")
                const label =
                  option.value === "REDIRECT" ? t.classicRedirectLabel
                  : option.value === "POPUP_BRIDGE" ? t.popupBridgeLabel
                  : t.smartButtonsLabel
                const desc =
                  option.value === "REDIRECT" ? t.classicRedirectDesc
                  : option.value === "POPUP_BRIDGE" ? t.popupBridgeDesc
                  : t.smartButtonsDesc
                return (
                  <button
                    key={option.value}
                    disabled={unavailable}
                    onClick={() => update({ checkoutFlow: option.value, checkoutFlowOverride: true })}
                    className={`text-left p-3 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                        : "border-[#343947] bg-[#1a1d24] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full border-2 flex-shrink-0 ${active ? "border-[#FFD600] bg-[#FFD600]" : "border-[#97a3b6]"}`} />
                      <span className="text-xs font-mono font-semibold">{label}</span>
                      {option.value === "SMART_BUTTONS" && (
                        <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#343947] text-[#97a3b6]">
                          {t.smartButtonsBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono leading-relaxed pl-4">{desc}</p>
                    {unavailable && (
                      <p className="text-xs font-mono leading-relaxed pl-4 mt-1 text-[#97a3b6]">{t.smartButtonsPaypalOnly}</p>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-xs font-mono text-[#97a3b6]">
              {t.checkoutExpDesc}
            </p>
            {draft.checkoutFlow === "POPUP_BRIDGE" && !draft.successReturnUrl && !draft.cancelReturnUrl && (
              <p className="text-xs font-mono text-amber-400">
                {t.checkoutExpWarning}
              </p>
            )}
            {draft.checkoutFlow === "SMART_BUTTONS" && (
              <p className="text-xs font-mono text-[#97a3b6]">
                {t.smartButtonsHowTo}{" "}
                <a href="/docs/api#smart-buttons" className="text-[#FFD600] hover:underline">{t.smartButtonsDocsLink} →</a>
              </p>
            )}
            {draft.checkoutFlow === "SMART_BUTTONS" && !draft.successReturnUrl && !draft.cancelReturnUrl && (
              <p className="text-xs font-mono text-amber-400">
                {t.smartButtonsNeedsReturnUrl}
              </p>
            )}
```

- [ ] **Step 4: Type check**

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`. `app/stores/page.tsx` already has many baseline errors from radix typings; only *new* lines count.

- [ ] **Step 5: Look at it (read-only)**

⚠️ The dev server uses the production DB. Open the page and look, but **do not press Save**: until migration 029 is applied, saving `SMART_BUTTONS` would hit the old CHECK constraint.

Run `npx next dev -p 3002`, log in, open Stores → a PayPal store → slide-over. Expected: three cards; the third shows the `PayPal` badge; clicking it selects it and shows the ℹ hint, plus the ⚠ warning if both return URLs are empty. On a Stripe or Shopify store, the third card is greyed and unclickable, with "Available for PayPal stores only." Switch the dashboard language to VI and check the copy. Close without saving.

- [ ] **Step 6: Commit**

```bash
git add lib/i18n/stores.ts app/stores/page.tsx
git commit -m "feat(dashboard): Smart Buttons option in the store checkout-experience picker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Settings store cards — third option; platform default stays two

**Files:**
- Modify: `lib/i18n/settings.ts` (EN after line 40, VI after line 147)
- Modify: `app/settings/page.tsx:42-53`, `:80-106`, `:612-623`, `:876-920`

**Interfaces:**
- Consumes: `PATCH /api/merchant/stores/checkout-flow` (already normalises with `normalizeCheckoutFlow`); `GET /api/merchant/stores` (already returns `providerType`).
- Produces: i18n keys `smartButtons`, `smartButtonsDesc`, `smartButtonsPaypalOnly`.

- [ ] **Step 1: Add the copy**

`lib/i18n/settings.ts` EN, after `popupBridgeDesc: …,` (line 40):

```ts
    smartButtons: "Smart Buttons (iframe)",
    smartButtonsDesc: "PayPal buttons inside the storefront, served in an iframe from the shield domain.",
    smartButtonsPaypalOnly: "Available for PayPal stores only.",
```

VI, after its `popupBridgeDesc: …,` (line 147):

```ts
    smartButtons: "Smart Buttons (iframe)",
    smartButtonsDesc: "Nút PayPal nằm ngay trong trang cửa hàng, qua iframe từ tên miền shield.",
    smartButtonsPaypalOnly: "Chỉ dùng được cho cửa hàng PayPal.",
```

- [ ] **Step 2: A separate option list for store cards**

`app/settings/page.tsx`. Leave `CHECKOUT_FLOW_OPTIONS` (lines 42-53) as is; it still drives the super-admin **Default Checkout Experience** block (line ~1354), which must stay at two options. Directly after it, add:

```ts
// Per-store choices. SMART_BUTTONS is per-store opt-in only and never a
// platform default (see lib/checkout-flow.ts PLATFORM_DEFAULT_FLOW_VALUES).
const STORE_CHECKOUT_FLOW_VALUES = ["REDIRECT", "POPUP_BRIDGE", "SMART_BUTTONS"] as const
```

- [ ] **Step 3: Carry `providerType` on `MerchantStore`**

In `interface MerchantStore` (line ~80) add `providerType: string` after `checkoutFlowOverride: boolean`. In `interface MerchantStoreApiRow` (line ~91) add:

```ts
  providerType?: string | null
  provider_type?: string | null
```

In the `stores` mapping (line ~622), after the `checkoutFlowOverride:` line, add:

```ts
    providerType: s.providerType ?? s.provider_type ?? "PAYPAL",
```

- [ ] **Step 4: Label helpers**

Directly above `const handleCheckoutFlowChange = async` (line ~660), add:

```ts
  const flowLabel = (flow: string) =>
    flow === "POPUP_BRIDGE" ? t.popupBridge : flow === "SMART_BUTTONS" ? t.smartButtons : t.classicRedirect
  const flowDesc = (flow: string) =>
    flow === "POPUP_BRIDGE" ? t.popupBridgeDesc : flow === "SMART_BUTTONS" ? t.smartButtonsDesc : t.classicRedirectDesc
```

- [ ] **Step 5: Render four cards**

In the store card block (lines ~876-920):

(a) `<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">` → `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">`

(b) In the "Use Platform Default" card, replace

```tsx
                          {t.currentlyUsing} {store.checkoutFlow === "POPUP_BRIDGE" ? t.popupBridge : t.classicRedirect}.
```

with

```tsx
                          {t.currentlyUsing} {flowLabel(store.checkoutFlow)}.
```

(c) Replace the whole `{CHECKOUT_FLOW_OPTIONS.map((option) => { … })}` block for the store options with:

```tsx
                      {STORE_CHECKOUT_FLOW_VALUES.map((value) => {
                        const selected = store.checkoutFlowOverride && store.checkoutFlow === value
                        const unavailable =
                          value === "SMART_BUTTONS" &&
                          (store.providerType === "STRIPE" || store.providerType === "SHOPIFY")
                        return (
                          <button
                            key={value}
                            onClick={() => handleCheckoutFlowChange(store, value)}
                            disabled={checkoutFlowSaving === store.id || unavailable}
                            className={`text-left p-3 rounded-lg border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                              selected
                                ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                                : "border-[#343947] bg-[#151821] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${selected ? "border-[#FFD600] bg-[#FFD600]" : "border-[#343947]"}`} />
                              <span className="text-base font-semibold text-[#e7edf8]">{flowLabel(value)}</span>
                            </div>
                            <p className="text-sm text-[#aab4c5] leading-6 pl-4">
                              {unavailable ? t.smartButtonsPaypalOnly : flowDesc(value)}
                            </p>
                          </button>
                        )
                      })}
```

- [ ] **Step 6: Type check**

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`. Then: `grep -n "CHECKOUT_FLOW_OPTIONS" app/settings/page.tsx` should show only the definition and the super-admin default block.

- [ ] **Step 7: Look at it (read-only; do not click a flow card on prod before migration 029)**

Dev server → Settings as a merchant. Expected: each store card shows 4 options in a row on wide screens and 2×2 on medium; Smart Buttons is greyed with "Available for PayPal stores only." on Stripe/Shopify stores. As super-admin: **Default Checkout Experience** still shows exactly two options.

- [ ] **Step 8: Commit**

```bash
git add lib/i18n/settings.ts app/settings/page.tsx
git commit -m "feat(settings): Smart Buttons on per-store cards; platform default stays redirect/popup

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: API docs — `SMART_BUTTONS`, `embedUrl`, snippet, message contract

**Files:**
- Modify: `app/docs/api/page.tsx` (`checkoutResponse` const ~line 82, "Flow Rules" ~line 291, step 2 of "Recommended Flow" ~line 449, new section before `</main>`)

**Interfaces:**
- Consumes: the contract in this plan's Spec ("The merchant-side contract").
- Produces: an anchor `#smart-buttons` (the Stores slide-over links to `/docs/api#smart-buttons`).

- [ ] **Step 1: Response example**

In `const checkoutResponse`, after the `"popupOrigin": …,` line add:

```
  "embedUrl": null,
  "embedOrigin": null,
```

- [ ] **Step 2: Flow rules**

After `<div>`REDIRECT`: navigate to `approvalUrl`</div>` add:

```tsx
                      <div>`SMART_BUTTONS`: frame `embedUrl` (PayPal stores); on an `error` message fall back to `approvalUrl`</div>
```

- [ ] **Step 3: Recommended flow, step 2**

Replace the step-2 sentence with:

```tsx
                  2. Merchant frontend opens <span className="text-cyan-400">`popupUrl`</span> for `POPUP_BRIDGE`, frames <span className="text-cyan-400">`embedUrl`</span> for `SMART_BUTTONS`, or redirects to <span className="text-cyan-400">`approvalUrl`</span> for `REDIRECT`.
```

- [ ] **Step 4: New section**

Add, near the other consts at the top of the file:

```ts
const smartButtonsSnippet = `<div id="paydef-buttons"></div>
<script>
(function () {
  // Both values come from your backend's POST /api/gateway/checkout response.
  var embedUrl = "{{embedUrl}}";
  var approvalUrl = "{{approvalUrl}}";
  if (!embedUrl) { window.location.href = approvalUrl; return; }

  var origin = new URL(embedUrl).origin;
  var frame = document.createElement("iframe");
  frame.src = embedUrl;
  frame.allow = "payment";
  frame.title = "PayPal";
  frame.style.cssText = "width:100%;border:0;height:160px;";
  document.getElementById("paydef-buttons").appendChild(frame);

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.origin !== origin || !m || m.source !== "paydef-buttons") return;
    if (m.type === "resize" && m.height) frame.style.height = m.height + "px";
    if ((m.type === "approved" || m.type === "failed") && m.redirectUrl) window.location.href = m.redirectUrl;
    if (m.type === "error") window.location.href = approvalUrl; // fall back to the classic redirect
  });
})();
</script>`

const smartButtonsMessages = [
  { type: "ready", fields: "—", meaning: "Buttons rendered." },
  { type: "resize", fields: "height", meaning: "Content height in px; resize the iframe." },
  { type: "cancelled", fields: "—", meaning: "Buyer closed the PayPal popup. The transaction stays PENDING and the buttons stay usable." },
  { type: "approved", fields: "status, redirectUrl", meaning: "Payment COMPLETED or AUTHORIZED." },
  { type: "failed", fields: "status, redirectUrl", meaning: "Payment ended FAILED, CANCELED, EXPIRED or similar." },
  { type: "pending", fields: "—", meaning: "No final status after ~30 s. Rely on the webhook." },
  { type: "error", fields: "code, message?", meaning: "No buttons can be shown. Fall back to approvalUrl." },
]
```

Then, directly before `      </main>`, add:

```tsx
        <section id="smart-buttons" className="rounded-lg border border-border bg-card p-6">
          <SectionTitle
            icon={<ArrowRight className="h-5 w-5" />}
            eyebrow="PayPal Smart Buttons"
            title="Embed PayPal Buttons In Your Storefront (SMART_BUTTONS)"
            description="Turn on Smart Buttons for a PayPal store under Stores → Checkout Experience. Your backend calls the checkout API as usual; the response then also contains embedUrl. Frame it where you would have redirected. The page only loads on the origin of your store's Success / Cancel return URL, so at least one must be set."
          />
          <div className="mt-5 space-y-4">
            <CodeBlock code={smartButtonsSnippet} language="html" />
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-[11px] leading-6">
                <thead className="bg-background text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">type</th>
                    <th className="px-4 py-2 font-medium">fields</th>
                    <th className="px-4 py-2 font-medium">meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {smartButtonsMessages.map((m) => (
                    <tr key={m.type} className="border-t border-border">
                      <td className="px-4 py-2 text-cyan-400">{m.type}</td>
                      <td className="px-4 py-2 text-foreground">{m.fields}</td>
                      <td className="px-4 py-2 text-muted-foreground">{m.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-muted-foreground">
              Every message has <span className="text-foreground">source: "paydef-buttons"</span> and <span className="text-foreground">transactionId</span>. Always check <span className="text-foreground">event.origin === new URL(embedUrl).origin</span>. The webhook is still the final source of truth.
            </div>
          </div>
        </section>
```

- [ ] **Step 5: Type check, then look**

Run: `bash tsc-new-errors.sh`
Expected: `tsc: no new errors …`. Dev server → `/docs/api#smart-buttons` shows the section, the snippet and the 7-row table, and the response example lists `embedUrl`/`embedOrigin`.

- [ ] **Step 6: Commit**

```bash
git add app/docs/api/page.tsx
git commit -m "docs(api): document SMART_BUTTONS, embedUrl and the iframe message contract

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Sandbox end-to-end — our page, a server-created order, a dynamic client-id

Closes the one assumption the prototype did not prove. It runs the real `lib/paypal.ts` and `lib/smart-buttons.ts` against PayPal **sandbox**, with no database: a two-origin local server stands in for the merchant and the shield, and in-memory stubs stand in for `/api/gateway/execute` and `browser-status`.

**Precondition (user):** a PayPal **sandbox** REST app. developer.paypal.com → Apps & Credentials → **Sandbox** → Create App. The user sets `PP_SANDBOX_CLIENT_ID` and `PP_SANDBOX_SECRET` in the shell that runs the server (for example via `! $env:PP_SANDBOX_CLIENT_ID="…"`). These values are never written to a file and never echoed. The sandbox *buyer* login is done by the user in the PayPal popup; the agent does not type PayPal credentials.

**Files:**
- Create: `<SCRATCHPAD>/smart-buttons-harness/e2e-server.mjs`

**Interfaces:**
- Consumes: `createPayPalOrder`, `getApprovalUrl`, `captureApprovedOrder` (`lib/paypal.ts`); `renderButtonsPage`, `frameAncestorsCsp`, `decideButtonPage` (`lib/smart-buttons.ts`).
- Produces: a pass/fail observation, written to the ledger.

- [ ] **Step 1: Write the server**

`e2e-server.mjs`:

```js
// Sandbox e2e for Smart Buttons. No DB. PAYPAL_ENV must not be "live".
import http from "node:http"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

const ROOT = "C:/Users/ADMIN/Documents/Web Store App/PayDef/v0-payment-gateway-dashboard/"
const pp = await import(pathToFileURL(ROOT + "lib/paypal.ts").href)
const sb = await import(pathToFileURL(ROOT + "lib/smart-buttons.ts").href)

if (process.env.PAYPAL_ENV === "live") throw new Error("Refusing to run against live PayPal")
const clientId = process.env.PP_SANDBOX_CLIENT_ID
const clientSecret = process.env.PP_SANDBOX_SECRET
if (!clientId || !clientSecret) throw new Error("Set PP_SANDBOX_CLIENT_ID and PP_SANDBOX_SECRET")

const MERCHANT = "http://localhost:4101"
const SHIELD = "http://127.0.0.1:4102"
const tx = { id: randomUUID(), status: "PENDING" }

const order = await pp.createPayPalOrder({
  clientId, clientSecret,
  amount: "1.00", currencyCode: "USD", intent: "CAPTURE",
  items: [{ name: "Smart Buttons e2e", quantity: "1", unitAmount: { currencyCode: "USD", value: "1.00" } }],
  returnUrl: `${SHIELD}/order/success?ref=${tx.id}`,
  cancelUrl: `${SHIELD}/order/cancel?ref=${tx.id}`,
  customId: tx.id,
})
tx.paypalOrderId = order.id
const approvalUrl = pp.getApprovalUrl(order)
console.log("order", order.id, "status", order.status)

const row = {
  id: tx.id, status: "PENDING", intent: "CAPTURE", original_currency: "USD",
  paypal_order_id: order.id, checkout_expires_at: new Date(Date.now() + 30 * 60e3).toISOString(),
  merchant_success_url: `${MERCHANT}/thanks`, merchant_cancel_url: `${MERCHANT}/cart`,
  client_id: clientId,
}
const embedUrl = `${SHIELD}/checkout/buttons?ref=${tx.id}`

const snippetPage = `<!doctype html><meta charset="utf-8"><title>Merchant e2e</title>
<h2>Merchant checkout (localhost:4101)</h2><div id="paydef-buttons"></div><pre id="log"></pre>
<script>
(function () {
  var embedUrl = ${JSON.stringify(embedUrl)};
  var approvalUrl = ${JSON.stringify(approvalUrl)};
  var origin = new URL(embedUrl).origin;
  var frame = document.createElement("iframe");
  frame.src = embedUrl; frame.allow = "payment"; frame.title = "PayPal";
  frame.style.cssText = "width:100%;border:0;height:160px;";
  document.getElementById("paydef-buttons").appendChild(frame);
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.origin !== origin || !m || m.source !== "paydef-buttons") return;
    document.getElementById("log").textContent += JSON.stringify(m) + "\\n";
    if (m.type === "resize" && m.height) frame.style.height = m.height + "px";
    if ((m.type === "approved" || m.type === "failed") && m.redirectUrl) window.location.href = m.redirectUrl;
    if (m.type === "error") window.location.href = approvalUrl;
  });
})();
</script>`

const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body) }

http.createServer((req, res) => {
  const u = new URL(req.url, MERCHANT)
  if (u.pathname === "/thanks" || u.pathname === "/cart") {
    return send(res, 200, `<h2>${u.pathname}</h2><pre>${u.search}</pre>`, { "content-type": "text/html" })
  }
  send(res, 200, snippetPage, { "content-type": "text/html; charset=utf-8" })
}).listen(4101, () => console.log("merchant", MERCHANT))

// A third origin that must NOT be able to frame the page (Review Focus 5).
http.createServer((req, res) => {
  send(res, 200, `<h2>Attacker (localhost:4103)</h2><iframe src="${embedUrl}" style="width:100%;height:200px"></iframe>`,
    { "content-type": "text/html" })
}).listen(4103, () => console.log("attacker http://localhost:4103"))

http.createServer(async (req, res) => {
  const u = new URL(req.url, SHIELD)
  if (u.pathname === "/checkout/buttons") {
    const d = sb.decideButtonPage({ row: { ...row, status: tx.status }, executeToken: null, tokenShouldBlock: false, now: new Date() })
    const html = d.kind === "render" ? sb.renderButtonsPage(d.config, d.allowedOrigins) : sb.renderButtonsErrorPage(d.code, d.allowedOrigins)
    return send(res, d.kind === "render" ? 200 : d.status, html, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": sb.frameAncestorsCsp(d.allowedOrigins),
    })
  }
  if (u.pathname === "/api/gateway/execute" && req.method === "POST") {
    if (tx.status === "PENDING") {
      const r = await pp.captureApprovedOrder({ clientId, clientSecret, orderId: tx.paypalOrderId })
      console.log("capture result", JSON.stringify(r).slice(0, 300))
      tx.status = "COMPLETED"
    }
    return send(res, 200, JSON.stringify({ status: tx.status, transaction_id: tx.id }), { "content-type": "application/json" })
  }
  if (u.pathname.startsWith("/api/gateway/browser-status/")) {
    return send(res, 200, JSON.stringify({ transaction_id: tx.id, status: tx.status, paypal_order_id: tx.paypalOrderId }),
      { "content-type": "application/json" })
  }
  send(res, 404, "not found")
}).listen(4102, "127.0.0.1", () => console.log("shield", SHIELD))
```

If `captureApprovedOrder`'s result shape differs (check `OrderCaptureResult` in `lib/paypal.ts`), only the log line changes. Treat it as a ruling, not a failure.

- [ ] **Step 2: Run it**

From the harness dir, with the two env vars set by the user:
`node --experimental-strip-types --import ./alias-hook.mjs e2e-server.mjs` (in the background)
Expected console: `order <ID> status CREATED`, then `merchant …`, `attacker …`, `shield …`.

- [ ] **Step 3: Drive it (Claude in Chrome, new tab)**

1. Open `http://localhost:4101`. Expected: PayPal buttons render inside the iframe; the log shows `{"type":"resize",…}` and `{"type":"ready",…}`.
2. Click the PayPal button. Expected: the approval popup opens. **Hand over to the user** to log in with the sandbox buyer and approve.
3. Expected after approval: console prints `capture result … COMPLETED`; the merchant tab navigates to `http://localhost:4101/thanks?transaction_id=<id>&status=COMPLETED&paypal_order_id=<ID>`.
4. Cancel path (fresh run of the server): click the button, close the popup. Expected: log shows `{"type":"cancelled"}`, the buttons stay. Clicking again re-opens the popup for the same order.
5. Negative framing: open `http://localhost:4103`. Expected: the iframe is blocked; DevTools console shows a `frame-ancestors` CSP violation. Read it with `read_console_messages` and pattern `frame-ancestors`.

- [ ] **Step 4: If the SDK rejects `integration-date`**

If step 3.1 shows `{"type":"error","code":"sdk_load_failed"}` or the SDK console says it does not recognise `integration-date`, then: remove that param from `buildSdkUrl`, update the Task 5 assertion, re-run Tasks 5 and 11, and ledger the ruling with the exact PayPal console message.

- [ ] **Step 5: Record the result.** No commit (scratchpad). Stop the server and close the tab. Write the pass/fail per sub-step into the ledger, and update memory `express-checkout-spike.md` with "Phase 1 e2e verified (sandbox, server-created order, dynamic client-id)".

---

### Task 12: Rollout (each step needs the user's explicit go-ahead)

Nothing here is done without asking: it touches production and is outward-facing.

- [ ] **Step 1: Merge and push.** Use superpowers:finishing-a-development-branch. Pushing to `origin` needs the `hyauns` gh account (`gh auth switch --user hyauns`; see memory `paydef-environments-db.md`).

- [ ] **Step 2: Apply migration 029 to production, before the deploy.** The constraint only widens, so the old code is unaffected.

```bash
node scripts/run-029-migration.cjs          # confirm host is ep-billowing-meadow, read the SQL
node scripts/run-029-migration.cjs --yes
```

Expected: `Constraint after migration: CHECK ((checkout_flow = ANY (ARRAY['REDIRECT'::text, 'POPUP_BRIDGE'::text, 'SMART_BUTTONS'::text])))` and `Migration 029 complete!`

- [ ] **Step 3: Deploy on Coolify** (the user triggers it, or confirms the auto-deploy ran).

- [ ] **Step 4: Check the headers on a real shield domain.** Coolify's Traefik must not add `X-Frame-Options`.

```bash
curl -s -D - -o /dev/null "https://<an ACTIVE shield domain>/checkout/buttons?ref=00000000-0000-0000-0000-000000000000"
```

Expected: `HTTP/2 404`, `content-security-policy: frame-ancestors 'none'`, `cache-control: no-store`, and **no** `x-frame-options`. If Traefik adds `x-frame-options`, stop. The fix belongs in the Coolify/Traefik labels for this path, and it is the user's call.

- [ ] **Step 5: Turn it on for one PayPal store.** Stores → store → Smart Buttons → Save. Expected: saved without error. Existing integrations keep redirecting because they ignore `embedUrl`. Real buyer use starts only once a storefront embeds the snippet (custom Next.js stores) or after the Phase 1b plugin release (WooCommerce).

---

## Self-review

**Spec coverage:**
- R1 → Tasks 2 and 3.
- R2 → Task 2 and Task 9 (the platform default UI stays at two options).
- R3 → Task 2 and Task 6(b).
- R4 → Task 6.
- R5 → Tasks 4 and 7.
- R6 → Task 7, verified in Task 7 step 4 and Task 12 step 4.
- R7 → Task 5, verified in Task 11.
- R8 → Task 7.
- R9 → Tasks 8 and 9.
- R10 → Task 10.
- D1-D7 are each implemented by the task named in their "Why".

**Placeholder scan:** none. `<SCRATCHPAD>` and `<an ACTIVE shield domain>` are run-time values, defined where they are used.

**Type consistency:** `ButtonPageConfig` fields are used identically in Tasks 4, 5, 7 and 11. `buildFlowUrls` returns the four names the route destructures. `effectiveFlowForProvider(flow, providerType)` has the same signature in Tasks 2 and 6. `STORE_CHECKOUT_FLOW_VALUES` is defined in Task 9 step 2 and used in step 5.

**Review Focus:**
1. Cancel-then-retry → Task 5 test plus Task 11 step 3.4.
2. Injection → Task 5 test.
3. Old integration still redirects → Task 6 test plus route code.
4. Reload after finish/expiry → Task 4 and Task 5 tests.
5. Foreign framing → Task 4 test plus Task 11 step 3.5.
