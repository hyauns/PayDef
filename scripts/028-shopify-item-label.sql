-- =============================================================================
-- Migration 028 — Shopify per-store masked item label
--
-- Lets a SHOPIFY-provider store define a FIXED masked line-item title shown on
-- the Shopify checkout (e.g. "Marine Supplies"), instead of the random generic
-- descriptor from lib/masking.ts (MASKED_DESCRIPTORS). When NULL/blank, the
-- existing masking fallback (display profile → identity bundle → maskItemName)
-- is used unchanged.
--
-- Non-secret; stored plaintext. Only used by lib/shopify-checkout.ts.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS shopify_item_label TEXT;

COMMENT ON COLUMN stores.shopify_item_label IS
  'Optional fixed masked line-item title for SHOPIFY-provider checkout. When set, overrides the generic masking pool. Non-secret.';
