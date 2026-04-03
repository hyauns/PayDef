import { withAuth, NextRequestWithAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import type { Role } from "@/lib/auth"
import { ROLE_HOME } from "@/lib/auth"

// ─── Route-to-role access map ─────────────────────────────────────────────────
// Any route prefix listed here requires the given role.
const PROTECTED_ROUTES: { prefix: string; role: Role }[] = [
  { prefix: "/super-admin", role: "SUPER_ADMIN" },
  { prefix: "/admin",       role: "SUPER_ADMIN" },
  { prefix: "/dashboard",   role: "MERCHANT"    },
]

// Public routes that require NO authentication
const PUBLIC_PATHS = ["/login", "/api/auth", "/favicon", "/_next", "/icon", "/apple-icon"]

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // ── Unauthenticated → /login ──────────────────────────────────────────────
    if (!token) {
      const loginUrl = new URL("/login", req.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }

    const role = token.role as Role | undefined

    // ── Role-based route enforcement ──────────────────────────────────────────
    for (const { prefix, role: required } of PROTECTED_ROUTES) {
      if (pathname.startsWith(prefix)) {
        if (role !== required) {
          // Wrong role → redirect to their own home
          const home = role ? ROLE_HOME[role] : "/login"
          return NextResponse.redirect(new URL(home, req.url))
        }
        // Correct role → allow
        return NextResponse.next()
      }
    }

    // ── Authenticated user hits /login → send to role home ───────────────────
    if (pathname === "/login" && role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // Run middleware for ALL matched routes — we handle auth checks manually
      authorized: () => true,
    },
  }
)

// ─── Matcher: exclude truly static assets ────────────────────────────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
