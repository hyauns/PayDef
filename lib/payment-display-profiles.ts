/**
 * lib/payment-display-profiles.ts — Payment Display Profiles Foundation (Phase 2A)
 *
 * This module provides the backend foundation for determining how a PayPal
 * transaction appears to a buyer, migrating away from generic masking
 * towards truthful, industry-aware semantic descriptors.
 */

import { sanitizePayPalField } from "@/lib/masking"
import { createHash } from "crypto"

// ─── Types & Enums ──────────────────────────────────────────────────────────

export type IndustryVertical =
  | "automotive_tires"
  | "electronics"
  | "home_goods"
  | "toys"
  | "beauty"
  | "apparel"
  | "generic_ecommerce"

export type PaymentDisplayMode =
  | "REAL_SANITIZED"     // Pass real item name, sanitized
  | "SEMANTIC_ORDER"     // e.g., "Tire & Wheel Order"
  | "BRAND_SEMANTIC"     // e.g., "TireVix Auto - Tire & Wheel Order"
  | "LEGACY_GENERIC"     // Use the old item_masking fallback

export type LineItemPolicy =
  | "SINGLE_SEMANTIC_ITEM" // Combine cart into 1 line item
  | "REAL_CART_ITEMS"      // Keep actual cart items (but semantic names)
  | "LEGACY_RANDOM_SPLIT"  // Use the old behavioral-randomization split

