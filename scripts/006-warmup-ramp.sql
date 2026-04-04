-- =============================================================================
-- Migration: Add warmup ramp & flexible limit columns to merchant_accounts
--
-- warmup_started_at    — Tracks when the account entered WARMING_UP status.
--                        Used to compute progressive daily caps.
-- daily_limit_override — Optional manual cap (takes precedence over default).
--                        Allows per-account limit customisation.
-- =============================================================================

ALTER TABLE merchant_accounts
  ADD COLUMN IF NOT EXISTS warmup_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_limit_override  NUMERIC(12,2);

-- Backfill: set warmup_started_at to created_at for existing WARMING_UP accounts
UPDATE merchant_accounts
  SET warmup_started_at = created_at
  WHERE status = 'WARMING_UP' AND warmup_started_at IS NULL;

COMMENT ON COLUMN merchant_accounts.warmup_started_at IS
  'Timestamp when the account entered WARMING_UP status. Used for progressive daily-cap ramp.';

COMMENT ON COLUMN merchant_accounts.daily_limit_override IS
  'Optional manual daily volume cap. When set, overrides the default daily_limit for this account.';
