/**
 * scripts/migrate-phase5b-identity-bundles.ts
 *
 * Phase 5B Migration: Payment Identity Bundles
 *
 * Creates:
 *   - payment_identity_bundles table
 *   - payment_identity_bundle_items table
 *   - Adds bundle_id to merchant_accounts
 *   - Adds bundle_id to shield_domains
 *   - All required indexes
 *
 * Run: npx tsx scripts/migrate-phase5b-identity-bundles.ts
 *
 * Safe:
 *   - All DDL uses IF NOT EXISTS / IF NOT EXISTS patterns
 *   - All new columns are nullable — no existing rows break
 *   - Wrapped in BEGIN/COMMIT with ROLLBACK on failure
 *   - Does NOT modify checkout, PayPal, or payment flow behavior
 */

import { getPool } from "../lib/neon"

async function run() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // ── 1. Create payment_identity_bundles table ──────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_identity_bundles (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID        NOT NULL,
        store_id            UUID,
        display_profile_id  UUID,
        bundle_name         TEXT        NOT NULL,
        public_brand_name   TEXT,
        industry_vertical   TEXT        NOT NULL,
        primary_shield_domain TEXT,
        support_email       TEXT,
        support_phone       TEXT,
        order_lookup_url    TEXT,
        tracking_url        TEXT,
        shipping_policy_url TEXT,
        refund_policy_url   TEXT,
        privacy_policy_url  TEXT,
        terms_url           TEXT,
        is_default          BOOLEAN     NOT NULL DEFAULT false,
        is_active           BOOLEAN     NOT NULL DEFAULT true,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
    console.log("✓ payment_identity_bundles table created")

    // ── 2. Create payment_identity_bundle_items table ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_identity_bundle_items (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID        NOT NULL,
        bundle_id           UUID        NOT NULL REFERENCES payment_identity_bundles(id) ON DELETE CASCADE,
        descriptor_name     TEXT        NOT NULL,
        product_slug        TEXT,
        product_title       TEXT        NOT NULL,
        product_description TEXT,
        product_type        TEXT        NOT NULL DEFAULT 'physical_good',
        shipping_required   BOOLEAN     NOT NULL DEFAULT true,
        tracking_expected   BOOLEAN     NOT NULL DEFAULT true,
        price_min           NUMERIC,
        price_max           NUMERIC,
        image_url           TEXT,
        is_active           BOOLEAN     NOT NULL DEFAULT true,
        sort_order          INTEGER     DEFAULT 0,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
    console.log("✓ payment_identity_bundle_items table created")

    // ── 3. Add bundle_id to merchant_accounts ────────────────────────────────
    await client.query(`
      ALTER TABLE merchant_accounts
      ADD COLUMN IF NOT EXISTS bundle_id UUID;
    `)
    console.log("✓ merchant_accounts.bundle_id column added")

    // ── 4. Add bundle_id to shield_domains ───────────────────────────────────
    await client.query(`
      ALTER TABLE shield_domains
      ADD COLUMN IF NOT EXISTS bundle_id UUID;
    `)
    console.log("✓ shield_domains.bundle_id column added")

    // ── 5. Indexes for payment_identity_bundles ──────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS pib_tenant_id_idx
      ON payment_identity_bundles(tenant_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS pib_store_id_idx
      ON payment_identity_bundles(store_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS pib_display_profile_id_idx
      ON payment_identity_bundles(display_profile_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS pib_tenant_store_default_idx
      ON payment_identity_bundles(tenant_id, store_id, is_default, is_active);`)
    console.log("✓ payment_identity_bundles indexes created")

    // ── 6. Indexes for payment_identity_bundle_items ─────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS pibi_bundle_active_sort_idx
      ON payment_identity_bundle_items(bundle_id, is_active, sort_order);`)
    await client.query(`CREATE INDEX IF NOT EXISTS pibi_tenant_id_idx
      ON payment_identity_bundle_items(tenant_id);`)
    console.log("✓ payment_identity_bundle_items indexes created")

    // ── 7. Indexes for new FK columns ────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS merchant_accounts_bundle_id_idx
      ON merchant_accounts(bundle_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS shield_domains_bundle_id_idx
      ON shield_domains(bundle_id);`)
    console.log("✓ FK indexes created")

    await client.query("COMMIT")
    console.log("\n✅ Phase 5B migration completed successfully!")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("❌ Phase 5B migration failed:", err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
