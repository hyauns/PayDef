/**
 * POST /api/gateway/checkout
 *
 * Public endpoint consumed by merchant storefronts.
 * Authentication: X-Store-ID + X-API-Key headers (bcrypt verified).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  ATOMIC TRANSACTION FLOW (Phase 3.2)                               │
 * │                                                                     │
 * │  Pre-flight (outside transaction):                                  │
 * │    1. Validate X-Store-ID / X-API-Key headers                       │
 * │    2. Parse & validate request body                                 │
 * │    3. Resolve store + verify API key → tenantId                     │
 * │                                                                     │
 * │  Inside single DB transaction (BEGIN → COMMIT / ROLLBACK):          │
 * │    4. Fetch ACTIVE + WARMING_UP merchant accounts for tenant        │
 * │    5. Filter by warm-up cap + daily limit → weighted random select  │
 * │    6. SELECT … FOR UPDATE — row-level lock on chosen account        │
 * │    7. Re-verify volume limit with locked data                       │
 * │    8. Mask item name + build shield URLs                            │
 * │    9. Create PayPal order (approval link)                           │
 * │   10. INSERT transaction row (status = PENDING)                     │
 * │   11. UPDATE merchant current_volume                                │
 * │   12. COMMIT → return { approvalUrl, transactionId }                │
 * │                                                                     │
 * │  Rollback guarantee: if ANY step 4-11 fails, ROLLBACK runs and     │
 * │  no phantom volume increase or orphan transaction row is created.   │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server"
import { createLogger } from "@/lib/logger"

const moduleLog = createLogger({ route: "/api/gateway/checkout" })
import bcrypt from "bcryptjs"
import { getPool, getSql } from "@/lib/neon"
import {
  clearPayPalTokenCache,
  createPayPalOrder,
  getApprovalUrl,
  isInvalidClientError,
  isFatalForbiddenError,
  isTemporaryForbiddenError,
  isRateLimitError,
  PayPalApiError,
} from "@/lib/paypal"
import { sendTelegramMessage } from "@/lib/telegram"
import { recordPayPalError, filterOpenCircuits } from "@/lib/circuit-breaker"
import { maskItemName, buildShieldUrls } from "@/lib/masking"
import { resolvePaymentDisplayProfile, buildPaymentDisplayName } from "@/lib/payment-display-profiles"
import {
  buildPopupBridgeUrl,
  getCheckoutPreferences,
  resolveCheckoutFlow,
} from "@/lib/checkout-flow"
import { decrypt, isEncrypted } from "@/lib/encryption"
import {
  type MerchantAccountRow,
  filterEligibleAccounts,
  selectByStrategy,
  getEffectiveDailyLimit,
  WARMUP_MAX_TRANSACTION,
} from "@/lib/merchant-rotation"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { compareApiKeyCached } from "@/lib/api-key-cache"
import { generateExecuteToken, getMode as getExecuteTokenMode } from "@/lib/execute-token"

// ─── Request body shape ───────────────────────────────────────────────────────

interface CheckoutBody {
  amount:        number   // decimal, e.g. 49.99
  currency?:     string   // ISO 4217, default "USD"
  itemName:      string   // real product name (will be masked)
  intent?:       "CAPTURE" | "AUTHORIZE"  // default "CAPTURE"
  customerEmail?: string  // optional payer email for audit trail
  buyerIp?:      string
  buyerCountry?: string
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface StoreRow {
  id:            string
  name:          string
  tenant_id:     string
  api_key_hash:  string
  is_active:     boolean
  capture_mode:  string   // 'INSTANT' | 'MANUAL'
  checkout_flow: string | null
  success_return_url: string | null
  cancel_return_url: string | null
}

function getClientIdHint(clientId: string): string {
  return `${clientId.slice(0, 8)}...${clientId.slice(-4)}`
}

function normalizeSecret(secret: string): string {
  return secret.trim()
}

function resolveProxyUrl(proxyUrl: string | null): string | undefined {
  if (!proxyUrl) return undefined
  const value = isEncrypted(proxyUrl) ? decrypt(proxyUrl) : proxyUrl
  const normalized = value.trim()
  return normalized || undefined
}

async function quarantineMerchantAccount(
  accountId: string,
  reason: string,
  tenantId?: string
): Promise<void> {
  const sql = getSql()
  // Only returns rows that actually changed status — for anti-spam alerting
  const result = await sql`
    UPDATE merchant_accounts
    SET status = 'SUSPENDED',
        updated_at = NOW()
    WHERE id = ${accountId}
      AND status IN ('ACTIVE', 'WARMING_UP')
    RETURNING id
  `
  const statusChanged = (result as unknown[]).length > 0
  moduleLog.error("checkout.account_quarantined", `account=${accountId} reason=${reason} status_changed=${statusChanged}`, {
    merchantAccountId: accountId,
    accountStatus: "SUSPENDED"
  })

  // Telegram alert only if status actually changed (anti-spam)
  if (statusChanged && tenantId) {
    try {
      const tenantRows = await sql`
        SELECT telegram_bot_token, telegram_chat_id
        FROM tenants WHERE id = ${tenantId} LIMIT 1
      `
      const tenant = tenantRows[0] as { telegram_bot_token: string | null; telegram_chat_id: string | null } | undefined
      if (tenant?.telegram_bot_token && tenant?.telegram_chat_id) {
        const message = [
          "\u{1F6A8} <b>CRITICAL: PayPal Account Quarantined</b>",
          "",
          `Account: <code>${accountId}</code>`,
          `Reason: <b>${reason}</b>`,
          "",
          "Check PayPal Business Dashboard immediately.",
        ].join("\n")
        const alertResult = await sendTelegramMessage(tenant.telegram_bot_token, tenant.telegram_chat_id, message)
        if (!alertResult.ok) {
          moduleLog.error("checkout.telegram_alert_failed", `Telegram alert failed: ${alertResult.error}`, {
            merchantAccountId: accountId,
            error: alertResult.error
          })
        }
      }
    } catch (alertErr) {
      // Alert failure must never block checkout
      moduleLog.error("checkout.telegram_alert_failed", "Telegram alert error (non-blocking):", {
        merchantAccountId: accountId,
        error: alertErr
      })
    }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  const log = moduleLog.child({ requestId, traceId: requestId })
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  MAINTENANCE MODE CHECK
  //  If the admin has enabled maintenance mode, reject all checkout traffic.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  try {
    const maintenanceSql = getSql()
    const ctrlRows = (await maintenanceSql`
      SELECT value FROM system_settings WHERE key = 'gateway_controls'
    `) as unknown as { value: { maintenanceMode?: boolean } }[]
    if (ctrlRows[0]?.value?.maintenanceMode === true) {
      return NextResponse.json(
        { error: "Gateway is in maintenance mode. Please try again later." },
        { status: 503 }
      )
    }
  } catch {
    // If we can't check, proceed (fail-open for availability)
  }

  // ── Resolve intent ──────────────────────────────────────────────────────────
  // Priority: explicit intent from the store request > capture_mode fallback.
  //
  // The store is the authority on what intent it needs for each transaction.
  // The gateway's capture_mode is only used as a DEFAULT when the store
  // doesn't specify intent (backwards compatibility for older integrations).
  //
  // ATP-2026-00036: Previously the gateway unconditionally overrode the
  // store's explicit intent based on capture_mode, causing CAPTURE-intent
  // transactions to be processed as AUTHORIZE when the gateway's stores
  // table had capture_mode=MANUAL (even if the store intended CAPTURE).
  let intent: "CAPTURE" | "AUTHORIZE" = "CAPTURE"

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PRE-FLIGHT: validate headers, body, and store credentials
  //  (no DB mutation — safe to run outside the transaction)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── Step 1. Extract & validate headers ─────────────────────────────────────
  const storeId = req.headers.get("X-Store-ID")
  const apiKey  = req.headers.get("X-API-Key")

  if (!storeId || !apiKey) {
    return NextResponse.json(
      { error: "Missing X-Store-ID or X-API-Key header." },
      { status: 401 }
    )
  }

  // ── Step 2. Parse & validate body ──────────────────────────────────────────
  let body: CheckoutBody
  try {
    body = (await req.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const {
    amount,
    currency = "USD",
    itemName,
    intent: rawIntent,
    customerEmail,
    buyerIp,
    buyerCountry,
  } = body

  if (rawIntent === "CAPTURE" || rawIntent === "AUTHORIZE") {
    // Store explicitly specified intent — gateway honours it
    intent = rawIntent
    log.info("checkout.intent_explicit", `Store sent explicit intent=${intent} (store=${storeId})`, {
      storeId,
      intent,
    })
  }

  log.info("checkout.request_started", `Incoming intent=${rawIntent ?? "<not sent>"} amount=${amount} currency=${currency}`, {
    storeId,
    intent: rawIntent ?? undefined,
    amount,
    currency,
  })

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number." },
      { status: 400 }
    )
  }
  if (!itemName?.trim()) {
    return NextResponse.json({ error: "itemName is required." }, { status: 400 })
  }

  const amountStr = amount.toFixed(2)

  // ── Step 3. Resolve store + verify API key (read-only, no mutation) ────────
  const sql = getSql()
  const storeRows = (await sql`
    SELECT id, name, tenant_id, api_key_hash, is_active,
           COALESCE(capture_mode, 'INSTANT') AS capture_mode,
           checkout_flow,
           success_return_url,
           cancel_return_url
    FROM   stores
    WHERE  id = ${storeId}
    LIMIT  1
  `) as unknown as StoreRow[]
  const store = storeRows[0] ?? null

  if (!store || !store.is_active) {
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const keyValid = await compareApiKeyCached(apiKey, store.api_key_hash)
  if (!keyValid) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
  }

  // ── Rate limiting (after auth to avoid blocking valid payments pre-verify) ──
  const { allowed, headers: rlHeaders } = await checkRateLimit(storeId)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: rlHeaders }
    )
  }

  const { tenant_id: tenantId } = store
  const checkoutPreferences = await getCheckoutPreferences(sql)
  const flow = resolveCheckoutFlow(store.checkout_flow, checkoutPreferences)

  // ── Finalise intent (capture_mode fallback + mismatch logging) ──────────────
  // If store sent explicit intent above (line 144-147), it's already set.
  // If not, derive from capture_mode now that we have the store row.
  if (rawIntent !== "CAPTURE" && rawIntent !== "AUTHORIZE") {
    intent = store.capture_mode === "MANUAL" ? "AUTHORIZE" : "CAPTURE"
    log.info("checkout.intent_derived", `No explicit intent → derived from capture_mode=${store.capture_mode} → intent=${intent}`, {
      storeId,
      tenantId,
      captureMode: store.capture_mode,
      intent,
    })
  } else {
    log.info("checkout.intent_explicit", `Store sent explicit intent=${intent}; using explicit intent`, {
      storeId,
      tenantId,
      intent,
    })
  }
  log.info("checkout.intent_finalized", `Final intent=${intent} capture_mode=${store.capture_mode} store=${storeId}`, {
    storeId,
    tenantId,
    captureMode: store.capture_mode,
    intent,
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ATOMIC TRANSACTION
  //  All state-mutating operations are wrapped in a single BEGIN / COMMIT.
  //  Any failure at any step triggers ROLLBACK, preventing:
  //    • phantom volume increases
  //    • orphan PENDING transaction rows
  //    • inconsistent merchant_accounts state
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const pool   = getPool()
  const client = await pool.connect()

  let transactionId: string
  let approvalUrl:   string
  let popupUrl:      string | null = null
  let popupOrigin:   string | null = null
  const excludedAccountIds = new Set<string>()
  let exhaustedInvalidAccounts = false

  try {
    checkoutAttempt: while (true) {
      await client.query("BEGIN")

    // ── Step 4. Fetch eligible merchant accounts (inside transaction) ────────
    // Running this query through the transaction client ensures we see a
    // consistent snapshot — no other connection can commit volume changes
    // between this read and the subsequent FOR UPDATE lock.
    const eligibleQuery = await client.query<MerchantAccountRow>(
      `SELECT ma.id, ma.tenant_id, ma.client_id, ma.client_secret,
              ma.shield_domain, ma.proxy_url,
              ma.daily_limit, ma.soft_limit, ma.daily_limit_override,
              ma.current_volume, ma.priority, ma.status,
              ma.warmup_started_at,
              ma.item_masking, ma.fake_product_name,
              COALESCE(ho.cnt, 0)::TEXT AS recent_order_count
       FROM   merchant_accounts ma
       LEFT JOIN (
         SELECT merchant_id, COUNT(*) AS cnt
         FROM   transactions
         WHERE  created_at > NOW() - INTERVAL '1 hour'
         GROUP BY merchant_id
       ) ho ON ho.merchant_id = ma.id
       WHERE  ma.tenant_id = $1
         AND  ma.status IN ('ACTIVE', 'WARMING_UP')
       ORDER BY ma.priority DESC`,
      [tenantId]
    )

    const allAccounts = eligibleQuery.rows.filter((account) => !excludedAccountIds.has(account.id))

    if (allAccounts.length === 0) {
      await client.query("ROLLBACK")
      if (exhaustedInvalidAccounts) {
        return NextResponse.json(
          { error: "Payment provider error. No healthy payment accounts are currently available." },
          { status: 502 }
        )
      }
      return NextResponse.json(
        { error: "System Overloaded — no active payment accounts available." },
        { status: 403 }
      )
    }

    // ── Step 5. Filter by warm-up cap + daily limit → weighted random ────────
    const eligible = filterEligibleAccounts(allAccounts, amount)

    if (eligible.length === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "System Overloaded — all accounts have reached their daily limit." },
        { status: 403 }
      )
    }

    // ── Circuit breaker filter (shadow/enforce) ──────────────────────────────
    const circuitFiltered = await filterOpenCircuits(eligible, storeId)

    const candidate = await selectByStrategy(circuitFiltered, tenantId, getSql())

    // ── Step 6. SELECT … FOR UPDATE — row-level lock ─────────────────────────
    // Acquires an exclusive row lock on the chosen merchant account.
    // Concurrent requests targeting the same account will block here until
    // this transaction completes, guaranteeing serial volume updates.
    const locked = await client.query<MerchantAccountRow>(
      `SELECT id, tenant_id, client_id, client_secret,
              shield_domain, proxy_url,
              daily_limit, soft_limit, daily_limit_override,
              current_volume, priority, status,
              warmup_started_at,
              item_masking, fake_product_name
       FROM   merchant_accounts
       WHERE  id = $1
       FOR UPDATE`,
      [candidate.id]
    )

    const account = locked.rows[0]

    // ── Step 7. Re-verify volume limit with locked (authoritative) data ──────
    // Between step 4's snapshot read and acquiring the lock, another request
    // may have committed a volume increase.  We must re-check with the
    // freshly locked row to prevent over-commitment.
    const currentVolume = parseFloat(account.current_volume)
    const effectiveLimit = getEffectiveDailyLimit(account)

    if (currentVolume + amount > effectiveLimit) {
      await client.query("ROLLBACK")
      excludedAccountIds.add(account.id)
      continue
    }

    if (false && currentVolume + amount > effectiveLimit) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "System Overloaded — selected account capacity exceeded. Please retry." },
        { status: 403 }
      )
    }

    // Warm-up double-check with locked data
    if (account.status === "WARMING_UP" && amount > WARMUP_MAX_TRANSACTION) {
      await client.query("ROLLBACK")
      excludedAccountIds.add(account.id)
      continue
    }

    if (false && account.status === "WARMING_UP" && amount > WARMUP_MAX_TRANSACTION) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "System Overloaded — warm-up account cannot process this amount." },
        { status: 403 }
      )
    }

    // Generate a provisional transaction ID for idempotency + shield URLs
    const txIdRow = await client.query<{ id: string }>(
      "SELECT gen_random_uuid()::text AS id"
    )
    transactionId = txIdRow.rows[0].id

    const txLog = log.child({ transactionId, traceId: transactionId })

    // ── Step 8. Mask item name + build shield URLs ───────────────────────────
    
    // PAYMENT_DISPLAY_PROFILE_MODE integration (Phase 2A)
    const profileMode = process.env.PAYMENT_DISPLAY_PROFILE_MODE || "shadow"
    
    const profile = await resolvePaymentDisplayProfile({
      tenantId,
      storeId,
      merchantAccountId: account.id,
      storeName: store.name,
    })
    
    const legacyMasker = (realName: string) => account.item_masking 
      ? maskItemName(realName, account.fake_product_name)
      : maskItemName(realName)

    const profileDisplayName = buildPaymentDisplayName({
      profile,
      realItemName: itemName,
      seed: transactionId,
      legacyMasker
    })

    const maskedName = profileMode === "enforce" 
      ? profileDisplayName 
      : legacyMasker(itemName)

    txLog.info("payment_display_profile.resolved",
      `Payment Display Profile resolved source=${profile.source} mode=${profileMode}`,
      {
        storeId,
        tenantId,
        merchantAccountId: account.id,
        profileId: profile.profileId,
        source: profile.source,
        industryVertical: profile.industryVertical,
        displayMode: profile.displayMode,
        lineItemPolicy: profile.lineItemPolicy,
        mode: profileMode,
      }
    )

    const executeToken = generateExecuteToken(transactionId)
    const { returnUrl, cancelUrl } = buildShieldUrls(
      account.shield_domain,
      transactionId,
      executeToken
    )
    txLog.info("checkout.execute_token_generated",
      `Execute token: tx=${transactionId} enabled=${executeToken !== null} ` +
      `mode=${getExecuteTokenMode()} generated=${executeToken !== null} ` +
      `returnUrlHasEt=${returnUrl.includes("et=")}`,
      {
        storeId,
        tenantId,
        merchantAccountId: account.id,
        tokenEnabled: executeToken !== null,
        tokenGenerated: executeToken !== null,
        returnUrlHasEt: returnUrl.includes("et=")
      }
    )

    // ── Step 9. Create PayPal order ──────────────────────────────────────────
    // The PayPal API call lives inside the transaction intentionally:
    //   • On success → we persist the transaction row + volume update
    //   • On failure → ROLLBACK ensures zero DB side effects
    // Trade-off: the row lock is held during the HTTP call.  This is
    // acceptable because the lock scope is a single row, and PayPal
    // typically responds in <500ms.
    //
    // SECURITY: client_secret is decrypted just-in-time, only at this point.
    // The decrypted value exists only in memory for the duration of the
    // PayPal API call and is never persisted or logged.
    let decryptedSecret: string
    let proxyUrl: string | undefined
    try {
      decryptedSecret = normalizeSecret(decrypt(account.client_secret))
      proxyUrl = resolveProxyUrl(account.proxy_url)
    } catch (credentialError) {
      await client.query("ROLLBACK")
      excludedAccountIds.add(account.id)
      exhaustedInvalidAccounts = true
      clearPayPalTokenCache(account.client_id)
      txLog.error("checkout.paypal_order_failed",
        `Credential resolution failed for merchant account ${account.id} clientId=${getClientIdHint(account.client_id)} decryption_ok=false proxy=${account.proxy_url ? "configured" : "none"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`,
        {
          storeId,
          tenantId,
          merchantAccountId: account.id,
          intent,
          amount,
          currency,
          proxyEnabled: !!account.proxy_url,
          clientIdHint: getClientIdHint(account.client_id),
          paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
          error: credentialError
        }
      )
      await quarantineMerchantAccount(account.id, "credential_resolution_failed", tenantId)
      continue
    }

    // Proxy URL is also decrypted just-in-time (if encrypted) — it may
    // contain authentication credentials embedded in the URL.

    // Diagnostic: confirm we're using DB credentials, not env fallback
    txLog.info("checkout.account_selected",
      `Using merchant account ${account.id} clientId=${getClientIdHint(account.client_id)} status=${account.status} decryption_ok=true proxy=${proxyUrl ? "yes" : "no"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`,
      {
        storeId,
        tenantId,
        merchantAccountId: account.id,
        intent,
        amount,
        currency,
        accountStatus: account.status,
        proxyEnabled: !!proxyUrl,
        clientIdHint: getClientIdHint(account.client_id),
        paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
      }
    )

    let paypalOrder
    try {
      paypalOrder = await createPayPalOrder({
        clientId:      account.client_id.trim(),
        clientSecret:  decryptedSecret,
        amount:        amountStr,
        currencyCode:  currency,
        intent,
        items: [
          {
            name:       maskedName,
            quantity:   "1",
            unitAmount: { currencyCode: currency, value: amountStr },
          },
        ],
        returnUrl,
        cancelUrl,
        customId:      transactionId,
        merchantAccId: account.id,
        proxyUrl,
      })
    } catch (paypalError) {
      await client.query("ROLLBACK")

      // ── 401 invalid_client → quarantine ──────────────────────────────────
      if (isInvalidClientError(paypalError)) {
        exhaustedInvalidAccounts = true
        excludedAccountIds.add(account.id)
        clearPayPalTokenCache(account.client_id)
        txLog.error("checkout.account_retry",
          `Excluding merchant account ${account.id} after invalid_client clientId=${getClientIdHint(account.client_id)} decryption_ok=true proxy=${proxyUrl ? "yes" : "no"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"} retried=true`,
          {
            storeId,
            tenantId,
            merchantAccountId: account.id,
            proxyEnabled: !!proxyUrl,
            clientIdHint: getClientIdHint(account.client_id),
            paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
            error: paypalError
          }
        )
        await quarantineMerchantAccount(account.id, "paypal_invalid_client", tenantId)
        continue
      }

      // ── 403 fatal (PERMISSION_DENIED, ACCOUNT_RESTRICTED) → quarantine ──
      if (isFatalForbiddenError(paypalError)) {
        exhaustedInvalidAccounts = true
        excludedAccountIds.add(account.id)
        clearPayPalTokenCache(account.client_id)
        const safeReason = paypalError instanceof PayPalApiError
          ? `paypal_403_fatal_${paypalError.body.slice(0, 80).replace(/[^a-zA-Z0-9_]/g, "_")}`
          : "paypal_403_fatal"
        txLog.error("checkout.account_retry",
          `Fatal 403 for account ${account.id} clientId=${getClientIdHint(account.client_id)} reason=${safeReason}`,
          {
            storeId,
            tenantId,
            merchantAccountId: account.id,
            clientIdHint: getClientIdHint(account.client_id),
            error: paypalError
          }
        )
        await quarantineMerchantAccount(account.id, safeReason, tenantId)
        continue
      }

      // ── 403 ambiguous → circuit breaker cooldown (NOT suspend) ───────────
      if (isTemporaryForbiddenError(paypalError)) {
        excludedAccountIds.add(account.id)
        txLog.warn("checkout.account_retry",
          `Ambiguous 403 for account ${account.id} clientId=${getClientIdHint(account.client_id)} — recording for circuit breaker`,
          {
            storeId,
            tenantId,
            merchantAccountId: account.id,
            clientIdHint: getClientIdHint(account.client_id),
            error: paypalError
          }
        )
        await recordPayPalError(account.id, "403_ambiguous", tenantId)
        continue
      }

      // ── 429 rate limit → circuit breaker cooldown (NEVER suspend) ────────
      if (isRateLimitError(paypalError)) {
        excludedAccountIds.add(account.id)
        txLog.warn("checkout.account_retry",
          `PayPal 429 for account ${account.id} clientId=${getClientIdHint(account.client_id)} — recording for circuit breaker`,
          {
            storeId,
            tenantId,
            merchantAccountId: account.id,
            clientIdHint: getClientIdHint(account.client_id),
            error: paypalError
          }
        )
        await recordPayPalError(account.id, "429", tenantId)
        continue
      }

      // ── 5xx or timeout → circuit breaker cooldown + try next account ─────
      if (paypalError instanceof PayPalApiError && paypalError.statusCode >= 500) {
        excludedAccountIds.add(account.id)
        txLog.warn("checkout.account_retry",
          `PayPal 5xx (${paypalError.statusCode}) for account ${account.id} — recording for circuit breaker`,
          {
            storeId,
            tenantId,
            merchantAccountId: account.id,
            error: paypalError
          }
        )
        await recordPayPalError(account.id, "5xx", tenantId)
        continue
      }

      // ── Unknown error → log and return 502 (existing behavior) ───────────
      txLog.error("checkout.paypal_order_failed",
        `PayPal order creation failed for merchant account ${account.id} clientId=${getClientIdHint(account.client_id)} decryption_ok=true proxy=${proxyUrl ? "yes" : "no"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`,
        {
          storeId,
          tenantId,
          merchantAccountId: account.id,
          proxyEnabled: !!proxyUrl,
          clientIdHint: getClientIdHint(account.client_id),
          paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
          error: paypalError
        }
      )
      return NextResponse.json(
        { error: "Payment provider error. Please try again." },
        { status: 502 }
      )
    }

    txLog.info("checkout.paypal_order_created", `PayPal order created: orderId=${paypalOrder.id} intent=${intent} status=${paypalOrder.status}`, {
      storeId,
      tenantId,
      merchantAccountId: account.id,
      paypalOrderId: paypalOrder.id,
      intent,
      amount,
      currency,
    })
    approvalUrl = getApprovalUrl(paypalOrder)
    if (flow === "POPUP_BRIDGE") {
      popupUrl = buildPopupBridgeUrl(account.shield_domain, approvalUrl, transactionId)
      popupOrigin = new URL(popupUrl).origin
    }

    // ── Step 10. INSERT PENDING transaction ──────────────────────────────────
    // Status is always PENDING at this point — the order is created on PayPal
    // but the buyer has NOT yet approved it. The transaction moves to AUTHORIZED
    // or COMPLETED only after the buyer approves AND /api/gateway/execute is
    // called successfully.
    await client.query(
      `INSERT INTO transactions (
         id, tenant_id, store_id, merchant_id,
         original_amount, original_currency, original_item_name,
         gateway_fee, status, intent,
         masked_item_name, paypal_order_id,
         customer_email, buyer_ip, buyer_country, ip_address,
         checkout_expires_at, authorization_expires_at,
         merchant_success_url, merchant_cancel_url,
         created_at, updated_at
       ) VALUES (
         $1,  $2,  $3,  $4,
         $5,  $6,  $7,
         0,   'PENDING'::transaction_status, $13,
         $8,  $9,
         $10, $11, $12, $11,
         NOW() + INTERVAL '30 minutes',
         NULL,
         $14, $15,
         NOW(), NOW()
       )`,
      [
        transactionId,             // $1
        tenantId,                  // $2
        storeId,                   // $3
        account.id,                // $4
        amount,                    // $5
        currency,                  // $6  — original_currency
        itemName,                  // $7  — original_item_name (unmasked, for audit)
        maskedName,                // $8  — masked_item_name
        paypalOrder.id,            // $9  — paypal_order_id
        customerEmail ?? null,     // $10 — customer_email
        buyerIp       ?? null,     // $11 — buyer_ip + ip_address
        buyerCountry  ?? null,     // $12 — buyer_country
        intent,                    // $13 — intent (CAPTURE | AUTHORIZE) for execute step
        store.success_return_url ?? null, // $14
        store.cancel_return_url ?? null, // $15
      ]
    )

    // ── Step 11. Volume is NOT incremented here ───────────────────────────────
    // Volume is deferred to POST /api/gateway/execute where actual PayPal
    // execution succeeds. This prevents phantom volume from:
    //   • Buyers who abandon the PayPal popup without paying
    //   • Failed authorization/capture calls
    //   • Network errors during execution

    // ── Step 12. COMMIT ──────────────────────────────────────────────────────
    // Only reached if ALL prior steps succeeded.  This single COMMIT
    // atomically persists: the new transaction row + the volume increment.
    await client.query("COMMIT")
      break checkoutAttempt
    }

  } catch (err) {
    // ── ROLLBACK on any unexpected error ─────────────────────────────────────
    // Guarantees: no orphan rows, no phantom volume increases.
    await client.query("ROLLBACK").catch(() => null)
    log.error("checkout.unexpected_error", "Unexpected error:", { error: err })
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  } finally {
    // Always release the pool client back to the pool
    client.release()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  SUCCESS RESPONSE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return NextResponse.json(
    {
      transactionId,
      executeToken: generateExecuteToken(transactionId),
      approvalUrl,
      flow,
      popupUrl,
      popupOrigin,
      intent,
      status: "PENDING",
      merchantReturnConfigured: !!(store.success_return_url || store.cancel_return_url),
    },
    { status: 201 }
  )
}
