# Shield domain health check — design

Date: 2026-10-09 · Status: draft for review

## Why

On 2026-10-09 we found `pay.giblistores.com` and `pay.chococlose.com` NXDOMAIN while both ACTIVE PayPal
accounts used them. PayDef kept routing every PayPal order to those hosts; buyers approved at PayPal, the
return to `/order/success` on the dead host never happened, nothing was captured, and 9 orders went
EXPIRED over several days. Nobody was told. (`pay.bubblyscent.com` is also dead: the apex domain is in
registry `pending delete`.)

Goal: PayDef notices a dead shield host within ~2 minutes, tells the tenant on Telegram, stops routing
PayPal orders to accounts behind it, and — when no healthy account is left — refuses PayPal cleanly
instead of letting buyers pay into a dead return path. It recovers on its own when the host is back.

Non-goals: fixing DNS; Stripe / Shopify; a dashboard UI (the existing `health_ok` / `last_check` fields
already show in the shield-domain admin list); changing `/execute`, capture, refund, void, webhooks.

## Decisions already made (with the user)

1. All accounts of a tenant behind dead shields → **refuse PayPal** (no fail-open, no bypass via paylaz.nl).
2. Probe = **HTTPS request to PayDef on the shield host**, not just DNS/TLS.
3. **Shadow first**: `SHIELD_HEALTH_MODE=shadow|enforce`, default `shadow` (alerts + logs only).
4. Approach A: probe in the existing one-minute recovery cron, state in the database.

## What already exists (reused)

- `shield_domains(domain, is_active, health_ok, last_check, tenant_id, bundle_id, …)`. `health_ok` is
  written today only by admin create/update (`lib/shield-domain-service.ts` `touchHealthSnapshot`), and
  four checkout queries already filter shield-domain choice on `health_ok = true`
  (`app/api/gateway/checkout/route.ts` ~789, 935, 990, 1007).
- `checkDomainBridgeHealth(domain)` in `lib/shield-domain-service.ts`: GET
  `https://<domain>/api/health/shield-popup`, 5 s timeout. The route is in the middleware's
  `SHIELD_PASSTHROUGH_PREFIXES`, so it answers on shield hosts (`/api/health` itself redirects there).
- Recovery cron `app/api/cron/recovery/route.ts`, called every minute by a Coolify task.
- Tenant Telegram (`tenants.telegram_bot_token / telegram_chat_id`, `lib/telegram.ts`), as used by the
  circuit breaker.
- Prod data today: every account `shield_domain` has a matching `shield_domains` row; all four rows are
  shared (`tenant_id` NULL).

## Design

### 1. Probe result

`checkDomainBridgeHealth` becomes stricter: healthy only if HTTP 200 **and** body is exactly
`shield-popup-ok` (a parked page or a wrong server answering 200 must fail). Redirects are not followed
(`redirect: "manual"`), so a host that 307s to somewhere else fails. The admin "check" button uses the
same function and gets the same strictness.

### 2. State — migration 031

```sql
ALTER TABLE shield_domains
  ADD COLUMN IF NOT EXISTS probe_up          BOOLEAN,      -- NULL = never probed
  ADD COLUMN IF NOT EXISTS probe_failures    INTEGER NOT NULL DEFAULT 0,  -- consecutive
  ADD COLUMN IF NOT EXISTS probe_error       TEXT,         -- last failure detail, short
  ADD COLUMN IF NOT EXISTS probe_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS probe_changed_at  TIMESTAMPTZ;  -- last UP<->DOWN flip
```

`probe_up` is the probe's own verdict. `health_ok` stays the field the rest of the system reads; the
probe writes it **only in enforce mode** (in shadow, touching it would already change shield-domain
choice in the four checkout queries).

### 3. Probe run (`lib/shield-health.ts`, called from the recovery cron)

- Domains = `shield_domains WHERE is_active`. Any ACTIVE / WARMING_UP account whose `shield_domain` has
  no row is logged as `shield_health.unregistered_domain` (not probed — the middleware would not serve
  it as a shield host anyway).
- All domains probed in parallel; the run is bounded by the 5 s timeout.
- Pure state transition `nextHealth(prev, ok)`:
  - ok → `probe_failures = 0`, `probe_up = true`.
  - fail → `probe_failures + 1`; `probe_up = false` once `probe_failures >= 2`, else unchanged.
  - So: DOWN after 2 consecutive failures (~2 min), UP after 1 success.
- One UPDATE per domain writes the probe columns (+ `last_check = NOW()`, and `health_ok = probe_up` in
  enforce). `probe_changed_at` set only on a flip.
- A failure inside the probe step is logged and never fails the rest of the recovery cron (webhook
  delivery and expiry sweep keep running).

