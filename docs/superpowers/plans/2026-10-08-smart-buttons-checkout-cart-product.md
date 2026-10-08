# PayPal Smart Buttons on Checkout, Cart and Product Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WooCommerce shops show PayPal's own payment buttons directly on the **checkout**, **cart** and **product** pages, with no "Place order" step first, to raise conversion. Account rotation, item masking and the buyer's shipping address all keep working.

**Architecture:** "Two-step" Smart Buttons.
1. **When a page renders**, the plugin asks PayDef for a **button session**. PayDef pre-selects the PayPal account from the current amount (read-only; volume is still only counted at execute) and returns an `embedUrl` on the shield domain. The iframe loads the PayPal SDK with that account's `client-id`.
2. **When the buyer clicks the button**, the iframe asks the shop page to create the order. The plugin creates the WooCommerce order and calls `/api/gateway/checkout` with the `buttonSessionId`. PayDef creates the PayPal order on the **pinned** account and re-checks its limits with the final amount, then hands the PayPal order id back to the SDK.
   - **Checkout page:** the buyer has typed their address, so the order uses `SET_PROVIDED_ADDRESS` (unchanged).
   - **Cart and product pages ("express"):** there is no address yet, so the order uses `GET_FROM_FILE`. PayPal's `onShippingAddressChange` relays the buyer's address to the shop, which computes WooCommerce shipping (and tax), and PayDef PATCHes the PayPal total. Addresses the shop cannot ship to are rejected.
3. After approval, PayDef captures or authorizes as today. It now also stores the payer and the full shipping address from PayPal's response and sends them in the store webhook, so an express order gets its address filled in.

**Tech Stack:** Next.js 16 / TypeScript / Neon Postgres (PayDef). PHP 7.4+ / WooCommerce classic templates, plus one vanilla-JS asset (plugin). PayPal Orders v2 REST plus JS SDK v5. Verification uses the Node TS harness (`npm run verify:smart-buttons`), `php-parser` lint, and the WordPress Playground rig against PayPal **sandbox**.

**Spec:** inline (below). Builds on the unpushed branch `feat/paypal-smart-buttons` (Phase 1 + plugin 1.10.0, never released) and on the sandbox spike `scratch/spike-shipping-callback.mjs`.

## Global Constraints

- **Branch:** keep working on `feat/paypal-smart-buttons`. Nothing is pushed, deployed or uploaded until Part D, and every step there needs the user's go-ahead.
- **One release:** plugin ships as **1.10.0** (1.10.0 was never released) containing all three placements. User decision 2026-10-08: no intermediate release.
- **Shop owner controls everything; buyers never choose.** Placement checkboxes plus the existing "Always redirect to PayPal" kill switch live in the plugin; the PayDef dashboard's `SMART_BUTTONS` flow remains the master switch.
- **Production shops sell to the US only.** Tests use US addresses and a **US sandbox buyer**. VN was only the earlier sandbox account.
- **Never break the classic path.** Any failure (no session, iframe not ready within 10 s, order creation error, pinned account unavailable) falls back to today's behaviour: the WooCommerce "Place order" button, then a redirect to PayPal.
- **Money invariants:**
  - The PayPal total always equals the WooCommerce order total at capture. `item_total` is fixed when the order is created; only `shipping` and `tax_total` change.
  - PayDef refuses a PATCH whose total does not equal `item_total + shipping + tax_total`.
