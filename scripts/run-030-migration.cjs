// Run migration 030: button_sessions table + express / payer columns on transactions
// Usage: node scripts/run-030-migration.cjs          (dry run: prints target host + SQL)
//        node scripts/run-030-migration.cjs --yes    (applies it)
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
  console.log("Target DB host:", new URL(connStr).hostname);

  const ddl = fs.readFileSync(path.join(__dirname, "030-button-sessions.sql"), "utf-8");
  // Drop comment-only lines FIRST (comments may contain ";"), then one
  // statement per ";"-terminated block.
  const statements = ddl
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!process.argv.includes("--yes")) {
    console.log(`Dry run. ${statements.length} statements would run:\n`);
    statements.forEach((s, i) => console.log(`-- [${i + 1}]\n${s};\n`));
    console.log("Re-run with --yes to apply.");
    return;
  }

  const sql = neon(connStr);
  try {
    for (const s of statements) {
      await sql.query(s);
    }
    const rows = await sql`
      SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'button_sessions')::int AS t,
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'transactions'
                AND column_name IN ('button_session_id', 'express', 'express_item_total', 'payer_email', 'payer_name', 'shipping_address'))::int AS c
    `;
    console.log("Verification:", rows[0]);
    if (rows[0].t !== 1 || rows[0].c !== 6) {
      console.error("Migration verification FAILED");
      process.exit(1);
    }
    console.log("Migration 030 complete!");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
