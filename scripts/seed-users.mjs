/**
 * scripts/seed-users.mjs
 *
 * Seeds two test accounts into the database:
 *   - super@gateway.internal  / SuperAdmin123!  (SUPER_ADMIN)
 *   - merchant@gateway.internal / Merchant123!  (MERCHANT + Tenant)
 *
 * Run once: node scripts/seed-users.mjs
 */

import { createHash, randomUUID } from "node:crypto"
import { neon } from "@neondatabase/serverless"

// ── bcrypt is ESM-incompatible in pure-ESM context, use a PBKDF2 substitute
// for the seed script. In production the app uses bcryptjs.
// To keep the seed simple, we inline a bcrypt-compatible hash using the
// `crypto` module via a helper that calls the Neon crypt() extension.
// ─────────────────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL_UNPOOLED

if (!DATABASE_URL) {
  console.error("[seed] ERROR: No DATABASE_URL found in environment.")
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// Enable pgcrypto so we can use crypt() for bcrypt hashing inside SQL
async function main() {
  console.log("[seed] Enabling pgcrypto extension...")
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`

  // ── Super Admin (no tenantId) ──────────────────────────────────────────────
  const superAdminId = randomUUID()
  console.log("[seed] Inserting SUPER_ADMIN user...")
  await sql`
    INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
    VALUES (
      ${superAdminId},
      'super@gateway.internal',
      crypt('SuperAdmin123!', gen_salt('bf', 12)),
      'SUPER_ADMIN',
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          updated_at    = NOW()
  `

  // ── Merchant + Tenant ──────────────────────────────────────────────────────
  const tenantId    = randomUUID()
  const merchantId  = randomUUID()

  console.log("[seed] Inserting tenant...")
  await sql`
    INSERT INTO tenants (id, name, created_at, updated_at)
    VALUES (${tenantId}, 'Demo Merchant Co.', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `

  console.log("[seed] Inserting MERCHANT user...")
  await sql`
    INSERT INTO users (id, email, password_hash, role, tenant_id, created_at, updated_at)
    VALUES (
      ${merchantId},
      'merchant@gateway.internal',
      crypt('Merchant123!', gen_salt('bf', 12)),
      'MERCHANT',
      ${tenantId},
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          tenant_id     = EXCLUDED.tenant_id,
          updated_at    = NOW()
  `

  console.log("[seed] Done! Test accounts:")
  console.log("  SUPER_ADMIN  → super@gateway.internal    / SuperAdmin123!")
  console.log("  MERCHANT     → merchant@gateway.internal / Merchant123!")
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err)
  process.exit(1)
})
