# Shield Domain Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PayDef probes every active shield host each minute, alerts the tenant on Telegram when one goes DOWN/UP, and (in enforce mode) stops routing PayPal orders to accounts behind a dead shield — refusing PayPal when none is left.

**Architecture:** One new module `lib/shield-health.ts` holds the probe, the pure state transition, the account filter and the cron step. Migration 031 adds `probe_*` columns to `shield_domains`. The recovery cron calls the step; `/api/gateway/checkout` and `/api/gateway/button-session` call the filter at the same point of their account pipeline, so session pinning and the rotation pointer keep seeing identical lists.

**Tech Stack:** Next.js route handlers (TypeScript), Neon (`getSql()` tagged template, `getPool()` pg pool), Upstash (circuit breaker, unchanged), Telegram Bot API (`lib/telegram.ts`). Tests: plain Node assertion scripts with type-stripping + the alias hook of `scripts/verify/smart-buttons/`.

**Spec:** `docs/superpowers/specs/2026-10-09-shield-health-check-design.md`

## Global Constraints

- Mode env var: `SHIELD_HEALTH_MODE=shadow|enforce`; anything else (incl. unset) = `shadow`.
- Probe URL: `https://<domain>/api/health/shield-popup`, GET, 5 000 ms timeout, `redirect: "manual"`; healthy only if HTTP 200 **and** trimmed body === `shield-popup-ok`.
- DOWN after 2 consecutive failures; UP after 1 success.
- Health data older than 5 minutes, never probed, or no `shield_domains` row → treated as healthy (fail-open on missing information only).
- In shadow the probe NEVER writes `health_ok`; in enforce it writes `health_ok = probe_up` (only when `probe_up` is not NULL).
- Enforce + no healthy account → checkout **503** `{ error: "PayPal is temporarily unavailable. Please choose another payment method.", code: "shield_unavailable" }`; button-session `{ enabled: false, reason: "shield_unavailable" }`; pinned session on a dead account → existing **409** `button_session_account_unavailable`.
- Never touched: `/api/gateway/execute`, capture, refund, void, webhooks, recovery sweep logic, Stripe, Shopify, the WooCommerce plugin.
- Telegram is sent only on a flip; a send failure is logged, never retried, never thrown.
- Production DB is what `.env.local` points to: never run migrations or write queries from tests or from the implementer's shell. The migration is applied by the user.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Add only files you changed (the repo has many untracked files).
- Windows + Git Bash; no pnpm on PATH (`npx pnpm@10.33.0` if ever needed). Edit code with the Edit/Write tools, not heredocs/sed (they eat backslashes).

## Review Focus

1. A domain that answers 200 with a parked page / another app, or 30x-redirects (e.g. Coolify default) → must count as DOWN (Task 1 tests body + 307).
2. Cron stopped for hours → all data stale → nothing is filtered, no PayPal refusal (Task 3 stale test).
3. Domain stored with different case / trailing dot / whitespace in `merchant_accounts.shield_domain` vs `shield_domains.domain` → still matched (Task 3 normalisation test).
4. A tenant whose accounts are all DOWN in **shadow** → orders still routed exactly as before, only logs + Telegram (Task 5 shadow route test).
5. The probe step throwing (DB error, bad row) → the rest of the recovery cron's result is unaffected (Task 4 `safeRunShieldHealthProbe` test).

---

## File Structure

- Create `lib/shield-health.ts` — probe, `nextHealth`, mode, filter, load/apply, cron step, alert text.
- Modify `lib/shield-domain-service.ts:176-206` — `checkDomainBridgeHealth` delegates to `probeShieldDomain`.
- Create `scripts/031-shield-probe.sql`, `scripts/run-031-migration.cjs`.
- Modify `app/api/cron/recovery/route.ts` — call `safeRunShieldHealthProbe`, add its summary to the log row and JSON.
- Modify `app/api/gateway/checkout/route.ts:~499` — `applyShieldHealth` on the account pool + 503.
- Modify `lib/button-session-create.ts` — optional `filterShieldHealth` dep, `shield_unavailable` reason.
- Modify `app/api/gateway/button-session/route.ts` — wire the dep.
- Create `scripts/verify/shield-health/run-all.mjs` + `test-*.mjs`; add `"verify:shield-health"` to `package.json`.

---

### Task 1: Probe + state transition + test runner

**Files:**
- Create: `lib/shield-health.ts`
- Create: `scripts/verify/shield-health/run-all.mjs`, `scripts/verify/shield-health/test-probe.mjs`, `scripts/verify/shield-health/test-next-health.mjs`
- Modify: `package.json` (scripts), `lib/shield-domain-service.ts` (`checkDomainBridgeHealth`)

**Interfaces:**
- Produces:
  - `probeShieldDomain(domain: string, fetchImpl?: typeof fetch): Promise<ProbeResult>` where `ProbeResult = { ok: boolean; status: number | null; error: string | null }`
  - `nextHealth(prev: { probe_up: boolean | null; probe_failures: number }, ok: boolean): { probe_up: boolean | null; probe_failures: number; flipped: "down" | "up" | null }`
  - `normalizeDomain(d: string | null | undefined): string` (lower-case, trimmed, trailing dot removed; `""` for empty)

- [ ] **Step 1: Test runner**

`scripts/verify/shield-health/run-all.mjs`:

```js
// Verification suite for the shield domain health check. Same harness as
// scripts/verify/smart-buttons (type-stripping + @/ alias hook + stubs).
// No database and no network. Run:  npm run verify:shield-health
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const hook = new URL("../smart-buttons/alias-hook.mjs", import.meta.url).href
const tests = readdirSync(here).filter((f) => /^test-.*\.mjs$/.test(f)).sort()

let failed = 0
for (const t of tests) {
  const r = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--import", hook, t], {
    cwd: here,
    encoding: "utf8",
  })
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? "PASS" : "FAIL"}  ${t}`)
  if (!ok) console.log((r.stdout + r.stderr).split("\n").slice(0, 12).map((l) => "      " + l).join("\n"))
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed ? 1 : 0)
```

`package.json` scripts: add `"verify:shield-health": "node scripts/verify/shield-health/run-all.mjs"` next to `verify:smart-buttons`.

- [ ] **Step 2: Failing tests**

`scripts/verify/shield-health/test-probe.mjs`:

```js
import assert from "node:assert/strict"
const { probeShieldDomain, normalizeDomain } = await import("@/lib/shield-health")

const calls = []
const fake = (impl) => async (url, init) => { calls.push({ url, init }); return impl() }
const res = (status, body) => ({ status, text: async () => body })

let r = await probeShieldDomain("pay.a.com", fake(() => res(200, "shield-popup-ok\n")))
assert.deepEqual(r, { ok: true, status: 200, error: null })
assert.equal(calls[0].url, "https://pay.a.com/api/health/shield-popup")
assert.equal(calls[0].init.redirect, "manual")
assert.ok(calls[0].init.signal, "timeout signal")

