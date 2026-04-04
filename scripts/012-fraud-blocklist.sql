-- =============================================================================
-- Migration: Fraud IP Blocklist
--
-- Stores blocked IP addresses for fraud prevention.
-- Safe to re-run: uses IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fraud_blocklist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET        NOT NULL,
  reason     TEXT,
  blocked_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fraud_blocklist_ip_idx ON fraud_blocklist (ip_address);
