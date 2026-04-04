-- =============================================================================
-- Migration: Add dedicated columns to system_logs for efficient filtering
--
-- Adds tenant_id, account_id, store_id to avoid JSONB-only filtering.
-- Safe to re-run: uses IF NOT EXISTS.
-- =============================================================================

ALTER TABLE system_logs
  ADD COLUMN IF NOT EXISTS tenant_id  UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES merchant_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_id   UUID REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level      TEXT NOT NULL DEFAULT 'info';

-- Add 'level' column for UI filtering (success, error, warning, info)
-- Migrate existing rows: map status → level
UPDATE system_logs SET level = CASE
  WHEN status = 'OK'      THEN 'success'
  WHEN status = 'ERROR'   THEN 'error'
  WHEN status = 'PARTIAL' THEN 'warning'
  ELSE 'info'
END WHERE level = 'info' AND status IS NOT NULL;

CREATE INDEX IF NOT EXISTS system_logs_tenant_idx  ON system_logs (tenant_id);
CREATE INDEX IF NOT EXISTS system_logs_level_idx   ON system_logs (level);
CREATE INDEX IF NOT EXISTS system_logs_account_idx ON system_logs (account_id);
