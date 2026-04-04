-- =============================================================================
-- Migration 015 — Email change verification codes
--
-- Used by the secure email change flow:
--   1. User requests email change → 6-digit code stored here, sent to OLD email
--   2. User enters code → verified → email updated in users table → row deleted
--
-- TTL: 10 minutes (enforced in application code)
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_change_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email  TEXT        NOT NULL,
  code       CHAR(6)     NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_change_codes_user_idx ON email_change_codes (user_id);

-- Auto-cleanup: delete expired codes (optional, can also be done in app logic)
-- DELETE FROM email_change_codes WHERE expires_at < NOW();
