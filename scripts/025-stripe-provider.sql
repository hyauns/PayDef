-- =============================================================================
-- Migration 025 — Stripe provider support
--
-- Adds per-store Stripe credentials and Stripe transaction references so a
-- store with provider_type = 'STRIPE' can run the Stripe Checkout Session flow.
--
-- Design notes:
--   • One Stripe account PER STORE (no rotation) — keys live on `stores`,
--     NOT on `merchant_accounts`. This keeps the PayPal account-rotation logic
--     completely untouched.
--   • Secret values (stripe_secret_key, stripe_webhook_secret) are stored
--     encrypted at rest via lib/encryption.ts (AES-256-GCM), exactly like
--     merchant_accounts.client_secret. The publishable key is non-secret.
--   • transactions.paypal_order_id is already nullable (mock_charge inserts
--     rows without it), so Stripe rows simply leave it NULL and use the new
--     stripe_session_id / stripe_payment_intent_id columns.
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ── Per-store Stripe credentials ────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS stripe_secret_key       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_publishable_key  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret   TEXT;

COMMENT ON COLUMN stores.stripe_secret_key IS
  'Stripe secret API key (sk_live_/sk_test_), encrypted at rest via AES-256-GCM. Used only for STRIPE provider stores.';
COMMENT ON COLUMN stores.stripe_publishable_key IS
  'Stripe publishable key (pk_live_/pk_test_). Non-secret; stored plaintext.';
COMMENT ON COLUMN stores.stripe_webhook_secret IS
  'Stripe webhook signing secret (whsec_...) for /api/webhook/stripe/[storeId], encrypted at rest.';

-- ── Stripe transaction references ───────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS stripe_session_id        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

COMMENT ON COLUMN transactions.stripe_session_id IS
  'Stripe Checkout Session id (cs_...) for STRIPE provider transactions. Used for webhook reconciliation.';
COMMENT ON COLUMN transactions.stripe_payment_intent_id IS
  'Stripe PaymentIntent id (pi_...) captured from the checkout.session.completed webhook.';

-- Webhook lookups resolve a transaction by its Stripe session / payment intent.
CREATE INDEX IF NOT EXISTS transactions_stripe_session_idx
  ON transactions (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_stripe_pi_idx
  ON transactions (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
