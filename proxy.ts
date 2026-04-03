/**
 * Next.js 16 Proxy (previously middleware) — Edge-compatible JWT-only auth guard.
 * Exports both `proxy` (named) and `default` for maximum compatibility.
 */
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"

type Role = "SUPER_ADMIN" | "MERCHANT"

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT:    "/",
}

const PROTECTED_ROUTES: { prefix: string; role: Role }[] = [
  { prefix: "/super-admin", role: "SUPER_ADMIN" },
  { prefix: "/admin",       role: "SUPER_ADMIN" },
]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow static assets, API auth routes, and webhook endpoints
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/gateway") ||
    pathname.startsWith("/_next") ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  const role = token?.role as Role | undefined

  // Authenticated user on /login → redirect to role home
  if (pathname === "/login") {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
    }
    return NextResponse.next()
  }

  // Check protected route prefixes
  for (const { prefix, role: required } of PROTECTED_ROUTES) {
    if (pathname.startsWith(prefix)) {
      if (!token) {
        const loginUrl = new URL("/login", req.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
      }
      if (role !== required) {
        return NextResponse.redirect(new URL(role ? ROLE_HOME[role] : "/login", req.url))
      }
      return NextResponse.next()
    }
  }

  return NextResponse.next()
}

// Default export for Next.js 16 compatibility
export default proxy

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
