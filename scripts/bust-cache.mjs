import { rmSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"

const root = process.cwd()

// 1. Clear Turbopack cache
const nextDir = join(root, ".next")
if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true })
  console.log("[v0] Deleted .next cache directory.")
} else {
  console.log("[v0] No .next directory found.")
}

// 2. Restore app/page.tsx (was deleted — must exist for Next.js root route)
const pagePath = join(root, "app/page.tsx")
const pageContent = `"use client"

import { DashboardHeader } from "@/components/dashboard/header"
import { GlobalMetrics } from "@/components/dashboard/global-metrics"
import { MerchantAccounts } from "@/components/dashboard/merchant-accounts"
import { ConnectedStores } from "@/components/dashboard/connected-stores"
import { TransactionFeed } from "@/components/dashboard/transaction-feed"
import { ShieldDomains } from "@/components/dashboard/shield-domains"
import { RotationLogic } from "@/components/dashboard/rotation-logic"

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">
        <GlobalMetrics />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
          <RotationLogic />
          <div className="xl:row-span-2">
            <TransactionFeed />
          </div>
        </div>
        <MerchantAccounts />
        <ConnectedStores />
        <ShieldDomains />
      </main>
    </div>
  )
}
`
mkdirSync(dirname(pagePath), { recursive: true })
writeFileSync(pagePath, pageContent, "utf8")
console.log("[v0] Restored app/page.tsx — imports TransactionFeed, no LiveFeed reference.")

// 3. Restore app/super-admin/page.tsx (was deleted — must exist)
const superAdminPath = join(root, "app/super-admin/page.tsx")
const superAdminExists = existsSync(superAdminPath)
if (!superAdminExists) {
  // Write a minimal placeholder so the route doesn't 404
  const placeholder = `"use client"
// SuperAdminDashboard — restored placeholder
import { DashboardHeader } from "@/components/dashboard/header"
export default function SuperAdminPage() {
  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-6 py-8">
        <h1 className="text-xl font-semibold text-foreground">Super Admin</h1>
        <p className="text-muted-foreground text-sm mt-2">Dashboard loading...</p>
      </main>
    </div>
  )
}
`
  mkdirSync(dirname(superAdminPath), { recursive: true })
  writeFileSync(superAdminPath, placeholder, "utf8")
  console.log("[v0] Restored app/super-admin/page.tsx as placeholder.")
} else {
  console.log("[v0] app/super-admin/page.tsx already exists — skipping.")
}

console.log("[v0] All done. Restart the dev server to pick up changes.")