r = await probeShieldDomain("pay.a.com", fake(() => res(200, "<html>parked</html>")))
assert.equal(r.ok, false); assert.equal(r.status, 200); assert.match(r.error, /unexpected body/)

r = await probeShieldDomain("pay.a.com", fake(() => res(307, "")))
assert.equal(r.ok, false); assert.equal(r.status, 307); assert.match(r.error, /HTTP 307/)

r = await probeShieldDomain("pay.a.com", fake(() => res(502, "bad gateway")))
assert.equal(r.ok, false); assert.match(r.error, /HTTP 502/)

r = await probeShieldDomain("pay.a.com", fake(() => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e }))
assert.equal(r.ok, false); assert.equal(r.status, null); assert.match(r.error, /ENOTFOUND/)

r = await probeShieldDomain("pay.a.com", fake(() => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError") }))
assert.equal(r.ok, false); assert.match(r.error, /timeout/i)

// error text is bounded
r = await probeShieldDomain("pay.a.com", fake(() => { throw new Error("x".repeat(1000)) }))
assert.ok(r.error.length <= 200)

assert.equal(normalizeDomain(" Pay.A.com. "), "pay.a.com")
assert.equal(normalizeDomain(null), "")
console.log("PASS test-probe")
```

`scripts/verify/shield-health/test-next-health.mjs`:

```js
import assert from "node:assert/strict"
const { nextHealth } = await import("@/lib/shield-health")

// never probed
assert.deepEqual(nextHealth({ probe_up: null, probe_failures: 0 }, true), { probe_up: true, probe_failures: 0, flipped: null })
assert.deepEqual(nextHealth({ probe_up: null, probe_failures: 0 }, false), { probe_up: null, probe_failures: 1, flipped: null })
assert.deepEqual(nextHealth({ probe_up: null, probe_failures: 1 }, false), { probe_up: false, probe_failures: 2, flipped: "down" })
// UP: one failure is tolerated, the second flips
assert.deepEqual(nextHealth({ probe_up: true, probe_failures: 0 }, false), { probe_up: true, probe_failures: 1, flipped: null })
assert.deepEqual(nextHealth({ probe_up: true, probe_failures: 1 }, false), { probe_up: false, probe_failures: 2, flipped: "down" })
assert.deepEqual(nextHealth({ probe_up: true, probe_failures: 1 }, true), { probe_up: true, probe_failures: 0, flipped: null })
// DOWN stays down quietly, one success recovers
assert.deepEqual(nextHealth({ probe_up: false, probe_failures: 7 }, false), { probe_up: false, probe_failures: 8, flipped: null })
assert.deepEqual(nextHealth({ probe_up: false, probe_failures: 8 }, true), { probe_up: true, probe_failures: 0, flipped: "up" })
console.log("PASS test-next-health")
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module …/lib/shield-health.ts`)

Run: `npm run verify:shield-health`

- [ ] **Step 4: Implement** — `lib/shield-health.ts` (first part):

```ts
/**
 * lib/shield-health.ts — health of the shield hosts (pay.<brand>.com) that
 * PayPal orders return to.
 *
 * A shield host that does not answer means an approved PayPal order is never
 * captured (the buyer returns to /order/success on that host). The recovery
 * cron probes every active shield each minute; checkout and button-session
 * leave out accounts behind a known-dead shield (SHIELD_HEALTH_MODE=enforce)
 * or only log what they would leave out (shadow, the default).
 *
 * Missing information (never probed, data older than 5 minutes because the
 * cron stopped, no shield_domains row) counts as healthy: only a host the
 * probe has seen failing is ever skipped.
 */

export const PROBE_PATH = "/api/health/shield-popup"
export const PROBE_BODY = "shield-popup-ok"
export const PROBE_TIMEOUT_MS = 5_000
export const DOWN_AFTER_FAILURES = 2
export const PROBE_STALE_MS = 5 * 60_000

export interface ProbeResult {
  ok: boolean
  status: number | null
  error: string | null
}

export function normalizeDomain(d: string | null | undefined): string {
  return (d ?? "").trim().toLowerCase().replace(/\.$/, "")
}

function shortError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string } } | null
  const code = e?.cause?.code
  const text = e?.name === "TimeoutError" ? `timeout after ${PROBE_TIMEOUT_MS} ms` : (e?.message || String(err))
  return (code ? `${code}: ${text}` : text).slice(0, 200)
}

/** GET https://<domain>/api/health/shield-popup — healthy only on 200 + the exact body. */
export async function probeShieldDomain(domain: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  try {
    const res = await fetchImpl(`https://${domain}${PROBE_PATH}`, {
      method: "GET",
      redirect: "manual", // a host redirecting elsewhere is not our shield
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "User-Agent": "PayDef-ShieldHealthCheck/1.0" },
    })
    if (res.status !== 200) return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    const body = (await res.text()).trim()
    if (body !== PROBE_BODY) return { ok: false, status: 200, error: "unexpected body (not a PayDef shield)" }
    return { ok: true, status: 200, error: null }
  } catch (err) {
    return { ok: false, status: null, error: shortError(err) }
  }
}

/** DOWN after DOWN_AFTER_FAILURES consecutive failures, UP after one success. */
export function nextHealth(
  prev: { probe_up: boolean | null; probe_failures: number },
  ok: boolean
): { probe_up: boolean | null; probe_failures: number; flipped: "down" | "up" | null } {
  if (ok) return { probe_up: true, probe_failures: 0, flipped: prev.probe_up === false ? "up" : null }
  const failures = prev.probe_failures + 1
  if (failures >= DOWN_AFTER_FAILURES) {
    return { probe_up: false, probe_failures: failures, flipped: prev.probe_up === false ? null : "down" }
  }
  return { probe_up: prev.probe_up, probe_failures: failures, flipped: null }
}
```

- [ ] **Step 5: Admin check uses the same probe.** In `lib/shield-domain-service.ts` add `import { probeShieldDomain } from "@/lib/shield-health"` and replace the body of `checkDomainBridgeHealth` (keep its signature and log lines):

```ts
  console.info(`[shield-domain] Health check started: domain=${domain}`)
  const r = await probeShieldDomain(domain)
  const detail = r.ok ? `Bridge OK (${r.status})` : `Bridge check failed: ${r.error}`
  console.info(`[shield-domain] Health check result: domain=${domain} healthy=${r.ok} status=${r.status}`)
  return { healthy: r.ok, statusCode: r.status, detail }
