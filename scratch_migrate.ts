import { getPool } from "./lib/neon"

async function run() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    
    // Add default_display_profile_id to stores
    await client.query(`
      ALTER TABLE stores 
      ADD COLUMN IF NOT EXISTS default_display_profile_id UUID;
    `)
    
    // Create payment_display_profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_display_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        store_id UUID,
        profile_name TEXT NOT NULL,
        industry_vertical TEXT NOT NULL,
        public_brand_name TEXT,
        descriptor_prefix TEXT,
        display_mode TEXT NOT NULL DEFAULT 'BRAND_SEMANTIC',
        line_item_policy TEXT NOT NULL DEFAULT 'SINGLE_SEMANTIC_ITEM',
        is_default BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
    
    await client.query(`CREATE INDEX IF NOT EXISTS payment_display_profiles_tenant_id_idx ON payment_display_profiles(tenant_id);`)
    await client.query(`CREATE INDEX IF NOT EXISTS payment_display_profiles_store_id_idx ON payment_display_profiles(store_id);`)
    
    // Create payment_descriptor_templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_descriptor_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        industry_vertical TEXT NOT NULL,
        descriptor_text TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
    
    await client.query(`CREATE INDEX IF NOT EXISTS payment_descriptor_templates_industry_vertical_idx ON payment_descriptor_templates(industry_vertical);`)
    
    await client.query("COMMIT")
    console.log("Migration successful!")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Migration failed:", err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
