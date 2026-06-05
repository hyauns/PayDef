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
import { maskItemName, buildShieldUrls, buildOrderMaskedName, seededIndex, buildInvoiceId } from "@/lib/masking"
import { resolvePaymentDisplayProfile, buildPaymentDisplayName, buildPayPalLineItemsForProfile } from "@/lib/payment-display-profiles"
import {
  buildPopupBridgeUrl,
  getCheckoutPreferences,
  resolveCheckoutFlow,
} from "@/lib/checkout-flow"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { resolvePaymentIdentityBundleForCheckout } from "@/lib/payment-identity-bundle-resolver"
import {
  type MerchantAccountRow,
  filterEligibleAccounts,
  selectByStrategy,
  getEffectiveDailyLimit,
  WARMUP_MAX_TRANSACTION,
} from "@/lib/merchant-rotation"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"
import { generateExecuteToken, getMode as getExecuteTokenMode } from "@/lib/execute-token"
import { handleStripeCheckout } from "@/lib/stripe-checkout"

// ─── Request body shape ───────────────────────────────────────────────────────

interface CheckoutBody {
  amount:        number   // decimal, e.g. 49.99
  currency?:     string   // ISO 4217, default "USD"
  itemName:      string   // real product name (will be masked)
  intent?:       "CAPTURE" | "AUTHORIZE"  // default "CAPTURE"
  customerEmail?: string  // optional payer email for audit trail
  buyerIp?:      string
  buyerCountry?: string
  orderId?:      string   // merchant order id — prefixed onto the masked item
                          // name (#orderId) for bundles with use_random_descriptor
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

// StoreRow removed since we use AuthenticatedStore

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