```

- [ ] **Step 6: Run — expect PASS:** `npm run verify:shield-health` (2/2) and `npx tsc --noEmit -p .` (exit 0).

- [ ] **Step 7: Commit**

```bash
git add lib/shield-health.ts lib/shield-domain-service.ts package.json scripts/verify/shield-health/run-all.mjs scripts/verify/shield-health/test-probe.mjs scripts/verify/shield-health/test-next-health.mjs
git commit -m "feat(shield-health): strict shield probe and DOWN/UP state transition"
```

---

### Task 2: Migration 031

**Files:**
- Create: `scripts/031-shield-probe.sql`, `scripts/run-031-migration.cjs`

- [ ] **Step 1: SQL** — `scripts/031-shield-probe.sql`:

```sql
-- Migration 031: probe state for shield domains (lib/shield-health.ts).
-- probe_up is the probe's own verdict (NULL = never probed); health_ok stays
-- the field the rest of the system reads and is written by the probe only in
-- SHIELD_HEALTH_MODE=enforce. Idempotent.
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_up BOOLEAN;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_error TEXT;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_checked_at TIMESTAMPTZ;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_changed_at TIMESTAMPTZ;
```

- [ ] **Step 2: Runner** — copy `scripts/run-030-migration.cjs` to `scripts/run-031-migration.cjs` and change exactly: the header comment (`Run migration 031: probe columns on shield_domains`), the SQL file name (`031-shield-probe.sql`), the verification query and check, and the success line:

```js
    const rows = await sql`
      SELECT COUNT(*)::int AS c FROM information_schema.columns
      WHERE table_name = 'shield_domains'
        AND column_name IN ('probe_up', 'probe_failures', 'probe_error', 'probe_checked_at', 'probe_changed_at')
    `;
    console.log("Verification:", rows[0]);
    if (rows[0].c !== 5) {
      console.error("Migration verification FAILED");
      process.exit(1);
    }
    console.log("Migration 031 complete!");
```

- [ ] **Step 3: Dry run only** (prints SQL, touches nothing): `node scripts/run-031-migration.cjs` → expect "Dry run. 5 statements would run". **Do NOT run with `--yes`** — the user applies it to production.

- [ ] **Step 4: Commit**

```bash
git add scripts/031-shield-probe.sql scripts/run-031-migration.cjs
git commit -m "feat(db): migration 031 — shield domain probe state"
```

---

### Task 3: Mode + account filter

**Files:**
- Modify: `lib/shield-health.ts` (append)
- Create: `scripts/verify/shield-health/test-filter.mjs`

**Interfaces:**
- Consumes: `normalizeDomain`, `PROBE_STALE_MS` (Task 1)
- Produces:
  - `type ShieldHealthMode = "shadow" | "enforce"`; `getShieldHealthMode(): ShieldHealthMode`
  - `interface ShieldHealthRow { domain: string; probe_up: boolean | null; probe_checked_at: string | Date | null }`
  - `filterHealthyShieldAccounts<T extends { id: string; shield_domain: string | null }>(accounts: T[], health: ShieldHealthRow[], mode: ShieldHealthMode, now: Date): { accounts: T[]; skipped: Array<{ accountId: string; domain: string }> }`
  - `loadShieldHealth(sql: SqlTag, domains: Array<string | null>): Promise<ShieldHealthRow[]>` — never throws (`[]` on error)
  - `applyShieldHealth<T>(accounts: T[], sql: SqlTag, ctx: { storeId: string; tenantId: string }, mode?: ShieldHealthMode, now?: Date): Promise<{ accounts: T[]; skipped: …; refusedAll: boolean }>`
  - `type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>`

- [ ] **Step 1: Failing test** — `scripts/verify/shield-health/test-filter.mjs`:

```js
import assert from "node:assert/strict"
const sh = await import("@/lib/shield-health")

const NOW = new Date("2026-10-09T12:00:00Z")
const fresh = "2026-10-09T11:59:00Z"
const stale = "2026-10-09T11:50:00Z"
const A = { id: "a", shield_domain: "pay.dead.com" }
const B = { id: "b", shield_domain: "pay.ok.com" }
const C = { id: "c", shield_domain: "Pay.Dead.com." } // case + trailing dot
const D = { id: "d", shield_domain: null }
const health = [
  { domain: "pay.dead.com", probe_up: false, probe_checked_at: fresh },
  { domain: "pay.ok.com", probe_up: true, probe_checked_at: fresh },
]

// mode
delete process.env.SHIELD_HEALTH_MODE; assert.equal(sh.getShieldHealthMode(), "shadow")
process.env.SHIELD_HEALTH_MODE = " Enforce "; assert.equal(sh.getShieldHealthMode(), "enforce")
process.env.SHIELD_HEALTH_MODE = "on"; assert.equal(sh.getShieldHealthMode(), "shadow")

// enforce drops dead (incl. differently written domain), keeps order and no-shield accounts
let r = sh.filterHealthyShieldAccounts([A, B, C, D], health, "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["b", "d"])
assert.deepEqual(r.skipped, [{ accountId: "a", domain: "pay.dead.com" }, { accountId: "c", domain: "pay.dead.com" }])
// shadow keeps everything but reports the same skips
r = sh.filterHealthyShieldAccounts([A, B, C, D], health, "shadow", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a", "b", "c", "d"])
assert.equal(r.skipped.length, 2)
// stale / never probed / no row → healthy
r = sh.filterHealthyShieldAccounts([A], [{ ...health[0], probe_checked_at: stale }], "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a"])
r = sh.filterHealthyShieldAccounts([A], [{ ...health[0], probe_up: null }], "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a"])
r = sh.filterHealthyShieldAccounts([A], [], "enforce", NOW)
assert.deepEqual(r.accounts.map((a) => a.id), ["a"])
// empty stays empty in enforce (never widened back)
r = sh.filterHealthyShieldAccounts([A, C], health, "enforce", NOW)
assert.deepEqual(r.accounts, [])

// loadShieldHealth: one query with normalised, de-duplicated domains; never throws
let seen
const sqlOk = async (strings, ...values) => { seen = { q: strings.join("?"), values }; return health }
assert.deepEqual(await sh.loadShieldHealth(sqlOk, ["Pay.Dead.com", "pay.dead.com", null, "pay.ok.com"]), health)
assert.match(seen.q, /FROM shield_domains/)
assert.deepEqual(seen.values[0], ["pay.dead.com", "pay.ok.com"])
assert.deepEqual(await sh.loadShieldHealth(async () => { throw new Error("db down") }, ["pay.ok.com"]), [])
let queried = false
assert.deepEqual(await sh.loadShieldHealth(async () => { queried = true; return [] }, [null]), [])
assert.equal(queried, false, "no query without domains")

