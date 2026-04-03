import os, shutil

root = "/vercel/share/v0-project"

# 1. Clear Turbopack / Next.js build cache
next_dir = os.path.join(root, ".next")
if os.path.exists(next_dir):
    shutil.rmtree(next_dir, ignore_errors=True)
    print("[v0] Deleted .next cache directory.")
else:
    print("[v0] No .next directory — nothing to clear.")

# 2. Restore app/page.tsx
page_path = os.path.join(root, "app/page.tsx")
page_content = '''"use client"

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
'''
os.makedirs(os.path.dirname(page_path), exist_ok=True)
with open(page_path, "w") as f:
    f.write(page_content)
print("[v0] Restored app/page.tsx (uses TransactionFeed, no LiveFeed).")

# 3. Restore app/super-admin/page.tsx if missing
super_path = os.path.join(root, "app/super-admin/page.tsx")
if not os.path.exists(super_path):
    placeholder = '''"use client"
import { Fragment, useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
export default function SuperAdminPage() {
  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-6 py-8">
        <h1 className="text-xl font-semibold text-foreground">Super Admin</h1>
        <p className="text-sm text-muted-foreground mt-2">Restored — rebuilding full page next.</p>
      </main>
    </div>
  )
}
'''
    os.makedirs(os.path.dirname(super_path), exist_ok=True)
    with open(super_path, "w") as f:
        f.write(placeholder)
    print("[v0] Restored app/super-admin/page.tsx.")
else:
    print("[v0] app/super-admin/page.tsx already exists.")

print("[v0] Done.")
