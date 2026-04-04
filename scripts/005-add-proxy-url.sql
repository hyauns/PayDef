-- =============================================================================
-- Migration: Add proxy_url column to merchant_accounts
--
-- Adds a nullable TEXT column for an optional HTTP/SOCKS proxy URL.
-- When set, all PayPal API calls for this account are routed through it.
-- Safe to re-run: uses IF NOT EXISTS.
-- =============================================================================

ALTER TABLE merchant_accounts
  ADD COLUMN IF NOT EXISTS proxy_url TEXT;

-- Optional index for quick proxy-usage auditing
CREATE INDEX IF NOT EXISTS merchant_accounts_proxy_idx
  ON merchant_accounts (proxy_url)
  WHERE proxy_url IS NOT NULL;

COMMENT ON COLUMN merchant_accounts.proxy_url IS
  'Optional HTTP/HTTPS/SOCKS5 proxy URL for routing PayPal API calls. Encrypted at rest via AES-256-GCM.';