// applyShieldHealth: refusedAll only in enforce with a non-empty pool that became empty
r = await sh.applyShieldHealth([A, C], sqlOk, { storeId: "s", tenantId: "t" }, "enforce", NOW)
assert.equal(r.refusedAll, true)
r = await sh.applyShieldHealth([A, C], sqlOk, { storeId: "s", tenantId: "t" }, "shadow", NOW)
assert.equal(r.refusedAll, false); assert.equal(r.accounts.length, 2)
r = await sh.applyShieldHealth([], sqlOk, { storeId: "s", tenantId: "t" }, "enforce", NOW)
assert.equal(r.refusedAll, false)
console.log("PASS test-filter")
```

- [ ] **Step 2: Run — expect FAIL** (`sh.getShieldHealthMode is not a function`): `npm run verify:shield-health`

- [ ] **Step 3: Implement** — append to `lib/shield-health.ts`:

```ts
// ─── Using the state: which accounts may take a PayPal order ─────────────────

export type ShieldHealthMode = "shadow" | "enforce"
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>

export interface ShieldHealthRow {
  domain: string
  probe_up: boolean | null
  probe_checked_at: string | Date | null
}

export function getShieldHealthMode(): ShieldHealthMode {
  return process.env.SHIELD_HEALTH_MODE?.trim().toLowerCase() === "enforce" ? "enforce" : "shadow"
}

function knownDown(row: ShieldHealthRow | undefined, now: Date): boolean {
  if (!row || row.probe_up !== false || !row.probe_checked_at) return false
  return now.getTime() - new Date(row.probe_checked_at).getTime() < PROBE_STALE_MS
}

/**
 * Accounts behind a shield the probe has recently seen DOWN are skipped
 * (enforce) or only reported (shadow). Order is preserved — the rotation
 * pointer indexes this list. An empty result is never widened back.
 */
export function filterHealthyShieldAccounts<T extends { id: string; shield_domain: string | null }>(
  accounts: T[],
  health: ShieldHealthRow[],
  mode: ShieldHealthMode,
  now: Date
): { accounts: T[]; skipped: Array<{ accountId: string; domain: string }> } {
  const byDomain = new Map(health.map((h) => [normalizeDomain(h.domain), h]))
  const kept: T[] = []
  const skipped: Array<{ accountId: string; domain: string }> = []
  for (const a of accounts) {
    const domain = normalizeDomain(a.shield_domain)
    if (domain && knownDown(byDomain.get(domain), now)) {
      skipped.push({ accountId: a.id, domain })
      if (mode === "shadow") kept.push(a)
    } else {
      kept.push(a)
    }
  }
  return { accounts: kept, skipped }
}

/** Probe state for the given shield hosts. Never throws: no data = healthy. */
export async function loadShieldHealth(sql: SqlTag, domains: Array<string | null>): Promise<ShieldHealthRow[]> {
  const list = [...new Set(domains.map(normalizeDomain).filter(Boolean))]
  if (list.length === 0) return []
  try {
    return (await sql`
      SELECT domain, probe_up, probe_checked_at
      FROM   shield_domains
      WHERE  LOWER(domain) = ANY(${list})
    `) as ShieldHealthRow[]
  } catch (err) {
    console.warn("[shield-health] health lookup failed (treated as healthy):", err instanceof Error ? err.message : err)
    return []
  }
}

/** Load + filter + log, for the account pipelines of checkout and button-session. */
export async function applyShieldHealth<T extends { id: string; shield_domain: string | null }>(
  accounts: T[],
  sql: SqlTag,
  ctx: { storeId: string; tenantId: string },
  mode: ShieldHealthMode = getShieldHealthMode(),
  now: Date = new Date()
): Promise<{ accounts: T[]; skipped: Array<{ accountId: string; domain: string }>; refusedAll: boolean }> {
  if (accounts.length === 0) return { accounts, skipped: [], refusedAll: false }
  const health = await loadShieldHealth(sql, accounts.map((a) => a.shield_domain))
  const r = filterHealthyShieldAccounts(accounts, health, mode, now)
  for (const s of r.skipped) {
    console.warn(
      `[shield-health] ${mode === "enforce" ? "skipped" : "would_skip"} account=${s.accountId} shield=${s.domain} store=${ctx.storeId} tenant=${ctx.tenantId}`
    )
  }
  return { ...r, refusedAll: mode === "enforce" && r.accounts.length === 0 }
}
```

- [ ] **Step 4: Run — expect PASS:** `npm run verify:shield-health` (3/3), `npx tsc --noEmit -p .` exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/shield-health.ts scripts/verify/shield-health/test-filter.mjs
git commit -m "feat(shield-health): account filter with shadow/enforce and fail-open on stale data"
```

---

### Task 4: Cron probe step + Telegram alerts

**Files:**
- Modify: `lib/shield-health.ts` (append)
- Modify: `app/api/cron/recovery/route.ts`
- Create: `scripts/verify/shield-health/test-probe-run.mjs`

**Interfaces:**
- Consumes: `probeShieldDomain`, `nextHealth`, `normalizeDomain`, `getShieldHealthMode`, `SqlTag`
- Produces:
  - `runShieldHealthProbe(sql: SqlTag, opts?: { mode?: ShieldHealthMode; fetchImpl?: typeof fetch; now?: Date; send?: (botToken: string, chatId: string, text: string) => Promise<{ ok: boolean; error?: string }> }): Promise<ShieldProbeSummary>`
  - `safeRunShieldHealthProbe(sql: SqlTag, opts?): Promise<ShieldProbeSummary | { error: string }>` — never throws
  - `interface ShieldProbeSummary { probed: number; down: string[]; flips: Array<{ domain: string; to: "down" | "up" }>; alerts: number }`
  - `buildShieldAlerts(input: { flips: Flip[]; accounts: AlertAccount[]; upByDomain: Map<string, boolean | null>; mode: ShieldHealthMode; now: Date }): Array<{ tenantId: string; botToken: string; chatId: string; text: string }>`

- [ ] **Step 1: Failing test** — `scripts/verify/shield-health/test-probe-run.mjs`:

