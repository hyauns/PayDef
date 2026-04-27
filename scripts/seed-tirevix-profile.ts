import { getSql } from "../lib/neon";

async function main() {
  console.log("Starting TireVix profile seed...");
  const sql = getSql();

  try {
    // 1. Find TireVix store
    const stores = await sql`
      SELECT id, tenant_id 
      FROM stores 
      WHERE name ILIKE '%TireVix%'
      LIMIT 1
    `;

    if (stores.length === 0) {
      console.log("No TireVix store found. Skipping seed.");
      return;
    }

    const store = stores[0];
    console.log(`Found TireVix store (ID: ${store.id}). Checking for existing profiles...`);

    // 2. Check if a profile already exists for this store
    const existingProfiles = await sql`
      SELECT id 
      FROM payment_display_profiles 
      WHERE store_id = ${store.id} AND industry_vertical = 'automotive_tires'
    `;

    let profileId;

    if (existingProfiles.length > 0) {
      profileId = existingProfiles[0].id;
      console.log(`Profile already exists (ID: ${profileId}).`);
    } else {
      // 3. Create the profile
      const inserted = await sql`
        INSERT INTO payment_display_profiles (
          tenant_id, store_id, profile_name, industry_vertical, 
          public_brand_name, descriptor_prefix, display_mode, line_item_policy,
          is_default, is_active
        ) VALUES (
          ${store.tenant_id}, ${store.id}, 'TireVix Auto Profile', 'automotive_tires',
          'TireVix', 'TireVix Auto', 'BRAND_SEMANTIC', 'SINGLE_SEMANTIC_ITEM',
          true, true
        ) RETURNING id
      `;
      profileId = inserted[0].id;
      console.log(`Created new profile (ID: ${profileId}).`);
    }

    // 4. Set as default profile for the store
    await sql`
      UPDATE stores 
      SET default_display_profile_id = ${profileId}
      WHERE id = ${store.id}
    `;
    console.log("Set default_display_profile_id on TireVix store successfully.");

  } catch (error) {
    console.error("Failed to seed TireVix profile:", error);
  } finally {
    process.exit(0);
  }
}

main();
