-- =============================================================================
-- Migration 027 — Shopify Payments provider support
--
-- Adds per-store Shopify credentials and Shopify transaction references so a
-- store with provider_type = 'SHOPIFY' can run the Shopify Draft Order invoice
-- flow (buyer pays on Shopify checkout, powered by Shopify Payments / Shop Pay).
--
-- Design notes (mirrors migration 025 — Stripe):
--   • One Shopify store PER PayDef store (no rotation) — credentials live on
--     `stores`, NOT on `merchant_accounts`. The PayPal account-rotation logic
--     and the Stripe flow are both left completely untouched.
--   • Secret values (shopify_access_token, shopify_webhook_secret) are stored
--     encrypted at rest via lib/encryption.ts (AES-256-GCM). The store domain
--     is non-secret and stored plaintext.
--   • transactions.paypal_order_id is already nullable, so Shopify rows leave it
--     NULL (like Stripe) and use the new shopify_draft_order_id /
--     shopify_order_id columns for webhook reconciliation.
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ── Per-store Shopify credentials ───────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS shopify_store_domain   TEXT,
  ADD COLUMN IF NOT EXISTS shopify_access_token   TEXT,
  ADD COLUMN IF NOT EXISTS shopify_webhook_secret TEXT;

COMMENT ON COLUMN stores.shopify_store_domain IS
  'Shopify store domain (e.g. my-store.myshopify.com). Non-secret; stored plaintext. Used only for SHOPIFY provider stores.';
COMMENT ON COLUMN stores.shopify_access_token IS
  'Shopify Admin API access token (shpat_...), encrypted at rest via AES-256-GCM. Needs write_draft_orders + read_orders scopes.';
COMMENT ON COLUMN stores.shopify_webhook_secret IS
  'Shopify webhook signing secret for /api/webhook/shopify/[storeId] (the Notifications page secret, or the app API secret key for API-created webhooks), encrypted at rest.';

-- ── Shopify transaction references ──────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS shopify_draft_order_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_order_id       TEXT;

COMMENT ON COLUMN transactions.shopify_draft_order_id IS
  'Shopify Draft Order id (gid or numeric) created at checkout for SHOPIFY provider transactions.';
COMMENT ON COLUMN transactions.shopify_order_id IS
  'Shopify Order id captured from the orders/paid webhook once the draft order invoice is paid.';

-- Webhook lookups resolve a transaction by its Shopify draft/order id (the
-- primary match is the PayDef transaction id carried in note_attributes).
CREATE INDEX IF NOT EXISTS transactions_shopify_draft_idx
  ON transactions (shopify_draft_order_id) WHERE shopify_draft_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_shopify_order_idx
  ON transactions (shopify_order_id) WHERE shopify_order_id IS NOT NULL;
