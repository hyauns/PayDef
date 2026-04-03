import { DashboardHeader } from "@/components/dashboard/header"
import { GlobalMetrics } from "@/components/dashboard/global-metrics"
import { MerchantAccounts } from "@/components/dashboard/merchant-accounts"
import { ConnectedStores } from "@/components/dashboard/connected-stores"
import { LiveFeed } from "@/components/dashboard/live-feed"
import { ShieldDomains } from "@/components/dashboard/shield-domains"
import { RotationLogic } from "@/components/dashboard/rotation-logic"

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">
        {/* Global Metrics */}
        <GlobalMetrics />

        {/* Rotation Logic + Live Feed — side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
          <RotationLogic />
          <div className="xl:row-span-2">
            <LiveFeed />
          </div>
        </div>

        {/* Merchant Accounts Rotator */}
        <MerchantAccounts />

        {/* Connected Stores */}
        <ConnectedStores />

        {/* Shield Domain Health */}
        <ShieldDomains />
      </main>
    </div>
  )
}
