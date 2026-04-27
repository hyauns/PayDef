import { getSql } from "../lib/neon"
import fs from "fs"
import path from "path"

const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
envFile.split("\n").forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
})

async function main() {
  const sql = getSql()
  try {
    await sql`ALTER TABLE merchant_accounts ADD COLUMN IF NOT EXISTS display_profile_id UUID`
    console.log("merchant_accounts updated")
  } catch (err: any) {
    console.log("Error updating merchant_accounts:", err.message)
  }

  try {
    await sql`CREATE INDEX IF NOT EXISTS merchant_accounts_display_profile_idx ON merchant_accounts (display_profile_id)`
    console.log("merchant_accounts index created")
  } catch (err: any) {
    console.log("Error indexing merchant_accounts:", err.message)
  }

  try {
    await sql`ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS display_profile_id UUID`
    console.log("shield_domains updated")
  } catch (err: any) {
    console.log("Error updating shield_domains:", err.message)
  }
}
main()
