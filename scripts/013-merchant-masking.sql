-- =============================================================================
-- Migration 013 — Merchant Account Masking & Soft Limit
--
-- Adds:
--   • item_masking       — toggle per-account item name masking
--   • fake_product_name  — custom masked product name for PayPal receipts
--   • soft_limit         — volume threshold where de-weighting begins
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE merchant_accounts
  ADD COLUMN IF NOT EXISTS item_masking      BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fake_product_name TEXT          NOT NULL DEFAULT 'Digital Service Upgrade',
  ADD COLUMN IF NOT EXISTS soft_limit        NUMERIC(12,2);

-- Default soft_limit to 80% of daily_limit for existing rows
UPDATE merchant_accounts
SET soft_limit = ROUND(daily_limit * 0.80, 2)
WHERE soft_limit IS NULL;

-- Set a sensible default for future inserts
ALTER TABLE merchant_accounts
  ALTER COLUMN soft_limit SET DEFAULT 4000.00;
