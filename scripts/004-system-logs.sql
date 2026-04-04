-- =============================================================================
-- Migration: Add system_logs table for cron job auditing
--
-- Stores audit entries for automated system operations (volume resets,
-- maintenance tasks, etc.) with structured metadata.
--
-- Safe to re-run: uses IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action     TEXT        NOT NULL,                -- e.g. 'VOLUME_RESET'
  status     TEXT        NOT NULL DEFAULT 'OK',   -- 'OK', 'ERROR', 'PARTIAL'
  metadata   JSONB       NOT NULL DEFAULT '{}',   -- structured details
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_logs_action_idx    ON system_logs (action);
CREATE INDEX IF NOT EXISTS system_logs_created_idx   ON system_logs (created_at DESC);
