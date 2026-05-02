import { POST } from "../app/api/gateway/checkout/route";
import { NextRequest } from "next/server";

process.env.PAYMENT_IDENTITY_BUNDLE_MODE = "enforce";
process.env.PAYMENT_DISPLAY_PROFILE_MODE = "enforce";

async function run() {
  const storeId = "9d7e0d84-145b-4daf-a080-21ecf5b43b6a";
  const apiKey = "sk_test_fixed_123456";

  const body = {
    amount: 302.41,
    currency: "USD",
    itemName: "Test Checkout Item",
    returnUrl: "https://example.com/return",
    cancelUrl: "https://example.com/cancel"
  };

  const req = new NextRequest("http://localhost:3000/api/gateway/checkout", {
    method: "POST",
    headers: {
      "X-Store-ID": storeId,
      "X-API-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  console.log("=== SENDING POST ===");
  const res = await POST(req);
  console.log("=== STATUS ===", res.status);
  const data = await res.json();
  console.log("=== RESPONSE ===", JSON.stringify(data, null, 2));
}

run().catch(console.error).finally(() => process.exit(0));
