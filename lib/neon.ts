/**
 * Database client — platform-aware driver selection.
 *
 * getSql()  — tagged-template SQL for simple queries (Neon HTTP, always)
 * getPool() — pool client for transactions (BEGIN / row-level locking)
 *
 * Pool driver selection:
 *   DATABASE_DRIVER=pg        → standard pg Pool over TCP (for Coolify/Docker/VPS)
 *   DATABASE_DRIVER=neon      → Neon serverless Pool over WebSocket (for Vercel)
 *   (unset)                   → auto-detect: pg if not on Vercel, neon on Vercel
 *
 * Both are initialised lazily so module evaluation never throws.
 *
 * IMPORTANT: On Coolify/Docker, the Neon WebSocket proxy (wss://) times out
 * because the container's network path to Neon's WSS endpoint is unreliable.
 * Standard pg over TCP to port 5432 works fine. This is why we default to pg
 * when not running on Vercel.
 */
import { neon, neonConfig, Pool as NeonPool, type NeonQueryFunction } from "@neondatabase/serverless"
import { Pool as PgPool } from "pg"

// ─── Driver selection ─────────────────────────────────────────────────────────

type DriverChoice = "pg" | "neon"

function resolveDriver(): DriverChoice {
  const explicit = process.env.DATABASE_DRIVER?.trim().toLowerCase()
  if (explicit === "pg") return "pg"
  if (explicit === "neon") return "neon"

  // Auto-detect: use neon on Vercel, pg everywhere else (Coolify, Docker, VPS)
  if (process.env.VERCEL) return "neon"
  return "pg"
}

const DRIVER = resolveDriver()

// Log once at startup
console.info(`[db] Driver selected: ${DRIVER} (DATABASE_DRIVER=${process.env.DATABASE_DRIVER ?? "(unset)"}, VERCEL=${process.env.VERCEL ?? "(unset)"})`)

// ─── Connection string ────────────────────────────────────────────────────────

function getConnectionString(): string {
  const cs = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL
  if (!cs) {
    throw new Error(
      "[db] Missing DATABASE_URL_UNPOOLED, POSTGRES_PRISMA_URL, or DATABASE_URL. " +
      "Add the Neon integration or set it in project settings."
    )
  }
  return cs
}

// ─── getSql() — Neon HTTP tagged template (works everywhere) ──────────────────

let _client: NeonQueryFunction<false, false> | null = null

export function getSql(): NeonQueryFunction<false, false> {
  if (_client) return _client
  _client = neon(getConnectionString())
  return _client
}

// ─── getPool() — platform-aware pool ──────────────────────────────────────────
// Returns pg.Pool on Coolify/Docker (TCP, stable)
// Returns Neon Pool on Vercel (WebSocket, serverless-compatible)
//
// Both implement the same pg.Pool interface (connect(), query(), on(), end())

let _pool: PgPool | NeonPool | null = null

export function getPool(): PgPool | NeonPool {
  if (_pool) return _pool

  if (DRIVER === "pg") {
    // Standard pg over TCP — stable on Coolify/Docker/VPS
    _pool = new PgPool({
      connectionString: getConnectionString(),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
    })
    _pool.on("error", (err: Error) => {
      console.error("[db] pg pool background error (non-fatal):", err.message)
    })
    console.info("[db] pg Pool created (TCP, max=5, idleTimeout=10s, connectTimeout=10s)")
  } else {
    // Neon serverless Pool — WebSocket transport for Vercel
    neonConfig.poolQueryViaFetch = true
    _pool = new NeonPool({ connectionString: getConnectionString() })
    _pool.on("error", (err: Error) => {
      console.error("[db] Neon pool background error (non-fatal):", err.message)
    })
    console.info("[db] Neon Pool created (WebSocket, poolQueryViaFetch=true)")
  }

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
