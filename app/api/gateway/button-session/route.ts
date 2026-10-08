/**
 * POST /api/gateway/button-session
 *
 * Called by a storefront (the WooCommerce plugin) when it renders a page that
 * can show PayPal Smart Buttons — checkout, cart or product. Pins a merchant
 * account for that amount and returns the iframe URL; the PayPal order itself
 * is created later by /api/gateway/checkout with the session id.
 *
 * Authentication: X-Store-ID + X-API-Key (same as checkout).
 * Body: { amount: number, currency?: string, context: "checkout"|"cart"|"product" }
 * 200: { enabled: false, reason } | { enabled: true, sessionId, embedUrl, embedOrigin, expiresAt }
 */

import { NextRequest, NextResponse } from "next/server"
import { getSql } from "@/lib/neon"
import { createLogger } from "@/lib/logger"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"
import { checkRateLimit } from "@/lib/gateway-rate-limit"
import { getCheckoutPreferences } from "@/lib/checkout-flow"
import { filterOpenCircuits } from "@/lib/circuit-breaker"
import { selectByStrategy, type MerchantAccountRow } from "@/lib/merchant-rotation"
import { resolvePaymentDisplayProfile } from "@/lib/payment-display-profiles"
import { isButtonContext } from "@/lib/button-sessions"
import { createButtonSession, type NewButtonSession } from "@/lib/button-session-create"

const log = createLogger({ route: "/api/gateway/button-session" })

export async function POST(req: NextRequest) {
  let store
  try {
    store = await authenticateStoreHeaders(req)
  } catch (error) {
    const msg = error instanceof Error ? error.message : ""
    if (msg.includes("Missing")) return NextResponse.json({ error: msg }, { status: 401 })
    if (msg.includes("Invalid")) return NextResponse.json({ error: "Invalid API key." }, { status: 401 })
    return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
  }

  const { allowed, headers: rlHeaders } = await checkRateLimit(store.id)
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: rlHeaders })
  }

  let body: { amount?: unknown; currency?: unknown; context?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 })
  }
  const currency = typeof body.currency === "string" && /^[A-Za-z]{3}$/.test(body.currency) ? body.currency : "USD"
  if (!isButtonContext(body.context)) {
    return NextResponse.json({ error: "context must be checkout, cart or product." }, { status: 400 })
  }
  const context = body.context

  const sql = getSql()
  const { defaultFlow } = await getCheckoutPreferences(sql)

  const result = await createButtonSession(
    {
      loadAccounts: async (tenantId) =>
        (await sql`
          SELECT ma.id, ma.tenant_id, ma.client_id, ma.client_secret,
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
          WHERE  ma.tenant_id = ${tenantId}
            AND  ma.status IN ('ACTIVE', 'WARMING_UP')
          ORDER BY ma.priority DESC
        `) as unknown as MerchantAccountRow[],
      preferredProfileId: async () =>
        (await resolvePaymentDisplayProfile({ tenantId: store.tenantId, storeId: store.id, storeName: store.name })).profileId ?? null,
      filterOpenCircuits: (accounts) => filterOpenCircuits(accounts, store.id),
      selectByStrategy: (accounts) => selectByStrategy(accounts, store.tenantId, sql),
      insertSession: async (row: NewButtonSession) => {
        const rows = (await sql`
          INSERT INTO button_sessions (
            tenant_id, store_id, merchant_account_id, shield_domain, context,
            amount, currency, intent, allowed_origins, expires_at
          ) VALUES (
            ${row.tenant_id}, ${row.store_id}, ${row.merchant_account_id}, ${row.shield_domain}, ${row.context},
            ${row.amount}, ${row.currency}, ${row.intent}, ${row.allowed_origins}, NOW() + INTERVAL '30 minutes'
          )
          RETURNING id, expires_at
        `) as unknown as { id: string; expires_at: string }[]
        return rows[0]
      },
    },
    { store, amount, currency, context, defaultFlow }
  )

  log.info(
    "button_session.result",
    result.enabled
      ? `Button session ${result.sessionId} for store=${store.id} context=${context} amount=${amount.toFixed(2)}`
      : `No Smart Buttons for store=${store.id} context=${context}: ${result.reason}`,
    { storeId: store.id, tenantId: store.tenantId, context, enabled: result.enabled }
  )
  return NextResponse.json(result)
}
