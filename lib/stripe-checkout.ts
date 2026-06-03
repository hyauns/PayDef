/**
 * lib/stripe-checkout.ts — Stripe Checkout orchestration
 *
 * Mirrors the PayPal checkout flow (app/api/gateway/checkout/route.ts) for
 * stores whose provider_type = 'STRIPE', WITHOUT touching:
 *   • merchant-account rotation (Stripe = one account per store)
 *   • lib/paypal.ts
 *   • the existing mock-charge route
 *
 * It REUSES the shared, provider-neutral machinery:
 *   • Item Masking      → resolvePaymentDisplayProfile + buildPayPalLineItemsForProfile
 *                         (produces masked line-item names) + identity bundle brand
 *   • Shield Domain     → buildShieldUrls() / buildPopupBridgeUrl()
 */

import { NextResponse } from "next/server"
import { getPool, getSql } from "@/lib/neon"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { maskItemName, maskBrandName, buildShieldUrls } from "@/lib/masking"
import {
  resolvePaymentDisplayProfile,
  buildPayPalLineItemsForProfile,
} from "@/lib/payment-display-profiles"
import { resolvePaymentIdentityBundleForCheckout } from "@/lib/payment-identity-bundle-resolver"
import { buildPopupBridgeUrl, type CheckoutFlow } from "@/lib/checkout-flow"
import { generateExecuteToken } from "@/lib/execute-token"
import { createCheckoutSession, StripeApiError } from "@/lib/stripe"
import { createLogger } from "@/lib/logger"
import type { AuthenticatedStore } from "@/lib/gateway-auth"

const moduleLog = createLogger({ route: "/api/gateway/checkout", provider: "stripe" })

interface StripeKeyRow {
  stripe_secret_key: string | null
  stripe_publishable_key: string | null
  stripe_webhook_secret: string | null
}

export interface StripeCheckoutParams {
  store: AuthenticatedStore
  amount: number
  amountStr: string
  currency: string
  itemName: string
  intent: "CAPTURE" | "AUTHORIZE"
  customerEmail?: string | null
  buyerIp?: string | null
  buyerCountry?: string | null
  flow: CheckoutFlow
  requestId: string
}

/**
 * Handles a checkout request for a STRIPE-provider store and returns the
 * same response envelope as the PayPal path: { approvalUrl, transactionId, ... }.
 */
