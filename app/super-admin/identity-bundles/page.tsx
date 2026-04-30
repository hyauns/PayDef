"use client"

import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { IdentityBundlesPageClient } from "@/components/super-admin/identity-bundles/IdentityBundlesPageClient"

export default function IdentityBundlesPage() {
  return (
    <DashboardShell>
      <main className="p-6 max-w-[1400px] mx-auto" data-ui-version="identity-bundles-page-skeleton-v1">
        <IdentityBundlesPageClient />
      </main>
    </DashboardShell>
  )
}
