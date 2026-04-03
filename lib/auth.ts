import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

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

        // Lookup user by email
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        })

        if (!user) {
          // Constant-time rejection: run bcrypt even on miss
          await bcrypt.compare(credentials.password, "$2a$12$placeholder.hash.for.timing")
          throw new Error("Invalid email or password.")
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!passwordValid) {
          throw new Error("Invalid email or password.")
        }

        // Return the minimal user object that NextAuth serialises into the JWT
        return {
          id:       user.id,
          email:    user.email,
          role:     user.role as Role,
          tenantId: user.tenantId ?? undefined,
        }
      },
    }),
  ],

  callbacks: {
    // Persist role + userId inside the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.userId   = user.id
        token.role     = (user as any).role as Role
        token.tenantId = (user as any).tenantId as string | undefined
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
