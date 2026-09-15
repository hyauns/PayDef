# PayPal Defect Fixes — Implementation Plan

> **For agentic workers:** execute task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Every task ends at an approval gate.** Do not start task N+1 until the user approves task N.

**Goal:** Fix seven verified defects on PayDef's PayPal path — wrong `current_status`, premature authorization expiry, a silent webhook-loss window, and a per-order return URL — without changing behaviour for Stripe, Shopify or `CUSTOM_MOCK` stores.

**Architecture:** All changes are surgical edits to existing PayPal-only code paths. Three files carry almost all of it: `app/api/webhook/paypal/route.ts` (inbound PayPal truth), `app/api/gateway/execute/route.ts` (buyer-return authorize/capture), `app/api/gateway/checkout/route.ts` (session creation). Stripe/Shopify code is never edited; where a shared file is touched, the change is gated so non-PayPal providers hit the identical old path.

**Tech Stack:** Next.js 16 App Router, TypeScript, Postgres/Neon (raw SQL), `@neondatabase/serverless` + `pg`.

**Spec:** `examples/BAO-LOI-PAYDEF.md` (the original report) plus the DB verification run on 2026-09-15 against `ep-billowing-meadow-aq422rf6` (prod/Coolify), recorded in the "Verified facts" section below.

---

## Global Constraints

- **PayPal only.** No edit may change behaviour for `provider_type` in (`STRIPE`, `SHOPIFY`, `CUSTOM_MOCK`). Where a shared file is edited, the new branch must be unreachable for those providers.
- **Prod DB is `ep-billowing-meadow-aq422rf6`** (from `.env.local`). `.env.prod.vercel` points at `ep-muddy-pine-an67umen`, which is the **old Vercel DB and does not contain the Sansuj store** — never verify against it.
- **No repo has a test framework.** `package.json` has no `test` script and no vitest/jest/playwright dependency. Verification per task is: `npx tsc --noEmit`, `npm run lint`, and targeted **read-only** SQL probes. Do not add a test framework as part of this work.
- **DB access is read-only for verification.** Any `UPDATE`/backfill is its own task with its own explicit approval, never folded into a code task.
- **Working tree:** `C:\Users\ADMIN\Documents\Web Store App\PayDef\v0-payment-gateway-dashboard`, branch `main`, synced to `d22eb82`. The second checkout at `Documents\Working\...` is the same commit; do not edit both.
- **Commit after each task**, message prefixed `fix(paypal):`, ending with the Co-Authored-By line.

---

## Verified facts this plan rests on (DB, 2026-09-15)

