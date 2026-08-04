/**
 * Route Protection Proxy (Next.js 16 Node.js Runtime)
 *
 * Handles:
 *  1. Shield-domain host routing for storefront facade pages
 *  2. Authentication and role-based access control for dashboard routes
 *  3. Token revocation checks against token_blacklist
 *
 * RELIABILITY:
 *  - All DB calls use a shared neon() instance (not recreated per call).
 *  - All DB calls have a 3-second AbortSignal timeout.
 *  - All DB calls fail-open on transient errors (ETIMEDOUT, fetch failed).
 *  - Shield domains use a 5-minute cache with stale-while-revalidate.
 *  - Blacklist uses a 30-second cache with stale-while-revalidate.
 */
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

type Role = "SUPER_ADMIN" | "MERCHANT"

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT: "/dashboard",
}

const PROTECTED_ROUTES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/super-admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/tenants", roles: ["SUPER_ADMIN"] },
  { prefix: "/dashboard", roles: ["MERCHANT"] },
  { prefix: "/accounts", roles: ["MERCHANT"] },
  { prefix: "/transactions", roles: ["SUPER_ADMIN", "MERCHANT"] },
  { prefix: "/stores", roles: ["MERCHANT"] },
  { prefix: "/settings", roles: ["SUPER_ADMIN", "MERCHANT"] },
  { prefix: "/analytics", roles: ["SUPER_ADMIN", "MERCHANT"] },
  { prefix: "/logs", roles: ["SUPER_ADMIN", "MERCHANT"] },
  { prefix: "/domains", roles: ["SUPER_ADMIN", "MERCHANT"] },
]

const SHIELD_ROUTE_MAP = new Map<string, string>([
  ["/", "/shield-storefront"],
  ["/products", "/shield-storefront/products"],
  ["/about", "/shield-storefront/about"],
  ["/contact", "/shield-storefront/contact"],
  ["/privacy-policy", "/shield-storefront/privacy-policy"],
  ["/terms-of-service", "/shield-storefront/terms-of-service"],
  ["/refund-policy", "/shield-storefront/refund-policy"],
  ["/shipping-policy", "/shield-storefront/shipping-policy"],
  ["/faq", "/shield-storefront/faq"],
])

const SHIELD_PASSTHROUGH_PREFIXES = [
  "/checkout/popup",
  "/order/success",
  "/order/cancel",
  "/api/gateway",
  "/api/webhook",
  "/api/health/shield-popup",
]

const SHIELD_BLOCKED_PREFIXES = [
  "/login",
  "/request-access",
  "/dashboard",
  "/accounts",
  "/stores",
  "/transactions",
  "/analytics",
  "/logs",
  "/settings",
  "/domains",
  "/super-admin",
  "/admin",
  "/tenants",
  "/docs",
  "/privacy",
  "/terms",
]

const SHIELD_BLOCKED_API_PREFIXES = ["/api/auth", "/api/admin", "/api/merchant"]

const STATIC_FILE_PATTERN = /\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?|txt|xml)$/i

// ─── Shared neon() instance for middleware ──────────────────────────────────────
// Reuse a single neon() instance instead of creating one per DB call.
// This avoids connection churn that triggers ETIMEDOUT on Coolify/Docker.
let _middlewareSql: NeonQueryFunction<false, false> | null = null

function getMiddlewareSql(): NeonQueryFunction<false, false> | null {
  if (_middlewareSql) return _middlewareSql
  const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL ?? null
  if (!dbUrl) return null
  _middlewareSql = neon(dbUrl)
  return _middlewareSql
}

// ─── DB query timeout ───────────────────────────────────────────────────────────
// Middleware DB queries must never block longer than 3 seconds.
const MIDDLEWARE_DB_TIMEOUT_MS = 3_000

// ─── Blacklist cache (fail-open, stale-while-revalidate) ─────────────────────
const _blacklistCache = new Map<string, { blocked: boolean; checkedAt: number }>()
const BLACKLIST_CACHE_TTL = 30_000  // 30s — was 5s, raised to reduce connection churn

// ─── Shield domain cache (fail-open, stale-while-revalidate) ─────────────────
const _shieldDomainCache = {
  hosts: new Set<string>(),
  checkedAt: 0,
  refreshing: false,
}
const SHIELD_DOMAIN_CACHE_TTL = 5 * 60_000  // 5 minutes — was 60s

function normalizeHost(host: string | null) {
  return host?.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "") ?? ""
}

function extractHostFromUrl(url: string | undefined) {
  if (!url) return ""
  try {
    return normalizeHost(new URL(url).host)
  } catch {
    return ""
  }
}

function getPrimaryHosts() {
  return new Set(
    [
      extractHostFromUrl(process.env.NEXTAUTH_URL),
      extractHostFromUrl(process.env.NEXT_PUBLIC_APP_URL),
      extractHostFromUrl(process.env.APP_BASE_URL),
      normalizeHost(process.env.PRIMARY_APP_HOST ?? null),
    ].filter(Boolean)
  )
}

