/**
 * lib/payment-identity-bundle-resolver.ts — Phase 5D-2
 *
 * Checkout-specific wrapper around the Phase 5B bundle resolver.
 *
 * Adds:
 *   - Shield domain assignment check (priority B)
 *   - Price-range item filtering
 *   - Structured shadow-mode return shape for checkout integration
 *   - Never throws in shadow mode — always returns safe fallback
 *
 * Does NOT:
 *   - Change PayPal payload
 *   - Change buyer-facing items
 *   - Change capture/refund/webhook behavior
 */

import { getSql } from "@/lib/neon"
import { sanitizePayPalField } from "@/lib/masking"
import {
  type PaymentIdentityBundle,
  type PaymentIdentityBundleItem,
  resolvePaymentIdentityBundle,
} from "@/lib/identity-bundles"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "lib/payment-identity-bundle-resolver" })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckoutBundleResolveInput {
  tenantId: string
  storeId: string
  merchantAccountId?: string | null
  shieldDomainId?: string | null
  checkoutAmount: number
  mode?: "shadow" | "enforce" | "disabled"
}

export interface CheckoutBundleResolveResult {
  mode: "shadow" | "enforce" | "disabled"
  bundle: PaymentIdentityBundle | null
  selectedItem: PaymentIdentityBundleItem | null
  candidateDescriptor: string | null
  assignmentMatch: {
    merchantAccount: boolean
    shieldDomain: boolean
  }
  warnings: string[]
  reason: string
}

// ─── Item selection with price-range filtering ────────────────────────────────

function selectItemByPriceAndSort(
  items: PaymentIdentityBundleItem[],
  checkoutAmount: number
): PaymentIdentityBundleItem | null {
  const active = items.filter(i => i.is_active)
  if (active.length === 0) return null

  // A. First active item where price_min <= checkoutAmount <= price_max
  const priceMatched = active.find(i => {
    const minOk = i.price_min == null || Number(i.price_min) <= checkoutAmount
    const maxOk = i.price_max == null || Number(i.price_max) >= checkoutAmount
    return minOk && maxOk
  })
  if (priceMatched) return priceMatched

  // B. Lowest sort_order active item (items are already sorted by sort_order ASC)
  return active[0]
}

// ─── Checkout Resolver ────────────────────────────────────────────────────────

/**
 * Resolves the Payment Identity Bundle for a checkout transaction.
 *
 * Extends the Phase 5B resolver by:
 *   1. Checking shield domain assignment (priority B)
 *   2. Price-range item selection
 *   3. Building a candidate descriptor string for shadow comparison
 *
 * Guarantees:
 *   - Never throws — returns safe fallback on any error
 *   - Never mutates PayPal payload
 *   - Returns structured data for shadow logging only
 */
