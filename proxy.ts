// Edge-compatible middleware — ZERO Node.js-only imports (no Prisma, no bcrypt).
// Auth state is read solely from the signed JWT via next-auth/jwt getToken().
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"

// ─── Types ───────────────────────────────────────────────────────────────────
type Role = "SUPER_ADMIN" | "MERCHANT"

// ─── Role → home route ────────────────────────────────────────────────────────
const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT:    "/dashboard",
}

// ─── Protected route map ─────────────────────────────────────────────────────
const PROTECTED_ROUTES: { prefix: string; role: Role }[] = [
  { prefix: "/super-admin", role: "SUPER_ADMIN" },
  { prefix: "/admin",       role: "SUPER_ADMIN" },
  { prefix: "/dashboard",   role: "MERCHANT"    },
]

// ─── Middleware ───────────────────────────────────────────────────────────────
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow Next.js internals and the auth API
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  // Decode the JWT — returns null when unauthenticated
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  const role = token?.role as Role | undefined

  // ── Authenticated user hits /login → redirect to their home ──────────────
  if (pathname === "/login") {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
    }
    return NextResponse.next()
  }

  // ── Check protected route prefixes ────────────────────────────────────────
  for (const { prefix, role: required } of PROTECTED_ROUTES) {
    if (pathname.startsWith(prefix)) {
      if (!token) {
        // Not logged in → /login with callbackUrl
        const loginUrl = new URL("/login", req.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
      }
      if (role !== required) {
        // Wrong role → their own home
        return NextResponse.redirect(new URL(role ? ROLE_HOME[role] : "/login", req.url))
      }
      return NextResponse.next()
    }
  }

  return NextResponse.next()
}

// ─── Matcher ─────────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
}

// Next.js 16 accepts either a default export or a named "proxy" export.
// Exporting both ensures compatibility regardless of how the runtime resolves it.
export default proxy
