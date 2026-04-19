// Run migration: Add VOIDED to transaction_status enum
// Usage: node scripts/run-022-migration.cjs

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
    // First check current enum values
    const current = await sql`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'transaction_status'
      ORDER BY enumsortorder
    `;
    console.log("Current enum values:", current.map(r => r.enumlabel));

    // Add VOIDED if not exists
    await sql`
      DO $BODY$ BEGIN
        ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'VOIDED';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $BODY$
    `;

    // Verify
    const after = await sql`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'transaction_status'
      ORDER BY enumsortorder
    `;
    console.log("Enum values after migration:", after.map(r => r.enumlabel));
    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