```js
import assert from "node:assert/strict"
const sh = await import("@/lib/shield-health")

const NOW = new Date("2026-10-09T12:00:00Z")
// shield_domains rows (state before this run)
const domains = [
  { id: "d1", domain: "pay.dead.com", probe_up: true, probe_failures: 1, probe_changed_at: null },     // 2nd failure → DOWN
  { id: "d2", domain: "pay.ok.com", probe_up: true, probe_failures: 0, probe_changed_at: null },       // stays UP
  { id: "d3", domain: "pay.back.com", probe_up: false, probe_failures: 9, probe_changed_at: "2026-10-09T10:00:00Z" }, // recovers
  { id: "d4", domain: "pay.orphan.com", probe_up: true, probe_failures: 1, probe_changed_at: null },   // DOWN, no account uses it
]
const accounts = [
  { id: "a1", name: "Choco <1>", tenant_id: "t1", shield_domain: "pay.dead.com", tenant_name: "T1", telegram_bot_token: "bot1", telegram_chat_id: "chat1" },
  { id: "a2", name: "Gibli", tenant_id: "t1", shield_domain: "pay.back.com", tenant_name: "T1", telegram_bot_token: "bot1", telegram_chat_id: "chat1" },
  { id: "a3", name: "Other", tenant_id: "t2", shield_domain: "pay.dead.com", tenant_name: "T2", telegram_bot_token: null, telegram_chat_id: null },
  // unregistered shield: only logged. (Tenant t2 on purpose — an account with no
  // shield_domains row counts as healthy, like in the filter, so in t1 it would
  // suppress the ⛔ line below.)
  { id: "a4", name: "Lost", tenant_id: "t2", shield_domain: "pay.unregistered.com", tenant_name: "T2", telegram_bot_token: null, telegram_chat_id: null },
]
const updates = []
const sql = async (strings, ...values) => {
  const q = strings.join("?")
  if (q.includes("FROM   shield_domains") && q.includes("is_active")) return domains
  if (q.includes("FROM   merchant_accounts")) return accounts
  if (q.includes("UPDATE shield_domains")) { updates.push({ q, values }); return [] }
  throw new Error("unexpected query: " + q)
}
const fetchImpl = async (url) =>
  String(url).includes("pay.dead.com") || String(url).includes("pay.orphan.com")
    ? (() => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e })()
    : { status: 200, text: async () => "shield-popup-ok" }
const sent = []
const send = async (bot, chat, text) => { sent.push({ bot, chat, text }); return { ok: true } }

let s = await sh.runShieldHealthProbe(sql, { mode: "shadow", fetchImpl, now: NOW, send })
assert.equal(s.probed, 4)
assert.deepEqual(s.down.sort(), ["pay.dead.com", "pay.orphan.com"])
assert.deepEqual(s.flips.map((f) => `${f.domain}:${f.to}`).sort(), ["pay.back.com:up", "pay.dead.com:down", "pay.orphan.com:down"])
assert.equal(updates.length, 4)
// shadow never writes health_ok; the enforce flag is passed as false
for (const u of updates) assert.match(u.q, /health_ok = CASE WHEN \?/)
const u1 = updates.find((u) => u.values.includes("d1"))
assert.ok(u1.values.includes(false), "probe_up=false written for d1")
assert.ok(u1.values.some((v) => typeof v === "string" && v.includes("ENOTFOUND")), "probe_error written")

// one Telegram message per tenant with a bot; tenant t2 has none; orphan domain → no recipient
assert.equal(sent.length, 1)
assert.equal(sent[0].bot, "bot1"); assert.equal(sent[0].chat, "chat1")
assert.match(sent[0].text, /Shield DOWN.*pay\.dead\.com/)
assert.match(sent[0].text, /ENOTFOUND/)
assert.match(sent[0].text, /Choco &lt;1&gt;/, "account names are HTML-escaped")
assert.match(sent[0].text, /shadow/)
assert.match(sent[0].text, /back UP.*pay\.back\.com.*2h/)
assert.doesNotMatch(sent[0].text, /No PayPal account/, "t1 still has pay.back.com healthy")
assert.equal(s.alerts, 1)

// enforce: health_ok written; all of t1's accounts dead → the ⛔ line
updates.length = 0; sent.length = 0
domains[0] = { ...domains[0], probe_up: true, probe_failures: 1 }
domains[2] = { ...domains[2], probe_up: true, probe_failures: 1 } // pay.back.com fails now too
const allDead = async (url) => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND" }; throw e }
s = await sh.runShieldHealthProbe(sql, { mode: "enforce", fetchImpl: allDead, now: NOW, send })
assert.ok(updates.every((u) => u.values.includes(true)), "enforce flag passed as true")
assert.equal(sent.length, 1)
assert.match(sent[0].text, /No PayPal account of T1 has a working shield.*refused/s)

// no flips → no messages
updates.length = 0; sent.length = 0
domains.forEach((d, i) => (domains[i] = { ...d, probe_up: false, probe_failures: 5 }))
s = await sh.runShieldHealthProbe(sql, { mode: "enforce", fetchImpl: allDead, now: NOW, send })
assert.equal(sent.length, 0); assert.equal(s.flips.length, 0)

// a Telegram failure is swallowed (pay.dead.com flips again → t1 gets a message → send throws)
domains[0] = { ...domains[0], probe_up: true, probe_failures: 1 }
s = await sh.runShieldHealthProbe(sql, { mode: "shadow", fetchImpl: allDead, now: NOW, send: async () => { throw new Error("telegram down") } })
assert.equal(s.flips.length, 1)

// safe wrapper never throws
const r = await sh.safeRunShieldHealthProbe(async () => { throw new Error("db down") }, { fetchImpl, now: NOW, send })
assert.match(r.error, /db down/)
console.log("PASS test-probe-run")
```

- [ ] **Step 2: Run — expect FAIL** (`sh.runShieldHealthProbe is not a function`): `npm run verify:shield-health`

- [ ] **Step 3: Implement** — append to `lib/shield-health.ts` (and add `import { sendTelegramMessage } from "@/lib/telegram"` at the top):

