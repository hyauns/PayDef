-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-tenant Payment Gateway — Initial Schema Migration
-- Mirrors prisma/schema.prisma exactly.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enums (conditional creation via pg_type catalog)
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'MERCHANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'WARMING_UP', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          "Role"      NOT NULL DEFAULT 'MERCHANT',
  tenant_id     UUID        UNIQUE REFERENCES tenants(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── stores ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  api_key_hash TEXT       NOT NULL,
  webhook_url TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stores_tenant_id_idx ON stores(tenant_id);

-- ── merchant_accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_accounts (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       TEXT            NOT NULL,
  client_secret   TEXT            NOT NULL,
  shield_domain   TEXT            NOT NULL,
  daily_limit     NUMERIC(12, 2)  NOT NULL,
  current_volume  NUMERIC(12, 2)  NOT NULL DEFAULT 0,
  priority        INT             NOT NULL DEFAULT 1,
  status          "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  volume_reset_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_accounts_tenant_id_idx        ON merchant_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS merchant_accounts_tenant_status_idx    ON merchant_accounts(tenant_id, status);

-- ── transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID                NOT NULL REFERENCES tenants(id),
  store_id          UUID                NOT NULL REFERENCES stores(id),
  merchant_id       UUID                NOT NULL REFERENCES merchant_accounts(id),
  original_amount   NUMERIC(12, 2)      NOT NULL,
  gateway_fee       NUMERIC(12, 2)      NOT NULL DEFAULT 0,
  status            "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  masked_item_name  TEXT                NOT NULL,
  paypal_order_id   TEXT,
  paypal_capture_id TEXT,
  buyer_ip          TEXT,
  buyer_country     CHAR(2),
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_tenant_id_idx         ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS transactions_tenant_store_idx      ON transactions(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS transactions_tenant_merchant_idx   ON transactions(tenant_id, merchant_id);
CREATE INDEX IF NOT EXISTS transactions_tenant_status_idx     ON transactions(tenant_id, status);
CREATE INDEX IF NOT EXISTS transactions_tenant_created_idx    ON transactions(tenant_id, created_at);

-- ── auto-updated timestamps trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','users','stores','merchant_accounts','transactions']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END;
$$;
