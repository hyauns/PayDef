/**
 * lib/identity-bundles.ts — Phase 5B
 *
 * Payment Identity Bundle resolver foundation.
 *
 * A Payment Identity Bundle consistently connects:
 *   - Payment Display Profile
 *   - Merchant Account(s)
 *   - Shield Domain
 *   - Descriptor/Product names (for PayPal)
 *   - Shield-domain product/category pages
 *   - Support email/phone
 *   - Policy URLs
 *   - Industry vertical
 *
 * This module provides:
 *   - Types for bundles and bundle items
 *   - Resolver that finds the correct bundle for a transaction
 *   - Deterministic item selection for future descriptor use
 *   - Structured logging integration
 *
 * Phase 5B scope:
 *   - Resolver foundation only (not wired into checkout)
 *   - Does NOT change PayPal payloads
 *   - Does NOT change checkout behavior
 *   - Does NOT affect existing Payment Display Profile resolution
 */

import { getSql } from "@/lib/neon"
import { sanitizePayPalField } from "@/lib/masking"
import { createHash } from "crypto"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "lib/identity-bundles" })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentIdentityBundle {
  id: string
  tenant_id: string
  store_id: string | null
  display_profile_id: string | null
  bundle_name: string
  public_brand_name: string | null
  industry_vertical: string
  primary_shield_domain: string | null
  support_email: string | null
  support_phone: string | null
  order_lookup_url: string | null
  tracking_url: string | null
  shipping_policy_url: string | null
  refund_policy_url: string | null
  privacy_policy_url: string | null
  terms_url: string | null
  is_default: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface PaymentIdentityBundleItem {
  id: string
  tenant_id: string
  bundle_id: string
  descriptor_name: string
  product_slug: string | null
  product_title: string
  product_description: string | null
  product_type: string
  shipping_required: boolean
  tracking_expected: boolean
  price_min: number | null
  price_max: number | null
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: Date
  updated_at: Date
}

export type BundleResolverSource =
  | "merchant_account_bundle"
  | "store_default_bundle"
  | "tenant_default_bundle"
  | "display_profile_bundle"
  | "no_bundle"

export interface ResolvedPaymentIdentityBundle {
  /** The resolved bundle, or null if none found */
  bundle: PaymentIdentityBundle | null
  /** Active items in the bundle, sorted by sort_order */
  items: PaymentIdentityBundleItem[]
  /** How the bundle was resolved */
  source: BundleResolverSource
  /** Whether a fallback was used (no bundle found) */
  fallbackUsed: boolean
  /** Reason for fallback, if applicable */
  fallbackReason: string | null
  /** Non-fatal compliance warnings */
  warnings: string[]
}

export interface ResolveIdentityBundleInput {
  tenantId: string
  storeId: string
  merchantAccountId?: string
  displayProfileId?: string
  /** Reserved for future deterministic item selection */
  transactionId?: string
}

export interface SelectedBundleItem {
  /** The selected bundle item */
  item: PaymentIdentityBundleItem
  /** The final descriptor string, sanitized for PayPal */
  descriptorText: string
  /** Whether a fallback was used */
  fallback: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAFE_GENERIC_DESCRIPTORS = [
  "Product Order",
  "Ecommerce Purchase",
  "Order Summary",
  "Online Store Order",
  "Merchandise Order",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashSeed(seed: string): number {
  const hash = createHash("sha256").update(seed).digest()
  return hash.readUInt32BE(0)
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolves the Payment Identity Bundle for a given context.
 *
 * Resolution priority:
 *   1. Merchant account's bundle_id (if active, same tenant)
 *   2. Store default bundle (store_id match, is_default, is_active)
 *   3. Tenant default bundle (tenant_id match, store_id IS NULL, is_default, is_active)
 *   4. Display profile linked bundle (display_profile_id match, is_active)
 *   5. No bundle (returns fallback metadata)
 *
 * Guarantees:
 *   - Never allows cross-tenant bundle use
 *   - Never throws — returns fallback on any error
 *   - Never affects checkout behavior (Phase 5B — resolver only)
 */
export async function resolvePaymentIdentityBundle(
  input: ResolveIdentityBundleInput
): Promise<ResolvedPaymentIdentityBundle> {
  const { tenantId, storeId, merchantAccountId, displayProfileId } = input
  const warnings: string[] = []

  try {
    const sql = getSql()

    // ── 1. Merchant account bundle ──────────────────────────────────────────
    if (merchantAccountId) {
      const maRows = await sql`
        SELECT pib.*
        FROM merchant_accounts ma
        JOIN payment_identity_bundles pib ON ma.bundle_id = pib.id
        WHERE ma.id = ${merchantAccountId}
          AND ma.tenant_id = ${tenantId}
          AND pib.tenant_id = ${tenantId}
          AND pib.is_active = true
        LIMIT 1
      `
      if (maRows.length > 0) {
        const bundle = maRows[0] as unknown as PaymentIdentityBundle
        // Cross-tenant safety check (defense in depth)
        if (bundle.tenant_id !== tenantId) {
          warnings.push(`Cross-tenant bundle detected on merchant account ${merchantAccountId} — ignored`)
          log.warn("payment_identity_bundle.cross_tenant_ignored",
            `Merchant account ${merchantAccountId} has bundle from different tenant — ignored`, {
              tenantId,
              merchantAccountId,
            })
        } else {
          const items = await fetchActiveItems(sql, bundle.id, tenantId)
          log.info("payment_identity_bundle.resolved",
            `Bundle resolved via merchant_account source=${bundle.id}`, {
              tenantId,
              storeId,
              merchantAccountId,
              bundleId: bundle.id,
              source: "merchant_account_bundle",
              activeItemCount: items.length,
            })
          return {
            bundle,
            items,
            source: "merchant_account_bundle",
            fallbackUsed: false,
            fallbackReason: null,
            warnings,
          }
        }
      }
    }

    // ── 2. Store default bundle ──────────────────────────────────────────────
    const storeRows = await sql`
      SELECT *
      FROM payment_identity_bundles
      WHERE tenant_id = ${tenantId}
        AND store_id = ${storeId}
        AND is_default = true
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `
    if (storeRows.length > 0) {
      const bundle = storeRows[0] as unknown as PaymentIdentityBundle
      const items = await fetchActiveItems(sql, bundle.id, tenantId)
      log.info("payment_identity_bundle.resolved",
        `Bundle resolved via store_default source=${bundle.id}`, {
          tenantId,
          storeId,
          bundleId: bundle.id,
          source: "store_default_bundle",
          activeItemCount: items.length,
        })
      return {
        bundle,
        items,
        source: "store_default_bundle",
        fallbackUsed: false,
        fallbackReason: null,
        warnings,
      }
    }

    // ── 3. Tenant default bundle ─────────────────────────────────────────────
    const tenantRows = await sql`
      SELECT *
      FROM payment_identity_bundles
      WHERE tenant_id = ${tenantId}
        AND store_id IS NULL
        AND is_default = true
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `
    if (tenantRows.length > 0) {
      const bundle = tenantRows[0] as unknown as PaymentIdentityBundle
      const items = await fetchActiveItems(sql, bundle.id, tenantId)
      log.info("payment_identity_bundle.resolved",
        `Bundle resolved via tenant_default source=${bundle.id}`, {
          tenantId,
          storeId,
          bundleId: bundle.id,
          source: "tenant_default_bundle",
          activeItemCount: items.length,
        })
      return {
        bundle,
        items,
        source: "tenant_default_bundle",
        fallbackUsed: false,
        fallbackReason: null,
        warnings,
      }
    }

    // ── 4. Display profile linked bundle ─────────────────────────────────────
    if (displayProfileId) {
      const dpRows = await sql`
        SELECT *
        FROM payment_identity_bundles
        WHERE tenant_id = ${tenantId}
          AND display_profile_id = ${displayProfileId}
          AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `
      if (dpRows.length > 0) {
        const bundle = dpRows[0] as unknown as PaymentIdentityBundle
        const items = await fetchActiveItems(sql, bundle.id, tenantId)
        log.info("payment_identity_bundle.resolved",
          `Bundle resolved via display_profile source=${bundle.id}`, {
            tenantId,
            storeId,
            displayProfileId,
            bundleId: bundle.id,
            source: "display_profile_bundle",
            activeItemCount: items.length,
          })
        return {
          bundle,
          items,
          source: "display_profile_bundle",
          fallbackUsed: false,
          fallbackReason: null,
          warnings,
        }
      }
    }

    // ── 5. No bundle found — return fallback metadata ────────────────────────
    log.info("payment_identity_bundle.resolved",
      `No bundle found — returning fallback`, {
        tenantId,
        storeId,
        merchantAccountId,
        displayProfileId,
        source: "no_bundle",
        fallbackUsed: true,
      })

    return {
      bundle: null,
      items: [],
      source: "no_bundle",
      fallbackUsed: true,
      fallbackReason: "no_active_bundle_found",
      warnings,
    }
  } catch (err) {
    // Resolver must never hard-fail checkout
    log.error("payment_identity_bundle.resolver_error",
      `Bundle resolver failed — returning safe fallback`, {
        tenantId,
        storeId,
        merchantAccountId,
        error: err,
      })

    return {
      bundle: null,
      items: [],
      source: "no_bundle",
      fallbackUsed: true,
      fallbackReason: `resolver_error: ${err instanceof Error ? err.message : "unknown"}`,
      warnings: [...warnings, "Bundle resolver encountered an error — using fallback"],
    }
  }
}

// ─── Item Fetcher ─────────────────────────────────────────────────────────────

async function fetchActiveItems(
  sql: ReturnType<typeof getSql>,
  bundleId: string,
  tenantId: string
): Promise<PaymentIdentityBundleItem[]> {
  const rows = await sql`
    SELECT *
    FROM payment_identity_bundle_items
    WHERE bundle_id = ${bundleId}
      AND tenant_id = ${tenantId}
      AND is_active = true
    ORDER BY sort_order ASC, created_at ASC
  `
  return rows as unknown as PaymentIdentityBundleItem[]
}

// ─── Deterministic Item Selection ─────────────────────────────────────────────

/**
 * Selects a single descriptor item from a bundle deterministically.
 *
 * Selection is based on a SHA-256 hash of the transactionId, ensuring:
 *   - Same transactionId always picks the same item
 *   - Distribution is uniform across items
 *   - Result is sanitized for PayPal field constraints
 *
 * If no active items exist, falls back to a safe generic descriptor.
 *
 * NOTE: This helper is NOT wired into checkout in Phase 5B.
 *       It will be integrated in Phase 5D.
 */
export function selectBundleDescriptorItem(
  bundle: ResolvedPaymentIdentityBundle,
  transactionId: string
): SelectedBundleItem {
  const activeItems = bundle.items.filter(item => item.is_active)

  // No active items → safe generic fallback
  if (activeItems.length === 0) {
    const fallbackIndex = hashSeed(transactionId) % SAFE_GENERIC_DESCRIPTORS.length
    const fallbackDescriptor = SAFE_GENERIC_DESCRIPTORS[fallbackIndex]

    // Build a synthetic item for consistent return shape
    return {
      item: {
        id: "fallback",
        tenant_id: bundle.bundle?.tenant_id ?? "",
        bundle_id: bundle.bundle?.id ?? "",
        descriptor_name: fallbackDescriptor,
        product_slug: null,
        product_title: fallbackDescriptor,
        product_description: null,
        product_type: "physical_good",
        shipping_required: true,
        tracking_expected: true,
        price_min: null,
        price_max: null,
        image_url: null,
        is_active: true,
        sort_order: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
      descriptorText: sanitizePayPalField(fallbackDescriptor),
      fallback: true,
    }
  }

  // Deterministic selection via SHA-256 hash
  const index = hashSeed(transactionId) % activeItems.length
  const selected = activeItems[index]

  // Build descriptor text with optional brand prefix
  let descriptorText = selected.descriptor_name
  if (bundle.bundle?.public_brand_name) {
    descriptorText = `${bundle.bundle.public_brand_name} - ${selected.descriptor_name}`
  }

  // Sanitize and clamp to PayPal max length
  descriptorText = sanitizePayPalField(descriptorText)

  return {
    item: selected,
    descriptorText,
    fallback: false,
  }
}

// ─── Utility: Get bundle by ID ────────────────────────────────────────────────

/**
 * Fetches a single bundle by ID with tenant isolation.
 * Used by admin UI, not by checkout.
 */
export async function getBundleById(
  bundleId: string,
  tenantId: string
): Promise<{ bundle: PaymentIdentityBundle | null; items: PaymentIdentityBundleItem[] }> {
  const sql = getSql()

  const bundleRows = await sql`
    SELECT * FROM payment_identity_bundles
    WHERE id = ${bundleId} AND tenant_id = ${tenantId}
    LIMIT 1
  `
  if (bundleRows.length === 0) {
    return { bundle: null, items: [] }
  }

  const bundle = bundleRows[0] as unknown as PaymentIdentityBundle
  const items = await fetchActiveItems(sql, bundleId, tenantId)

  return { bundle, items }
}

/**
 * Lists all bundles for a tenant, optionally filtered by store.
 * Used by admin UI, not by checkout.
 */
export async function listBundlesForTenant(
  tenantId: string,
  storeId?: string
): Promise<PaymentIdentityBundle[]> {
  const sql = getSql()

  if (storeId) {
    const rows = await sql`
      SELECT * FROM payment_identity_bundles
      WHERE tenant_id = ${tenantId}
        AND (store_id = ${storeId} OR store_id IS NULL)
      ORDER BY is_default DESC, created_at DESC
    `
    return rows as unknown as PaymentIdentityBundle[]
  }

  const rows = await sql`
    SELECT * FROM payment_identity_bundles
    WHERE tenant_id = ${tenantId}
    ORDER BY is_default DESC, created_at DESC
  `
  return rows as unknown as PaymentIdentityBundle[]
}