| Fact | Value |
|---|---|
| Sansuj store id | `5afa3890-45ce-4cea-b623-ee27c2162275`, `PAYPAL`, `capture_mode=MANUAL`, `checkout_flow=POPUP_BRIDGE` |
| Sansuj `success_return_url` | `https://sansujyuku.com/checkout/order-received` (static, no `key`) |
| `paypal_webhook_id` | **NULL on all 3 merchant_accounts** (Chococlose, Ghiblistores, Giblistores.com) |
| `authorized_at` | **NULL on all 308 Sansuj authorize-path rows** → the PayPal webhook branch has never once written a row |
| Merchant webhook delivery | 980 events, **100% `delivered`**; `authorization.created` avg **2 s**, max 9 s, 0 over 60 min |
| The one real loss | tx `97193189-b539-4a4b-bed3-1c41f086634e` (WC#441211, $767.96, auth `6RJ056664V2942025`) has **no `webhook_events` row at all** — 1 of 305 |
| Premature expiry | authorizations live **avg 7.11 days** by PayDef's clock; **114 rows / $48,034.46** already flipped to `EXPIRED` with `status_reason='authorization_expired'`, none captured |
| Stripe/Shopify | insert `authorization_expires_at = NULL` → untouched by any expiry change |

---

## Task 1: Stop a late capture event from resurrecting a terminal transaction

**Why first:** this is a prerequisite for Task 2. The moment a valid Webhook ID is configured, PayPal will deliver queued/retried events. With today's guard, a `PAYMENT.CAPTURE.COMPLETED` arriving for a row that is `VOIDED` or `REFUNDED` silently overwrites it to `COMPLETED` **and adds the amount to `merchant_accounts.current_volume` a second time**.

**Files:**
- Modify: `app/api/webhook/paypal/route.ts` — `handleCaptureCompleted`, currently lines 377-420

**Interfaces:**
- Consumes: `TransactionRow` (has `status`, `id`, `original_amount`, `merchant_id`), `EventResult`, `GATEWAY_FEE_PERCENT` — all already in this file.
- Produces: no new exports. Task 2 relies only on the corrected behaviour.

**Decision recorded (see approval gate before starting):** `EXPIRED` is **accepted**, not blocked. A PayDef row is `EXPIRED` only because of PayDef's own clock (Task 3 proves the clock is wrong by 22 days); if PayPal says the money was captured, PayPal is right and the row must become `COMPLETED`. `REFUNDED` and `VOIDED` are blocked because applying a capture on top would erase a later, more authoritative state.

- [ ] **Step 1: Read the current handler and confirm the line range**

```bash
sed -n '377,420p' app/api/webhook/paypal/route.ts
```
Expected: the guard reads `if (transaction.status === "COMPLETED")` and the `UPDATE merchant_accounts SET current_volume = current_volume + $1` runs unconditionally after it.

- [ ] **Step 2: Replace the guard**

Replace:

```ts
  if (transaction.status === "COMPLETED") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }
```

with:

```ts
  // Idempotent: the same capture event delivered twice.
  if (transaction.status === "COMPLETED") {
    await client.query("ROLLBACK")
    return { status: "already_processed", transaction_id: transaction.id }
  }

  // A capture cannot legitimately land on a transaction that has already been
  // refunded, voided or disputed — those states are strictly later than a
  // capture, so an event arriving now is out of order and must NOT overwrite
  // them (doing so would also double-count merchant volume).
  // EXPIRED is deliberately NOT in this list: PayDef expires authorizations on
  // its own clock, so an EXPIRED row plus a real PayPal capture means our clock
  // was wrong and PayPal is authoritative.
  const CAPTURE_BLOCKING_STATES = ["REFUNDED", "VOIDED", "DISPUTED"] as const
  if ((CAPTURE_BLOCKING_STATES as readonly string[]).includes(transaction.status)) {
    await client.query("ROLLBACK")
    console.warn(
      `[PayPal Webhook] Ignoring PAYMENT.CAPTURE.COMPLETED for transaction ${transaction.id}: ` +
      `local status is '${transaction.status}', which is later than a capture. ` +
      `capture_id=${event.resource.id}`
    )
    return { status: "ignored_out_of_order", transaction_id: transaction.id }
  }
```

- [ ] **Step 3: Make the volume increment conditional on the row actually being new money**

The `UPDATE merchant_accounts ... current_volume + $1` must only run when the transaction was not already counted. `CANCELED`/`EXPIRED`/`FAILED`/`PENDING`/`AUTHORIZED` were never counted, so after the guard above every surviving state is safe to count exactly once. Add a guard against a null `merchant_id` (Stripe/mock rows carry `merchant_id = NULL` and must never reach this branch):

Replace:

```ts
  await client.query(
    `UPDATE merchant_accounts
     SET current_volume = current_volume + $1,
         updated_at = NOW()
     WHERE id = $2`,
    [originalAmount, transaction.merchant_id]
  )
```

with:

```ts
  // merchant_id is NULL for non-PayPal providers; guard so this stays PayPal-only.
  if (transaction.merchant_id) {
    await client.query(
      `UPDATE merchant_accounts
       SET current_volume = current_volume + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [originalAmount, transaction.merchant_id]
    )
  }
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors attributable to `app/api/webhook/paypal/route.ts`. Record the baseline error count from before the edit and compare.

- [ ] **Step 5: Lint the changed file**

```bash
npx eslint app/api/webhook/paypal/route.ts
```
Expected: clean.

- [ ] **Step 6: Prove the blast radius with a read-only probe**

```sql
-- Any non-PayPal row that could reach handleCaptureCompleted? Expect 0.
SELECT s.provider_type, COUNT(*) FROM transactions t
JOIN stores s ON s.id = t.store_id
WHERE t.merchant_id IS NOT NULL AND s.provider_type <> 'PAYPAL'
GROUP BY 1;
```
Expected: no rows.

- [ ] **Step 7: Commit**

```bash
git add app/api/webhook/paypal/route.ts
git commit -m "fix(paypal): do not let a late capture event overwrite a terminal transaction"
```

- [ ] **Step 8: APPROVAL GATE** — report to the user: the diff, the typecheck/lint result, the probe result. Wait for approval.

---

## Task 2: Give PayPal authorizations their real lifetime

