-- =============================================================================
-- Migration: Token Blacklist for JWT revocation
--
-- Stores revoked JWT identifiers (jti). Checked by middleware on each request.
-- Entries are cleaned up after they expire (matching JWT maxAge).
-- Safe to re-run: uses IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
  jti        TEXT        PRIMARY KEY,
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  revoked_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  reason     TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS token_blacklist_expires_idx ON token_blacklist (expires_at);

-- Cleanup function: remove expired tokens (call from cron or on each check)
-- Expired JWTs are harmless — they'd be rejected anyway — but cleanup keeps the table small.