- **Express orders are created before payment**, so a paid order always exists. Abandoned express orders are cancelled after **30 minutes** (user decision), unless PayDef says they were paid.
- **Backslashes:** heredocs and the Edit tool mangle `\\` and `\uXXXX` on this machine (memory `local-toolchain-gotchas`). Code below avoids backslashes. If one is unavoidable, write it via Node with `String.fromCharCode(92)` and verify the bytes.
- **Migration:** `scripts/030-button-sessions.sql`, applied to production only in Part D. `.env.local` points at PRODUCTION.
- **Out of scope:** WooCommerce **Blocks** cart/checkout (cozycradles and Sansuj use classic templates); TireBel (headless storefront); mini-cart / side-cart buttons; letting the buyer pick between several shipping methods inside PayPal (the cheapest available rate is used).
- **Commits** end with the two attribution lines in use on this branch (`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and the `Claude-Session:` line).

## Review Focus

1. **The total changes after the button rendered** (coupon added, quantity changed, shipping method changed on the checkout page). Expected: a new session for the new amount, or the pinned account's limit re-checked at create. Never a PayPal total that differs from WooCommerce. Pinned by B5 (checkout re-session on `updated_checkout`) and A6 (limit re-check → 409 → fallback).
2. **The buyer picks an address the shop cannot ship to** (no zone or rates, or a country not allowed). Expected: PayPal rejects the address and the total is untouched. Pinned by B2 (`apply_paypal_address` reject branches) and C2 scenario 4.
3. **The buyer closes PayPal after the express WooCommerce order was created.** Expected: the order is cancelled at 30 min and stock released, unless PayDef reports it paid (then it is completed with the PayPal address). Pinned by B3 (`expire_express_order`) and C2 scenario 6.
4. **Checkout form invalid when the buyer clicks PayPal.** Expected: WooCommerce shows its normal field errors, the popup closes, and nothing is created at PayPal. Pinned by B5 (failure branch) and C2 scenario 2.
5. **A third party sends `shipping-change` or `create-order` messages, or calls the shipping AJAX for someone else's order.** Expected: ignored or refused. The iframe only accepts messages from the shop origins, and the AJAX checks a nonce plus the order owner. Pinned by A4 (origin check test) and B3 (owner check).

---

## Spec

### Evidence this design rests on (sandbox, 2026-10-08)
- Phase 1: a cross-origin iframe with the SDK, a dynamic `client-id` plus `integration-date`, and a server-created order all work: approve, capture, webhook, thank-you.
- Spike (`scratch/spike-shipping-callback.mjs`, framed, order created **without** an address using `GET_FROM_FILE`):
  - `onShippingAddressChange` fires right after login for the default address, and again on every change.
  - `data.shippingAddress = {city, state, countryCode, postalCode}`, with no street.
  - A PATCH of `/purchase_units/@reference_id=='default'/amount` with `breakdown {item_total, shipping}` returns 204, and the popup shows the new total ($15, then $19).
  - `actions.reject(data.errors.ADDRESS_ERROR)` blocks the address.
  - The capture charged the last patched total, and the response contained the **full** shipping address (street) plus the payer.

### Decisions (user, 2026-10-08)
| # | Decision |
|---|---|
| D1 | Approved the two-step design (pre-selected account at render; order created on click) |
| D2 | Do not release the order-pay-page version; ship checkout + cart + product together |
| D3 | Cart and product: **recalculate shipping per PayPal address** |
| D4 | Abandoned express orders: **auto-cancel after 30 min** |
| D5 | Only shop owners choose; buyers get no choice |
| D6 | Production shops sell to the US only |

### Requirements
- **R1:** `POST /api/gateway/button-session` (store auth) takes `{amount, currency, context: checkout|cart|product}` and returns `{enabled:false}` when the store is not a PayPal store on `SMART_BUTTONS` or has no frameable return URL. Otherwise it returns `{enabled:true, sessionId, embedUrl, embedOrigin, expiresAt}`. The account is chosen read-only with the same eligibility, profile, circuit-breaker and strategy rules as checkout.
- **R2:** `POST /api/gateway/checkout` accepts `buttonSessionId` and `express`. With a session, the account is pinned; if it is no longer eligible, the route answers `409 {code:"button_session_account_unavailable"}`. With `express`, the order uses `GET_FROM_FILE` and ignores `shippingAddress`. The response adds `paypalOrderId`, and the transaction records `button_session_id`, `express` and `express_item_total`.
- **R3:** `POST /api/gateway/order-amount` (store auth) takes `{transactionId, shipping, taxTotal, total}`, only for PENDING express transactions of that store. It requires `total = express_item_total + shipping + taxTotal` and PATCHes PayPal, then updates `original_amount`.
- **R4:** `GET /checkout/buttons?session=&st=` renders the session page:
  - The SDK loads with the pinned account's `client-id`.
  - `createOrder` relays to the parent and waits up to 60 s.
  - In express sessions, `onShippingAddressChange` relays and waits up to 20 s; a timeout or rejection rejects the address.
  - `onApprove` executes as in Phase 1.
  - Messages are accepted only from the session's allowed origins.
- **R5:** Execute stores `payer_email`, `payer_name` and `shipping_address` (PayPal's object) on the transaction and adds them to the `payment.capture.completed` / `payment.authorization.created` webhook payloads and to `GET /api/gateway/transactions/:id`.
- **R6:** Plugin settings: "Show PayPal buttons on" checkout / cart / product (all on by default). The kill switch still forces the classic path everywhere.
- **R7:** Checkout page: the payment box shows the buttons and hides "Place order". A click submits the checkout via AJAX with `paydef_smart_session`. Validation errors are shown the WooCommerce way. If the buttons are not ready within 10 s, "Place order" comes back and the order redirects as before.
- **R8:** Cart page (under "Proceed to checkout") and product page (after add-to-cart): a click creates an express order (cart: from the whole cart; product: from that product, variation and quantity only, leaving the cart untouched). The address relay recalculates shipping and tax with WooCommerce's own zones and rates (cheapest rate) and rejects unshippable addresses.
- **R9:** The webhook fills the express order's shipping and billing address, email and name from PayPal when they are empty.
- **R10:** Express orders still pending after 30 min are cancelled, unless PayDef reports them COMPLETED or AUTHORIZED.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/030-button-sessions.sql`, `scripts/run-030-migration.cjs` | Create | `button_sessions` table; new `transactions` columns |
| `lib/paypal.ts` | Modify | `shippingPreference: "GET_FROM_FILE"`; `buildAmountPatch()`; `patchOrderAmount()`; payer/shipping on result types |
| `lib/button-sessions.ts` | Create | Pure: session token, session page decision, pinned-account pick, response shaping |
| `lib/smart-buttons.ts` | Modify | Shared execute JS; `renderSessionButtonsPage()` (relay `createOrder` and shipping) |
| `app/api/gateway/button-session/route.ts` | Create | R1 |
| `app/api/gateway/checkout/route.ts` | Modify | R2 |
| `app/api/gateway/order-amount/route.ts` | Create | R3 |
| `app/checkout/buttons/route.ts` | Modify | R4 (session mode) |
| `app/api/gateway/execute/route.ts`, `lib/store-webhooks.ts`, tx lookup | Modify | R5 |
| `app/docs/api/page.tsx` | Modify | Document session/express API and message contract |
| plugin `includes/class-paydef-client.php` | Modify | `button_session()`, `order_amount()` |
| plugin `includes/class-paydef-express.php` | Create | Express order creation, PayPal-address mapping, shipping/tax calculation, webhook address fill |
| plugin `includes/class-paydef-smart-buttons.php` | Create | Sessions (cached in WC session), placement rendering, asset enqueue, AJAX endpoints, 30-min expiry |
| plugin `includes/class-wc-gateway-paydef.php` | Modify | Placement settings; checkout container in `payment_fields`; `process_payment` smart/fallback branches |
| plugin `assets/paydef-smart-buttons.js` | Create | Parent-side bridge for the three contexts |
| plugin `includes/class-paydef-webhook.php`, `paydef-woocommerce.php`, `readme.txt` | Modify | Address fill; bootstrap; changelog |
| `scripts/verify/smart-buttons/*` | Modify/Create | New harness tests; rig gateway + blueprint (US zones, variable product) |

---

## Part A — PayDef

### Task 1 — A1: Migration 030

**Files:** Create `scripts/030-button-sessions.sql`, `scripts/run-030-migration.cjs`

- [ ] **Step 1: Confirm key column types (read-only)**

Run a read-only query through the same `.env.local` loader as `run-029-migration.cjs`:
```sql
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE (table_name, column_name) IN (('stores','id'),('stores','tenant_id'),('merchant_accounts','id'),('transactions','id'),('transactions','original_amount'))
```
Expected: the ids are `uuid` and `original_amount` is `numeric`. If a type differs, use it in the SQL below and record a ruling.

- [ ] **Step 2: Write the SQL**

```sql
-- 030-button-sessions.sql
-- Smart Buttons on checkout/cart/product pages: a "button session" pins the
-- PayPal account when the page renders; the PayPal order is created on click.
CREATE TABLE IF NOT EXISTS button_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  merchant_account_id UUID NOT NULL REFERENCES merchant_accounts(id) ON DELETE CASCADE,
  shield_domain       TEXT,
  context             TEXT NOT NULL CHECK (context IN ('checkout', 'cart', 'product')),
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT NOT NULL,
  intent              TEXT NOT NULL CHECK (intent IN ('CAPTURE', 'AUTHORIZE')),
  allowed_origins     TEXT[] NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS button_sessions_expires_idx ON button_sessions (expires_at);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS button_session_id  UUID REFERENCES button_sessions(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS express            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS express_item_total NUMERIC(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_email        TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_name         TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_address   JSONB;
```

- [ ] **Step 3: Runner.** Copy `scripts/run-029-migration.cjs` to `run-030-migration.cjs`: dry run by default, `--yes` applies, and it prints the host. Apply by running each statement from the SQL file (split on `;` lines). Verify with:
```sql
SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='button_sessions') AS t,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='transactions' AND column_name IN ('button_session_id','express','express_item_total','payer_email','payer_name','shipping_address')) AS c
```
Expected after apply: `t=1, c=6`.

- [ ] **Step 4: Dry run only.** Run `node scripts/run-030-migration.cjs`. Expected: the production host is printed along with the SQL. **Do not pass `--yes`.**
- [ ] **Step 5: Commit** `feat(db): migration 030 — button sessions and express transaction fields`.

### Task 2 — A2: `lib/paypal.ts` — GET_FROM_FILE, amount PATCH, payer/shipping types

**Interfaces — Produces:**
- `CreateOrderParams.shippingPreference?: "GET_FROM_FILE"`
- `buildAmountPatch({ currency, itemTotal, shipping, taxTotal }): { total: string; patch: object[] }`. Throws on a negative value or a non-2-decimal result.
- `patchOrderAmount({ clientId, clientSecret, proxyUrl?, orderId, currency, itemTotal, shipping, taxTotal }): Promise<{ total: string }>`
- `PayPalPayer = { email_address?: string; name?: { given_name?: string; surname?: string } }`
- `PayPalShippingDetail = { name?: { full_name?: string }; address?: { address_line_1?; address_line_2?; admin_area_2?; admin_area_1?; postal_code?; country_code? } }`
- `OrderCaptureResult` and `OrderAuthorizeResult` gain `payer?: PayPalPayer` and `purchase_units[].shipping?: PayPalShippingDetail`.

- [ ] **Step 1: Failing test** `scripts/verify/smart-buttons/test-paypal-express.mjs`:
```js
import assert from "node:assert/strict"
const pp = await import("@/lib/paypal")
const BASE = { clientId: "x", clientSecret: "y", amount: "20.00", currencyCode: "USD", items: [{ name: "a", quantity: "1", unitAmount: { currencyCode: "USD", value: "20.00" } }], returnUrl: "https://s/ok", cancelUrl: "https://s/no", customId: "t", skipRandomization: true }
assert.equal(pp.buildOrderPayload(BASE).application_context.shipping_preference, "NO_SHIPPING")
assert.equal(pp.buildOrderPayload({ ...BASE, shippingPreference: "GET_FROM_FILE" }).application_context.shipping_preference, "GET_FROM_FILE")
// a provided address always wins (checkout page)
assert.equal(pp.buildOrderPayload({ ...BASE, shippingPreference: "GET_FROM_FILE", shipping: { address: { address_line_1: "1 A St", country_code: "US" } } }).application_context.shipping_preference, "SET_PROVIDED_ADDRESS")
const { total, patch } = pp.buildAmountPatch({ currency: "USD", itemTotal: "20.00", shipping: "9.00", taxTotal: "1.65" })
assert.equal(total, "30.65")
assert.deepEqual(patch, [{ op: "replace", path: "/purchase_units/@reference_id=='default'/amount", value: { currency_code: "USD", value: "30.65", breakdown: { item_total: { currency_code: "USD", value: "20.00" }, shipping: { currency_code: "USD", value: "9.00" }, tax_total: { currency_code: "USD", value: "1.65" } } } }])
assert.equal(pp.buildAmountPatch({ currency: "USD", itemTotal: "20.00", shipping: "0", taxTotal: "0" }).total, "20.00")
assert.throws(() => pp.buildAmountPatch({ currency: "USD", itemTotal: "20.00", shipping: "-1", taxTotal: "0" }))
console.log("PASS test-paypal-express")
```
Run: `npm run verify:smart-buttons`. Expected: this script FAILs (`buildAmountPatch is not a function`).

- [ ] **Step 2: Implement.**

(a) In `CreateOrderParams`, after `shipping?:`, add:
```ts
  shippingPreference?: "GET_FROM_FILE"  // express (cart/product page): no address yet —
                                         // PayPal collects it; ignored when `shipping` is set
```
(b) In `buildOrderPayload`, replace the `shipping_preference:` line with:
```ts
      shipping_preference: p.shipping
        ? "SET_PROVIDED_ADDRESS"
        : p.shippingPreference === "GET_FROM_FILE" ? "GET_FROM_FILE" : "NO_SHIPPING",
```
(c) Add the types next to `OrderCaptureResult`, and add `payer?: PayPalPayer` plus `shipping?: PayPalShippingDetail` to both result interfaces' top level and `purchase_units[]` respectively.
(d) Append:
```ts
// ─── Express: update the order total once the buyer's address is known ────────

function toCents(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid amount: ${value}`)
  return Math.round(n * 100)
}

