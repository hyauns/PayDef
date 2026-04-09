const { neon } = require("@neondatabase/serverless")
const fs = require("fs")
const path = require("path")

// Parse .env.local manually
function loadEnv(envPath) {
  try {
    const content = fs.readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* file missing */ }
}

loadEnv(path.join(__dirname, "../.env.local"))
loadEnv(path.join(__dirname, "../.env"))

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) { console.error("DATABASE_URL not set"); process.exit(1) }

  const sql = neon(dbUrl)

  const check = await sql`
    SELECT column_name 
    FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'intent'
  `
  
  if (check.length === 0) {
    console.log("Adding intent column to transactions...")
    await sql`ALTER TABLE transactions ADD COLUMN intent TEXT NOT NULL DEFAULT 'CAPTURE'`
    console.log("✅ Added intent column with default 'CAPTURE'")
  } else {
    console.log("✅ intent column already exists")
  }
  
  const sample = await sql`SELECT id, status, intent FROM transactions ORDER BY created_at DESC LIMIT 3`
  console.log("Recent transactions:", JSON.stringify(sample, null, 2))
}

main().catch(e => { console.error("Error:", e.message); process.exit(1) })