**Problem:** `execute/route.ts:323` and `webhook/paypal/route.ts:358` both hard-code `NOW() + INTERVAL '7 days'`. PayPal authorizations are valid for **29 days** (the 3-day honor period only governs guaranteed capture). PayDef therefore kills authorizations ~22 days early: **114 rows / $48,034.46** already lost this way, and `lib/gateway-recovery.ts` then fires `payment.authorization.expired` to the merchant announcing it.

**Files:**
- Create: `lib/paypal-authorization-window.ts`
- Modify: `app/api/gateway/execute/route.ts:323`
- Modify: `app/api/webhook/paypal/route.ts:358`

**Interfaces:**
- Produces: `export const PAYPAL_AUTHORIZATION_VALID_DAYS = 29` and `export function authorizationExpirySql(): string` returning the literal `NOW() + INTERVAL '29 days'`. Task 3 does not consume these; nothing else does.

**Decision to confirm at the gate:** fixed 29 days vs. reading PayPal's own `expiration_time` off the authorization response. Fixed 29 days is proposed because it needs no new PayPal field plumbing and is never *longer* than PayPal's real window. Reading `expiration_time` is strictly more correct and can be a follow-up.

- [ ] **Step 1: Create the shared constant**

```ts
// lib/paypal-authorization-window.ts
//
// PayPal authorizations remain valid for 29 days from creation. The first 3 days
// are the "honor period" during which capture is guaranteed; after that a capture
// may be declined and the merchant is expected to reauthorize, but the
// authorization itself is still live and must not be treated as dead.
//
// PayDef previously used 7 days here, which expired live authorizations ~22 days
// early and emitted a false payment.authorization.expired to the merchant.
//
// PayPal-only: Stripe and Shopify transactions are always intent=CAPTURE and
// insert authorization_expires_at = NULL, so this value never applies to them.
export const PAYPAL_AUTHORIZATION_VALID_DAYS = 29

/** SQL fragment for the authorization expiry column. Interpolated, not parameterised,
 *  because Postgres does not accept a bind parameter inside an INTERVAL literal. */
export function authorizationExpirySql(): string {
  return `NOW() + INTERVAL '${PAYPAL_AUTHORIZATION_VALID_DAYS} days'`
}
```

- [ ] **Step 2: Use it in the buyer-return authorize path**

In `app/api/gateway/execute/route.ts`, add to the imports:

```ts
import { authorizationExpirySql } from "@/lib/paypal-authorization-window"
```

and change line 323 from:

```ts
                authorization_expires_at = NOW() + INTERVAL '7 days',
```

to:

```ts
                authorization_expires_at = ${authorizationExpirySql()},
```

(the surrounding string is already a template literal — confirm with `sed -n '318,328p' app/api/gateway/execute/route.ts` before editing; if it is a plain quoted string, convert that one SQL string to a template literal and nothing else.)

- [ ] **Step 3: Use it in the PayPal webhook authorize path**

Same import in `app/api/webhook/paypal/route.ts`, and change line 358 the same way.

- [ ] **Step 4: Grep for any remaining 7-day authorization literal**

```bash
grep -rn "INTERVAL '7 days'" --include=*.ts . | grep -v node_modules
```
Expected: only `app/api/admin/stats/route.ts:65` (a reporting window, unrelated) remains. `scripts/020-webhook-hardening.sql:42` is a historical backfill and is left alone.

- [ ] **Step 5: Confirm the reauthorize path is deliberately left at 3 days**

```bash
grep -rn "INTERVAL '3 days'" --include=*.ts . | grep -v node_modules
```
Expected: `app/api/gateway/reauthorize/route.ts:144` and `app/api/merchant/transactions/[id]/reauthorize/route.ts:89`. These are correct — a *re*authorization gets a fresh 3-day honor period — and must NOT be changed.