```ts
// ─── The probe run (recovery cron, every minute) ─────────────────────────────

interface DomainStateRow {
  id: string
  domain: string
  probe_up: boolean | null
  probe_failures: number
  probe_changed_at: string | Date | null
}

interface AlertAccount {
  id: string
  name: string
  tenant_id: string
  shield_domain: string | null
  tenant_name: string
  telegram_bot_token: string | null
  telegram_chat_id: string | null
}

interface Flip {
  domain: string
  to: "down" | "up"
  error: string | null
  downSince: Date | null // set for "up": when it went down
}

export interface ShieldProbeSummary {
  probed: number
  down: string[]
  flips: Array<{ domain: string; to: "down" | "up" }>
  alerts: number
}

type Sender = (botToken: string, chatId: string, text: string) => Promise<{ ok: boolean; error?: string }>

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60} min` : ""}`
}

/** One message per tenant (with a Telegram bot) that has an account behind a flipped shield. */
export function buildShieldAlerts(input: {
  flips: Flip[]
  accounts: AlertAccount[]
  upByDomain: Map<string, boolean | null>
  mode: ShieldHealthMode
  now: Date
}): Array<{ tenantId: string; botToken: string; chatId: string; text: string }> {
  const out: Array<{ tenantId: string; botToken: string; chatId: string; text: string }> = []
  const tenants = new Map<string, AlertAccount[]>()
  for (const a of input.accounts) {
    if (!a.telegram_bot_token || !a.telegram_chat_id) continue
    tenants.set(a.tenant_id, [...(tenants.get(a.tenant_id) ?? []), a])
  }
  for (const [tenantId, accts] of tenants) {
    const lines: string[] = []
    for (const f of input.flips) {
      const users = accts.filter((a) => normalizeDomain(a.shield_domain) === f.domain)
      if (users.length === 0) continue
      const names = users.map((a) => escapeHtml(a.name)).join(", ")
      if (f.to === "down") {
        const effect = input.mode === "enforce" ? "skipped for new PayPal orders" : "shadow mode: NOT skipped"
        lines.push(`🔴 <b>Shield DOWN</b>: <code>${escapeHtml(f.domain)}</code> — ${escapeHtml(f.error ?? "unknown error")}\nAccounts: ${names} (${effect})`)
      } else {
        const down = f.downSince ? ` (down ${duration(input.now.getTime() - new Date(f.downSince).getTime())})` : ""
        lines.push(`✅ <b>Shield back UP</b>: <code>${escapeHtml(f.domain)}</code>${down}\nAccounts: ${names}`)
      }
    }
    if (lines.length === 0) continue
    const healthy = accts.some((a) => input.upByDomain.get(normalizeDomain(a.shield_domain)) !== false)
    if (!healthy) {
      const what = input.mode === "enforce" ? "PayPal checkout is refused" : "PayPal is still routed to them (shadow mode)"
      lines.push(`⛔ No PayPal account of ${escapeHtml(accts[0].tenant_name)} has a working shield — ${what}.`)
    }
    out.push({ tenantId, botToken: accts[0].telegram_bot_token!, chatId: accts[0].telegram_chat_id!, text: lines.join("\n\n") })
  }
  return out
}

export async function runShieldHealthProbe(
  sql: SqlTag,
  opts: { mode?: ShieldHealthMode; fetchImpl?: typeof fetch; now?: Date; send?: Sender } = {}
): Promise<ShieldProbeSummary> {
  const mode = opts.mode ?? getShieldHealthMode()
  const now = opts.now ?? new Date()
  const send = opts.send ?? sendTelegramMessage
  const enforce = mode === "enforce"

  const rows = (await sql`
    SELECT id, domain, probe_up, probe_failures, probe_changed_at
    FROM   shield_domains
    WHERE  is_active = true
  `) as DomainStateRow[]
  const accounts = (await sql`
    SELECT ma.id, ma.name, ma.tenant_id, ma.shield_domain,
           t.name AS tenant_name, t.telegram_bot_token, t.telegram_chat_id
    FROM   merchant_accounts ma
    JOIN   tenants t ON t.id = ma.tenant_id
    WHERE  ma.status IN ('ACTIVE', 'WARMING_UP')
  `) as AlertAccount[]

  const registered = new Set(rows.map((r) => normalizeDomain(r.domain)))
  for (const a of accounts) {
    const d = normalizeDomain(a.shield_domain)
    if (d && !registered.has(d)) console.warn(`[shield-health] unregistered_domain account=${a.id} shield=${d}`)
  }

  const results = await Promise.all(rows.map((r) => probeShieldDomain(normalizeDomain(r.domain), opts.fetchImpl)))
  const flips: Flip[] = []
  const upByDomain = new Map<string, boolean | null>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const res = results[i]
    const domain = normalizeDomain(row.domain)
    const next = nextHealth({ probe_up: row.probe_up, probe_failures: row.probe_failures }, res.ok)
    upByDomain.set(domain, next.probe_up)
    if (next.flipped) flips.push({ domain, to: next.flipped, error: res.error, downSince: next.flipped === "up" ? (row.probe_changed_at ? new Date(row.probe_changed_at) : null) : null })
    // health_ok (read by the rest of the system) only follows the probe in enforce.
    await sql`
      UPDATE shield_domains
      SET    probe_up         = ${next.probe_up},
             probe_failures   = ${next.probe_failures},
             probe_error      = ${res.error},
             probe_checked_at = NOW(),
             probe_changed_at = CASE WHEN ${next.flipped !== null} THEN NOW() ELSE probe_changed_at END,
             last_check       = NOW(),
             health_ok = CASE WHEN ${enforce} AND ${next.probe_up}::boolean IS NOT NULL THEN ${next.probe_up}::boolean ELSE health_ok END
      WHERE  id = ${row.id}
    `
    if (next.flipped) console.warn(`[shield-health] ${domain} is ${next.flipped.toUpperCase()} (${res.error ?? "ok"}) mode=${mode}`)
  }

  let alerts = 0
  for (const m of buildShieldAlerts({ flips, accounts, upByDomain, mode, now })) {
    try {
      const r = await send(m.botToken, m.chatId, m.text)
      if (r.ok) alerts++
      else console.error(`[shield-health] Telegram alert failed tenant=${m.tenantId}: ${r.error}`)
    } catch (err) {
      console.error(`[shield-health] Telegram alert error tenant=${m.tenantId}:`, err instanceof Error ? err.message : err)
    }
  }

  return {
    probed: rows.length,
    down: [...upByDomain].filter(([, up]) => up === false).map(([d]) => d),
    flips: flips.map((f) => ({ domain: f.domain, to: f.to })),
    alerts,
  }
}

/** For the recovery cron: a failing probe must never fail the sweep. */
export async function safeRunShieldHealthProbe(
  sql: SqlTag,
  opts: Parameters<typeof runShieldHealthProbe>[1] = {}
): Promise<ShieldProbeSummary | { error: string }> {
  try {
    return await runShieldHealthProbe(sql, opts)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.warn("[shield-health] probe run failed:", error)
    return { error }
  }
}
```

Note: the test's `sql` fake matches `"FROM   shield_domains"` (three spaces, as written above) — keep the query text exactly as shown.

- [ ] **Step 4: Wire into the cron.** In `app/api/cron/recovery/route.ts`:
  - import: `import { safeRunShieldHealthProbe } from "@/lib/shield-health"`
  - after the button-session purge block, before `const durationMs`, add:

```ts
  // Shield hosts: an unreachable pay.<brand> host means approved PayPal orders
  // are never captured. Independent of the sweep's outcome and never fatal.
  const shieldProbe = await safeRunShieldHealthProbe(sql)
```

  - add `shield_probe: shieldProbe,` to the OK `system_logs` metadata JSON and `shield_probe: shieldProbe,` to the OK JSON response.

