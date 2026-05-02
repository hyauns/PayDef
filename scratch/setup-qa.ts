import { getSql } from "../lib/neon";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function setupTestStore() {
  const sql = getSql();
  
  // Create a tenant
  const tenantRows = await sql`
    INSERT INTO tenants (id, name) 
    VALUES (gen_random_uuid(), 'Test Tenant QA') 
    RETURNING id
  `;
  const tenantId = tenantRows[0].id;
  
  // Create a store
  const plainKey = "sk_test_" + crypto.randomBytes(16).toString("hex");
  const hash = await bcrypt.hash(plainKey, 10);
  
  const storeRows = await sql`
    INSERT INTO stores (id, tenant_id, name, api_key_hash, is_active)
    VALUES (gen_random_uuid(), ${tenantId}, 'Test QA Store', ${hash}, true)
    RETURNING id
  `;
  const storeId = storeRows[0].id;

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

  // Create a merchant account with the bundle id
  await sql`
    INSERT INTO merchant_accounts (
      id, tenant_id, client_id, client_secret, shield_domain, daily_limit, current_volume, priority, status, item_masking, fake_product_name, bundle_id
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, 'mock_client', 'mock_secret', 'rainbowprinthouse.com', 10000, 0, 100, 'ACTIVE', false, 'Legacy Fallback', ${bundleId}
    )
  `;

  // Create the shield domains in DB
  await sql`
    INSERT INTO shield_domains (
      id, tenant_id, domain, is_active, health_ok
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, 'www.bubblyscent.com', true, true
    ), (
      gen_random_uuid(), ${tenantId}, 'rainbowprinthouse.com', true, true
    )
    ON CONFLICT (domain) DO NOTHING
  `;

  console.log(JSON.stringify({ storeId, plainKey, tenantId, bundleId }));
}

setupTestStore().catch(console.error).finally(() => process.exit(0));
