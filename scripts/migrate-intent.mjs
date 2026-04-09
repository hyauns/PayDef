// Migration: ensure 'intent' column exists on transactions table
// Run: node scripts/migrate-intent.mjs

import { neon } from "@neondatabase/serverless"
import { config } from "dotenv"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, "../.env.local") })

const sql = neon(process.env.DATABASE_URL)

try {
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'intent'
      ) THEN
        ALTER TABLE transactions ADD COLUMN intent TEXT NOT NULL DEFAULT 'CAPTURE';
        RAISE NOTICE 'Added intent column to transactions';
      ELSE
        RAISE NOTICE 'intent column already exists on transactions';
      END IF;
    END;
    $$
  `
  console.log("✅ Migration complete: intent column ready")
  process.exit(0)
} catch (err) {
  console.error("❌ Migration failed:", err.message)
  process.exit(1)
}
