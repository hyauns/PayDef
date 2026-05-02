import { getSql } from "../lib/neon";

async function run() {
  const sql = getSql();
  const stores = await sql`SELECT id, tenant_id FROM stores LIMIT 1`;
  console.log("Store:", stores[0]);
  
  const apiKeys = await sql`SELECT id, store_id, key_string FROM store_api_keys LIMIT 1`;
  console.log("API Key:", apiKeys[0]);
}

run().catch(console.error).finally(() => process.exit(0));
