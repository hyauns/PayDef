-- =============================================================================
-- Migration: Admin Overhaul — Tenants enhancement + Shield Domains table
-- =============================================================================

-- 1. Add status + owner_email to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- 2. Shield domains rotation pool
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

COMMENT ON TABLE shield_domains IS
  'Central rotation pool of shield domains used to mask PayPal return/cancel URLs.';
COMMENT ON COLUMN shield_domains.tenant_id IS
  'When set, this domain is reserved for a specific tenant. NULL = shared pool.';
