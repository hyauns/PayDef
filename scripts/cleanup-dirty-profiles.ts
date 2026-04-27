import { getPool } from "../lib/neon"

async function runCleanup() {
  const pool = getPool()
  const client = await pool.connect()

  console.log("=== Starting Dirty Profile Data Cleanup ===")

  try {
    await client.query("BEGIN")

    // Find profiles with dirty data
    const dirtyRes = await client.query(`
      SELECT id, profile_name, public_brand_name, descriptor_prefix
      FROM payment_display_profiles
      WHERE profile_name ILIKE '%script%'
         OR public_brand_name ILIKE '%script%'
         OR descriptor_prefix ILIKE '%script%'
         OR profile_name ILIKE '%alert(%'
         OR public_brand_name ILIKE '%alert(%'
         OR descriptor_prefix ILIKE '%alert(%'
    `)

    console.log(`Found ${dirtyRes.rows.length} dirty profiles.`)

    for (const row of dirtyRes.rows) {
      console.log(`Cleaning profile ID: ${row.id}`)
      console.log(`  Before -> Profile: ${row.profile_name}, Brand: ${row.public_brand_name}, Prefix: ${row.descriptor_prefix}`)

      let newPrefix = "TireVix Auto"
      let newBrand = "TireVix"
      let newProfileName = "Cleaned Store Profile"

      // Hard reset to TireVix default to cleanse
      await client.query(`
        UPDATE payment_display_profiles
        SET profile_name = $1,
            public_brand_name = $2,
            descriptor_prefix = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [newProfileName, newBrand, newPrefix, row.id])

      console.log(`  After  -> Profile: ${newProfileName}, Brand: ${newBrand}, Prefix: ${newPrefix}`)
    }

    await client.query("COMMIT")
    console.log("=== Cleanup Completed Successfully ===")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Cleanup failed:", err)
  } finally {
    client.release()
    await pool.end()
  }
}

runCleanup().catch(console.error)