async function getActiveShieldHosts() {
  const now = Date.now()

  // Serve from cache if fresh
  if (now - _shieldDomainCache.checkedAt < SHIELD_DOMAIN_CACHE_TTL && _shieldDomainCache.hosts.size > 0) {
    return _shieldDomainCache.hosts
  }

  // Prevent concurrent refresh storms
  if (_shieldDomainCache.refreshing) {
    return _shieldDomainCache.hosts
  }

  const sql = getMiddlewareSql()
  if (!sql) {
    return _shieldDomainCache.hosts
  }

  _shieldDomainCache.refreshing = true
  try {
    const rows = (await sql.query(
      "SELECT domain FROM shield_domains WHERE is_active = true",
      [],
      { fetchOptions: { signal: AbortSignal.timeout(MIDDLEWARE_DB_TIMEOUT_MS) } }
    )) as { domain: string }[]

    const hosts = new Set(rows.map((row) => normalizeHost(row.domain)).filter(Boolean))
    _shieldDomainCache.hosts = hosts
    _shieldDomainCache.checkedAt = now
    return hosts
  } catch (error) {
    // Fail-open: use stale cache, log warning (not error) for transient failures
    const msg = error instanceof Error ? error.message : String(error)
    if (/fetch failed|ETIMEDOUT|ECONNRESET|timeout/i.test(msg)) {
      console.warn(`[proxy] Shield domain refresh failed (transient, using stale cache): ${msg}`)
    } else {
      console.error("[proxy] Shield domain lookup failed:", error)
    }
    return _shieldDomainCache.hosts
  } finally {
    _shieldDomainCache.refreshing = false
  }
}

async function isShieldDomainHost(host: string) {
  if (!host || getPrimaryHosts().has(host)) {
    return false
  }

  const hosts = await getActiveShieldHosts()
  return hosts.has(host)
}

async function isTokenRevoked(jti: string): Promise<boolean> {
  const cached = _blacklistCache.get(jti)
  if (cached) {
    if (cached.blocked) return true
    if (Date.now() - cached.checkedAt < BLACKLIST_CACHE_TTL) return false
  }

  const sql = getMiddlewareSql()
  if (!sql) {
    // No DB URL configured — fail-open (allow request)
    return false
  }

  try {
    const rows = await sql.query(
      "SELECT 1 FROM token_blacklist WHERE jti = $1 AND expires_at > NOW() LIMIT 1",
      [jti],
      { fetchOptions: { signal: AbortSignal.timeout(MIDDLEWARE_DB_TIMEOUT_MS) } }
    )

    const blocked = rows.length > 0
    _blacklistCache.set(jti, { blocked, checkedAt: Date.now() })

    if (_blacklistCache.size > 200) {
      const now = Date.now()
      for (const [key, val] of _blacklistCache) {
        if (!val.blocked && now - val.checkedAt > 30_000) {
          _blacklistCache.delete(key)
        }
      }
    }

    return blocked
  } catch (error) {
    // Fail-open: if DB is unreachable, allow the request through
    const msg = error instanceof Error ? error.message : String(error)
    if (/fetch failed|ETIMEDOUT|ECONNRESET|timeout/i.test(msg)) {
      console.warn(`[proxy] Blacklist check failed (transient, fail-open): ${msg}`)
    } else {
      console.error("[proxy] Blacklist check failed:", error)
    }
    return false
  }
}

function rewriteToShieldStorefront(req: NextRequest, pathname: string) {
  const targetPath = SHIELD_ROUTE_MAP.get(pathname)
  if (!targetPath) {
    return null
  }

  const url = req.nextUrl.clone()
  url.pathname = targetPath
  return NextResponse.rewrite(url)
}

function redirectShieldToHome(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = "/"
  url.search = ""
  return NextResponse.redirect(url)
}

function blockShieldApiAccess() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const host = normalizeHost(req.headers.get("x-forwarded-host") ?? req.headers.get("host"))

  if (pathname.startsWith("/_next") || STATIC_FILE_PATTERN.test(pathname)) {
    return NextResponse.next()
  }

  if (await isShieldDomainHost(host)) {
    if (
      SHIELD_PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
      pathname.startsWith("/shield-storefront")
    ) {
      return NextResponse.next()
    }

    if (SHIELD_BLOCKED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return blockShieldApiAccess()
    }

    if (SHIELD_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return redirectShieldToHome(req)
    }

    const rewritten = rewriteToShieldStorefront(req, pathname)
    if (rewritten) {
      return rewritten
    }

    return redirectShieldToHome(req)
  }

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/gateway") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  const role = token?.role as Role | undefined

  if (pathname === "/shield-storefront" || pathname.startsWith("/shield-storefront/")) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  if (pathname === "/login") {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
    }
    return NextResponse.next()
  }

  for (const { prefix, roles: allowedRoles } of PROTECTED_ROUTES) {
    if (pathname.startsWith(prefix)) {
      if (!token) {
        const loginUrl = new URL("/login", req.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
      }

      if (!role || !allowedRoles.includes(role)) {
        return NextResponse.redirect(new URL(role ? ROLE_HOME[role] : "/login", req.url))
      }

      const jti = token.jti as string | undefined
      if (jti) {
        const revoked = await isTokenRevoked(jti)
        if (revoked) {
          const loginUrl = new URL("/login", req.url)
          loginUrl.searchParams.set("error", "SessionRevoked")
          const response = NextResponse.redirect(loginUrl)

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

      return NextResponse.next()
    }
  }

  if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/merchant")) {
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