- [ ] **Step 6: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint app/api/gateway/execute/route.ts app/api/webhook/paypal/route.ts lib/paypal-authorization-window.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/paypal-authorization-window.ts app/api/gateway/execute/route.ts app/api/webhook/paypal/route.ts
git commit -m "fix(paypal): expire authorizations after PayPal's real 29 days, not 7"
```

- [ ] **Step 8: APPROVAL GATE.** Report the diff and note that this fixes *future* rows only — the 114 already-expired rows are Task 6.

---

## Task 3: Close the silent webhook-loss window

**Problem:** in `execute/route.ts` the whole persist-and-deliver block sits inside `try { … } catch (persistErr) { txLog.error(...) }`. If `persistWebhookEventSafe` throws, no `webhook_events` row exists, the per-minute cron has nothing to sweep, and the route still answers `200 AUTHORIZED`. Measured rate: **1 in 305** — and that one is WC#441211, the $767.96 order the report is built around.

**Files:**
- Modify: `app/api/gateway/execute/route.ts` — the `catch (persistErr)` at ~line 394 (authorize) and ~line 586 (capture)
- Modify: `app/api/gateway/capture/route.ts` — the `catch (persistErr)` at ~line 333

**Interfaces:**
- Consumes: `txLog` (already imported), `sendTelegramAlert` — **confirm the real export name first** with `grep -rn "export .*[Tt]elegram" lib/`. If no alert helper exists, this task ships the response-field change only and the alert becomes a separate proposal.

- [ ] **Step 1: Find the alert helper**

```bash
grep -rn "export (async )?function.*[Tt]elegram" lib/ | grep -v node_modules
```
Record the exact name and signature. Do not invent one.

- [ ] **Step 2: Surface the failure in the API response instead of swallowing it**

The payment genuinely succeeded, so the status code must stay `200` — but the caller deserves to know the notification did not persist. In each of the three `catch (persistErr)` blocks, set a flag that the route's success response includes, e.g. declare `let webhookPersistFailed = false` before the `try` and set it to `true` in the `catch`, then add `webhook_event_persisted: !webhookPersistFailed` to the JSON body the route returns.

- [ ] **Step 3: Emit a loud operational alert from the catch**

Using the helper found in Step 1, alert with: transaction id, store id, event name, and the error message. This is the only signal that a payment's notification was lost.

- [ ] **Step 4: Typecheck + lint the three files**

- [ ] **Step 5: Read-only probe — how many rows are missing an event today?**

```sql
SELECT COUNT(*) AS authorized_without_event
FROM transactions t
LEFT JOIN webhook_events w
  ON w.transaction_id = t.id AND w.event_name = 'payment.authorization.created'
WHERE t.store_id = '5afa3890-45ce-4cea-b623-ee27c2162275'
  AND t.status = 'AUTHORIZED' AND w.id IS NULL;
```
Expected: `1` (WC#441211) before any backfill.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(paypal): alert and report when a webhook event fails to persist"
```

- [ ] **Step 7: APPROVAL GATE.**

---

## Task 4: Accept a per-order `returnUrl` on checkout

**Problem:** `CheckoutBody` (`app/api/gateway/checkout/route.ts:73-91`) accepts no return URL, so every transaction stores the store-level static `stores.success_return_url`. WooCommerce's thank-you URL is per-order and carries a secret `key`; without it `woocommerce_thankyou` never fires and GA4/Ads/UET record no purchase.

**Not a redirect change:** `app/order/result-client.tsx:30-38` already redirects to the stored URL verbatim and only appends `transaction_id`, `status`, `paypal_order_id`. That file is not edited.

**Files:**
- Modify: `app/api/gateway/checkout/route.ts` — `CheckoutBody` (73-91), destructure (221-229), validation (247-255), PayPal INSERT (~1272-1273)
- Create: `lib/return-url-guard.ts`

**Interfaces:**
- Produces: `export function resolveMerchantReturnUrl(requested: string | null | undefined, storeDefault: string | null): string | null` — returns the requested URL when it is `https:` **and** its host equals the host of `storeDefault`; otherwise returns `storeDefault` unchanged.

**Security note — this is why the guard exists:** `stores.success_return_url` is admin-set and trusted. A body field is attacker-controlled if a store API key leaks, so accepting it unvalidated turns PayDef into an open redirect. Host-pinning to the store's configured URL keeps the trust boundary where it is.

- [ ] **Step 1: Write the guard**

```ts
// lib/return-url-guard.ts
/**
 * Resolve the post-payment redirect target for one transaction.
 *
 * A merchant may pass a per-order URL (WooCommerce's order-received URL carries a
 * per-order `key`), but it is only honoured when it is https and lives on the same
 * host the store already has configured. Anything else falls back to the store
 * default, so a leaked API key cannot turn the gateway into an open redirect.
 */
export function resolveMerchantReturnUrl(
  requested: string | null | undefined,
  storeDefault: string | null
): string | null {
  if (!requested || typeof requested !== "string") return storeDefault
  if (!storeDefault) return storeDefault

  let want: URL
  let base: URL
  try {
    want = new URL(requested)
    base = new URL(storeDefault)
  } catch {
    return storeDefault
  }
  if (want.protocol !== "https:") return storeDefault
  if (want.host.toLowerCase() !== base.host.toLowerCase()) return storeDefault
  return want.toString()
}
```

- [ ] **Step 2: Exercise the guard with a throwaway script** (no test framework exists; this is the substitute, and it is deleted afterwards)