export function buildAmountPatch(p: { currency: string; itemTotal: string; shipping: string; taxTotal: string }) {
  const item = toCents(p.itemTotal)
  const ship = toCents(p.shipping)
  const tax  = toCents(p.taxTotal)
  const money = (cents: number) => ({ currency_code: p.currency, value: (cents / 100).toFixed(2) })
  const total = (item + ship + tax) / 100
  return {
    total: total.toFixed(2),
    patch: [{
      op: "replace",
      path: "/purchase_units/@reference_id=='default'/amount",
      value: {
        currency_code: p.currency,
        value: total.toFixed(2),
        breakdown: { item_total: money(item), shipping: money(ship), tax_total: money(tax) },
      },
    }],
  }
}

export async function patchOrderAmount(p: {
  clientId: string; clientSecret: string; proxyUrl?: string; orderId: string
  currency: string; itemTotal: string; shipping: string; taxTotal: string
}): Promise<{ total: string }> {
  const { total, patch } = buildAmountPatch(p)
  const token = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${p.orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "User-Agent": getUserAgent(p.clientId) },
    body: JSON.stringify(patch),
    ...createFetchOptions(p.proxyUrl),
  })
  if (!res.ok) throw new PayPalApiError("patch order amount", res.status, await res.text())
  return { total }
}
```
The `tax_total` of `0.00` is always sent. PayPal accepts zero-value breakdown entries (verified in C2, scenario 3).

- [ ] **Step 3:** Run `npm run verify:smart-buttons`. Expected: all scripts pass, including `test-paypal-express`. Then `npx tsc --noEmit -p .` must exit 0.
- [ ] **Step 4: Commit** `feat(paypal): GET_FROM_FILE orders and amount PATCH for express Smart Buttons`.

### Task 3 — A3: `lib/button-sessions.ts` (pure)

**Interfaces — Produces:**
- `sessionToken(sessionId): string | null` is `generateExecuteToken("button-session:" + id)`.
- `verifySessionToken(sessionId, token)` delegates to `verifyExecuteToken("button-session:" + id, token)`.
- `type ButtonContext = "checkout" | "cart" | "product"`; `isButtonContext(v): v is ButtonContext`
- `interface ButtonSessionRow { id; store_id; merchant_account_id; shield_domain: string|null; context; amount: string; currency; intent: "CAPTURE"|"AUTHORIZE"; allowed_origins: string[]; expires_at: string|Date; client_id: string }`
- `pickPinnedAccount<T extends { id: string }>(eligible: T[], session: { merchant_account_id: string }): T | null`
- `decideSessionPage({ row, tokenShouldBlock, now }): { kind: "render"; config: SessionPageConfig; allowedOrigins: string[] } | { kind: "error"; status: number; code: "not_found"|"invalid_token"|"expired"|"framing_not_configured"; allowedOrigins: string[] }`
- `interface SessionPageConfig { sessionId; clientId; currency; intent: "capture"|"authorize"; express: boolean }`. `express` is `context !== "checkout"`.
- `buildSessionEmbedUrl(shieldDomain, sessionId, token): string` returns `${resolveShieldBaseUrl(shieldDomain)}/checkout/buttons?session=<id>[&st=<token>]`.

- [ ] **Step 1: Failing test** `test-button-sessions.mjs`. Assert:
  - `pickPinnedAccount([{id:"a"},{id:"b"}], {merchant_account_id:"b"}).id === "b"`, and `null` when absent.
  - `isButtonContext("cart")` is true and `isButtonContext("mini")` is false.
  - Decision: `not_found` for `row: null`; `invalid_token` when blocked; `expired` when `expires_at <= now`; `framing_not_configured` when `allowed_origins` is empty.
  - Render config: `express:false` for checkout, `true` for cart/product; `intent` lower-cased.
  - `buildSessionEmbedUrl("pay.example.com","S","T") === "https://pay.example.com/checkout/buttons?session=S&st=T"`.
- [ ] **Step 2: Implement** (all functions are straightforward; reuse `toSdkIntent` and `frameAncestorOrigins` from `lib/smart-buttons.ts` and `resolveShieldBaseUrl` from `lib/masking.ts`). `decideSessionPage` keeps `allowedOrigins = row.allowed_origins` (already filtered by `frameAncestorOrigins` when the session was created).
- [ ] **Step 3:** Run `npm run verify:smart-buttons` (all pass) and `tsc` (0). **Step 4: Commit** `feat(smart-buttons): button-session primitives`.

### Task 4 — A4: `lib/smart-buttons.ts` — session page with relayed `createOrder` and shipping

**Interfaces — Produces:** `renderSessionButtonsPage(config: SessionPageConfig, allowedOrigins: string[]): string`.

The message contract is the iframe ↔ shop page protocol. Messages **to** the shop carry `source: "paydef-buttons"`. Messages **from** the shop carry `source: "paydef-shop"`. The iframe acts only on messages from `allowedOrigins`.

| Direction | type | fields |
|---|---|---|
| iframe → shop | `create-order` | `requestId` |
| shop → iframe | `order-created` | `requestId, transactionId, executeToken, paypalOrderId` |
| shop → iframe | `order-failed` | `requestId, message?` |
| iframe → shop | `shipping-change` | `requestId, transactionId, address {city,state,countryCode,postalCode}` |
| shop → iframe | `shipping-updated` / `shipping-rejected` | `requestId`, `reason` = `ADDRESS_ERROR` / `COUNTRY_ERROR` / `STATE_ERROR` / `ZIP_ERROR` |
| iframe → shop | `ready`, `resize`, `cancelled`, `approved`, `failed`, `pending`, `error` | as in Phase 1 |

- [ ] **Step 1: Refactor first, under existing tests.** Move the shared inline JS of `renderButtonsPage` (`post`, `say`, `returnUrl`, `showContinue`, `sleep`, `finalStatus`, and `execute` with the "hide spent buttons" line) into a constant `RUNTIME_JS` that reads the transaction id and execute token from mutable variables `TX` and `ET` instead of `CFG`. `renderButtonsPage` sets `var TX = CFG.transactionId, ET = CFG.executeToken;`. Run `npm run verify:smart-buttons`: all 11+ existing scripts must still pass. Commit `refactor(smart-buttons): share the execute runtime between page modes`.
- [ ] **Step 2: Failing test** `test-session-page.mjs`. Run the emitted inline script against a fake SDK, fake `fetch`, fake `window.parent` and a fake `addEventListener` (same technique as `test-minors.mjs`). Assert:
  1. `createOrder()` posts `create-order` with a `requestId`. A reply `order-created` from `https://shop.example.com` resolves it to the `paypalOrderId`. The same reply from `https://evil.example.com` is ignored (the promise stays pending; check with a 50 ms race).
  2. `order-failed` rejects `createOrder`.
  3. In an express session, `onShippingAddressChange(data, actions)` posts `shipping-change` with the address and the current `transactionId`. `shipping-updated` resolves without calling `actions.reject`. `shipping-rejected` with `reason:"COUNTRY_ERROR"` calls `actions.reject(data.errors.COUNTRY_ERROR)`.
  4. In a checkout (non-express) session, the Buttons config has **no** `onShippingAddressChange` key.
  5. `onApprove` calls `/api/gateway/execute` with the relayed `transactionId` and `executeToken`, then posts `approved`.
  6. The page source has no `postMessage(` call with `"*"`.
