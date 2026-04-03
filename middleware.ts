/**
 * Route Protection Middleware (Vercel Edge Runtime)
 * 
 * Handles authentication and role-based access control for all protected routes.
 * Uses NextAuth JWT tokens decoded at the edge — no database calls required.
 */
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"

type Role = "SUPER_ADMIN" | "MERCHANT"

// Default landing page for each role
const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT:    "/",
}

/**
 * Protected route definitions:
 * - prefix: URL path prefix to match
 * - role: Required role to access routes under this prefix
 */
const PROTECTED_ROUTES: { prefix: string; role: Role }[] = [
  // Admin routes — SUPER_ADMIN only
  { prefix: "/super-admin", role: "SUPER_ADMIN" },
  { prefix: "/admin",       role: "SUPER_ADMIN" },
  // Dashboard routes — MERCHANT only (SUPER_ADMIN redirected to /super-admin)
  { prefix: "/dashboard",   role: "MERCHANT" },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ─── SKIP: Static files, auth API, webhooks, and gateway endpoints ──────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/gateway") ||
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

  // ─── PROTECTED ROUTES: Check authentication and role permissions ───────────
  for (const { prefix, role: requiredRole } of PROTECTED_ROUTES) {
    if (pathname.startsWith(prefix)) {
      // 1. Not authenticated → redirect to /login with callbackUrl
      if (!token) {
        const loginUrl = new URL("/login", req.url)
        loginUrl.searchParams.set("callbackUrl", pathname)
        return NextResponse.redirect(loginUrl)
      }

      // 2. Wrong role → redirect to their own home page
      //    - MERCHANT trying to access /super-admin/* → redirect to /
      //    - SUPER_ADMIN trying to access /dashboard/* → redirect to /super-admin
      if (role !== requiredRole) {
        return NextResponse.redirect(new URL(role ? ROLE_HOME[role] : "/login", req.url))
      }

      // 3. Correct role → allow access
      return NextResponse.next()
    }
  }

  // ─── PUBLIC ROUTES: Allow all other requests ────────────────────────────────
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
