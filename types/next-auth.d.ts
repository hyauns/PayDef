import { DefaultSession, DefaultJWT } from "next-auth"
import type { Role } from "@/lib/auth"

// ─── Augment the built-in NextAuth Session + JWT types ────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      /** Database UUID of the authenticated user */
      userId: string
      /** Role — SUPER_ADMIN or MERCHANT */
      role: Role
      /** Tenant UUID (undefined for SUPER_ADMIN) */
      tenantId?: string
    } & DefaultSession["user"]
  }

  interface User {
    role: Role
    tenantId?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId:   string
    role:     Role
    tenantId?: string
  }
}