export interface PaymentDisplayProfileRow {
  id: string
  tenant_id: string
  store_id: string | null
  profile_name: string
  industry_vertical: IndustryVertical
  public_brand_name: string | null
  descriptor_prefix: string | null
  display_mode: PaymentDisplayMode
  line_item_policy: LineItemPolicy
  is_default: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface ResolvedPaymentDisplayProfile {
  profileId: string | null
  industryVertical: IndustryVertical
  displayMode: PaymentDisplayMode
  lineItemPolicy: LineItemPolicy
  publicBrandName: string | null
  descriptorPrefix: string | null
  source: "store_default" | "store_profile" | "tenant_default" | "generated_fallback"
  descriptorPool: string[]
}

// ─── Descriptor Pools ────────────────────────────────────────────────────────

export const INDUSTRY_DESCRIPTOR_POOLS: Record<IndustryVertical, string[]> = {
  automotive_tires: [
    "Tire & Wheel Order",
    "Automotive Parts Order",
    "Vehicle Tire Purchase",
    "Tire Service Package",
    "Auto Parts Checkout",
    "Road Safety Tire Order",
  ],
  toys: [
    "Toy & Gift Order",
    "Kids Product Purchase",
    "Gift Product Order",
  ],
  home_goods: [
    "Home Goods Order",
    "Kitchen & Home Purchase",
    "Household Product Order",
  ],
  beauty: [
    "Beauty Product Order",
    "Fragrance & Care Purchase",
    "Personal Care Order",
  ],
  electronics: [
    "Electronics Accessory Order",
    "Device Parts Purchase",
    "Tech Product Order",
  ],
  apparel: [
    "Apparel Order",
    "Clothing Purchase",
    "Fashion Product Order",
  ],
  generic_ecommerce: [
    "Online Store Order",
    "Ecommerce Purchase",
    "Product Order",
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashSeed(seed: string): number {
  const hash = createHash("sha256").update(seed).digest()
  return hash.readUInt32BE(0)
}

function getDeterministicDescriptor(pool: string[], seed: string): string {
  if (pool.length === 0) return "Product Order"
  const index = hashSeed(seed) % pool.length
  return pool[index]
}

// ─── Display Name Builder ────────────────────────────────────────────────────

/**
 * Builds the final display name for a line item based on the resolved profile.
 * Ensures the output is deterministic and PayPal-safe.
 */
export function buildPaymentDisplayName(params: {
  profile: ResolvedPaymentDisplayProfile
  realItemName?: string | null
  seed: string
  legacyMasker?: (realName: string) => string
}): string {
  const { profile, realItemName, seed, legacyMasker } = params

  let displayName = ""

  switch (profile.displayMode) {
    case "REAL_SANITIZED":
      displayName = realItemName?.trim() || "Product Order"
      break

    case "SEMANTIC_ORDER":
      displayName = getDeterministicDescriptor(profile.descriptorPool, seed)
      break

    case "BRAND_SEMANTIC": {
      const prefix = profile.descriptorPrefix || profile.publicBrandName
      const descriptor = getDeterministicDescriptor(profile.descriptorPool, seed)
      if (prefix) {
        displayName = `${prefix} - ${descriptor}`
      } else {
        displayName = descriptor
      }
      break
    }

    case "LEGACY_GENERIC":
    default:
      if (legacyMasker) {
        displayName = legacyMasker(realItemName || "")
      } else {
        displayName = "Technical Support" // safe hard fallback
      }
      break
  }

  // Always sanitize the final output
  return sanitizePayPalField(displayName)
}

import { getSql } from "@/lib/neon"

/**
 * Resolves the payment display profile for a given store.
 */
export async function resolvePaymentDisplayProfile(params: {
  tenantId?: string
  storeId: string
  merchantAccountId?: string
  storeName?: string
}): Promise<ResolvedPaymentDisplayProfile> {
  const { tenantId, storeId } = params
  
  const sql = getSql()

  // 1. Check if store has explicit default_display_profile_id
  const storeRows = await sql`
    SELECT default_display_profile_id 
    FROM stores 
    WHERE id = ${storeId}
  `
  let profileId = storeRows[0]?.default_display_profile_id

  let profileRow = null

  if (profileId) {
    const rows = await sql`
      SELECT id, industry_vertical, display_mode, line_item_policy, public_brand_name, descriptor_prefix
      FROM payment_display_profiles
      WHERE id = ${profileId} AND is_active = true
    `
    profileRow = rows[0]
  }

  // 2. If not found, check if store has an active is_default profile
  if (!profileRow) {
    const rows = await sql`
      SELECT id, industry_vertical, display_mode, line_item_policy, public_brand_name, descriptor_prefix
      FROM payment_display_profiles
      WHERE store_id = ${storeId} AND is_default = true AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `
    profileRow = rows[0]
    if (profileRow) profileId = profileRow.id
  }

  // 3. If not found and tenantId exists, check tenant default profile
  if (!profileRow && tenantId) {
    const rows = await sql`
      SELECT id, industry_vertical, display_mode, line_item_policy, public_brand_name, descriptor_prefix
      FROM payment_display_profiles
      WHERE tenant_id = ${tenantId} AND store_id IS NULL AND is_default = true AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `
    profileRow = rows[0]
    if (profileRow) profileId = profileRow.id
  }

  // If a profile was found in DB
  if (profileRow) {
    const iv = profileRow.industry_vertical as IndustryVertical
    return {
      profileId: profileRow.id,
      industryVertical: iv,
      displayMode: profileRow.display_mode as PaymentDisplayMode,
      lineItemPolicy: profileRow.line_item_policy as LineItemPolicy,
      publicBrandName: profileRow.public_brand_name,
      descriptorPrefix: profileRow.descriptor_prefix,
      source: profileId === storeRows[0]?.default_display_profile_id ? "store_default" : (profileRow.store_id ? "store_profile" : "tenant_default"),
      descriptorPool: INDUSTRY_DESCRIPTOR_POOLS[iv] || INDUSTRY_DESCRIPTOR_POOLS.generic_ecommerce,
    }
  }

  // 4. Safe Generic Fallback
  return {
    profileId: null,
    industryVertical: "generic_ecommerce",
    displayMode: "LEGACY_GENERIC",
    lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
    publicBrandName: null,
    descriptorPrefix: null,
    source: "generated_fallback",
    descriptorPool: INDUSTRY_DESCRIPTOR_POOLS.generic_ecommerce,
  }
}
