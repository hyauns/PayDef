-- =============================================================================
-- Migration: Add manual capture (Authorize & Capture) support
--
-- 1. Adds 'AUTHORIZED' to the transaction_status enum
-- 2. Adds 'authorization_id' column to track the PayPal authorization ID
-- 3. Adds 'intent' column to record which flow was used (CAPTURE vs AUTHORIZE)
-- =============================================================================

-- Add AUTHORIZED to the transaction_status enum (idempotent)
DO $$ BEGIN
  ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'AUTHORIZED' AFTER 'PENDING';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add columns for manual capture tracking
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS authorization_id TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'CAPTURE';

-- Index for looking up authorized transactions pending capture
CREATE INDEX IF NOT EXISTS transactions_authorization_idx
  ON transactions (authorization_id) WHERE authorization_id IS NOT NULL;

COMMENT ON COLUMN transactions.authorization_id IS
  'PayPal authorization ID — present only for AUTHORIZE intent orders. Used by /api/gateway/capture.';

COMMENT ON COLUMN transactions.intent IS
  'PayPal order intent: CAPTURE (immediate) or AUTHORIZE (manual capture later).';
