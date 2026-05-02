import { POST } from "../app/api/gateway/checkout/route";
import { getSql } from "../lib/neon";
import { NextRequest } from "next/server";

async function runTest() {
  const sql = getSql();
  
  // 1. Setup a dummy store and tenant for testing
  // Actually, we can just find any store
  const stores = await sql`
    SELECT s.id, s.tenant_id, s.api_key_id
    FROM stores s
    LIMIT 1
  `;
  if (stores.length === 0) throw new Error("No stores found");
  const store = stores[0];

  // Look up an api_key string
  const apiKeys = await sql`
    SELECT key_string 
    FROM api_keys 
    WHERE id = ${store.api_key_id}
  `;
  const apiKeyString = apiKeys.length > 0 ? apiKeys[0].key_string : "test_api_key_123456";

  // Mock POST request to checkout
  const body = {
    amount: "100.00",
    currency: "USD",
    item_name: "Test Item",
    return_url: "https://example.com/return",
    cancel_url: "https://example.com/cancel"
  };

  const req = new NextRequest("http://localhost:3000/api/gateway/checkout", {
    method: "POST",
    headers: {
      "X-Store-ID": store.id,
      "X-API-Key": apiKeyString,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  console.log("=== Sending Request ===");
  const res = await POST(req);
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  // The logs will be printed to console because we are running in a script
}

runTest().catch(console.error).finally(() => process.exit(0));