### 4. Alerts

Sent only on a flip, so at most one message per domain per outage:

- DOWN: `🔴 Shield DOWN: pay.x.com — <error>. Accounts affected: <names>. Mode: shadow (not blocking) / enforce (skipped)`.
- UP: `✅ Shield back UP: pay.x.com (down <duration>)`.
- Recipients: every tenant that has an ACTIVE / WARMING_UP account with that `shield_domain`
  (shield rows are shared, so the account is what links a domain to a tenant).
- Extra line when, after the flip, **none** of that tenant's ACTIVE / WARMING_UP accounts has a healthy
  shield: `⛔ No PayPal account of <tenant> has a working shield — PayPal checkout is <refused | still being routed (shadow)>`.
- Telegram failure is logged, never retried, never blocks.

### 5. Using the state (`filterHealthyShieldAccounts`)

One pure function, used at the three places that choose a PayPal account:

```
filterHealthyShieldAccounts(accounts, healthByDomain, mode, now)
  → { accounts: kept, skipped: [{ accountId, domain, reason }] }
```

- An account is **unhealthy** when its shield row has `probe_up = false` **and** `probe_checked_at` is
  less than 5 minutes old. Never probed, stale data (cron down), or no row → treated as healthy
  (fail-open on *missing information*, never on a known-dead host).
- shadow: returns all accounts, logs `shield_health.would_skip` for each unhealthy one.
- enforce: returns only healthy accounts. An empty result is **not** widened back.

Call sites (health read with one query per request:
`SELECT domain, probe_up, probe_checked_at FROM shield_domains WHERE LOWER(domain) = ANY(...)`):

1. `/api/gateway/checkout`, no button session: applied to the eligible accounts before rotation.
   Enforce + nothing left → **503** `{ error: "PayPal is temporarily unavailable. Please choose another payment method.", code: "shield_unavailable" }`.
   The WooCommerce plugin already shows this as "Unable to start PayPal: …" — no plugin change.
2. `/api/gateway/button-session`: applied before pinning. Enforce + nothing left →
   `{ enabled: false, reason: "shield_unavailable" }`; the plugin shows no Smart Buttons and falls back
   to the classic PayPal place-order path, which then gets the 503 of case 1. Not cached like `flow`,
   so the buttons return as soon as a shield is back.
3. `/api/gateway/checkout` with a button session whose pinned account is now unhealthy (enforce) →
   existing **409** `button_session_account_unavailable`; the plugin renews the session, which then
   lands on case 2.

The same filter feeds the rotation-candidate list used by `advanceRotationPast`, so session pinning
and the pointer keep seeing identical lists (the 2026-10-09 review finding I1).

Not affected: `/execute`, capture, refund, void, webhooks, the recovery sweep, Stripe, Shopify.

### 6. Rollout

1. Deploy with `SHIELD_HEALTH_MODE` unset (= shadow) + run migration 031 (the user runs it).
2. Watch Telegram / logs for a few days. Expected right now: DOWN alerts for giblistores, chococlose and
   bubblyscent and the "no working shield" line for the tenant.
3. Remove `pay.bubblyscent.com` from the pool (`is_active = false`), since the domain is being deleted.
4. Set `SHIELD_HEALTH_MODE=enforce` in Coolify and redeploy.

## Testing (`scripts/verify/shield-health/`, same no-network harness as `verify:smart-buttons`)

- `nextHealth`: fail, fail → DOWN; DOWN + ok → UP; single fail stays UP; flips flagged correctly.
- Probe: 200 + `shield-popup-ok` = ok; 200 other body, 307, 5xx, timeout, DNS error = fail (fake fetch).
- `filterHealthyShieldAccounts`: shadow keeps all + reports; enforce drops dead; stale (> 5 min) and
  never-probed kept; empty result stays empty in enforce.
- Alerts: sent only on flips; right tenants; "no working shield" line only when it is true; Telegram
  error swallowed.
- Routes (through the existing route harness): checkout 503 `shield_unavailable` in enforce with all dead;
  unchanged in shadow; button-session `enabled:false`; pinned-dead session → 409; rotation candidates
  filtered identically.
- Cron: a throwing probe step leaves webhook delivery / expiry sweep results intact.
- Migration 031 verify script (columns exist), like 030.

## Risks

- Probe false positive in enforce = PayPal refused for that tenant. Mitigated by shadow period,
  2-failure threshold, fail-open on stale data, and alerts on every flip.
- PayDef's own outbound network failing makes every domain look DOWN; in enforce that refuses PayPal —
  the same outcome buyers would get anyway, but now with an alert.
- Admin "check" and the cron both write `health_ok`; in enforce the cron is the source of truth (it
  rewrites within a minute).
