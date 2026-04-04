import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { randomUUID } from "crypto"
import { getSql, type UserRow } from "@/lib/neon"

// ─── Role constants (mirrors Prisma enum) ─────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MERCHANT: "MERCHANT",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// ─── Role → home route mapping ────────────────────────────────────────────────
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  MERCHANT: "/dashboard",
}

// ─── NextAuth options ─────────────────────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required.")
        }

        // Lookup user by email using raw SQL (no Prisma generated client needed)
        const email = credentials.email.toLowerCase().trim()
        const sql = getSql()
        const rows = (await sql`
          SELECT id, email, password_hash, role, tenant_id
          FROM   users
          WHERE  email = ${email}
          LIMIT  1
        `) as unknown as UserRow[]
        const user = rows[0] ?? null

        if (!user) {
          // Constant-time rejection: run bcrypt even on miss to prevent timing attacks
          await bcrypt.compare(credentials.password, "$2a$12$placeholderHashForTimingSafety00")
          throw new Error("Invalid email or password.")
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!passwordValid) {
          throw new Error("Invalid email or password.")
        }

        // Return the minimal object NextAuth serialises into the JWT
        return {
          id:       user.id,
          email:    user.email,
          role:     user.role as Role,
          tenantId: user.tenant_id ?? undefined,
        }
      },
    }),
  ],

  callbacks: {
    // Persist role + userId + jti inside the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.userId   = user.id
        token.role     = (user as any).role as Role
        token.tenantId = (user as any).tenantId as string | undefined
        // Generate a unique token identifier for session tracking & revocation
        token.jti      = randomUUID()

        // Log login event to system_logs (best-effort, non-blocking)
        try {
          const sql = getSql()
          await sql`
            INSERT INTO system_logs (action, status, level, metadata, tenant_id)
            VALUES (
              'USER_LOGIN',
              'OK',
              'info',
              ${JSON.stringify({
                userId: user.id,
                email: user.email,
                role: (user as any).role,
                jti: token.jti,
              })}::jsonb,
              ${(user as any).tenantId ?? null}
            )
          `
        } catch {
          // Non-critical: don't block login if audit logging fails
        }
      }
      return token
    },

    // Expose role + userId on the client-side session object
    async session({ session, token }) {
      if (token) {
        session.user.userId   = token.userId   as string
        session.user.role     = token.role     as Role
        session.user.tenantId = token.tenantId as string | undefined
      }
      return session
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
}
