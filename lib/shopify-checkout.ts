/**
 * lib/shopify-checkout.ts — Shopify Draft Order checkout orchestration
 *
 * Mirrors the Stripe checkout flow (lib/stripe-checkout.ts) for stores whose
 * provider_type = 'SHOPIFY', WITHOUT touching:
 *   • merchant-account rotation (Shopify = one store per PayDef store)
 *   • lib/paypal.ts / lib/stripe.ts
 *   • the existing mock-charge route
 *
 * It REUSES the shared, provider-neutral machinery:
 *   • Item Masking → resolvePaymentDisplayProfile + buildPayPalLineItemsForProfile
 *                    (produces a masked line-item title) + identity bundle brand
 *   • Popup bridge → buildPopupBridgeUrl() for POPUP_BRIDGE stores
 *
 * The buyer is redirected to the Draft Order invoice_url and pays on Shopify's
 * hosted checkout (Shopify Payments / Shop Pay). The transaction stays PENDING
 * and is flipped to COMPLETED by /api/webhook/shopify/[storeId] (orders/paid).
 */

import { NextResponse } from "next/server"
import { getPool, getSql } from "@/lib/neon"
import { decrypt, isEncrypted } from "@/lib/encryption"
import { maskItemName, seededIndex } from "@/lib/masking"
import {
  resolvePaymentDisplayProfile,
  buildPayPalLineItemsForProfile,
} from "@/lib/payment-display-profiles"
import { resolvePaymentIdentityBundleForCheckout } from "@/lib/payment-identity-bundle-resolver"
import { buildPopupBridgeUrl, type CheckoutFlow } from "@/lib/checkout-flow"
import { createDraftOrder, ShopifyApiError } from "@/lib/shopify"
import { createLogger } from "@/lib/logger"
import type { AuthenticatedStore } from "@/lib/gateway-auth"

const moduleLog = createLogger({ route: "/api/gateway/checkout", provider: "shopify" })

/**
 * Ad-source pool for Shopify conversion-source attribution. The merchant runs
 * Google Ads, Microsoft (Bing) Ads and Facebook ads, so each order is randomly
 * (equal-weight) attributed to one of these via UTM params on the invoice URL.
 */
const CONVERSION_SOURCES = [
  { source: "google", medium: "cpc", campaign: "google_ads" },
  { source: "bing", medium: "cpc", campaign: "bing_ads" },
  { source: "facebook", medium: "paid_social", campaign: "facebook_ads" },
] as const

/** Appends the chosen ad-source UTM params to a Shopify invoice URL. */
function withConversionUtm(
  invoiceUrl: string,
  pick: (typeof CONVERSION_SOURCES)[number]
): string {
  try {
    const url = new URL(invoiceUrl)
    url.searchParams.set("utm_source", pick.source)
    url.searchParams.set("utm_medium", pick.medium)
    url.searchParams.set("utm_campaign", pick.campaign)
    return url.toString()
  } catch {
    // Never block checkout on a URL parse issue — fall back to the bare invoice URL.
    return invoiceUrl
  }
}

interface ShopifyKeyRow {
  shopify_store_domain: string | null
  shopify_access_token: string | null
  shopify_item_label: string | null
}

