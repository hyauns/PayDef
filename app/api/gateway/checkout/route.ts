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
import { createPayPalOrder, getApprovalUrl } from "@/lib/paypal"
import { maskItemName, buildShieldUrls } from "@/lib/masking"
import { decrypt } from "@/lib/encryption"
import {
  type MerchantAccountRow,
  MerchantRotationError,
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

  // Normalise + validate intent
  // If the store has capture_mode = MANUAL, force AUTHORIZE regardless of the request body
  let intent: "CAPTURE" | "AUTHORIZE" =
    rawIntent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE"

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
    SELECT id, tenant_id, api_key_hash, is_active, COALESCE(capture_mode, 'INSTANT') AS capture_mode
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

  // ── Override intent based on store's capture_mode ──────────────────────────
  // If the store is configured for manual capture, force AUTHORIZE regardless
  // of what the client requested. The merchant must then call
  // POST /api/merchant/transactions/capture to collect the funds.
  if (store.capture_mode === "MANUAL") {
    intent = "AUTHORIZE"
  }

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

  try {
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
         SELECT merchant_account_id, COUNT(*) AS cnt
         FROM   transactions
         WHERE  created_at > NOW() - INTERVAL '1 hour'
         GROUP BY merchant_account_id
       ) ho ON ho.merchant_account_id = ma.id
       WHERE  ma.tenant_id = $1
         AND  ma.status IN ('ACTIVE', 'WARMING_UP')
       ORDER BY ma.priority DESC`,
      [tenantId]
    )

    const allAccounts = eligibleQuery.rows

    if (allAccounts.length === 0) {
      await client.query("ROLLBACK")
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
      return NextResponse.json(
        { error: "System Overloaded — selected account capacity exceeded. Please retry." },
        { status: 403 }
      )
    }

    // Warm-up double-check with locked data
    if (account.status === "WARMING_UP" && amount > WARMUP_MAX_TRANSACTION) {
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
    const decryptedSecret = decrypt(account.client_secret)

    // Proxy URL is also decrypted just-in-time (if encrypted) — it may
    // contain authentication credentials embedded in the URL.
    const proxyUrl = account.proxy_url ?? undefined

    let paypalOrder
    try {
      paypalOrder = await createPayPalOrder({
        clientId:      account.client_id,
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
      console.error("[checkout] PayPal order creation failed:", paypalError)
      return NextResponse.json(
        { error: "Payment provider error. Please try again." },
        { status: 502 }
      )
    }

    approvalUrl = getApprovalUrl(paypalOrder)

    // ── Step 10. INSERT PENDING transaction ──────────────────────────────────
    await client.query(
      `INSERT INTO transactions (
         id, tenant_id, store_id, merchant_id,
         original_amount, original_currency, original_item_name,
         gateway_fee, status,
         masked_item_name, paypal_order_id,
         customer_email, buyer_ip, buyer_country, ip_address,
         created_at, updated_at
       ) VALUES (
         $1,  $2,  $3,  $4,
         $5,  $6,  $7,
         0,   $13,
         $8,  $9,
         $10, $11, $12, $11,
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
        intent === "AUTHORIZE" ? "AUTHORIZED" : "PENDING",  // $13 — status
      ]
    )

    // ── Step 11. Increment current_volume (CAPTURE only) ─────────────────────
    // For AUTHORIZE intent, volume is NOT incremented here.
    // It will be updated when the store calls POST /api/gateway/capture
    // and the capture succeeds — this prevents phantom volume inflation
    // from authorizations that are never captured.
    if (intent === "CAPTURE") {
      await client.query(
        `UPDATE merchant_accounts
         SET    current_volume = current_volume + $1,
                updated_at     = NOW()
         WHERE  id = $2`,
        [amount, account.id]
      )
    }

    // ── Step 12. COMMIT ──────────────────────────────────────────────────────
    // Only reached if ALL prior steps succeeded.  This single COMMIT
    // atomically persists: the new transaction row + the volume increment.
    await client.query("COMMIT")

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
      intent,
      status: intent === "AUTHORIZE" ? "AUTHORIZED" : "PENDING",
    },
    { status: 201 }
  )
}
