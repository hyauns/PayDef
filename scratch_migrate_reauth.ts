import { getPool } from "./lib/neon"

async function run() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    
    // Add latest_authorization_id to transactions
    await client.query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS latest_authorization_id TEXT;
    `)

    await client.query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS authorization_expires_at TIMESTAMPTZ;
    `)
    
    await client.query("COMMIT")
    console.log("Migration successful!")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Migration failed:", err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
