-- =============================================================================
-- Migration: Add paypal_webhook_id to merchant_accounts
--
-- Each PayPal application (client_id + client_secret) has its own webhook
-- configuration and therefore its own webhook_id.  Storing it per-account
-- enables multi-tenant signature verification — the webhook handler can
-- look up the correct webhook_id based on the transaction's merchant_id.
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE merchant_accounts
  ADD COLUMN IF NOT EXISTS paypal_webhook_id TEXT;

COMMENT ON COLUMN merchant_accounts.paypal_webhook_id IS
  'PayPal Webhook ID for signature verification (per-app).  '
  'Null = fall back to the global PAYPAL_WEBHOOK_ID env var.';