- [ ] **Step 3: Implement** `renderSessionButtonsPage`. Its inline script:
```js
(function () {
  var CFG = /*scriptJson(config)*/;
  var ORIGINS = /*scriptJson(allowedOrigins)*/;
  var TX = null, ET = null, seq = 0, waiting = {};
  /*RUNTIME_JS*/
  function ask(msg, timeoutMs) {
    var id = String(++seq) + "-" + Date.now();
    msg.requestId = id;
    return new Promise(function (resolve, reject) {
      waiting[id] = { resolve: resolve, reject: reject };
      setTimeout(function () { if (waiting[id]) { delete waiting[id]; reject(new Error("timeout")); } }, timeoutMs);
      post(msg);
    });
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (ORIGINS.indexOf(e.origin) < 0 || !m || m.source !== "paydef-shop" || !waiting[m.requestId]) return;
    var w = waiting[m.requestId]; delete waiting[m.requestId];
    w.resolve(m);
  });
  if (!window.paypal || !window.paypal.Buttons) { post({ type: "error", code: "sdk_load_failed" }); return; }
  var options = {
    createOrder: function () {
      return ask({ type: "create-order" }, 60000).then(function (m) {
        if (m.type !== "order-created" || !m.paypalOrderId) throw new Error(m.message || "order_failed");
        TX = m.transactionId; ET = m.executeToken || null;
        return m.paypalOrderId;
      });
    },
    onApprove: function () { if (busy) return; busy = true; return execute(); },
    onCancel: function () { post({ type: "cancelled" }); },
    onError: function (err) { post({ type: "error", code: "paypal_error", message: String((err && err.message) || err).slice(0, 200) }); }
  };
  if (CFG.express) {
    options.onShippingAddressChange = function (data, actions) {
      return ask({ type: "shipping-change", transactionId: TX, address: data.shippingAddress }, 20000).then(function (m) {
        if (m.type !== "shipping-updated") return actions.reject(data.errors[m.reason] || data.errors.ADDRESS_ERROR);
      }, function () { return actions.reject(data.errors.ADDRESS_ERROR); });
    };
  }
  window.paypal.Buttons(options).render("#paydef-buttons").then(function () { post({ type: "ready" }); })
    .catch(function () { post({ type: "error", code: "render_failed" }); });
  /* ResizeObserver block as in renderButtonsPage */
})();
```
`busy` and `execute()` come from `RUNTIME_JS`. The SDK URL uses `buildSdkUrl(config)`, with the same `integration-date`.

