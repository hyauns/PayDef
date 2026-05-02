import { getSql } from "../lib/neon";

async function reset() {
  const sql = getSql();
  await sql`UPDATE merchant_accounts SET status = 'ACTIVE' WHERE client_id = 'mock_client'`;
  console.log("Reset complete");
}

reset().catch(console.error).finally(() => process.exit(0));
