/**
 * Neon serverless SQL client — no generated artifacts required.
 * Use tagged-template queries: getSql()`SELECT * FROM users WHERE id = ${id}`
 *
 * The client is initialised lazily via getSql() so module evaluation never
 * throws, preventing the NextAuth API route from returning HTML error pages.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

let _client: NeonQueryFunction<false, false> | null = null

export function getSql(): NeonQueryFunction<false, false> {
  if (_client) return _client
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL
  if (!connectionString) {
    throw new Error(
      "[db] Missing DATABASE_URL_UNPOOLED or POSTGRES_PRISMA_URL. " +
      "Add the Neon integration or set the variable in your project settings."
    )
  }
  _client = neon(connectionString)
  return _client
}

// ─── Typed row shapes ─────────────────────────────────────────────────────────
export type UserRow = {
  id:            string
  email:         string
  password_hash: string
  role:          "SUPER_ADMIN" | "MERCHANT"
  tenant_id:     string | null
}
