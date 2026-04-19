/**
 * Route Protection Proxy (Next.js 16 Node.js Runtime)
 *
 * Handles:
 *  1. Shield-domain host routing for storefront facade pages
 *  2. Authentication and role-based access control for dashboard routes
 *  3. Token revocation checks against token_blacklist
 */
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"

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

const _blacklistCache = new Map<string, { blocked: boolean; checkedAt: number }>()
const BLACKLIST_CACHE_TTL = 5_000

const _shieldDomainCache = {
  hosts: new Set<string>(),
  checkedAt: 0,
}
const SHIELD_DOMAIN_CACHE_TTL = 60_000

function getDatabaseUrl() {
  return process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL ?? null
}

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
      "paydef.io",
      "www.paydef.io",
    ].filter(Boolean)
  )
}

async function getActiveShieldHosts() {
  const now = Date.now()
  if (now - _shieldDomainCache.checkedAt < SHIELD_DOMAIN_CACHE_TTL && _shieldDomainCache.hosts.size > 0) {
    return _shieldDomainCache.hosts
  }

  const dbUrl = getDatabaseUrl()
  if (!dbUrl) {
    return _shieldDomainCache.hosts
  }

  try {
    const sql = neon(dbUrl)
    const rows = (await sql`
      SELECT domain
      FROM shield_domains
      WHERE is_active = true
    `) as { domain: string }[]

    const hosts = new Set(rows.map((row) => normalizeHost(row.domain)).filter(Boolean))
    _shieldDomainCache.hosts = hosts
    _shieldDomainCache.checkedAt = now
    return hosts
  } catch (error) {
    console.error("[proxy] Shield domain lookup failed:", error)
    return _shieldDomainCache.hosts
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

  try {
    const dbUrl = getDatabaseUrl()
    if (!dbUrl) {
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
    console.error("[proxy] Blacklist check failed:", error)
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

export async function proxy(req: NextRequest) {
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
