/**
 * Registers the Shopify webhooks the SHOPIFY provider needs, via the Admin API.
 *
 * Run this AFTER the Paydef code is deployed and the SHOPIFY store exists in the
 * Paydef dashboard (so the destination endpoint actually responds).
 *
 * Reads from env (token never lives in the file):
 *   SHOPIFY_DOMAIN=nemxek-1k.myshopify.com
 *   SHOPIFY_TOKEN=shpat_...
 *   PAYDEF_WEBHOOK_URL=https://<paydef-domain>/api/webhook/shopify/<storeId>
 *   [SHOPIFY_API_VERSION=2024-10]
 *
 * Idempotent: lists existing webhooks first and skips any topic already pointing
 * at the same address.
 *
 * IMPORTANT — webhook signing secret:
 *   Webhooks created via the Admin API are signed with the custom app's
 *   **API secret key** (Shopify Admin → Apps → your app → API credentials →
 *   "API secret key"). Store THAT value as the SHOPIFY webhook secret in the
 *   Paydef store (field: shopifyWebhookSecret) so /api/webhook/shopify can
 *   verify the HMAC.
 *
 * Run:  node scripts/register-shopify-webhook.mjs
 */

const domain = (process.env.SHOPIFY_DOMAIN || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "")
const token = (process.env.SHOPIFY_TOKEN || "").trim()
const address = (process.env.PAYDEF_WEBHOOK_URL || "").trim()
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2024-10").trim()

if (!domain || !token || !address) {
  console.error("Missing SHOPIFY_DOMAIN, SHOPIFY_TOKEN, or PAYDEF_WEBHOOK_URL env var.")
  process.exit(1)
}
if (!/^https:\/\/.+\/api\/webhook\/shopify\/.+/.test(address)) {
  console.error(`PAYDEF_WEBHOOK_URL looks wrong: ${address}`)
  console.error("Expected: https://<paydef-domain>/api/webhook/shopify/<storeId>")
  process.exit(1)
}

const base = `https://${domain}/admin/api/${apiVersion}`
const headers = { "Content-Type": "application/json", "X-Shopify-Access-Token": token }
const TOPICS = ["orders/paid", "refunds/create"]

async function listWebhooks() {
  const res = await fetch(`${base}/webhooks.json?limit=250`, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`list webhooks failed (${res.status}): ${text.slice(0, 300)}`)
  return JSON.parse(text).webhooks || []
}

async function createWebhook(topic) {
  const res = await fetch(`${base}/webhooks.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`create ${topic} failed (${res.status}): ${text.slice(0, 400)}`)
  return JSON.parse(text).webhook
}

async function main() {
  console.log(`\nRegistering webhooks on "${domain}" → ${address}\n`)
  const existing = await listWebhooks()

  for (const topic of TOPICS) {
    const dup = existing.find((w) => w.topic === topic && w.address === address)
    if (dup) {
      console.log(`  • ${topic} — already registered (id ${dup.id}), skipping`)
      continue
    }
    const created = await createWebhook(topic)
    console.log(`  ✓ ${topic} — created (id ${created.id})`)
  }

  console.log(`\nDone. Remember: set the Paydef store's shopifyWebhookSecret to the app's`)
  console.log(`API secret key so the webhook HMAC verifies.\n`)
}

main().catch((err) => {
  console.error("Error:", err.message)
  process.exit(1)
})