- [ ] **Step 5: Run — expect PASS:** `npm run verify:shield-health` (4/4), `npm run verify:smart-buttons` (25/25), `npx tsc --noEmit -p .` exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/shield-health.ts app/api/cron/recovery/route.ts scripts/verify/shield-health/test-probe-run.mjs
git commit -m "feat(shield-health): recovery cron probes shield hosts and alerts on DOWN/UP"
```

---

### Task 5: Checkout uses the filter

**Files:**
- Modify: `app/api/gateway/checkout/route.ts` (~line 499, the `allAccounts` line)
- Create: `scripts/verify/shield-health/test-checkout-shield.mjs`

**Interfaces:**
- Consumes: `applyShieldHealth(accounts, sql, ctx)` (Task 3)

- [ ] **Step 1: Failing test** — `scripts/verify/shield-health/test-checkout-shield.mjs`. The harness is the one of `scripts/verify/smart-buttons/test-checkout-session-route.mjs` (real route; fake pool / SQL / PayPal fetch), reduced to what this test needs:

```js
// /api/gateway/checkout with dead shields, through the real route.
import assert from "node:assert/strict"
process.env.SHIELD_HEALTH_MODE = "enforce"
delete process.env.UPSTASH_REDIS_REST_URL // circuit breaker off
const { POST } = await import("@/app/api/gateway/checkout/route")
const { clearRotationCache } = await import("@/lib/merchant-rotation")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS", // as in test-checkout-session-route.mjs; button sessions need it
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id, domain) => ({
  id, tenant_id: "tenant-1", client_id: "cid-" + id, client_secret: "secret", shield_domain: domain, proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
})
const SESSION = {
  id: "11111111-2222-3333-4444-555555555555", store_id: "store-1", merchant_account_id: "acct-dead", context: "checkout",
  amount: "20.00", currency: "USD", expires_at: new Date(Date.now() + 600_000).toISOString(),
}
const fresh = new Date(Date.now() - 30_000).toISOString()
const HEALTH = [
  { domain: "pay.dead.com", probe_up: false, probe_checked_at: fresh },
  { domain: "pay.ok.com", probe_up: true, probe_checked_at: fresh },
]

