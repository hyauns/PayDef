-- 030-button-sessions.sql
-- Smart Buttons on checkout/cart/product pages: a "button session" pins the
-- PayPal account when the page renders; the PayPal order is created on click.
-- Additive only: a new table and nullable / defaulted columns on transactions.

CREATE TABLE IF NOT EXISTS button_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  merchant_account_id UUID NOT NULL REFERENCES merchant_accounts(id) ON DELETE CASCADE,
  shield_domain       TEXT,
  context             TEXT NOT NULL CHECK (context IN ('checkout', 'cart', 'product')),
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT NOT NULL,
  intent              TEXT NOT NULL CHECK (intent IN ('CAPTURE', 'AUTHORIZE')),
  allowed_origins     TEXT[] NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS button_sessions_expires_idx ON button_sessions (expires_at);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS button_session_id UUID REFERENCES button_sessions(id) ON DELETE SET NULL;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS express BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS express_item_total NUMERIC(12,2);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_email TEXT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_name TEXT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_address JSONB;
