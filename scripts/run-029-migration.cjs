// Run migration 029: allow stores.checkout_flow = 'SMART_BUTTONS'
// Usage: node scripts/run-029-migration.cjs          (dry run: prints target host + SQL)
//        node scripts/run-029-migration.cjs --yes    (applies it)
// Reads DATABASE_URL_UNPOOLED || DATABASE_URL from .env.local — which is PRODUCTION.

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
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
  const host = new URL(connStr).hostname;
  console.log("Target DB host:", host);

  const ddl = fs.readFileSync(path.join(__dirname, "029-checkout-flow-smart-buttons.sql"), "utf-8");
  if (!process.argv.includes("--yes")) {
    console.log("Dry run. SQL that would run:\n" + ddl + "\nRe-run with --yes to apply.");
    return;
  }

  const sql = neon(connStr);
  try {
    await sql`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_checkout_flow_check`;
    await sql`ALTER TABLE stores ADD CONSTRAINT stores_checkout_flow_check
              CHECK (checkout_flow IN ('REDIRECT', 'POPUP_BRIDGE', 'SMART_BUTTONS'))`;

    const rows = await sql`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'stores_checkout_flow_check'
    `;
    console.log("Constraint after migration:", rows[0]?.def);
    if (!rows[0] || !String(rows[0].def).includes("SMART_BUTTONS")) {
      console.error("Migration verification FAILED");
      process.exit(1);
    }
    console.log("Migration 029 complete!");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