export async function handleStripeCheckout(params: StripeCheckoutParams): Promise<NextResponse> {
  const {
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
  } = params

  const tenantId = store.tenantId
  const transactionId = crypto.randomUUID()
  const log = moduleLog.child({ requestId, transactionId, traceId: transactionId, storeId: store.id })

  const sql = getSql()

  // ── Step 1. Load the store's Stripe credentials (separate query so PayPal /
  //    mock-charge stores never touch the new columns before migration 025). ──
  let keyRow: StripeKeyRow | undefined
  try {
    const rows = (await sql`
      SELECT stripe_secret_key, stripe_publishable_key, stripe_webhook_secret
      FROM stores
      WHERE id = ${store.id}
      LIMIT 1
    `) as unknown as StripeKeyRow[]
    keyRow = rows[0]
  } catch (err) {
    log.error("stripe.keys_query_failed", "Failed to load Stripe credentials", { error: err })
    return NextResponse.json(
      { error: "Stripe is not configured for this store." },
      { status: 503 }
    )
  }

  if (!keyRow?.stripe_secret_key) {
    log.error("stripe.not_configured", "Store has no Stripe secret key", {})
    return NextResponse.json(
      { error: "Stripe is not configured for this store." },
      { status: 503 }
    )
  }

  let secretKey: string
  try {
    secretKey = isEncrypted(keyRow.stripe_secret_key)
      ? decrypt(keyRow.stripe_secret_key)
      : keyRow.stripe_secret_key.trim()
  } catch (err) {
    log.error("stripe.secret_decrypt_failed", "Failed to decrypt Stripe secret key", { error: err })
    return NextResponse.json(
      { error: "Stripe credential error for this store." },
      { status: 500 }
    )
  }

  // ── Step 2. Item Masking — reuse the shared Payment Display Profile ─────────
  // Stripe stores have no merchant_account, so there is no per-account
  // item_masking toggle / fake_product_name; masking is driven entirely by the
  // store's display profile, with a generic masker fallback.
  const profileMode = (process.env.PAYMENT_DISPLAY_PROFILE_MODE || "shadow") as "shadow" | "enforce"
  const bundleMode = (process.env.PAYMENT_IDENTITY_BUNDLE_MODE || "shadow") as
    | "shadow"
    | "enforce"
    | "disabled"

  const profile = await resolvePaymentDisplayProfile({
    tenantId,
    storeId: store.id,
    storeName: "Unknown Store",
  })

  const legacyMasker = (realName: string) => maskItemName(realName)

  const lineItemResult = buildPayPalLineItemsForProfile({
    profile,
    originalItems: [
      {
        name: itemName,
        quantity: "1",
        unitAmount: { currencyCode: currency, value: amountStr },
      },
    ],
    checkoutTotal: amountStr,
    currency,
    transactionId,
    mode: profileMode,
    legacyMasker,
  })

  const maskedItems = lineItemResult.selectedItems

  // ── Step 3. Resolve Payment Identity: shield domain + brand + product name ───
  let primaryShieldDomain: string | null = null
  let publicBrandName: string | null = null
  let candidateDescriptor: string | null = null
  let identityItemTitle: string | null = null
  try {
    const bundleResult = await resolvePaymentIdentityBundleForCheckout({
      tenantId,
      storeId: store.id,
      merchantAccountId: null,
      checkoutAmount: amount,
      mode: bundleMode,
    })
    primaryShieldDomain = bundleResult.primaryShieldDomain
    publicBrandName = bundleResult.publicBrandName
    candidateDescriptor = bundleResult.candidateDescriptor
    // The identity's selected item supplies the product name shown to the buyer
    // (prefer the realistic product_title, fall back to its descriptor_name).
    identityItemTitle =
      bundleResult.selectedItem?.product_title?.trim() ||
      bundleResult.selectedItem?.descriptor_name?.trim() ||
      null
  } catch (err) {
    // Non-fatal — fall back to the store's own shield domain + masked brand.
    log.error("stripe.bundle_resolve_failed", "Identity bundle resolution failed (non-fatal)", {
      error: err,
    })
  }

  const finalShieldDomain = primaryShieldDomain || store.shieldDomain
  // Card-statement descriptor (Stripe clamps to 22 chars) — prefer the identity brand.
  const statementDescriptorSuffix = publicBrandName || candidateDescriptor || maskBrandName(transactionId)

  // Line-item name on the Stripe checkout + receipt: prefer the Payment Identity's
  // configured product_title; otherwise fall back to the generic masked name.
  const stripeItems = identityItemTitle
    ? maskedItems.map((it) => ({ ...it, name: identityItemTitle as string }))
    : maskedItems
  const maskedItemName = stripeItems[0]?.name ?? maskItemName(itemName)

  // ── Step 4. Build return/cancel URLs ────────────────────────────────────────
  // In production these go through the masking shield domain. For LOCAL testing
  // the shield domain resolves to the deployed instance (which can't see a
  // transaction created on your local DB), so SHIELD_RETURN_BASE_URL lets you
  // point the return back to a locally-reachable PayDef, e.g.
  //   SHIELD_RETURN_BASE_URL=http://localhost:3000
  // Leave it unset in production to keep shield-domain masking.
  const executeToken = generateExecuteToken(transactionId)
  const returnBaseOverride = process.env.SHIELD_RETURN_BASE_URL?.trim()
  let returnUrl: string
  let cancelUrl: string
  if (returnBaseOverride) {
    const base = returnBaseOverride.replace(/\/+$/, "")
    const rp = new URLSearchParams({ ref: transactionId })
    if (executeToken) rp.set("et", executeToken)
    returnUrl = `${base}/order/success?${rp.toString()}`
    cancelUrl = `${base}/order/cancel?${new URLSearchParams({ ref: transactionId }).toString()}`
  } else {
    const built = buildShieldUrls(finalShieldDomain, transactionId, executeToken)
    returnUrl = built.returnUrl
    cancelUrl = built.cancelUrl
  }

  // ── Step 5. Create the Stripe Checkout Session ──────────────────────────────
  let session
  try {
    session = await createCheckoutSession({
      secretKey,
      currency,
      items: stripeItems,
      statementDescriptorSuffix,
      successUrl: returnUrl,
      cancelUrl,
      transactionId,
      customerEmail,
    })
  } catch (err) {
    const status = err instanceof StripeApiError ? err.statusCode : 502
    log.error("stripe.create_session_failed", "Stripe Checkout Session creation failed", {
      error: err,
    })
    return NextResponse.json(
      { error: "Payment provider error. Please try again." },
      { status: status >= 400 && status < 600 ? status : 502 }
    )
  }

  const approvalUrl = session.url
  let popupUrl: string | null = null
  let popupOrigin: string | null = null
  if (flow === "POPUP_BRIDGE") {
    popupUrl = buildPopupBridgeUrl(finalShieldDomain, approvalUrl, transactionId)
    try {
      popupOrigin = new URL(popupUrl).origin
    } catch {
      popupOrigin = finalShieldDomain ? `https://${finalShieldDomain}` : null
    }
  }

  // ── Step 6. Persist the PENDING transaction (no rotation, no merchant_id) ───
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO transactions (
         id, tenant_id, store_id, merchant_id,
         original_amount, original_currency, original_item_name,
         gateway_fee, status, intent,
         masked_item_name, paypal_order_id,
         stripe_session_id, stripe_payment_intent_id,
         customer_email, buyer_ip, buyer_country, ip_address,
         checkout_expires_at, authorization_expires_at,
         merchant_success_url, merchant_cancel_url,
         created_at, updated_at
       ) VALUES (
         $1,  $2,  $3,  NULL,
         $4,  $5,  $6,
         0,   'PENDING'::transaction_status, 'CAPTURE',
         $7,  NULL,
         $8,  $9,
         $10, $11, $12, $11,
         NOW() + INTERVAL '30 minutes',
         NULL,
         $13, $14,
         NOW(), NOW()
       )`,
      [
        transactionId, // $1
        tenantId, // $2
        store.id, // $3
        amount, // $4  — original_amount
        currency, // $5  — original_currency
        itemName, // $6  — original_item_name (unmasked, for audit)
        maskedItemName, // $7  — masked_item_name
        session.id, // $8  — stripe_session_id
        session.paymentIntentId, // $9  — stripe_payment_intent_id (may be null)
        customerEmail ?? null, // $10 — customer_email
        buyerIp ?? null, // $11 — buyer_ip + ip_address
        buyerCountry ?? null, // $12 — buyer_country
        store.successReturnUrl ?? null, // $13 — merchant_success_url
        store.cancelReturnUrl ?? null, // $14 — merchant_cancel_url
      ]
    )
  } catch (err) {
    // The Stripe session is harmless if abandoned; surface the persistence error.
    log.error("stripe.transaction_insert_failed", "Failed to persist Stripe transaction", {
      error: err,
      stripeSessionId: session.id,
    })
    return NextResponse.json({ error: "Payment processing error. Please try again." }, { status: 500 })
  } finally {
    client.release()
  }

  log.info("stripe.checkout_created", `Stripe Checkout Session created session=${session.id}`, {
    storeId: store.id,
    tenantId,
    transactionId,
    finalShieldDomain,
    flow,
    intent,
  })

  return NextResponse.json(
    {
      transactionId,
      executeToken,
      approvalUrl,
      flow,
      popupUrl,
      popupOrigin,
      intent: "CAPTURE",
      status: "PENDING",
      provider: "stripe",
      merchantReturnConfigured: !!(store.successReturnUrl || store.cancelReturnUrl),
    },
    { status: 201 }
  )
}
