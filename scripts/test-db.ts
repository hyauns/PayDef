import { getSql } from "../lib/neon"

async function run() {
  const sql = getSql()
  try {
    const tx = await sql`SELECT id, status, original_amount, merchant_id, paypal_order_id, intent, created_at FROM transactions ORDER BY created_at DESC LIMIT 5`
    console.table(tx)
    const ma = await sql`SELECT id, name, current_volume FROM merchant_accounts LIMIT 5`
    console.table(ma)
  } catch(e) { console.error(e) }
}
run()