- [ ] **Step 4:** Run `npm run verify:smart-buttons` (all pass, including the parse-check over the new page) and `tsc` (0). **Step 5: Commit** `feat(smart-buttons): session page relays createOrder and shipping changes to the shop`.

### Task 5 — A5: `POST /api/gateway/button-session`

**Files:** Create `app/api/gateway/button-session/route.ts`. Test `test-button-session-route.mjs` (fake SQL, same pattern as `test-buttons-route.mjs`; stub `@/lib/merchant-rotation` `selectByStrategy` and `@/lib/circuit-breaker` through the harness STUBS map).

The handler:
1. `authenticateStoreHeaders(req)`, then `checkRateLimit(store.id)`.
2. Parse `{amount>0, currency (3 letters, default USD), context}`. Return 400 on bad input.
3. Compute `flow = effectiveFlowForProvider(resolveCheckoutFlow(store.checkoutFlow, prefs), store.providerType)`. If it is not `SMART_BUTTONS`, return `200 {enabled:false, reason:"flow"}`.
4. `origins = frameAncestorOrigins([store.successReturnUrl, store.cancelReturnUrl])`. If empty, return `200 {enabled:false, reason:"framing_not_configured"}`.
5. Load the tenant's ACTIVE and WARMING_UP accounts (same SELECT as checkout Step 4, without `FOR UPDATE`) and run `filterEligibleAccounts(rows, amount)`. Apply the display-profile preference exactly as checkout does (`resolvePaymentDisplayProfile(...).profileId`, keeping matches only when any exist), then `filterOpenCircuits(_, store.id)` and `selectByStrategy(_, tenantId, getSql())`. If nothing is eligible, return `200 {enabled:false, reason:"no_account"}`.
6. `intent = store.captureMode === "MANUAL" ? "AUTHORIZE" : "CAPTURE"`.
7. `INSERT INTO button_sessions (...) VALUES (...) RETURNING id`, with `expires_at = NOW() + INTERVAL '30 minutes'` and `shield_domain = account.shield_domain`.
8. Respond `200 {enabled:true, sessionId, embedUrl: buildSessionEmbedUrl(account.shield_domain, id, sessionToken(id)), embedOrigin, expiresAt}`.

Tests cover: flow off → `enabled:false`; no origins → `enabled:false`; happy path → INSERT values (store id, account id, `context`, `amount`, `["https://shop.example.com"]`) and an `embedUrl` with `session=`; 400 on `context:"mini"`; 401 without headers.

- [ ] Steps: failing test → implement → `npm run verify:smart-buttons` + `tsc` → commit `feat(gateway): button-session endpoint pins a PayPal account when buttons render`.

### Task 6 — A6: `/api/gateway/checkout` — pinned account and express

- [ ] **Step 1: Failing test** `test-checkout-pin.mjs` for a pure helper added to `lib/button-sessions.ts`: `resolveCheckoutSession(row, storeId, now)`. It returns `{ ok: true, session }` or `{ ok: false, status: 409, code: "button_session_invalid" }` when the row is missing, belongs to another store, or is expired.
- [ ] **Step 2: Route edits** (`app/api/gateway/checkout/route.ts`):
  - (a) `CheckoutBody` gains `buttonSessionId?: string` and `express?: boolean`, with comments.
  - (b) After the Shopify branch and before `buildPayPalShipping`, when `body.buttonSessionId` is set: `SELECT id, store_id, merchant_account_id, context, amount, currency, expires_at FROM button_sessions WHERE id = $1`, then `resolveCheckoutSession(...)`. On `!ok`, return `NextResponse.json({ error: "Button session is invalid or expired.", code }, { status: 409 })`.
  - (c) `const express = !!body.express && !!buttonSession && buttonSession.context !== "checkout"`.
  - (d) `paypalShipping` becomes `express ? null : buildPayPalShipping(shippingAddress)`.
  - (e) Account pin: replace the block from `// ── Phase 4: Payment Display Profile Consistency Filter` through `const candidate = await selectByStrategy(circuitFiltered, tenantId, getSql())` with:
```ts
    let candidate: MerchantAccountRow
    if (buttonSession) {
      const pinned = pickPinnedAccount(eligible, buttonSession)
      if (!pinned) {
        await client.query("ROLLBACK")
        log.warn("checkout.button_session_account_unavailable", `Pinned account no longer eligible (session=${buttonSession.id})`, { storeId: store.id, tenantId })
        return NextResponse.json(
          { error: "The selected payment account is no longer available.", code: "button_session_account_unavailable" },
          { status: 409 }
        )
      }
      candidate = pinned
    } else {
      /* the original Phase 4 profile filter + circuit breaker + selectByStrategy block, unchanged,
         ending with: candidate = await selectByStrategy(circuitFiltered, tenantId, getSql()) */
    }
```
  An excluded pinned account (Step 7 re-verify failing, so `continue`) then reaches this point again with no eligible match and returns 409. That is the intended fallback.
  - (f) In `createPayPalOrder({...})`, add `shippingPreference: express ? "GET_FROM_FILE" : undefined,`.
  - (g) Declare `let paypalOrderIdOut: string | null = null` next to `embedUrl`. Set `paypalOrderIdOut = paypalOrder.id` after creation, and add `paypalOrderId: paypalOrderIdOut` to the success JSON.
  - (h) INSERT: add columns `button_session_id, express, express_item_total` with params `$16, $17, $18` = `buttonSession?.id ?? null`, `express`, `express ? amountStr : null`.
- [ ] **Step 3:** `npm run verify:smart-buttons` (all pass), `tsc` (0), and `npx eslint app/api/gateway/checkout/route.ts` (no new warnings beyond the 3 pre-existing). Review the diff line by line: REDIRECT, POPUP_BRIDGE, SMART_BUTTONS-without-session, Stripe and Shopify paths must be untouched.
- [ ] **Step 4: Commit** `feat(gateway): checkout honours a button session (pinned account) and express GET_FROM_FILE`.

### Task 7 — A7: `POST /api/gateway/order-amount`

Store-authenticated. Body `{transactionId, shipping, taxTotal, total}` (strings or numbers).

```sql
SELECT t.id, t.status, t.express, t.express_item_total, t.paypal_order_id, t.original_currency,
       ma.client_id, ma.client_secret, ma.proxy_url
FROM transactions t JOIN merchant_accounts ma ON ma.id = t.merchant_id
WHERE t.id = $1 AND t.store_id = $2
```

| Condition | Response |
|---|---|
| No row | 404 |
| `status !== 'PENDING'` | 409 `not_pending` |
| `!express` | 409 `not_express` |
| `buildAmountPatch({ itemTotal: express_item_total, shipping, taxTotal }).total !== Number(total).toFixed(2)` | 409 `total_mismatch`, with the expected total in the body |

When all pass:
1. `patchOrderAmount(...)`, with the secret decrypted just-in-time as in checkout.
2. `UPDATE transactions SET original_amount = $total, updated_at = NOW() WHERE id = $1`.
3. Respond `{ ok: true, amount: total }`. A PayPal 4xx returns `502 {code:"paypal_patch_failed"}`.

