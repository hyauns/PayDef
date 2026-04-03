/**
 * Neon serverless SQL client — no generated artifacts required.
 *
 * getSql()  — tagged-template SQL for simple queries
 * getPool() — full pool client for transactions (BEGIN / row-level locking)
 *
 * Both are initialised lazily so module evaluation never throws.
 */
import { neon, neonConfig, Pool, type NeonQueryFunction } from "@neondatabase/serverless"

let _client: NeonQueryFunction<false, false> | null = null

function getConnectionString(): string {
  const cs = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL
  if (!cs) {
    throw new Error(
      "[db] Missing DATABASE_URL_UNPOOLED or POSTGRES_PRISMA_URL. " +
      "Add the Neon integration or set it in project settings."
    )
  }
  return cs
}

export function getSql(): NeonQueryFunction<false, false> {
  if (_client) return _client
  _client = neon(getConnectionString())
  return _client
}

// Pool client — required for explicit transactions (BEGIN / COMMIT / ROLLBACK)
// and SELECT ... FOR UPDATE row-level locking.
let _pool: Pool | null = null

export function getPool(): Pool {
  if (_pool) return _pool
  // neonConfig.webSocketConstructor is set automatically in Node environments
  neonConfig.poolQueryViaFetch = true
  _pool = new Pool({ connectionString: getConnectionString() })
  return _pool
}

// ─── Typed row shapes ─────────────────────────────────────────────────────────
export type UserRow = {
  id:            string
  email:         string
  password_hash: string
  role:          "SUPER_ADMIN" | "MERCHANT"
  tenant_id:     string | null
}
