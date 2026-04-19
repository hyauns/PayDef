-- 020-webhook-hardening.sql
-- Production hardening for outbound merchant webhooks, reconciliation,
-- redirect return URLs, and lifecycle recovery.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS success_return_url TEXT,
  ADD COLUMN IF NOT EXISTS cancel_return_url  TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS authorized_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authorization_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_reason           TEXT,
  ADD COLUMN IF NOT EXISTS merchant_success_url    TEXT,
  ADD COLUMN IF NOT EXISTS merchant_cancel_url     TEXT;

DO $$
BEGIN
  ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'CANCELED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'EXPIRED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE transactions
SET checkout_expires_at = COALESCE(checkout_expires_at, created_at + INTERVAL '30 minutes')
WHERE checkout_expires_at IS NULL;

UPDATE transactions
SET authorization_expires_at = COALESCE(
      authorization_expires_at,
      CASE
        WHEN intent = 'AUTHORIZE' THEN created_at + INTERVAL '7 days'
        ELSE NULL
      END
    )
WHERE authorization_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_checkout_exp_idx
  ON transactions (status, checkout_expires_at DESC);

CREATE INDEX IF NOT EXISTS transactions_auth_exp_idx
  ON transactions (status, authorization_expires_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id           UUID        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id                 UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  account_id               UUID        REFERENCES merchant_accounts(id) ON DELETE SET NULL,
  event_name               TEXT        NOT NULL,
  business_key             TEXT        NOT NULL UNIQUE,
  target_url               TEXT        NOT NULL,
  raw_payload              TEXT        NOT NULL,
  payload_version          TEXT        NOT NULL DEFAULT '2026-04-08',
  source                   TEXT        NOT NULL DEFAULT 'system',
  trigger_origin           TEXT        NOT NULL DEFAULT 'automatic',
  delivery_status          TEXT        NOT NULL DEFAULT 'pending',
  attempt_count            INTEGER     NOT NULL DEFAULT 0,
  last_delivery_id         UUID,
  latest_http_status       INTEGER,
  latest_response_snippet  TEXT,
  latest_error             TEXT,
  last_attempt_at          TIMESTAMPTZ,
  next_retry_at            TIMESTAMPTZ,
  delivered_at             TIMESTAMPTZ,
  replayed_at              TIMESTAMPTZ,
  canceled_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_events_status_check CHECK (
    delivery_status IN ('pending', 'delivered', 'retrying', 'dead_letter', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS webhook_events_transaction_idx
  ON webhook_events (transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_events_store_status_idx
  ON webhook_events (store_id, delivery_status, next_retry_at);

CREATE INDEX IF NOT EXISTS webhook_events_tenant_created_idx
  ON webhook_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                UUID        NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  transaction_id          UUID        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id                UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  target_url              TEXT        NOT NULL,
  headers_sent            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  raw_payload             TEXT        NOT NULL,
  http_status             INTEGER,
  response_body_snippet   TEXT,
  error_message           TEXT,
  attempt_number          INTEGER     NOT NULL,
  trigger_origin          TEXT        NOT NULL DEFAULT 'automatic',
  final_status            TEXT        NOT NULL DEFAULT 'pending',
  next_retry_at           TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_deliveries_status_check CHECK (
    final_status IN ('pending', 'delivered', 'retrying', 'dead_letter', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_event_idx
  ON webhook_deliveries (event_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_tx_idx
  ON webhook_deliveries (transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_store_idx
  ON webhook_deliveries (store_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_webhook_events_updated_at'
      AND tgrelid = 'webhook_events'::regclass
  ) THEN
    CREATE TRIGGER trg_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