export interface ShopifyCheckoutParams {
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
 * Handles a checkout request for a SHOPIFY-provider store and returns the same
 * response envelope as the PayPal / Stripe paths: { approvalUrl, transactionId }.
 */
export async function handleShopifyCheckout(params: ShopifyCheckoutParams): Promise<NextResponse> {
  const {
    store,
    amount,
    amountStr,
    currency,
    itemName,
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

  // ── Step 1. Load the store's Shopify credentials (separate query so PayPal /
  //    Stripe / mock-charge stores never touch the new columns before migration
  //    027). ────────────────────────────────────────────────────────────────
  let keyRow: ShopifyKeyRow | undefined
  try {
    const rows = (await sql`
      SELECT shopify_store_domain, shopify_access_token, shopify_item_label
      FROM stores
      WHERE id = ${store.id}
      LIMIT 1
    `) as unknown as ShopifyKeyRow[]
    keyRow = rows[0]
  } catch (err) {
    log.error("shopify.keys_query_failed", "Failed to load Shopify credentials", { error: err })
    return NextResponse.json(
      { error: "Shopify is not configured for this store." },
      { status: 503 }
    )
  }

  if (!keyRow?.shopify_store_domain || !keyRow?.shopify_access_token) {
    log.error("shopify.not_configured", "Store has no Shopify domain / access token", {})
    return NextResponse.json(
      { error: "Shopify is not configured for this store." },
      { status: 503 }
    )
  }

  const shopDomain = keyRow.shopify_store_domain.trim()
  let accessToken: string
  try {
    accessToken = isEncrypted(keyRow.shopify_access_token)
      ? decrypt(keyRow.shopify_access_token)
      : keyRow.shopify_access_token.trim()
  } catch (err) {
    log.error("shopify.token_decrypt_failed", "Failed to decrypt Shopify access token", { error: err })
    return NextResponse.json(
      { error: "Shopify credential error for this store." },
      { status: 500 }
    )
  }

  // ── Step 2. Item Masking — reuse the shared Payment Display Profile ─────────
  // Shopify stores have no merchant_account, so masking is driven entirely by
  // the store's display profile, with a generic masker fallback — identical to
  // the Stripe path.
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

  // ── Step 3. Resolve Payment Identity: shield domain + product title ─────────
  let primaryShieldDomain: string | null = null
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
    identityItemTitle =
      bundleResult.selectedItem?.product_title?.trim() ||
      bundleResult.selectedItem?.descriptor_name?.trim() ||
      null
  } catch (err) {
    // Non-fatal — fall back to the store's own shield domain + masked name.
    log.error("shopify.bundle_resolve_failed", "Identity bundle resolution failed (non-fatal)", {
      error: err,
    })
  }

  const finalShieldDomain = primaryShieldDomain || store.shieldDomain
  // Line-item title shown on the Shopify checkout. Priority:
  //   1. the store's `shopify_item_label` — may hold a POOL of names separated by
  //      commas / newlines; one is picked at random per order (seeded by the
  //      transaction id so a retry of the same checkout reproduces the same name)
  //   2. the Payment Identity's configured product_title
  //   3. the generic masked name (display profile / maskItemName pool)
  const labelPool = (keyRow.shopify_item_label ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const storeItemLabel =
    labelPool.length > 0 ? labelPool[seededIndex(transactionId, labelPool.length)] : null
  const maskedItemTitle = storeItemLabel || identityItemTitle || maskedItems[0]?.name || maskItemName(itemName)

  // ── Step 4. Create the Shopify Draft Order (invoice) ────────────────────────
  let draft
  try {
    draft = await createDraftOrder({
      shopDomain,
      accessToken,
      currency,
      itemTitle: maskedItemTitle,
      amount: amountStr,
      customerEmail,
      transactionId,
    })
  } catch (err) {
    const status = err instanceof ShopifyApiError ? err.statusCode : 502
    log.error("shopify.create_draft_failed", "Shopify Draft Order creation failed", { error: err })
    return NextResponse.json(
      { error: "Payment provider error. Please try again." },
      { status: status >= 400 && status < 600 ? status : 502 }
    )
  }

  // ── Conversion-source attribution ──────────────────────────────────────────
  // Shopify builds the order's "Conversion summary" from the checkout session's
  // UTM params. A draft-order invoice link carries none, so every order shows up
  // as "direct". Append a randomised ad-source UTM (seeded by the transaction id
  // so a checkout retry reproduces the same source) to the invoice URL, so the
  // buyer's Shopify session is attributed to one of the ad platforms the merchant
  // actually runs. Equal random across Google / Bing / Facebook.
  const conv = CONVERSION_SOURCES[seededIndex(transactionId, CONVERSION_SOURCES.length)]
  const approvalUrl = withConversionUtm(draft.invoiceUrl, conv)
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

  // ── Step 5. Persist the PENDING transaction (no rotation, no merchant_id) ───
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO transactions (
         id, tenant_id, store_id, merchant_id,
         original_amount, original_currency, original_item_name,
         gateway_fee, status, intent,
         masked_item_name, paypal_order_id,
         shopify_draft_order_id,
         customer_email, buyer_ip, buyer_country, ip_address,
         checkout_expires_at, authorization_expires_at,
         merchant_success_url, merchant_cancel_url,
         created_at, updated_at
       ) VALUES (
         $1,  $2,  $3,  NULL,
         $4,  $5,  $6,
         0,   'PENDING'::transaction_status, 'CAPTURE',
         $7,  NULL,
         $8,
         $9,  $10, $11, $10,
         NOW() + INTERVAL '30 minutes',
         NULL,
         $12, $13,
         NOW(), NOW()
       )`,
      [
        transactionId, // $1
        tenantId, // $2
        store.id, // $3
        amount, // $4  — original_amount
        currency, // $5  — original_currency
        itemName, // $6  — original_item_name (unmasked, for audit)
        maskedItemTitle, // $7  — masked_item_name
        draft.draftOrderId, // $8  — shopify_draft_order_id
        customerEmail ?? null, // $9  — customer_email
        buyerIp ?? null, // $10 — buyer_ip + ip_address
        buyerCountry ?? null, // $11 — buyer_country
        store.successReturnUrl ?? null, // $12 — merchant_success_url
        store.cancelReturnUrl ?? null, // $13 — merchant_cancel_url
      ]
    )
  } catch (err) {
    // The Shopify draft order is harmless if abandoned (it expires unpaid);
    // surface the persistence error.
    log.error("shopify.transaction_insert_failed", "Failed to persist Shopify transaction", {
      error: err,
      shopifyDraftOrderId: draft.draftOrderId,
    })
    return NextResponse.json({ error: "Payment processing error. Please try again." }, { status: 500 })
  } finally {
    client.release()
  }

  log.info("shopify.checkout_created", `Shopify Draft Order created draft=${draft.draftOrderId}`, {
    storeId: store.id,
    tenantId,
    transactionId,
    finalShieldDomain,
    flow,
    conversionSource: conv.source,
  })

  return NextResponse.json(
    {
      transactionId,
      executeToken: null,
      approvalUrl,
      flow,
      popupUrl,
      popupOrigin,
      intent: "CAPTURE",
      status: "PENDING",
      provider: "shopify",
      merchantReturnConfigured: !!(store.successReturnUrl || store.cancelReturnUrl),
    },
    { status: 201 }
  )
}