export async function resolvePaymentIdentityBundleForCheckout(
  input: CheckoutBundleResolveInput
): Promise<CheckoutBundleResolveResult> {
  const mode = input.mode || (process.env.PAYMENT_IDENTITY_BUNDLE_MODE as any) || "shadow"

  if (mode === "disabled") {
    return {
      mode: "disabled",
      bundle: null,
      selectedItem: null,
      candidateDescriptor: null,
      assignmentMatch: { merchantAccount: false, shieldDomain: false },
      warnings: [],
      reason: "disabled_by_mode",
    }
  }

  try {
    // ── Step 1: Use Phase 5B resolver (handles merchant account + store + tenant defaults)
    const resolved = await resolvePaymentIdentityBundle({
      tenantId: input.tenantId,
      storeId: input.storeId,
      merchantAccountId: input.merchantAccountId ?? undefined,
    })

    let bundle = resolved.bundle
    let reason: string = resolved.source
    let maMatch = resolved.source === "merchant_account_bundle"
    let sdMatch = false
    const warnings = [...resolved.warnings]

    // ── Step 2: If Phase 5B found no bundle, try shield domain assignment (priority B)
    if (!bundle && input.shieldDomainId) {
      try {
        const sql = getSql()
        const sdRows = await sql`
          SELECT pib.*
          FROM shield_domains sd
          JOIN payment_identity_bundles pib ON sd.bundle_id = pib.id
          WHERE sd.id = ${input.shieldDomainId}
            AND pib.tenant_id = ${input.tenantId}
            AND pib.is_active = true
          LIMIT 1
        `
        if (sdRows.length > 0) {
          bundle = sdRows[0] as unknown as PaymentIdentityBundle
          reason = "shield_domain_bundle"
          sdMatch = true
        }
      } catch (sdErr) {
        warnings.push("Shield domain bundle lookup failed")
        log.warn("payment_identity_bundle.shield_domain_lookup_error",
          "Shield domain bundle lookup failed — continuing without", {
            tenantId: input.tenantId,
            shieldDomainId: input.shieldDomainId ?? undefined,
            error: sdErr,
          })
      }
    }

    // ── Step 3: If Phase 5B resolved via merchant account, also check shield domain assignment match
    if (bundle && input.shieldDomainId && !sdMatch) {
      try {
        const sql = getSql()
        const checkRows = await sql`
          SELECT 1 FROM shield_domains
          WHERE id = ${input.shieldDomainId}
            AND bundle_id = ${bundle.id}
          LIMIT 1
        `
        if (checkRows.length > 0) {
          sdMatch = true
        }
      } catch {
        // Non-critical — don't fail
      }
    }

    // ── Step 4: Select item
    let selectedItem: PaymentIdentityBundleItem | null = null
    let candidateDescriptor: string | null = null

    if (bundle) {
      const items = resolved.items.length > 0
        ? resolved.items
        : await fetchItemsForBundle(bundle.id, input.tenantId)

      selectedItem = selectItemByPriceAndSort(items, input.checkoutAmount)

      if (!selectedItem && items.length > 0) {
        warnings.push("No item matched price range — fell back to first active item")
      }
      if (!selectedItem && items.length === 0) {
        warnings.push("Bundle has no active items")
      }

      // Build candidate descriptor
      if (selectedItem) {
        const prefix = bundle.public_brand_name?.trim()
        let baseDescriptor = selectedItem.descriptor_name.trim()

        // Prevent duplicate brand prefix (e.g. "Brand - Brand - Item")
        if (prefix && baseDescriptor.toLowerCase().startsWith(prefix.toLowerCase())) {
          baseDescriptor = baseDescriptor.slice(prefix.length).replace(/^[-\s]+/, "")
        }

        const rawCandidate = prefix ? `${prefix} - ${baseDescriptor}` : baseDescriptor
        
        // Do not silently truncate to 127 here. Pass a large length (1000) so the 
        // checkout enforce preflight can catch length violations and log a clear fallback.
        candidateDescriptor = sanitizePayPalField(rawCandidate, 1000)
      }
    }

    return {
      mode,
      bundle,
      selectedItem,
      candidateDescriptor,
      assignmentMatch: {
        merchantAccount: maMatch,
        shieldDomain: sdMatch,
      },
      warnings,
      reason,
    }
  } catch (err) {
    log.error("payment_identity_bundle.checkout_resolver_error",
      "Checkout bundle resolver failed — returning safe fallback", {
        tenantId: input.tenantId,
        storeId: input.storeId,
        merchantAccountId: input.merchantAccountId ?? undefined,
        error: err,
      })

    return {
      mode,
      bundle: null,
      selectedItem: null,
      candidateDescriptor: null,
      assignmentMatch: { merchantAccount: false, shieldDomain: false },
      warnings: ["Resolver error — using safe fallback"],
      reason: `resolver_error: ${err instanceof Error ? err.message : "unknown"}`,
    }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function fetchItemsForBundle(
  bundleId: string,
  tenantId: string
): Promise<PaymentIdentityBundleItem[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM payment_identity_bundle_items
    WHERE bundle_id = ${bundleId}
      AND tenant_id = ${tenantId}
      AND is_active = true
    ORDER BY sort_order ASC, created_at ASC
  `
  return rows as unknown as PaymentIdentityBundleItem[]
}
