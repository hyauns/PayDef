require("dotenv").config({ path: ".env.local" })
const { Pool } = require("pg")

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

async function run() {
  try {
    const res = await pool.query('SELECT id, status, original_amount, merchant_id, intent, created_at FROM transactions ORDER BY created_at DESC LIMIT 5')
    console.table(res.rows)
    
    const res2 = await pool.query('SELECT id, name, current_volume FROM merchant_accounts LIMIT 5')
    console.table(res2.rows)
  } catch (err) {
    console.error(err)
  } finally {
    pool.end()
  }
}

run()
