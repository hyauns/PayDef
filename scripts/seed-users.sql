-- scripts/seed-users.sql
-- Seeds two test accounts into the database.
--
-- Accounts created:
--   SUPER_ADMIN : super@gateway.internal    / SuperAdmin123!
--   MERCHANT    : merchant@gateway.internal / Merchant123!
--
-- Safe to run multiple times (ON CONFLICT DO UPDATE).

-- Enable pgcrypto for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Tenant for the demo merchant ─────────────────────────────────────────
INSERT INTO tenants (id, name, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Merchant Co.',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
  SET name       = EXCLUDED.name,
      updated_at = NOW();

-- ── 2. SUPER_ADMIN user (no tenant) ─────────────────────────────────────────
INSERT INTO users (id, email, password_hash, role, tenant_id, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'super@gateway.internal',
  crypt('SuperAdmin123!', gen_salt('bf', 12)),
  'SUPER_ADMIN',
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      updated_at    = NOW();

-- ── 3. MERCHANT user (linked to tenant above) ────────────────────────────────
INSERT INTO users (id, email, password_hash, role, tenant_id, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'merchant@gateway.internal',
  crypt('Merchant123!', gen_salt('bf', 12)),
  'MERCHANT',
  '00000000-0000-0000-0000-000000000001',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      tenant_id     = EXCLUDED.tenant_id,
      updated_at    = NOW();
