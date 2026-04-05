/**
 * Route Protection Proxy (Next.js 16 Node.js Runtime)
 *
 * Handles:
 *  1. Authentication — redirect unauthenticated users to /login
 *  2. Role-based access control — route users to their permitted pages
 *  3. Token revocation — check JWT `jti` against `token_blacklist` table
 *
 * The blacklist check uses Neon's HTTP driver (edge-compatible) with a
 * 5-second in-memory cache to avoid a DB round-trip on every single request.
 */
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"

type Role = "SUPER_ADMIN" | "MERCHANT"

// Default landing page for each role
const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT: "/dashboard",
}

/**
 * Protected route definitions:
 * - prefix: URL path prefix to match
 * - roles: Array of roles allowed to access routes under this prefix
 */
const PROTECTED_ROUTES: { prefix: string; roles: Role[] }[] = [
  // Admin routes — SUPER_ADMIN only
  { prefix: "/super-admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin",       roles: ["SUPER_ADMIN"] },
  { prefix: "/tenants",     roles: ["SUPER_ADMIN"] },
  // Dashboard routes — MERCHANT only
  { prefix: "/dashboard",     roles: ["MERCHANT"] },
  { prefix: "/accounts",      roles: ["MERCHANT"] },
  { prefix: "/transactions",  roles: ["MERCHANT"] },
  { prefix: "/stores",        roles: ["MERCHANT"] },
  // Shared routes — both SUPER_ADMIN and MERCHANT
  { prefix: "/settings",   roles: ["SUPER_ADMIN", "MERCHANT"] },
  { prefix: "/analytics",  roles: ["SUPER_ADMIN", "MERCHANT"] },
  { prefix: "/logs",       roles: ["SUPER_ADMIN", "MERCHANT"] },
]

// ─── Token Blacklist Cache ────────────────────────────────────────────────────
// A short-lived in-memory cache to avoid a DB query on every single request.
// When a JTI is found to be blacklisted, it stays cached (revocation is permanent
// until the JWT expires). Clean JTIs are cached for 5 seconds.

const _blacklistCache = new Map<string, { blocked: boolean; checkedAt: number }>()
const BLACKLIST_CACHE_TTL = 5_000 // 5 seconds

/**
 * Checks if a JWT's `jti` has been revoked.
 *
 * Uses Neon HTTP driver (edge-compatible) with 5-second caching:
 *   - If JTI is in cache and not expired → return cached result
 *   - Otherwise → query token_blacklist table
 *   - Cache the result
 *
 * If the DB query fails (network issue), we ALLOW the request through
 * (fail-open) to avoid locking out all users due to a transient DB issue.
 */
async function isTokenRevoked(jti: string): Promise<boolean> {
  // Check cache first
  const cached = _blacklistCache.get(jti)
  if (cached) {
    // Blocked tokens stay cached forever (they won't un-revoke)
    if (cached.blocked) return true
    // Clean tokens are re-checked after TTL
    if (Date.now() - cached.checkedAt < BLACKLIST_CACHE_TTL) return false
  }

  try {
    const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL
    if (!dbUrl) {
      // No DB URL configured — can't check, fail-open
      return false
    }

    const sql = neon(dbUrl)
    const rows = await sql`
      SELECT 1 FROM token_blacklist
      WHERE jti = ${jti}
        AND expires_at > NOW()
      LIMIT 1
    `

    const blocked = rows.length > 0

    // Cache the result
    _blacklistCache.set(jti, { blocked, checkedAt: Date.now() })

    // Periodic cache cleanup: remove stale entries every ~100 checks
    if (_blacklistCache.size > 200) {
      const now = Date.now()
      for (const [key, val] of _blacklistCache) {
        // Remove non-blocked entries older than 30 seconds
        if (!val.blocked && now - val.checkedAt > 30_000) {
          _blacklistCache.delete(key)
        }
      }
    }

    return blocked
  } catch (err) {
    // Fail-open: if DB is unreachable, don't lock out all users
    console.error("[proxy] Blacklist check failed:", err)
    return false
  }
}

// ─── Proxy ─────────────────────────────────────────────────────────────────────

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ─── SKIP: Static files, auth API, webhooks, cron, and gateway endpoints ────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/gateway") ||
    pathname.startsWith("/api/cron") ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  // ─── DECODE JWT (Edge-compatible, no DB call) ───────────────────────────────
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  const role = token?.role as Role | undefined

  // ─── LOGIN PAGE: Redirect authenticated users to their role home ────────────
  if (pathname === "/login") {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
    }
    return NextResponse.next()
  }

  // ─── PROTECTED ROUTES: Check authentication, role, and blacklist ───────────
  for (const { prefix, roles: allowedRoles } of PROTECTED_ROUTES) {
    if (pathname.startsWith(prefix)) {
      // 1. Not authenticated → redirect to /login with callbackUrl
      if (!token) {
        const loginUrl = new URL("/login", req.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
      }

      // 2. Wrong role → redirect to their own home page
      if (!role || !allowedRoles.includes(role)) {
        return NextResponse.redirect(new URL(role ? ROLE_HOME[role] : "/login", req.url))
      }

      // 3. ★ TOKEN REVOCATION CHECK ★
      // Query the token_blacklist table to see if this JWT has been revoked
      // by a Super Admin. Uses edge-compatible Neon HTTP driver with caching.
      const jti = token.jti as string | undefined
      if (jti) {
        const revoked = await isTokenRevoked(jti)
        if (revoked) {
          // Clear the session cookie and redirect to login with a message
          const loginUrl = new URL("/login", req.url)
          loginUrl.searchParams.set("error", "SessionRevoked")
          const response = NextResponse.redirect(loginUrl)

          // Delete all NextAuth session cookies to force re-login
          const cookieNames = [
            "next-auth.session-token",
            "__Secure-next-auth.session-token",
            "next-auth.csrf-token",
            "__Host-next-auth.csrf-token",
          ]
          for (const name of cookieNames) {
            response.cookies.delete(name)
          }

          return response
        }
      }

      // 4. Correct role + valid token → allow access
      return NextResponse.next()
    }
  }

  // ─── PROTECTED API ROUTES: Check blacklist for authenticated API calls ──────
  if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/merchant")) {
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check blacklist for API routes too
    const jti = token.jti as string | undefined
    if (jti) {
      const revoked = await isTokenRevoked(jti)
      if (revoked) {
        return NextResponse.json(
          { error: "Session has been revoked. Please log in again." },
          { status: 401 }
        )
      }
    }

    return NextResponse.next()
  }

  // ─── PUBLIC ROUTES: Allow all other requests ────────────────────────────────
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
