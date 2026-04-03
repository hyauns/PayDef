/**
 * NextAuth API route — rebuilt fresh to bust stale Turbopack cache.
 * Imports from lib/auth-config.ts (NOT lib/auth.ts or lib/db.ts).
 */
import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth-config"

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
