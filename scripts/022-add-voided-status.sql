-- 022-add-voided-status.sql
-- Adds 'VOIDED' to the transaction_status enum.
-- Required for the /api/gateway/void endpoint.
-- Safe to re-run: uses IF NOT EXISTS guard.

DO $$
BEGIN
  ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'VOIDED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
