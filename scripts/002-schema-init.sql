-- =============================================================================
-- Phase 1.1 — Core Schema Initialization
-- Multi-Tenant Payment Gateway
--
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- Adds missing columns to any tables that already exist from an earlier run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email storage

-- ---------------------------------------------------------------------------
-- Enums  (idempotent via DO block)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'MERCHANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('ACTIVE', 'PAUSED', 'WARMING_UP', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM (
    'PENDING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'REFUNDED', 'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. tenants
--    Top-level isolation boundary — one per Merchant organisation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  plan                TEXT        NOT NULL DEFAULT 'STARTER',
  status              TEXT        NOT NULL DEFAULT 'ACTIVE',
  owner_email         TEXT,
  gateway_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns that may be missing from an earlier schema version
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan                TEXT         NOT NULL DEFAULT 'STARTER',
  ADD COLUMN IF NOT EXISTS gateway_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS status              TEXT         NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS owner_email         TEXT;

-- ---------------------------------------------------------------------------
-- 2. users
--    Supports SUPER_ADMIN (no tenant) and MERCHANT (linked to one tenant).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'MERCHANT',
  tenant_id     UUID        REFERENCES tenants (id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. stores
--    A client e-commerce store belonging to one Merchant / Tenant.
--    api_key_hash stores a bcrypt hash — raw key is shown once at creation.
--    shield_domain is used to mask PayPal return/cancel URLs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  api_key_hash  TEXT        NOT NULL,
  webhook_url   TEXT,
  shield_domain TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS shield_domain TEXT;

CREATE INDEX IF NOT EXISTS stores_tenant_id_idx ON stores (tenant_id);

-- ---------------------------------------------------------------------------
-- 4. merchant_accounts
--    A PayPal Business account inside a tenant's rotation pool.
--    Credentials are stored as plaintext here; encrypt at rest in production
--    using pgp_sym_encrypt() / Vault / KMS before go-live.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_accounts (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID           NOT NULL REFERENCES tenants  (id) ON DELETE CASCADE,
  store_id        UUID           REFERENCES stores (id) ON DELETE SET NULL,
  name            TEXT           NOT NULL DEFAULT 'Unnamed Account',
  email           TEXT,
  client_id       TEXT           NOT NULL,
  client_secret   TEXT           NOT NULL,
  shield_domain   TEXT,
  proxy_url       TEXT,
  daily_limit     NUMERIC(12,2)  NOT NULL DEFAULT 5000.00,
  current_volume  NUMERIC(12,2)  NOT NULL DEFAULT 0.00,
  priority        INTEGER        NOT NULL DEFAULT 1,
  status          account_status NOT NULL DEFAULT 'ACTIVE',
  warmup_started_at    TIMESTAMPTZ,
  daily_limit_override NUMERIC(12,2),
  volume_reset_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_accounts
  ADD COLUMN IF NOT EXISTS store_id  UUID REFERENCES stores (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name      TEXT NOT NULL DEFAULT 'Unnamed Account',
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS shield_domain TEXT,
  ADD COLUMN IF NOT EXISTS proxy_url TEXT,
  ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_limit_override NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS merchant_accounts_tenant_id_idx        ON merchant_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS merchant_accounts_tenant_status_idx    ON merchant_accounts (tenant_id, status);
CREATE INDEX IF NOT EXISTS merchant_accounts_tenant_store_idx     ON merchant_accounts (tenant_id, store_id);

-- ---------------------------------------------------------------------------
-- 5. transactions
--    Immutable audit log of every gateway event.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID               NOT NULL REFERENCES tenants          (id),
  store_id          UUID               NOT NULL REFERENCES stores           (id),
  merchant_id       UUID               NOT NULL REFERENCES merchant_accounts(id),
  original_amount   NUMERIC(12,2)      NOT NULL,
  original_currency TEXT               NOT NULL DEFAULT 'USD',
  original_item_name TEXT,
  masked_item_name  TEXT               NOT NULL DEFAULT 'Digital Service',
  gateway_fee       NUMERIC(12,2)      NOT NULL DEFAULT 0.00,
  status            transaction_status NOT NULL DEFAULT 'PENDING',
  paypal_order_id   TEXT,
  paypal_capture_id TEXT,
  authorization_id  TEXT,
  intent            TEXT               NOT NULL DEFAULT 'CAPTURE',
  customer_email    TEXT,
  buyer_ip          TEXT,
  buyer_country     CHAR(2),
  ip_address        TEXT,
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS original_currency  TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS original_item_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email     TEXT,
  ADD COLUMN IF NOT EXISTS ip_address         TEXT,
  ADD COLUMN IF NOT EXISTS authorization_id   TEXT,
  ADD COLUMN IF NOT EXISTS intent             TEXT NOT NULL DEFAULT 'CAPTURE';

CREATE INDEX IF NOT EXISTS transactions_tenant_id_idx        ON transactions (tenant_id);
CREATE INDEX IF NOT EXISTS transactions_tenant_store_idx     ON transactions (tenant_id, store_id);
CREATE INDEX IF NOT EXISTS transactions_tenant_merchant_idx  ON transactions (tenant_id, merchant_id);
CREATE INDEX IF NOT EXISTS transactions_tenant_status_idx    ON transactions (tenant_id, status);
CREATE INDEX IF NOT EXISTS transactions_tenant_created_idx   ON transactions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_paypal_order_idx     ON transactions (paypal_order_id);

-- ---------------------------------------------------------------------------
-- 6. billing_records
--    One row per completed transaction — tracks platform fee income.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants      (id),
  transaction_id UUID        NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  gross_amount   NUMERIC(12,2) NOT NULL,
  fee_amount     NUMERIC(12,2) NOT NULL,
  net_amount     NUMERIC(12,2) NOT NULL,
  currency       TEXT        NOT NULL DEFAULT 'USD',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_records_tenant_idx      ON billing_records (tenant_id);
CREATE INDEX IF NOT EXISTS billing_records_transaction_idx ON billing_records (transaction_id);

-- ---------------------------------------------------------------------------
-- Automatic updated_at trigger (applied to all timestamped tables)
-- ---------------------------------------------------------------------------
-- 8. shield_domains
--    Central rotation pool of shield domains used to mask PayPal URLs.
--    tenant_id NULL = shared pool; set = reserved for that tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shield_domains (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT        NOT NULL UNIQUE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  health_ok   BOOLEAN     NOT NULL DEFAULT TRUE,
  last_check  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shield_domains_active_idx
  ON shield_domains (is_active) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- Auto-update updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ 
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tenants','users','stores','merchant_accounts','transactions','shield_domains'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_' || tbl || '_updated_at'
        AND tgrelid = tbl::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;