The test `test-order-amount-route.mjs` covers: 404, `not_pending`, `not_express`, `total_mismatch` (expected 30.65, sent 30.00), and the happy path (stubbed `patchOrderAmount` called with `itemTotal "20.00"` and UPDATE executed). Commit `feat(gateway): order-amount endpoint updates an express PayPal order's total`.

### Task 8 — A8: `/checkout/buttons` — session mode

In `app/checkout/buttons/route.ts`:
1. If `session` is present (and `ref` is absent), validate it with `isTransactionRef`.
2. `SELECT s.*, ma.client_id FROM button_sessions s JOIN merchant_accounts ma ON ma.id = s.merchant_account_id WHERE s.id = $1`.
3. `verifySessionToken(id, st)`, then `decideSessionPage`, then render with `renderSessionButtonsPage` (or the error page) under the same `htmlResponse` headers.

The existing `ref` mode is unchanged. Extend `test-buttons-route.mjs` with session cases: 200 render with `client-id` of the joined account; 410 expired; 404 unknown. Commit `feat(shield): /checkout/buttons serves session pages`.

### Task 9 — A9: Payer and address from PayPal into transactions, webhooks and lookup

1. In `execute/route.ts`, in both the authorize and the capture branch, before the `UPDATE`, compute:
```ts
    const pu0 = result.purchase_units?.[0]
    const payerEmail = result.payer?.email_address ?? null
    const payerName  = [result.payer?.name?.given_name, result.payer?.name?.surname].filter(Boolean).join(" ") || null
    const shippingAddress = pu0?.shipping ?? null
```
   `result` is `authResult` or `captureResult`. Add `payer_email = $n, payer_name = $n+1, shipping_address = $n+2::jsonb` to each UPDATE (`JSON.stringify(shippingAddress)` or null). Add to each webhook payload: `payer_email: payerEmail ?? undefined`, `buyer_name: payerName ?? undefined`, `shipping_address: shippingAddress ?? undefined`.
2. In `lib/store-webhooks.ts` `StoreWebhookPayload`, add `payer_email?: string` and `shipping_address?: Record<string, unknown>`.
3. Transaction lookup (`app/api/gateway/transactions/[transactionId]/route.ts` and the detail function it calls): select and return `payer_email`, `payer_name` and `shipping_address`.
4. Test `test-execute-payer.mjs`: extract the payer/address logic into `lib/smart-buttons.ts` `payerFromPayPal(result)` (pure) and test it with the spike's real capture response shape.

Commit `feat(gateway): keep PayPal's payer and shipping address and send them to the store`.

### Task 10 — A10: API docs

Add to `/docs/api#smart-buttons`:
- the button-session request and response;
- the `buttonSessionId`/`express` checkout fields and `paypalOrderId`;
- `order-amount`;
- the extended message table from A4;
- the new webhook fields.

Run `npx eslint app/docs/api/page.tsx` and `tsc`. Commit.

---

## Part B — WooCommerce plugin 1.10.0

All PHP is linted after each task with `node <scratchpad>/php-lint/lint.cjs "<plugin dir>"`, and the linter is proven to catch a deliberate error once. PHP cannot be executed here, so behaviour is verified by the JS bridge test (B5) and the Playground rig (C2).

### Task 11 — B1: Client methods and placement settings
- `Paydef_Client::button_session( array $args )` sends POST `/api/gateway/button-session`.
- `Paydef_Client::order_amount( array $args )` sends POST `/api/gateway/order-amount`.
- Both go through the existing `post()`.
- Gateway settings, after `force_redirect`: three checkboxes `sb_checkout`, `sb_cart`, `sb_product` (title "Show PayPal buttons on", labels "Checkout page", "Cart page", "Product pages", default `yes`). Description: *"Needs Checkout Experience = Smart Buttons (iframe) on the PayDef dashboard. Buyers never choose; untick a page to keep the classic flow there."*
- New gateway method `smart_buttons_enabled( $context )`: true only if the gateway is available, flow is `paypal`, `force_redirect` is not ticked, and `sb_{$context}` is `yes`.

### Task 12 — B2: `includes/class-paydef-express.php`
Static methods:
- `create_from_cart()` (`WC_Order|WP_Error`):
  1. `WC()->checkout()->create_order( array( 'payment_method' => 'paydef' ) )` inside try/catch.
  2. `strip_shipping_and_tax( $order )`, then `mark( $order, 'cart' )`.
- `create_from_product( $product_id, $variation_id, $qty, $attributes )` (`WC_Order|WP_Error`):
  1. Validate that the product is purchasable, in stock for `$qty`, and of type simple or variation. Variable products require a matching variation id.
  2. `wc_create_order( array( 'customer_id' => get_current_user_id(), 'created_via' => 'paydef_express' ) )`, then `add_product( $product, $qty, array( 'variation' => $attributes ) )`, `set_payment_method( 'paydef' )`, `calculate_totals( false )`, `mark( $order, 'product' )`.
- `strip_shipping_and_tax( $order )`: remove all shipping items and `calculate_totals( false )`.
- `mark( $order, $context )`: meta `_paydef_express = 1`, `_paydef_express_context`, `_paydef_express_owner = WC()->session ? WC()->session->get_customer_id() : ''`, `created_via = paydef_express`; then save.
- `item_total( $order )` returns `wc_format_decimal( $order->get_total(), 2 )` after strip. This is the value sent as the checkout `amount`.
- `map_address( array $pp )` maps the PayPal partial address to `array( country, state, postcode, city )`:
  - `country = strtoupper( $pp['countryCode'] )`.
  - When `WC()->countries->get_states( $country )` is non-empty: use the raw value if it is a key (US `CA`); otherwise compare `sanitize_title( remove_accents( $name ) )` against each state name.
  - Otherwise use the raw state.
- `apply_paypal_address( $order, array $pp )` returns `array( 'ok' => true, 'shipping' => '9.00', 'tax' => '0.00', 'total' => '29.00' )` or `array( 'ok' => false, 'reason' => 'COUNTRY_ERROR'|'STATE_ERROR'|'ADDRESS_ERROR' )`:
  1. Country not in `WC()->countries->get_shipping_countries()` → `COUNTRY_ERROR`.
  2. Set the order's shipping country, state, postcode and city, and the billing ones too when the billing country is empty.
  3. If no item needs shipping (`$product->needs_shipping()` false for all), skip rates.
  4. Otherwise build the package (contents from order items with `data => $product`, `line_total`, `line_tax`, `line_subtotal`, `line_subtotal_tax`, `quantity`, `product_id`, `variation_id`; `contents_cost`; `applied_coupons = $order->get_coupon_codes()`; `user => array( 'ID' => $order->get_customer_id() )`; `destination` with empty street fields).
  5. Run `WC()->shipping()->load_shipping_methods()` and `$calc = WC()->shipping()->calculate_shipping_for_package( $package )`. No rates → `ADDRESS_ERROR`. Otherwise pick the cheapest rate by `get_cost()`.
  6. Remove existing shipping items and add a `WC_Order_Item_Shipping` with that rate's `method_title`, `method_id`, `instance_id`, `total` and `taxes`.
  7. `calculate_totals( true )`, save.
  8. Return `shipping = $order->get_shipping_total()`, `tax = $order->get_total_tax()`, `total = $order->get_total()` (formatted to 2 decimals).
