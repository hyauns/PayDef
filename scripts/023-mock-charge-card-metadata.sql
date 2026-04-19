-- 023-mock-charge-card-metadata.sql
-- Adds card metadata columns required by /api/gateway/mock-charge.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS encrypted_card_number TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_cvv         TEXT,
  ADD COLUMN IF NOT EXISTS exp_month             TEXT,
  ADD COLUMN IF NOT EXISTS exp_year              TEXT,
  ADD COLUMN IF NOT EXISTS card_last_4           TEXT,
  ADD COLUMN IF NOT EXISTS card_brand            TEXT,
  ADD COLUMN IF NOT EXISTS buyer_name            TEXT,
  ADD COLUMN IF NOT EXISTS billing_address       JSONB;
