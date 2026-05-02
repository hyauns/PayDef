const { Pool } = require('pg')

async function run() {
  const pool = new Pool({
    connectionString: "postgresql://neondb_owner:npg_Ur84eQWdXCcJ@ep-muddy-pine-an67umen-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
  })

  const { rows } = await pool.query(`SELECT id, api_key_hash FROM stores WHERE name = 'TireVix' LIMIT 1`)
  console.log(rows[0])
  
  process.exit(0)
}

run().catch(console.error)