- `fill_from_paypal( $order, array $shipping_address, $payer_email, $payer_name )`:
  - The shipping address comes from the webhook / transaction (`address_line_1` … `country_code`, and `name.full_name`).
  - Set the shipping fields, plus billing name and address when the billing first name or address is empty.
  - Set the billing email when it is empty and `$payer_email` is valid.
  - Add a note and save.
- `owns( $order )`: `_paydef_express_owner` equals the current session customer id (strict string compare, non-empty).

### Task 13 — B3: `includes/class-paydef-smart-buttons.php`
Hooks:
- `woocommerce_proceed_to_checkout` (priority 30) → `render_cart()`
- `woocommerce_after_add_to_cart_button` (priority 20) → `render_product()`
- `wp_enqueue_scripts` → `enqueue()` (only on `is_checkout() || is_cart() || is_product()`, not on order-pay / order-received)
- `wc_ajax_paydef_express_create` and `wc_ajax_paydef_shipping_change`
- `paydef_express_expire` (Action Scheduler)

Functions:
- `session( $context, $amount, $currency )` (array|null): cached in `WC()->session` under `paydef_bs_{$context}` as `array( amount, currency, sessionId, embedUrl, embedOrigin, expires )`. It is reused when amount and currency are equal and `expires` is more than 5 min away; otherwise it calls `button_session()`. `enabled:false` caches a negative result for 5 min (no PayDef call on every page view of a non-Smart-Buttons store).
- `render_container( $context, $session, $extra_attrs )` prints `<div class="paydef-smart-buttons" data-context="…" data-embed-url="…" data-embed-origin="…" data-session-id="…" …></div>` (all `esc_attr`).
- `render_cart()`: amount `WC()->cart->get_total( 'edit' )`, gated by `smart_buttons_enabled( 'cart' )` and a non-empty cart.
- `render_product()`: `global $product`; simple or variable, purchasable, in stock; amount `wc_get_price_to_display( $product )`; extra attributes `data-product-id` and `data-product-type`.
- `enqueue()`: registers `assets/paydef-smart-buttons.js` (deps `jquery`, footer) and `wp_localize_script( 'paydef-smart-buttons', 'paydefSB', array( 'ajax' => WC_AJAX::get_endpoint( '%%endpoint%%' ), 'nonce' => wp_create_nonce( 'paydef_sb' ), 'fallbackMs' => 10000 ) )`.
- `ajax_express_create()`:
  1. `check_ajax_referer( 'paydef_sb', 'nonce' )`. Context is `cart` or `product`.
  2. Create the order (B2). Session id and `item_total`, then `create_checkout( order_common_args minus shippingAddress + buttonSessionId + express => true, amount => item_total )`. Store meta `_paydef_transaction_id`, `_paydef_flow = paypal`, `_paydef_express_session`.
  3. `as_schedule_single_action( time() + 30 * MINUTE_IN_SECONDS, 'paydef_express_expire', array( $order->get_id() ), 'paydef' )`.
  4. `wp_send_json_success( array( 'transactionId' => …, 'executeToken' => …, 'paypalOrderId' => … ) )`.
  5. On a 409 `button_session_account_unavailable`, drop the cached session and return `wp_send_json_error( array( 'code' => 'session', 'message' => … ) )`. The order created in step 2 is cancelled immediately in every error branch.
- `ajax_shipping_change()`:
  1. Nonce check. The order is found by `Paydef_Webhook::find_order_by_txid( $txid )` and must be express, pending and `owns()`.
  2. `apply_paypal_address()`. `ok` → `order_amount( array( 'transactionId' => …, 'shipping' => …, 'taxTotal' => …, 'total' => … ) )`. Success → `wp_send_json_success()`; otherwise `wp_send_json_error( array( 'reason' => 'ADDRESS_ERROR' ) )`.
  3. A not-ok address → `wp_send_json_error( array( 'reason' => $res['reason'] ) )`.
- `expire_express_order( $order_id )`:
  - Only for an express order still `pending`.
  - `get_transaction( txid )`: COMPLETED → `fill_from_paypal` plus `payment_complete`; AUTHORIZED → `fill_from_paypal` plus `update_status( 'processing', … )`, mirroring the webhook's authorization handling.
  - Anything else → `update_status( 'cancelled', __( 'PayDef: express checkout not completed within 30 minutes.', 'paydef-woocommerce' ) )`.

### Task 14 — B4: Gateway changes
- `payment_fields()`: when `smart_buttons_enabled( 'checkout' )` and `is_checkout()` and not `is_wc_endpoint_url( 'order-pay' )`, call `Paydef_Smart_Buttons::session( 'checkout', WC()->cart->get_total( 'edit' ), get_woocommerce_currency() )` and render the container (`data-context="checkout"`) after the description.
- `process_payment()`:
  - With `$_POST['paydef_smart_session']`, call `process_smart_checkout( $order, $session_id )`: `create_checkout( order_common_args + buttonSessionId )`. On success store the meta as in `process_redirect_checkout` and return `array( 'result' => 'success', 'redirect' => '', 'paydef_transaction_id' => …, 'paydef_execute_token' => …, 'paydef_paypal_order_id' => … )`. On error, `wc_add_notice` and `array( 'result' => 'failure' )`.
  - With `$_POST['paydef_force_redirect']`, `process_redirect_checkout` ignores `embedUrl` (classic redirect).
  - Otherwise unchanged. The 1.10.0 order-pay `receipt_page()` stays as the no-JS fallback.

### Task 15 — B5: `assets/paydef-smart-buttons.js` and its test
Parent-side bridge. Its responsibilities:
- `mount(el)`: create the iframe (`allow="payment"`, width 100%, max 480 px), start the 10 s ready timer, and listen for messages from `el.dataset.embedOrigin` with `source === "paydef-buttons"`. `ready` stops the timer; `resize` sets the height.
  - Checkout context, `ready` → hide `#place_order` while the PayDef radio is checked.
  - `create-order` → `createOrder(ctx)` → reply `order-created` or `order-failed`.
  - `shipping-change` → POST `paydefSB.ajax.replace("%%endpoint%%","paydef_shipping_change")` with `{nonce, transactionId, address}` → reply `shipping-updated` or `shipping-rejected` (reason).
  - `approved` / `failed` with `redirectUrl` → `window.location.href = redirectUrl`.
  - `error`, or the timer firing → `fallback(el)`. For checkout: remove the iframe, show `#place_order`, and add a hidden input `paydef_force_redirect=1`. For cart and product: remove the container (the normal buttons remain).
