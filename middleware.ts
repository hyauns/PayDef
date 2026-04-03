/**
 * Edge Middleware for route protection — uses JWT only, no DB imports.
 * Next.js 16 still supports middleware.ts (proxy.ts is optional).
 */
import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"

type Role = "SUPER_ADMIN" | "MERCHANT"

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT:    "/dashboard",
}

const PROTECTED_ROUTES: { prefix: string; role: Role }[] = [
  { prefix: "/super-admin", role: "SUPER_ADMIN" },
  { prefix: "/admin",       role: "SUPER_ADMIN" },
  { prefix: "/dashboard",   role: "MERCHANT"    },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow Next.js internals and auth API
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/gateway") ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  const role = token?.role as Role | undefined

  // Authenticated user at /login → redirect to their home
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
