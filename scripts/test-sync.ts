import { getSql } from "../lib/neon"

async function run() {
  const sql = getSql()
  try {
    const tenantId = '1ed87cc3-1a2c-4b53-8f6a-493cf0903328' // I need the tenantId.
    const res = await sql`
      SELECT
        t.merchant_id,
        SUM(t.original_amount) AS real_volume,
        ma2.volume_reset_at, ma2.created_at as ma_created, t.created_at as t_created
      FROM transactions t
      JOIN merchant_accounts ma2 ON t.merchant_id = ma2.id
      WHERE t.status = 'COMPLETED'
      GROUP BY t.merchant_id, ma2.volume_reset_at, ma2.created_at, t.created_at
    `
    console.table(res)
  } catch(e) { console.error(e) }
}
run()
