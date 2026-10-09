// Run migration 031: probe columns on shield_domains
// Usage: node scripts/run-031-migration.cjs          (dry run: prints target host + SQL)
//        node scripts/run-031-migration.cjs --yes    (applies it)
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

  const ddl = fs.readFileSync(path.join(__dirname, "031-shield-probe.sql"), "utf-8");
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
      SELECT COUNT(*)::int AS c FROM information_schema.columns
      WHERE table_name = 'shield_domains'
        AND column_name IN ('probe_up', 'probe_failures', 'probe_error', 'probe_checked_at', 'probe_changed_at')
    `;
    console.log("Verification:", rows[0]);
    if (rows[0].c !== 5) {
      console.error("Migration verification FAILED");
      process.exit(1);
    }
    console.log("Migration 031 complete!");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