- `createOrder` per context:
  - **checkout:** `$.ajax({ url: wc_checkout_params.checkout_url, type: "POST", dataType: "json", data: $("form.checkout").serialize() + "&paydef_smart_session=" + sid })`. On `result === "success"`, resolve with the `paydef_*` fields. Otherwise insert `result.messages` into `form.checkout` the way WooCommerce does (`.woocommerce-NoticeGroup-checkout`), trigger `checkout_error`, scroll to the notices and reject.
  - **cart:** POST `paydef_express_create` with `{nonce, context:"cart"}`.
  - **product:** POST `paydef_express_create` with `{nonce, context:"product", product_id, variation_id, quantity, attributes}`, read from the add-to-cart form (`input.qty`, `input[name=variation_id]`, `select[name^=attribute_]`).
- Remounting:
  - checkout: on `updated_checkout` (WooCommerce re-renders the payment box) and on `payment_method_selected`.
  - cart: on `updated_cart_totals`.
  - product: the container is disabled (`pointer-events:none; opacity:.5`) until `found_variation` and re-disabled on `reset_data`, for variable products.

Test `scripts/verify/smart-buttons/test-plugin-bridge.mjs` loads the asset with a fake jQuery, DOM and `window` and asserts:
1. Messages from another origin are ignored.
2. Checkout `create-order` posts the serialized form plus `paydef_smart_session` and replies `order-created` with the `paydef_*` values.
3. A checkout failure inserts the WooCommerce notices and replies `order-failed`.
4. `shipping-change` posts to the shipping endpoint and maps `success:false, reason:"COUNTRY_ERROR"` to `shipping-rejected` / `COUNTRY_ERROR`.
5. No `ready` within 10 s: checkout gets the hidden `paydef_force_redirect` and a visible `#place_order`.
6. `approved` navigates to `redirectUrl`.

### Task 16 — B6: Webhook address fill, bootstrap, version
- `class-paydef-webhook.php`: in the `payment.capture.completed` and `payment.authorization.created` cases, when `_paydef_express` is set and `$payload['shipping_address']` is an array, call `Paydef_Express::fill_from_paypal( $order, $payload['shipping_address'], $payload['payer_email'] ?? '', $payload['buyer_name'] ?? '' )` before the status change.
- `paydef-woocommerce.php`: require the two new classes, run `Paydef_Smart_Buttons::init()` in `paydef_wc_init()`, and keep `Version: 1.10.0`.
- `readme.txt`: rewrite the 1.10.0 changelog entry to describe checkout, cart and product buttons, address-based shipping, the 30-minute expiry and the placement settings.
- Rebuild `plugin woo/paydef-woocommerce-1.10.0.zip` (forward-slash entries, contents verified equal to source).

---

## Part C — Verification

### Task 17 — C1: Rig

1. `wp-gateway.mjs` implements:
   - `button-session`: `enabled:true` with the sandbox client id; `session=` embed URL.
   - `checkout` with `buttonSessionId`/`express`: `lib/paypal.ts` `createPayPalOrder` with `shippingPreference` and `shipping`, and `paypalOrderId` in the response.
   - `order-amount`: real `patchOrderAmount` with the same total check.
   - `/checkout/buttons?session=`: real `renderSessionButtonsPage`.
   - execute: real capture; the webhook includes `shipping_address`, `payer_email` and `buyer_name` taken from the capture response with `payerFromPayPal`.
2. `blueprint.json`:
   - store base `US:CA`, taxes off, selling/shipping countries US;
   - zones: "California" (state CA) flat rate $9; "Alaska" (state AK) with **no methods**; "United States" flat rate $5;
   - products: physical simple "Test Tire" $20 and a variable "Test Rim" (Size 16/17, $30/$35); PayDef settings with all three placements on.

### Task 18 — C2: Sandbox scenarios (user-assisted)

The user needs a **US sandbox personal account**: developer.paypal.com → Testing Tools → Sandbox Accounts → Create account → Personal, United States. The user logs in inside the PayPal popup; the agent never types PayPal credentials. Checks per scenario:

| # | Page | Steps | Expected |
|---|---|---|---|
| 1 | Checkout | Fill a CA address, then click PayPal in the payment box | No "Place order" visible; popup total = $29 (20 + 9); WC order Processing; PayPal order shows the typed address |
| 2 | Checkout | Leave the email empty and click PayPal | WC field errors shown; popup closes; no WC order created |
| 3 | Product (Test Tire, qty 2) | Click PayPal, log in with a CA default address | Total $49 (40 + 9); change to a NY address → $45; pay → WC order Processing with the full PayPal address and email; the cart is untouched |
| 4 | Product | Pick or add an **Alaska** address | PayPal rejects it |
| 5 | Cart (Test Rim 17 + Test Tire) | Click PayPal | Total = items + zone rate; pay → order Processing; the cart is emptied on thank-you |
| 6 | Cart | Click PayPal, close the popup; run `paydef_express_expire` early through WooCommerce → Status → Scheduled Actions → "Run" | Order Cancelled, stock restored |
| 7 | Any | Tick "Always redirect" | No buttons on cart/product; checkout shows "Place order"; order redirects to PayPal |
| 8 | Checkout | Block `localhost:4200` in the browser so the iframe can't load | After 10 s "Place order" appears; clicking it redirects |

### Task 19 — C3: Final whole-branch review
Opus reviewer over `c7d812e..HEAD` with this plan, the Review Focus list and the ledger rulings; then one fix pass.

---

## Part D — Rollout (each step needs the user's explicit go-ahead)
1. Migration 030 on production (dry run, then `--yes`; additive only).
2. Merge `feat/paypal-smart-buttons` → `main`, push, Coolify deploy.
3. Header check on a shield domain (`/checkout/buttons?ref=…` → CSP present, no `X-Frame-Options`; the middleware passthrough works).
4. The user uploads plugin 1.10.0 to **one** shop (cozycradles suggested). Behaviour is unchanged until the dashboard is switched.
5. Switch that store to Smart Buttons; one small **real** order from the product page; refund it.
6. Then the other shops.

## Self-review
- **Spec coverage:** R1→A5; R2→A6; R3→A7; R4→A4/A8; R5→A9; R6→B1; R7→B4/B5; R8→B2/B3/B5; R9→B6; R10→B3. D1–D6 are reflected in the Global Constraints.
- **Placeholders:** A3, A5, A7 and B1–B4 describe behaviour precisely with exact names and signatures, but leave routine glue to the executor; their tests list every asserted case. A ruling is needed if any signature here proves unworkable.
- **Type consistency:** `buttonSessionId`/`express`/`paypalOrderId` (A6 ↔ B3/B4/C1); `shipping-change`/`shipping-updated`/`shipping-rejected` (A4 ↔ B5); `order_amount` fields `shipping`/`taxTotal`/`total` (A7 ↔ B3); `payer_email`/`buyer_name`/`shipping_address` (A9 ↔ B6).