let scenario
let lockedIds = []
globalThis.__harnessStore = STORE
globalThis.__harnessSql = (strings, ...values) => {
  const q = strings.join("?")
  if (q.includes("FROM   shield_domains")) return HEALTH
  if (q.includes("FROM   button_sessions")) return [scenario.session]
  if (q.includes("UPDATE tenants")) return [{ id: "tenant-1" }]
  if (q.includes("FROM tenants")) return [{ rotation_strategy: "SEQUENTIAL", rotation_interval: 120, last_rotation_index: 0, last_rotation_at: null }]
  return []
}
globalThis.__harnessPool = {
  connect: async () => ({
    release() {},
    async query(text, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] }
      if (text.includes("FROM   merchant_accounts ma")) return { rows: scenario.accounts }
      if (text.includes("FOR UPDATE")) { lockedIds.push(params[0]); return { rows: [scenario.accounts.find((a) => a.id === params[0])] } }
      if (/RETURNING\s+id/i.test(text) || /gen_random_uuid/i.test(text)) return { rows: [{ id: "99999999-8888-7777-6666-555555555555" }] }
      return { rows: [] }
    },
  }),
}
globalThis.fetch = async (url) => {
  const u = String(url)
  const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: new Headers() })
  if (u.includes("/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 3600 })
  if (u.includes("/v2/checkout/orders")) return json({ id: "5O190127TN364715T", status: "CREATED", links: [{ rel: "approve", href: "https://www.paypal.com/checkoutnow?token=5O190127TN364715T" }, { rel: "payer-action", href: "https://www.paypal.com/checkoutnow?token=5O190127TN364715T" }] })
  return json({})
}
const call = async (body) => {
  clearRotationCache("tenant-1")
  const r = await POST({ json: async () => body, headers: { get: () => null } })
  return { status: r.status, body: await r.json() }
}
const BODY = { amount: 20, currency: "USD", itemName: "Thing" }

// all shields dead → 503 shield_unavailable, nothing locked
scenario = { accounts: [acct("acct-dead", "pay.dead.com"), acct("acct-dead2", "Pay.Dead.com")] }
lockedIds = []
let r = await call(BODY)
assert.equal(r.status, 503, JSON.stringify(r.body))
assert.equal(r.body.code, "shield_unavailable")
assert.equal(lockedIds.length, 0)

// one healthy → the order goes to it
scenario = { accounts: [acct("acct-dead", "pay.dead.com"), acct("acct-ok", "pay.ok.com")] }
lockedIds = []
r = await call(BODY)
assert.equal(r.status, 201, JSON.stringify(r.body))
assert.deepEqual(lockedIds, ["acct-ok"])

// button session pinned on a dead account → 409 (plugin renews the session)
scenario = { session: SESSION, accounts: [acct("acct-dead", "pay.dead.com"), acct("acct-ok", "pay.ok.com")] }
r = await call({ ...BODY, buttonSessionId: SESSION.id })
assert.equal(r.status, 409, JSON.stringify(r.body))
assert.equal(r.body.code, "button_session_account_unavailable")

// shadow: all dead, still routed exactly as before
process.env.SHIELD_HEALTH_MODE = "shadow"
scenario = { accounts: [acct("acct-dead", "pay.dead.com")] }
lockedIds = []
r = await call(BODY)
assert.equal(r.status, 201, JSON.stringify(r.body))
assert.deepEqual(lockedIds, ["acct-dead"])
console.log("PASS test-checkout-shield")
```

If the route needs other harness answers to reach 201 (it reached 201 in `test-checkout-session-route.mjs` with the same answers), copy them from that file rather than changing the route.

- [ ] **Step 2: Run — expect FAIL** (first assertion: status 201 instead of 503): `npm run verify:shield-health`

- [ ] **Step 3: Implement.** In `app/api/gateway/checkout/route.ts`:
  - import: `import { applyShieldHealth } from "@/lib/shield-health"`
  - replace
    ```ts
    const allAccounts = eligibleQuery.rows.filter((account) => !excludedAccountIds.has(account.id))
    ```
    with
    ```ts
    // Accounts behind a shield host the probe has seen DOWN never take a new
    // order in enforce mode: the buyer could pay but would return to a dead
    // /order/success and the order would never be captured. Same place in the
    // pipeline as /api/gateway/button-session, so the rotation lists match.
    const shield = await applyShieldHealth(
      eligibleQuery.rows.filter((account) => !excludedAccountIds.has(account.id)),
      getSql(),
      { storeId: store.id, tenantId }
    )
    const allAccounts = shield.accounts

    if (shield.refusedAll && !buttonSession) {
      await client.query("ROLLBACK")
      log.warn("checkout.shield_unavailable", "Every PayPal account is behind a DOWN shield host", { storeId: store.id, tenantId })
      return NextResponse.json(
        { error: "PayPal is temporarily unavailable. Please choose another payment method.", code: "shield_unavailable" },
        { status: 503 }
      )
    }
    ```
  (`getSql` is already imported in this file; check `log.warn`'s signature matches the existing `log.warn("checkout.button_session_account_unavailable", …)` call and follow it.)

- [ ] **Step 4: Run — expect PASS:** `npm run verify:shield-health` (5/5), `npm run verify:smart-buttons` (25/25 — existing route tests return `[]` for the health query, i.e. healthy), `npx tsc --noEmit -p .` exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/gateway/checkout/route.ts scripts/verify/shield-health/test-checkout-shield.mjs
git commit -m "feat(shield-health): checkout skips accounts behind a DOWN shield (503 when none is left)"
```

---

### Task 6: Button sessions use the filter

**Files:**
- Modify: `lib/button-session-create.ts`, `app/api/gateway/button-session/route.ts`
- Create: `scripts/verify/shield-health/test-button-session-shield.mjs`

**Interfaces:**
- Consumes: `applyShieldHealth` (Task 3)
- Produces: `ButtonSessionDeps.filterShieldHealth?(accounts: MerchantAccountRow[]): Promise<MerchantAccountRow[]>`; `ButtonSessionResult` reason union gains `"shield_unavailable"`.

- [ ] **Step 1: Failing test** — `scripts/verify/shield-health/test-button-session-shield.mjs`:

```js
import assert from "node:assert/strict"
const { createButtonSession } = await import("@/lib/button-session-create")

const STORE = {
  id: "store-1", name: "Shop", tenantId: "tenant-1", webhookUrl: null, shieldDomain: null, isActive: true,
  captureMode: "INSTANT", checkoutFlow: "SMART_BUTTONS",
  successReturnUrl: "https://shop.example.com/checkout/order-received", cancelReturnUrl: "https://shop.example.com/checkout",
  providerType: "PAYPAL",
}
const acct = (id, domain) => ({
  id, tenant_id: "tenant-1", client_id: "cid-" + id, client_secret: "x", shield_domain: domain, proxy_url: null,
  daily_limit: "1000", soft_limit: null, daily_limit_override: null, current_volume: "0", priority: 1, status: "ACTIVE",
  warmup_started_at: null, item_masking: false, fake_product_name: "", display_profile_id: null, bundle_id: null, recent_order_count: "0",
})
const input = { store: STORE, amount: 20, currency: "USD", context: "cart", defaultFlow: "REDIRECT" }
const deps = (accounts, filterShieldHealth) => {
  const d = {
    seen: null,
    loadAccounts: async () => accounts,
    preferredProfileId: async () => null,
    filterOpenCircuits: async (a) => a,
    selectByStrategy: async (a) => { d.seen = a.map((x) => x.id); return a[0] },
    insertSession: async () => ({ id: "sess-1", expires_at: "2026-10-09T12:30:00Z" }),
  }
  if (filterShieldHealth) d.filterShieldHealth = filterShieldHealth
  return d
}
const dropDead = async (a) => a.filter((x) => x.shield_domain !== "pay.dead.com")

// dead account never pinned; rotation sees the filtered list
let d = deps([acct("a", "pay.dead.com"), acct("b", "pay.ok.com")], dropDead)
let r = await createButtonSession(d, input)
assert.equal(r.enabled, true)
assert.deepEqual(d.seen, ["b"])
assert.match(r.embedUrl, /pay\.ok\.com/)

// all dead → shield_unavailable (not no_account)
r = await createButtonSession(deps([acct("a", "pay.dead.com")], dropDead), input)
assert.deepEqual(r, { enabled: false, reason: "shield_unavailable" })

// no accounts at all stays no_account; dep omitted = unchanged behaviour
r = await createButtonSession(deps([], dropDead), input)
assert.deepEqual(r, { enabled: false, reason: "no_account" })
d = deps([acct("a", "pay.dead.com")])
r = await createButtonSession(d, input)
assert.equal(r.enabled, true)
console.log("PASS test-button-session-shield")
```

- [ ] **Step 2: Run — expect FAIL** (`d.seen` is `["a","b"]`): `npm run verify:shield-health`

- [ ] **Step 3: Implement.** In `lib/button-session-create.ts`:
  - add to `ButtonSessionDeps`:
    ```ts
      /** Shield health (lib/shield-health.ts): leaves out accounts behind a DOWN shield in enforce mode. */
      filterShieldHealth?(accounts: MerchantAccountRow[]): Promise<MerchantAccountRow[]>
    ```
  - reason union: `reason: "flow" | "framing_not_configured" | "no_account" | "shield_unavailable"`
  - replace
    ```ts
      const eligible = filterEligibleAccounts(await deps.loadAccounts(store.tenantId), input.amount)
    ```
    with
    ```ts
      // Shield health first — the same place in the pipeline as checkout, so the
      // list the rotation pointer indexes is identical on both sides.
      const loaded = await deps.loadAccounts(store.tenantId)
      const healthy = deps.filterShieldHealth ? await deps.filterShieldHealth(loaded) : loaded
      if (loaded.length > 0 && healthy.length === 0) return { enabled: false, reason: "shield_unavailable" }
      const eligible = filterEligibleAccounts(healthy, input.amount)
    ```
  - update the header comment's pipeline line to: `eligibility → display-profile preference → circuit breaker → rotation strategy` → `shield health → eligibility → display-profile preference → circuit breaker → rotation strategy`.

  In `app/api/gateway/button-session/route.ts`: `import { applyShieldHealth } from "@/lib/shield-health"` and add to the deps object (next to `filterOpenCircuits`):
    ```ts
      filterShieldHealth: async (accounts) =>
        (await applyShieldHealth(accounts, sql, { storeId: store.id, tenantId: store.tenantId })).accounts,
    ```

- [ ] **Step 4: Run — expect PASS:** `npm run verify:shield-health` (6/6), `npm run verify:smart-buttons` (25/25), `npx tsc --noEmit -p .` exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/button-session-create.ts app/api/gateway/button-session/route.ts scripts/verify/shield-health/test-button-session-shield.mjs
git commit -m "feat(shield-health): button sessions never pin an account behind a DOWN shield"
```

---

### Task 7: Final verification

- [ ] Run `npm run verify:shield-health` (6/6), `npm run verify:smart-buttons` (25/25), `npx tsc --noEmit -p .` (exit 0); paste the tallies in the report.
- [ ] `git log --oneline main..HEAD` shows the spec commit + 6 feature commits; `git status --short | grep -v '^??'` is empty.
- [ ] Do not push, merge, or run migration 031 with `--yes`. Hand-off for the user:
  1. `! node scripts/run-031-migration.cjs --yes`
  2. `! git checkout main && git merge --ff-only feat/shield-health-check && git push` (Coolify deploys; `SHIELD_HEALTH_MODE` unset = shadow)
  3. After deploy: within ~2 min a Telegram 🔴 for `pay.giblistores.com` and `pay.chococlose.com` plus the ⛔ line; `pay.bubblyscent.com` has no account, so it is only logged.
  4. Later: `UPDATE shield_domains SET is_active = false WHERE domain = 'pay.bubblyscent.com'`; then `SHIELD_HEALTH_MODE=enforce` in Coolify + redeploy.
