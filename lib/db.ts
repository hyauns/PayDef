import { PrismaClient } from "@prisma/client"

// Prevent multiple PrismaClient instances in development (hot-reload)
declare global {
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined
}

export const db: PrismaClient =
  globalThis._prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalThis._prisma = db
}
