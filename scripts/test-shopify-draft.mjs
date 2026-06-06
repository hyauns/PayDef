/**
 * Manual test for the Shopify Draft Order flow used by the SHOPIFY provider.
 *
 * Reads credentials from env so the token never lives in the file:
 *   SHOPIFY_DOMAIN=nemxek-1k.myshopify.com
 *   SHOPIFY_TOKEN=shpat_...
 *   [SHOPIFY_API_VERSION=2024-10]   (optional)
 *
 * Steps:
 *   1. GET shop.json        — verifies the token + prints the shop name.
 *   2. POST draft_orders    — creates a $1.00 tax-exempt custom-line-item draft
 *                             (same shape lib/shopify.ts uses) and prints the
 *                             invoice_url you can open to see the live checkout.
 *
 * The draft order is harmless: it is a DRAFT (no real order, no inventory
 * change) until someone pays the invoice. Delete it from Shopify Admin →
 * Orders → Drafts when done.
 *
 * Run:  node scripts/test-shopify-draft.mjs
 */

const domain = (process.env.SHOPIFY_DOMAIN || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "")
const token = (process.env.SHOPIFY_TOKEN || "").trim()
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2024-10").trim()

if (!domain || !token) {
  console.error("Missing SHOPIFY_DOMAIN or SHOPIFY_TOKEN env var.")
  process.exit(1)
}

const base = `https://${domain}/admin/api/${apiVersion}`
const headers = { "Content-Type": "application/json", "X-Shopify-Access-Token": token }

async function main() {
  // ── 1. Verify the token ────────────────────────────────────────────────────
  console.log(`\n[1/2] GET ${base}/shop.json`)
  const shopRes = await fetch(`${base}/shop.json`, { headers })
  const shopText = await shopRes.text()
  if (!shopRes.ok) {
    console.error(`  ✗ shop.json failed (${shopRes.status}): ${shopText.slice(0, 300)}`)
    process.exit(1)
  }
  const shop = JSON.parse(shopText).shop
  console.log(`  ✓ Authenticated. Shop: "${shop.name}" — plan: ${shop.plan_display_name}, currency: ${shop.currency}`)

  // ── 2. Create a test draft order ────────────────────────────────────────────
  const fakeTxnId = "test-" + Math.random().toString(36).slice(2, 10)
  const draftBody = {
    draft_order: {
      line_items: [
        { title: "Collectible Item (test)", price: "1.00", quantity: 1, taxable: false, requires_shipping: false },
      ],
      tax_exempt: true,
      note: `PayDef transaction ${fakeTxnId}`,
      note_attributes: [{ name: "paydef_txn", value: fakeTxnId }],
      tags: "paydef",
      use_customer_default_address: false,
    },
  }

  console.log(`\n[2/2] POST ${base}/draft_orders.json  (paydef_txn=${fakeTxnId})`)
  const draftRes = await fetch(`${base}/draft_orders.json`, {
    method: "POST",
    headers,
    body: JSON.stringify(draftBody),
  })
  const draftText = await draftRes.text()
  if (!draftRes.ok) {
    console.error(`  ✗ draft_orders.json failed (${draftRes.status}): ${draftText.slice(0, 500)}`)
    console.error("\n  → If this is a 403/scope error, the custom app is missing the 'write_draft_orders' scope.")
    process.exit(1)
  }

  const draft = JSON.parse(draftText).draft_order
  console.log(`  ✓ Draft Order created.`)
  console.log(`     id            : ${draft.id}`)
  console.log(`     total_price   : ${draft.total_price} ${draft.currency || ""}`)
  console.log(`     status        : ${draft.status}`)
  console.log(`     invoice_url   : ${draft.invoice_url}`)
  console.log(`\n  → Open invoice_url in a browser to see the exact checkout your TCG Lore buyers would land on.`)
  console.log(`  → It is a DRAFT; delete it in Shopify Admin → Orders → Drafts when finished.\n`)
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
