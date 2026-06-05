// Run migration 026: add payment_identity_bundles.use_random_descriptor
// Usage: node scripts/run-026-migration.cjs
// Reads the connection string from .env.local (DATABASE_URL_UNPOOLED || DATABASE_URL).

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=["']?(.*?)["']?\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
}

async function migrate() {
  const connStr = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connStr) {
    console.error("No DATABASE_URL found");
    process.exit(1);
  }

  console.log("Connecting to:", connStr.replace(/:[^:@]+@/, ":***@"));
  const sql = neon(connStr);

  try {
    await sql`
      ALTER TABLE payment_identity_bundles
      ADD COLUMN IF NOT EXISTS use_random_descriptor BOOLEAN NOT NULL DEFAULT false
    `;

    const cols = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'payment_identity_bundles'
        AND column_name = 'use_random_descriptor'
    `;
    console.log("Column after migration:", cols);
    if (cols.length === 0) {
      console.error("Migration verification FAILED: column not found");
      process.exit(1);
    }
    console.log("Migration 026 complete!");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
