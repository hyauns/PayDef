import { getSql } from './lib/neon'

async function run() {
  const sql = getSql()
  const rows = await sql`
    SELECT id, name, tenant_id, 
           api_key_hash IS NOT NULL AS has_api_key_hash, 
           LENGTH(api_key_hash) AS api_key_hash_length, 
           updated_at, api_key_hash 
    FROM stores 
    WHERE id = '9d7e0d84-145b-4daf-a080-21ecf5b43b6a'`
  console.log(rows)
  process.exit(0)
}
run()