```bash
node -e "
const {resolveMerchantReturnUrl:r}=require('./lib/return-url-guard.ts');
" 2>/dev/null || echo "TS not directly requireable — instead verify via npx tsx, or inline the cases in a .mjs after npx tsc"
```
Cases that must hold: same-host https → returned; different host → store default; `http:` → store default; `javascript:` → store default; malformed → store default; `null` requested → store default.

- [ ] **Step 3: Add the field to `CheckoutBody`**

```ts
  returnUrl?: string   // per-order success URL; host must match the store's configured success_return_url
```

- [ ] **Step 4: Use it at the PayPal INSERT only**

Change `store.successReturnUrl ?? null` at ~line 1272 to `resolveMerchantReturnUrl(body.returnUrl, store.successReturnUrl ?? null)`. **Do not touch** `lib/stripe-checkout.ts:293` or `lib/shopify-checkout.ts:304` — those keep the store default, which preserves current behaviour for those providers exactly.

- [ ] **Step 5: Typecheck + lint**

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(paypal): honour a per-order returnUrl pinned to the store's own host"
```

- [ ] **Step 7: APPROVAL GATE.**

---

## Task 5: Require webhook signature verification outside production

**Problem:** `app/api/webhook/paypal/route.ts:266-270` returns `{ verified: true, reason: "dev_mode_skip" }` whenever no webhook id is configured and the deployment is not strict production. Preview deployments count as non-production. Any unauthenticated POST can drive a transaction to `COMPLETED`/`REFUNDED`/`DISPUTED`.

**Files:**
- Modify: `app/api/webhook/paypal/route.ts:250-297`

- [ ] **Step 1:** Gate the skip behind an explicit opt-in env var (e.g. `PAYPAL_WEBHOOK_ALLOW_UNVERIFIED=1`) rather than "not production", so a preview deploy is closed by default and local development is a deliberate choice.
- [ ] **Step 2:** Typecheck + lint.
- [ ] **Step 3:** Confirm the var is absent from `.env.local` / `.env.prod.vercel` so nothing changes in prod.
- [ ] **Step 4:** Commit `fix(paypal): require explicit opt-in to skip webhook signature verification`.
- [ ] **Step 5: APPROVAL GATE.**

---

## Task 6 — CANCELLED by the user (2026-09-15)

The user will reconcile the existing 77 `AUTHORIZED` and 114 `authorization_expired` Sansuj rows **manually in the PayPal dashboard**. No backfill, no CSV reconciliation, no writes to production data as part of this work. The requirement is forward-correctness only: transactions created from now on must carry the right expiry and the right status.

**Consequence for Task 1:** because existing rows are not being repaired by us, the capture guard must let PayDef **self-heal**. A `PAYMENT.CAPTURE.COMPLETED` arriving for an `EXPIRED` row is accepted and moves it to `COMPLETED`; only `REFUNDED`, `VOIDED` and `DISPUTED` are blocked.

**Consequence for Task 2:** the 29-day window is **fixed**, not read from PayPal's `expiration_time`, so that a missing or malformed field in a PayPal response can never break the write (user decision).

## Task 7 (separate deliverable): teach the WooCommerce plugin the five events it ignores

Plugin v1.7.1 at `Documents\Working\...\plugin woo\` handles only `payment.authorization.created`, `payment.capture.completed`, `payment.capture.refunded`, `payment.authorization.voided`. PayDef also emits `payment.session.expired`, `payment.checkout.canceled`, `payment.authorization.expired`, `payment.capture.denied`, `payment.dispute.created` — all currently hitting `default: break`.

This is a change to the plugin, not to PayDef, and ships as its own zip. Planned separately once Tasks 1-6 land.

---

## Self-review

- **Spec coverage:** report item #1 → Task 4; #2 → Task 3 (plus Task 7 for the 60-minute window); #3 → Tasks 1, 2, 6 and the Webhook-ID configuration the user performs in the PayPal dashboard; #4 → Task 7. The two defects the report missed → Tasks 1 and 5.
- **Not covered by any task, deliberately:** configuring the three PayPal apps' Webhook IDs is a dashboard action only the user can perform (tracked in memory as `paypal-webhook-misconfigured`), and the 26 unreplayable `dead_letter` events belong to other stores — both are raised to the user rather than planned here.
- **Placeholders:** Task 3 Step 1 and Task 5 Step 1 deliberately begin with a grep because the exact helper name and env-var convention must be read from the codebase, not guessed; every other step carries its literal code.
