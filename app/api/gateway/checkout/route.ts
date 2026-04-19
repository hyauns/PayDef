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
import bcrypt from "bcryptjs"
import { getPool, getSql } from "@/lib/neon"
import {
  clearPayPalTokenCache,
  createPayPalOrder,
  getApprovalUrl,
  isInvalidClientError,
} from "@/lib/paypal"
import { maskItemName, buildShieldUrls } from "@/lib/masking"
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
  reason: string
): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE merchant_accounts
    SET status = 'SUSPENDED',
        updated_at = NOW()
    WHERE id = ${accountId}
      AND status IN ('ACTIVE', 'WARMING_UP')
  `
  console.error(`[checkout] Quarantined merchant account ${accountId} reason=${reason}`)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
    console.info(`[checkout] Store sent explicit intent=${intent} (store=${storeId})`)
  }

  console.info(`[checkout] Incoming intent=${rawIntent ?? "<not sent>"} amount=${amount} currency=${currency}`)

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
    SELECT id, tenant_id, api_key_hash, is_active,
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

  const keyValid = await bcrypt.compare(apiKey, store.api_key_hash)
  if (!keyValid) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
  }

  const { tenant_id: tenantId } = store
  const checkoutPreferences = await getCheckoutPreferences(sql)
  const flow = resolveCheckoutFlow(store.checkout_flow, checkoutPreferences)

  // ── Finalise intent (capture_mode fallback + mismatch logging) ──────────────
  // If store sent explicit intent above (line 144-147), it's already set.
  // If not, derive from capture_mode now that we have the store row.
  if (rawIntent !== "CAPTURE" && rawIntent !== "AUTHORIZE") {
    intent = store.capture_mode === "MANUAL" ? "AUTHORIZE" : "CAPTURE"
    console.info(`[checkout] No explicit intent → derived from capture_mode=${store.capture_mode} → intent=${intent}`)
  } else if (
    (intent === "CAPTURE" && store.capture_mode === "MANUAL") ||
    (intent === "AUTHORIZE" && store.capture_mode !== "MANUAL")
  ) {
    console.warn(`[checkout] Intent/capture_mode mismatch: intent=${intent} capture_mode=${store.capture_mode} — honouring store's explicit intent`)
  }
  console.info(`[checkout] Final intent=${intent} capture_mode=${store.capture_mode} store=${storeId}`)

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

    const candidate = await selectByStrategy(eligible, tenantId, getSql())

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

    // ── Step 8. Mask item name + build shield URLs ───────────────────────────
    // Use per-account fake product name if item masking is enabled
    const maskedName = account.item_masking
      ? maskItemName(itemName, account.fake_product_name)
      : maskItemName(itemName)

    // Generate a provisional transaction ID for idempotency + shield URLs
    const txIdRow = await client.query<{ id: string }>(
      "SELECT gen_random_uuid()::text AS id"
    )
    transactionId = txIdRow.rows[0].id

    const { returnUrl, cancelUrl } = buildShieldUrls(
      account.shield_domain,
      transactionId
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
      console.error(
        `[checkout] Credential resolution failed for merchant account ${account.id} clientId=${getClientIdHint(account.client_id)} decryption_ok=false proxy=${account.proxy_url ? "configured" : "none"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`,
        credentialError
      )
      await quarantineMerchantAccount(account.id, "credential_resolution_failed")
      continue
    }

    // Proxy URL is also decrypted just-in-time (if encrypted) — it may
    // contain authentication credentials embedded in the URL.

    // Diagnostic: confirm we're using DB credentials, not env fallback
    console.info(
      `[checkout] Using merchant account ${account.id} clientId=${getClientIdHint(account.client_id)} status=${account.status} decryption_ok=true proxy=${proxyUrl ? "yes" : "no"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`
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
      if (isInvalidClientError(paypalError)) {
        exhaustedInvalidAccounts = true
        excludedAccountIds.add(account.id)
        clearPayPalTokenCache(account.client_id)
        console.error(
          `[checkout] Excluding merchant account ${account.id} after invalid_client clientId=${getClientIdHint(account.client_id)} decryption_ok=true proxy=${proxyUrl ? "yes" : "no"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"} retried=true`
        )
        await quarantineMerchantAccount(account.id, "paypal_invalid_client")
        continue
      }
      console.error(
        `[checkout] PayPal order creation failed for merchant account ${account.id} clientId=${getClientIdHint(account.client_id)} decryption_ok=true proxy=${proxyUrl ? "yes" : "no"} env=${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"}`,
        paypalError
      )
      return NextResponse.json(
        { error: "Payment provider error. Please try again." },
        { status: 502 }
      )
    }

    console.info(`[checkout] PayPal order created: orderId=${paypalOrder.id} intent=${intent} status=${paypalOrder.status}`)
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
    console.error("[checkout] Unexpected error:", err)
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
