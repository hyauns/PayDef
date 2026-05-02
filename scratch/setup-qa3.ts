import { getSql } from "../lib/neon";
import bcrypt from "bcryptjs";

async function run() {
  const sql = getSql();
  
  // Find an existing active store
  const storeRows = await sql`SELECT id, tenant_id FROM stores WHERE is_active = true LIMIT 1`;
  const tenantId = storeRows[0].tenant_id;
  const storeId = storeRows[0].id;
  
  // Update its API key so we know it
  const plainKey = "sk_test_fixed_123456";
  const hash = await bcrypt.hash(plainKey, 10);
  await sql`UPDATE stores SET api_key_hash = ${hash} WHERE id = ${storeId}`;
  
  // Delete the existing bubbly domain so we can insert it cleanly for this tenant
  await sql`DELETE FROM shield_domains WHERE domain = 'www.bubblyscent.com'`;
  await sql`DELETE FROM shield_domains WHERE domain = 'rainbowprinthouse.com'`;

  // Create the shield domains in DB for this tenant
  await sql`
    INSERT INTO shield_domains (
      id, tenant_id, domain, is_active, health_ok
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, 'www.bubblyscent.com', true, true
    ), (
      gen_random_uuid(), ${tenantId}, 'rainbowprinthouse.com', true, true
    )
  `;

  // Let's create a bundle
  const bundleRows = await sql`
    INSERT INTO payment_identity_bundles (
      id, tenant_id, bundle_name, public_brand_name, industry_vertical,
      primary_shield_domain, support_email, is_active
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, 'Bubbly QA Bundle', 'Bubbly Scent Auto Care', 'automotive_tires',
      'www.bubblyscent.com', 'support@bubblyscent.com', true
    )
    RETURNING id
  `;
  const bundleId = bundleRows[0].id;

  // Add an item to the bundle
  await sql`
    INSERT INTO payment_identity_bundle_items (
      id, tenant_id, bundle_id, descriptor_name, product_title, product_type, tracking_expected, shipping_required, is_active
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, ${bundleId}, 'Tire & Wheel Order', 'Tire Package', 'physical_good', true, true, true
    )
  `;

  // Update an existing active merchant account for this tenant
  const maRows = await sql`SELECT id FROM merchant_accounts WHERE tenant_id = ${tenantId} LIMIT 1`;
  const maId = maRows[0].id;

  await sql`
    UPDATE merchant_accounts 
    SET shield_domain = 'rainbowprinthouse.com',
        bundle_id = ${bundleId},
        status = 'ACTIVE'
    WHERE id = ${maId}
  `;

  console.log(JSON.stringify({ storeId, plainKey }));
}

run().catch(console.error).finally(() => process.exit(0));
