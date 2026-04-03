/**
 * POST /api/gateway/checkout
 *
 * Public endpoint consumed by merchant storefronts.
 * Authentication: X-Store-ID + X-API-Key headers (bcrypt verified).
 *
 * Flow:
 *  1. Validate store headers → resolve tenantId
 *  2. SELECT active MerchantAccounts for tenant
 *  3. Weighted random rotation to pick a candidate
 *  4. BEGIN transaction + SELECT … FOR UPDATE on chosen account (row-level lock)
 *  5. Verify candidate has not exceeded dailyLimit
 *  6. Create PayPal order (approval link)
 *  7. INSERT transaction as PENDING + UPDATE currentVolume
 *  8. COMMIT → return { approvalUrl, transactionId }
 */

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getPool, getSql } from "@/lib/neon"
import { createPayPalOrder, getApprovalUrl } from "@/lib/paypal"
import { maskItemName, buildShieldUrls } from "@/lib/masking"

// ─── Request body shape ───────────────────────────────────────────────────────

interface CheckoutBody {
  amount:       number   // decimal, e.g. 49.99
  currency?:    string   // ISO 4217, default "USD"
  itemName:     string   // real product name (will be masked)
  buyerIp?:     string
  buyerCountry?: string
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface StoreRow {
  id:            string
  tenant_id:     string
  api_key_hash:  string
  is_active:     boolean
}

interface AccountRow {
  id:             string
  tenant_id:      string
  client_id:      string
  client_secret:  string
  shield_domain:  string
  daily_limit:    string   // numeric comes back as string from pg
  current_volume: string
  priority:       number
  status:         string
}

// ─── Weighted random selection ────────────────────────────────────────────────
// Accounts with higher priority have proportionally higher selection chance.

function weightedRandom(accounts: AccountRow[]): AccountRow {
  const totalWeight = accounts.reduce((sum, a) => sum + a.priority, 0)
  let rand = Math.random() * totalWeight
  for (const account of accounts) {
    rand -= account.priority
    if (rand <= 0) return account
  }
  return accounts[accounts.length - 1]
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Extract & validate headers ─────────────────────────────────────────
  const storeId = req.headers.get("X-Store-ID")
  const apiKey  = req.headers.get("X-API-Key")

  if (!storeId || !apiKey) {
    return NextResponse.json(
      { error: "Missing X-Store-ID or X-API-Key header." },
      { status: 401 }
    )
  }

  // ── 2. Parse & validate body ───────────────────────────────────────────────
  let body: CheckoutBody
  try {
    body = (await req.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const { amount, currency = "USD", itemName, buyerIp, buyerCountry } = body

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

  // ── 3. Resolve store + verify API key ─────────────────────────────────────
  const sql = getSql()
  const storeRows = await sql<StoreRow[]>`
    SELECT id, tenant_id, api_key_hash, is_active
    FROM   stores
    WHERE  id = ${storeId}
    LIMIT  1
  `
  const store = storeRows[0] ?? null

  if (!store || !store.is_active) {
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const keyValid = await bcrypt.compare(apiKey, store.api_key_hash)
  if (!keyValid) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
  }

  const { tenant_id: tenantId } = store

  // ── 4. Fetch ACTIVE merchant accounts for this tenant ─────────────────────
  const accounts = await sql<AccountRow[]>`
    SELECT id, tenant_id, client_id, client_secret,
           shield_domain, daily_limit, current_volume, priority, status
    FROM   merchant_accounts
    WHERE  tenant_id = ${tenantId}
      AND  status    = 'ACTIVE'
  `

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "No active payment accounts available. Please try again later." },
      { status: 503 }
    )
  }

  // Filter out accounts that have already hit their daily limit (pre-flight check)
  const eligible = accounts.filter(
    (a) => parseFloat(a.current_volume) + amount <= parseFloat(a.daily_limit)
  )

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "All payment accounts have reached their daily limit." },
      { status: 503 }
    )
  }

  // ── 5. Weighted random rotation to pick a candidate ───────────────────────
  const candidate = weightedRandom(eligible)

  // ── 6. Row-level locking transaction ──────────────────────────────────────
  // BEGIN → SELECT … FOR UPDATE (locks the chosen row) → re-check limit →
  // CREATE PayPal order → INSERT transaction → UPDATE volume → COMMIT
  const pool   = getPool()
  const client = await pool.connect()

  let transactionId: string
  let approvalUrl:   string

  try {
    await client.query("BEGIN")

    // Lock the selected MerchantAccount row to prevent concurrent writes
    const locked = await client.query<AccountRow>(
      `SELECT id, client_id, client_secret, shield_domain,
              daily_limit, current_volume, priority, status
       FROM   merchant_accounts
       WHERE  id = $1
       FOR UPDATE`,
      [candidate.id]
    )

    const account = locked.rows[0]

    // Re-check limit with fresh locked data (prevents race conditions)
    const currentVolume = parseFloat(account.current_volume)
    const dailyLimit    = parseFloat(account.daily_limit)

    if (currentVolume + amount > dailyLimit) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "Selected account just exceeded its daily limit. Please retry." },
        { status: 503 }
      )
    }

    // ── 7. Item masking + shield URLs ────────────────────────────────────────
    const maskedName = maskItemName(itemName)

    // Generate a provisional transaction ID for idempotency key + shield URLs
    const txIdRow = await client.query<{ id: string }>(
      "SELECT gen_random_uuid()::text AS id"
    )
    transactionId = txIdRow.rows[0].id

    const { returnUrl, cancelUrl } = buildShieldUrls(account.shield_domain, transactionId)

    // ── 8. Create PayPal order (outside the db lock to minimise lock duration) ─
    // Note: PayPal call is inside the transaction intentionally — if PayPal
    // fails we ROLLBACK and never persist the row, keeping the DB clean.
    let paypalOrder
    try {
      paypalOrder = await createPayPalOrder({
        clientId:     account.client_id,
        clientSecret: account.client_secret,
        amount:       amountStr,
        currencyCode: currency,
        items: [
          {
            name:     maskedName,
            quantity: "1",
            unitAmount: { currencyCode: currency, value: amountStr },
          },
        ],
        returnUrl,
        cancelUrl,
        customId: transactionId,
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

    // ── 9. Insert PENDING transaction ─────────────────────────────────────────
    await client.query(
      `INSERT INTO transactions (
         id, tenant_id, store_id, merchant_id,
         original_amount, gateway_fee, status,
         masked_item_name, paypal_order_id, buyer_ip, buyer_country,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, 0, 'PENDING',
         $6, $7, $8, $9,
         NOW(), NOW()
       )`,
      [
        transactionId, tenantId, storeId, account.id,
        amount,
        maskedName, paypalOrder.id,
        buyerIp   ?? null,
        buyerCountry ?? null,
      ]
    )

    // ── 10. Increment currentVolume on the locked account ─────────────────────
    await client.query(
      `UPDATE merchant_accounts
       SET    current_volume = current_volume + $1,
              updated_at     = NOW()
       WHERE  id = $2`,
      [amount, account.id]
    )

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[checkout] Unexpected error:", err)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  } finally {
    client.release()
  }

  // ── 11. Return approval URL to the storefront ─────────────────────────────
  return NextResponse.json(
    {
      transactionId,
      approvalUrl,
      status: "PENDING",
    },
    { status: 201 }
  )
}