  // ── Step 1. Extract headers (validation handled by auth helper) ────────────
  const storeId = req.headers.get("X-Store-ID") // Kept for early logging

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
      storeId: storeId ?? undefined,
      intent,
    })
  }

  log.info("checkout.request_started", `Incoming intent=${rawIntent ?? "<not sent>"} amount=${amount} currency=${currency}`, {
    storeId: storeId ?? undefined,
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

  // ── Step 3. Resolve store + verify API key via shared helper ───────────────
  let store
  try {
    store = await authenticateStoreHeaders(req)
  } catch (error: any) {
    const msg = error.message
    if (msg.includes("Missing")) {
      return NextResponse.json({ error: msg }, { status: 401 })
    }
    if (msg.includes("Invalid")) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
    }
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const sql = getSql()

  // ── Rate limiting (after auth) ──────────────────────────────────────────────
  const { allowed, headers: rlHeaders } = await checkRateLimit(store.id)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: rlHeaders }
    )
  }

  const tenantId = store.tenantId
  const checkoutPreferences = await getCheckoutPreferences(sql)
  const flow = resolveCheckoutFlow(store.checkoutFlow, checkoutPreferences)

  // ── Finalise intent (capture_mode fallback + mismatch logging) ──────────────
  // If store sent explicit intent above (line 144-147), it's already set.
  // If not, derive from capture_mode now that we have the store row.
  if (rawIntent !== "CAPTURE" && rawIntent !== "AUTHORIZE") {
    intent = store.captureMode === "MANUAL" ? "AUTHORIZE" : "CAPTURE"
    log.info("checkout.intent_derived", `No explicit intent → derived from capture_mode=${store.captureMode} → intent=${intent}`, {
      storeId: store.id,
      tenantId,
      captureMode: store.captureMode,
      intent,
    })
  } else {
    log.info("checkout.intent_explicit", `Store sent explicit intent=${intent}; using explicit intent`, {
      storeId: store.id,
      tenantId,
      intent,
    })
  }
  log.info("checkout.intent_finalized", `Final intent=${intent} capture_mode=${store.captureMode} store=${store.id}`, {
    storeId: store.id,
    tenantId,
    captureMode: store.captureMode,
    intent,
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PROVIDER ROUTING
  //  STRIPE stores use the Stripe Checkout Session flow (one account per
  //  store — NO merchant-account rotation). The PayPal rotation logic below
  //  is never reached for these stores. PAYPAL (and any other) stores fall
  //  through to the existing rotation flow unchanged.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (store.providerType === "STRIPE") {
    return handleStripeCheckout({
      store,
      amount,
      amountStr,
      currency,
      itemName,
      intent,
      customerEmail,
      buyerIp,
      buyerCountry,
      flow,
      requestId,
    })
  }

  // ── Pre-resolve Payment Display Profile to guide account selection (Phase 4)
  const preliminaryProfile = await resolvePaymentDisplayProfile({
    tenantId,
    storeId: store.id,
    storeName: "Unknown Store", // The store name is not in AuthenticatedStore, we'll fetch it if needed inside
  })
  const preferredProfileId = preliminaryProfile.profileId

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
              ma.display_profile_id, ma.bundle_id,
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

    // ── Phase 4: Payment Display Profile Consistency Filter ────────────────
    let matchedAccounts = eligible
    let usedProfileMatchedAccounts = false
    let fallbackReason = "no_profile_requested"
    let matchingAccountCount = 0

    if (preferredProfileId) {
      const matched = eligible.filter(a => a.display_profile_id === preferredProfileId)
      matchingAccountCount = matched.length
      if (matched.length > 0) {
        matchedAccounts = matched
        usedProfileMatchedAccounts = true
        fallbackReason = "none"
      } else {
        fallbackReason = "no_matched_accounts_available"
      }
      
      log.info("payment_display_profile.account_filter", "Account filtered by profile preference", {
        tenantId,
        storeId: store.id,
        resolvedProfileId: preferredProfileId,
        eligibleAccountCount: eligible.length,
        matchingAccountCount,
        usedProfileMatchedAccounts,
        fallbackReason,
      })
    }

    // ── Circuit breaker filter (shadow/enforce) ──────────────────────────────
    const circuitFiltered = await filterOpenCircuits(matchedAccounts, store.id)

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
              item_masking, fake_product_name,
              display_profile_id, bundle_id
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

    // ── Step 8. Resolve Identity, Mask item name + build shield URLs ─────────
    
    // PAYMENT_DISPLAY_PROFILE_MODE integration (Phase 2A + Phase 3)
    const profileMode = (process.env.PAYMENT_DISPLAY_PROFILE_MODE || "shadow") as "shadow" | "enforce"
    const bundleMode = (process.env.PAYMENT_IDENTITY_BUNDLE_MODE || "shadow") as "shadow" | "enforce" | "disabled"
    
    // Phase 4: Resolve legacy Payment Display Profile (Priority B)
    const profile = await resolvePaymentDisplayProfile({
      tenantId,
      storeId: store.id,
      merchantAccountId: account.id,
      storeName: "Unknown Store", // Will be fetched inside if needed
    })
    
    const legacyMasker = (realName: string) => account.item_masking 
      ? maskItemName(realName, account.fake_product_name)
      : maskItemName(realName)

    // Default legacy line item result
    let lineItemResult = buildPayPalLineItemsForProfile({
      profile,
      originalItems: [{
        name:     itemName,
        quantity: "1",
        unitAmount: { currencyCode: currency, value: amountStr },
      }],
      checkoutTotal: amountStr,
      currency,
      transactionId,
      mode: profileMode,
      legacyMasker,
    })

    txLog.info("payment_display_profile.resolved",
      `Payment Display Profile resolved source=${profile.source} mode=${profileMode}`,
      {
        storeId: store.id,
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

    txLog.info("payment_display_profile.line_items_built",
      `Line items built: policy=${lineItemResult.lineItemPolicy} mode=${profileMode} invariant=${lineItemResult.amountInvariantPassed}`,
      {
        mode: profileMode,
        profileId: profile.profileId,
        source: profile.source,
        industryVertical: profile.industryVertical,
        displayMode: profile.displayMode,
        lineItemPolicy: lineItemResult.lineItemPolicy,
        legacyItemCount: lineItemResult.legacyItems.length,
        profileItemCount: lineItemResult.profileItems.length,
        selectedItemCount: lineItemResult.selectedItems.length,
        amountInvariantPassed: lineItemResult.amountInvariantPassed,
        skipRandomization: lineItemResult.skipRandomization,
      }
    )

    if (!lineItemResult.amountInvariantPassed) {
      txLog.warn("payment_display_profile.line_item_invariant_failed",
        `Amount invariant failed for policy=${lineItemResult.lineItemPolicy} — fell back to SINGLE_SEMANTIC_ITEM`,
        { storeId: store.id, tenantId, merchantAccountId: account.id, lineItemPolicy: lineItemResult.lineItemPolicy, profileId: profile.profileId }
      )
    }

    // ── PI-3B: Payment Identity Bundle (Priority A) ──────────────────────────
    let finalShieldDomain = account.shield_domain
    let shieldDomainId: string | undefined
    let invoiceId: string | null = null
    let identityDomainUsed = false
    let domainFallbackReason = "no_bundle"
    let bundleIdLog: string | undefined = undefined
    let candidateDescriptorLog: string | undefined = undefined
    let assignmentMatchLog = { merchantAccount: false, shieldDomain: false }

    try {
      if (account.bundle_id) {
        txLog.info("payment_identity_bundle.resolve_start",
          `Identity bundle resolve: mode=${bundleMode} account=${account.id}`, {
            tenantId,
            storeId: store.id,
            merchantAccountId: account.id,
            checkoutAmount: amount,
            mode: bundleMode,
          })

        const bundleResult = await resolvePaymentIdentityBundleForCheckout({
          tenantId,
          storeId: store.id,
          merchantAccountId: account.id,
          shieldDomainId: null, // we are resolving it from the bundle now!
          checkoutAmount: amount,
          mode: bundleMode,
        })

        bundleIdLog = bundleResult.bundleId || undefined
        candidateDescriptorLog = bundleResult.candidateDescriptor ?? undefined
        assignmentMatchLog = bundleResult.assignmentMatch

        txLog.info("payment_identity_bundle.resolve_result",
          `Identity bundle result: bundle=${bundleResult.bundleId ?? "none"} item=${bundleResult.selectedItemId ?? "none"} reason=${bundleResult.reason}`, {
            tenantId, storeId: store.id, merchantAccountId: account.id,
            bundleId: bundleResult.bundleId, selectedItemId: bundleResult.selectedItemId,
            reason: bundleResult.reason, mode: bundleResult.mode,
            assignmentMatch: bundleResult.assignmentMatch, warnings: bundleResult.warnings,
            checkoutAmount: amount,
          })

        if (bundleResult.selectedItem) {
          txLog.info("payment_identity_bundle.item_selected",
            `Bundle item: descriptor="${bundleResult.candidateDescriptor}" type=${bundleResult.selectedItem.product_type}`, {
              tenantId, storeId: store.id, merchantAccountId: account.id,
              bundleId: bundleResult.bundleId, selectedItemId: bundleResult.selectedItemId,
              candidateDescriptor: bundleResult.candidateDescriptor, productType: bundleResult.selectedItem.product_type,
              descriptorName: bundleResult.selectedItem.descriptor_name,
            })
        }

        if (bundleResult.warnings.length > 0) {
          txLog.warn("payment_identity_bundle.resolve_warning",
            `Bundle warnings: ${bundleResult.warnings.join("; ")}`, {
              tenantId, storeId: store.id, merchantAccountId: account.id,
              bundleId: bundleResult.bundleId, warnings: bundleResult.warnings,
            })
        }

        // Apply Priority A Source of Truth
        if (bundleResult.bundle && bundleResult.primaryShieldDomain) {
          // Resolve shieldDomainId internally
          const sdRows = await client.query<{ id: string }>(
            `SELECT id FROM shield_domains
             WHERE LOWER(domain) = LOWER($1) 
               AND is_active = true 
               AND health_ok = true
               AND (tenant_id = $2 OR tenant_id IS NULL)`,
            [bundleResult.primaryShieldDomain, tenantId]
          )
          
          if (sdRows.rows.length > 0) {
            shieldDomainId = sdRows.rows[0].id
            finalShieldDomain = bundleResult.primaryShieldDomain
            identityDomainUsed = true
            domainFallbackReason = "none"

            txLog.info("payment_identity.runtime_source_selected", "Priority A: Payment Identity Selected", {
              tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
              source: "payment_identity", bundleId: bundleResult.bundleId, reason: "valid_bundle_domain"
            })

            txLog.info("payment_identity.domain_from_identity", "Domain from Payment Identity", {
              bundleId: bundleResult.bundleId, primaryShieldDomain: finalShieldDomain,
              shieldDomainId, identityDomainUsed: true
            })
          } else {
             domainFallbackReason = "primary_shield_domain_unhealthy"
             txLog.info("payment_identity.runtime_source_selected", "Priority B: Legacy Selected", {
               tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
               source: "legacy", bundleId: bundleResult.bundleId, reason: domainFallbackReason
             })
             txLog.info("payment_identity.domain_fallback_legacy", "Fallback to legacy domain", {
               bundleId: bundleResult.bundleId, fallbackReason: domainFallbackReason, legacyShieldDomain: finalShieldDomain
             })
          }
        } else {
           domainFallbackReason = "missing_primary_shield_domain"
           txLog.info("payment_identity.runtime_source_selected", "Priority B: Legacy Selected", {
             tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
             source: "legacy", bundleId: bundleResult.bundleId, reason: domainFallbackReason
           })
           if (bundleResult.bundle) {
             txLog.info("payment_identity.domain_fallback_legacy", "Fallback to legacy domain", {
               bundleId: bundleResult.bundleId, fallbackReason: domainFallbackReason, legacyShieldDomain: finalShieldDomain
             })
           }
        }

        // Priority A Enforce Descriptor
        if (bundleResult.mode === "enforce") {
          txLog.info("payment_identity_bundle.enforce_start", "Starting Identity Bundle enforce evaluation", {
            tenantId, storeId: store.id, merchantAccountId: account.id, bundleId: bundleResult.bundleId,
          })

          const candidate = bundleResult.candidateDescriptor

          if (bundleResult.reason === "disabled_by_mode") {
             txLog.warn("payment_identity_bundle.enforce_fallback", "Resolver disabled by mode", {
               tenantId, storeId: store.id, fallbackReason: "mode_not_enforce"
             })
          } else if (!bundleResult.bundle) {
             txLog.warn("payment_identity_bundle.enforce_fallback", "No bundle assigned to merchant/store", {
               tenantId, storeId: store.id, fallbackReason: "no_bundle"
             })
          } else if (!bundleResult.selectedItem) {
             txLog.warn("payment_identity_bundle.enforce_fallback", "Bundle has no active selected item", {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId, fallbackReason: "no_selected_item"
             })
          } else if (!candidate) {
             txLog.warn("payment_identity_bundle.enforce_fallback", "Missing candidate descriptor", {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId, fallbackReason: "missing_candidate_descriptor"
             })
          } else if (candidate.length > 127) {
             txLog.warn("payment_identity_bundle.enforce_fallback", `Candidate descriptor too long (${candidate.length} > 127)`, {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId, candidateLength: candidate.length, fallbackReason: "descriptor_too_long"
             })
          } else {
             lineItemResult = {
               ...lineItemResult,
               selectedItems: [{
                 name: candidate,
                 quantity: "1",
                 unitAmount: { currencyCode: currency, value: amountStr }
               }],
               lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
               skipRandomization: true
             }

             const checkoutTotalCents = Math.round(parseFloat(amountStr) * 100)
             txLog.info("payment_identity_bundle.enforce_preflight", "Identity bundle enforce preflight checks", {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId,
               amountInvariantPassed: true, selectedItemCount: 1,
               selectedTotalCents: checkoutTotalCents, checkoutTotalCents: checkoutTotalCents
             })

             txLog.info("payment_identity_bundle.enforce_applied", "Identity bundle enforced on PayPal payload", {
               tenantId, storeId: store.id, merchantAccountId: account.id, shieldDomainId,
               bundleId: bundleResult.bundleId, selectedItemId: bundleResult.selectedItemId,
               mode: bundleResult.mode, candidateDescriptor: candidate, candidateLength: candidate.length,
               amountInvariantPassed: true, selectedItemCount: 1,
             })
          }
        }

        // ── PI-026: Order-traceable random descriptor (per-bundle opt-in) ──
        // When the resolved bundle opts in, override the PayPal line-item name
        // with "#<orderId> <random descriptor> <last char of real product>" and
        // route return/cancel URLs through a randomly-picked shield domain from
        // the bundle pool. Runs regardless of the global bundle MODE so it can be
        // turned on per-bundle without flipping the global enforce flag. Placed
        // last so it wins over the enforce block above.
        if (bundleResult.bundle?.use_random_descriptor) {
          const maskedName = buildOrderMaskedName({
            descriptors: bundleResult.itemDescriptors,
            seed: transactionId,
            orderId: body.orderId,
            realItemName: itemName,
          })
          if (maskedName) {
            lineItemResult = {
              ...lineItemResult,
              selectedItems: [{
                name: maskedName,
                quantity: "1",
                unitAmount: { currencyCode: currency, value: amountStr },
              }],
              lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
              skipRandomization: true,
            }

            // Random shield domain from the bundle pool (seeded by tx id).
            const sdPool = await client.query<{ id: string; domain: string }>(
              `SELECT id, domain FROM shield_domains
               WHERE bundle_id = $1 AND is_active = true AND health_ok = true
                 AND (tenant_id = $2 OR tenant_id IS NULL)
               ORDER BY domain ASC`,
              [bundleResult.bundleId, tenantId]
            )
            if (sdPool.rows.length > 0) {
              const pick = sdPool.rows[seededIndex(transactionId, sdPool.rows.length)]
              finalShieldDomain = pick.domain
              shieldDomainId = pick.id
              identityDomainUsed = true
            }

            // PayPal invoice_id = "<ShieldBrand>-<order digits>" (merchant-facing,
            // for tracing the order in the PayPal dashboard).
            invoiceId = buildInvoiceId(finalShieldDomain, body.orderId)

            txLog.info("payment_identity.random_descriptor_applied",
              `Order-traceable random descriptor applied: ${maskedName}`, {
                tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
                bundleId: bundleResult.bundleId, maskedName, invoiceId,
                randomShieldDomain: finalShieldDomain, shieldPoolSize: sdPool.rows.length,
              })
          } else {
            txLog.warn("payment_identity.random_descriptor_skipped",
              "use_random_descriptor set but bundle has no usable descriptors — using legacy masking", {
                tenantId, storeId: store.id, bundleId: bundleResult.bundleId,
              })
          }
        }
      } else {
        txLog.info("payment_identity.runtime_source_selected", "Priority B: Legacy Selected", {
          tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
          source: "legacy", reason: "no_account_bundle_id"
        })
      }
    } catch (bundleResolverErr) {
      txLog.error("payment_identity_bundle.resolve_error", "Bundle resolver failed", {
        tenantId, storeId: store.id, merchantAccountId: account.id, error: bundleResolverErr
      })
    }

    // ── Phase 4: Legacy Shield Domain Consistency (Priority B) ───────────────
    if (!identityDomainUsed) {
      let shieldProfileMatched = false
      if (preferredProfileId) {
        const sdRows = await client.query<{ id: string, domain: string }>(
          `SELECT id, domain 
           FROM shield_domains 
           WHERE tenant_id = $1 
             AND display_profile_id = $2 
             AND is_active = true 
             AND health_ok = true 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [tenantId, preferredProfileId]
        )
        if (sdRows.rows.length > 0) {
          finalShieldDomain = sdRows.rows[0].domain
          shieldDomainId = sdRows.rows[0].id
          shieldProfileMatched = true
        }
      }

      if (!shieldDomainId && finalShieldDomain) {
        const fallbackIdRows = await client.query<{ id: string }>(
          `SELECT id FROM shield_domains
           WHERE LOWER(domain) = LOWER($1) 
             AND is_active = true 
             AND health_ok = true
             AND (tenant_id = $2 OR tenant_id IS NULL)`,
          [finalShieldDomain, tenantId]
        )
        if (fallbackIdRows.rows.length === 1) {
          shieldDomainId = fallbackIdRows.rows[0].id
        } else if (fallbackIdRows.rows.length > 1) {
          txLog.warn("payment_display_profile.shield_domain_ambiguous", "Multiple shield domains match fallback hostname", {
            targetHost: finalShieldDomain, tenantId, matchCount: fallbackIdRows.rows.length
          })
        }
      }

      txLog.info("payment_display_profile.shield_domain_selected", "Legacy Shield domain selected for transaction", {
        tenantId, storeId: store.id, resolvedProfileId: preferredProfileId, shieldDomainId,
        profileMatched: shieldProfileMatched, fallbackUsed: !shieldProfileMatched,
        fallbackIdResolved: !shieldProfileMatched && !!shieldDomainId, targetHost: finalShieldDomain,
      })
    }

    // Domain mismatch warning
    if (account.shield_domain && finalShieldDomain && account.shield_domain !== finalShieldDomain) {
      txLog.warn("payment_identity.domain_mismatch_warning", "Legacy account shield domain differs from selected target host", {
        bundleId: bundleIdLog, identityDomain: finalShieldDomain, legacyAccountShieldDomain: account.shield_domain, merchantAccountId: account.id
      })
    }

    // Final Consistency Check Log
    txLog.info("payment_identity.runtime_consistency_check", "Payment Identity consistency check", {
      targetHost: finalShieldDomain,
      shieldDomainId,
      bundleId: bundleIdLog,
      candidateDescriptor: candidateDescriptorLog,
      assignmentMatch: assignmentMatchLog,
      amountInvariantPassed: lineItemResult.amountInvariantPassed
    })

    const executeToken = generateExecuteToken(transactionId)
    const { returnUrl, cancelUrl } = buildShieldUrls(
      finalShieldDomain,
      transactionId,
      executeToken
    )

    txLog.info("checkout.return_urls_built",
      `Return URLs built: source=${identityDomainUsed ? "payment_identity" : "legacy"} finalShieldDomain=${finalShieldDomain}`,
      {
        storeId: store.id, tenantId, merchantAccountId: account.id, transactionId,
        source: identityDomainUsed ? "payment_identity" : "legacy",
        finalShieldDomain,
        paypalReturnUrl: returnUrl,
        paypalCancelUrl: cancelUrl,
        legacyAccountShieldDomain: account.shield_domain,
        identityPrimaryShieldDomain: identityDomainUsed ? finalShieldDomain : null,
        popupOrigin: finalShieldDomain ? `https://${finalShieldDomain}` : null,
      }
    )

    txLog.info("checkout.execute_token_generated",
      `Execute token: tx=${transactionId} enabled=${executeToken !== null} ` +
      `mode=${getExecuteTokenMode()} generated=${executeToken !== null} ` +
      `returnUrlHasEt=${returnUrl.includes("et=")}`,
      {
        storeId: store.id, tenantId, merchantAccountId: account.id,
        tokenEnabled: executeToken !== null, tokenGenerated: executeToken !== null, returnUrlHasEt: returnUrl.includes("et=")
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
          storeId: store.id,
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
        storeId: store.id,
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

    // ── Phase 3: Handoff diagnostic — log what we're about to send ──────────
    const LEGACY_DESCRIPTOR_POOL = new Set([
      "Technical Support", "Service Extension", "Business Consultation",
      "Professional Services", "Support Package", "Account Maintenance",
      "Platform Services", "Service Subscription", "Enterprise Solution",
      "Managed Services", "IT Consultation", "System Integration",
      "Cloud Services", "Infrastructure Support", "Compliance Review",
      "Advisory Services",
    ])
    const selectedTotalCents = lineItemResult.selectedItems.reduce(
      (s, it) => s + Math.round(parseFloat(it.unitAmount.value) * 100) * parseInt(it.quantity, 10), 0
    )
    const checkoutTotalCents = Math.round(parseFloat(amountStr) * 100)
    const firstItemName = lineItemResult.selectedItems[0]?.name ?? ""
    const firstItemLooksLegacy = LEGACY_DESCRIPTOR_POOL.has(firstItemName)
    const firstItemLooksProfile = !firstItemLooksLegacy && firstItemName.length > 0

    txLog.info("payment_display_profile.create_order_handoff",
      `Handoff: mode=${profileMode} policy=${lineItemResult.lineItemPolicy} items=${lineItemResult.selectedItems.length} skip=${lineItemResult.skipRandomization} legacy=${firstItemLooksLegacy} profile=${firstItemLooksProfile}`,
      {
        mode: profileMode,
        lineItemPolicy: lineItemResult.lineItemPolicy,
        selectedItemCount: lineItemResult.selectedItems.length,
        skipRandomization: lineItemResult.skipRandomization,
        selectedTotalCents,
        checkoutTotalCents,
        amountMatch: selectedTotalCents === checkoutTotalCents,
        firstSelectedItemLooksLegacy: firstItemLooksLegacy,
        firstSelectedItemLooksProfile: firstItemLooksProfile,
      }
    )

    // ── Phase 3: Hard preflight assertion for enforce + SINGLE_SEMANTIC_ITEM ──
    // Prevents sending wrong legacy payload to PayPal in enforce mode.
    if (profileMode === "enforce" && lineItemResult.lineItemPolicy === "SINGLE_SEMANTIC_ITEM") {
      const itemCount = lineItemResult.selectedItems.length
      const anyLegacy = lineItemResult.selectedItems.some(it => LEGACY_DESCRIPTOR_POOL.has(it.name))
      const totalMatch = selectedTotalCents === checkoutTotalCents

      if (itemCount !== 1 || anyLegacy || !totalMatch || !lineItemResult.skipRandomization) {
        txLog.error("payment_display_profile.paypal_payload_mismatch",
          `PREFLIGHT ASSERTION FAILED: enforce+SINGLE_SEMANTIC_ITEM but items=${itemCount} legacy=${anyLegacy} totalMatch=${totalMatch} skipRand=${lineItemResult.skipRandomization}`,
          {
            storeId: store.id,
            tenantId,
            merchantAccountId: account.id,
            mode: profileMode,
            lineItemPolicy: lineItemResult.lineItemPolicy,
            itemCount,
            anyLegacy,
            totalMatch,
            skipRandomization: lineItemResult.skipRandomization,
          }
        )
        await client.query("ROLLBACK")
        return NextResponse.json(
          { error: "Payment processing error. Please try again." },
          { status: 500 }
        )
      }
    }

    let paypalOrder
    try {
      paypalOrder = await createPayPalOrder({
        clientId:      account.client_id.trim(),
        clientSecret:  decryptedSecret,
        amount:        amountStr,
        currencyCode:  currency,
        intent,
        items: lineItemResult.selectedItems,
        returnUrl,
        cancelUrl,
        customId:      transactionId,
        merchantAccId: account.id,
        proxyUrl,
        skipRandomization: lineItemResult.skipRandomization,
        invoiceId:     invoiceId ?? undefined,
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
            storeId: store.id,
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
            storeId: store.id,
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
            storeId: store.id,
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
            storeId: store.id,
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
            storeId: store.id,
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
          storeId: store.id,
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
      storeId: store.id,
      tenantId,
      merchantAccountId: account.id,
      paypalOrderId: paypalOrder.id,
      intent,
      amount,
      currency,
    })
    approvalUrl = getApprovalUrl(paypalOrder)
    if (flow === "POPUP_BRIDGE") {
      popupUrl = buildPopupBridgeUrl(finalShieldDomain, approvalUrl, transactionId)
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
        store.id,                  // $3
        account.id,                // $4
        amount,                    // $5
        currency,                  // $6  — original_currency
        itemName,                  // $7  — original_item_name (unmasked, for audit)
        lineItemResult.selectedItems[0]?.name ?? "Unknown",  // $8  — masked_item_name
        paypalOrder.id,            // $9  — paypal_order_id
        customerEmail ?? null,     // $10 — customer_email
        buyerIp       ?? null,     // $11 — buyer_ip + ip_address
        buyerCountry  ?? null,     // $12 — buyer_country
        intent,                    // $13 — intent (CAPTURE | AUTHORIZE) for execute step
        store.successReturnUrl ?? null, // $14
        store.cancelReturnUrl ?? null, // $15
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
      merchantReturnConfigured: !!(store.successReturnUrl || store.cancelReturnUrl),
    },
    { status: 201 }
  )
}
