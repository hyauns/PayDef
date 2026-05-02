"use client"

import useSWR from "swr"
import { DollarSign, Shield, Activity } from "lucide-react"
import { StatCard } from "./StatCard"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { dashboardCopy } from "@/lib/i18n/dashboard"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n)
}

export function GlobalMetrics() {
  const { language } = useLanguage()
  const t = dashboardCopy[language]

  const { data, isLoading } = useSWR<{
    volume: { today: number; yesterday: number; percentChange: number }
    domains: { active: number; total: number; degraded: number }
    transactions: { countToday: number }
  }>("/api/merchant/dashboard-stats", fetcher, {
    refreshInterval: 30_000, // refresh every 30s
    revalidateOnFocus: true,
  })

  // ── Volume card data ────────────────────────────────────────────────────────
  const volume = data?.volume
  const pctChange = volume?.percentChange ?? 0
  const isPositive = pctChange > 0
  const isNegative = pctChange < 0

  // ── Domains data ────────────────────────────────────────────────────────────
  const domains = data?.domains
  const hasDegraded = (domains?.degraded ?? 0) > 0

  // ── Transactions data ───────────────────────────────────────────────────────
  const txCount = data?.transactions?.countToday ?? 0

  // ── Skeleton card ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] rounded-xl p-6 flex flex-col gap-3 animate-pulse shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between">
              <div className="w-24 h-3 bg-[#2a2d39] rounded" />
              <div className="w-9 h-9 bg-[#2a2d39] rounded-xl" />
            </div>
            <div>
              <div className="h-8 w-32 bg-[#2a2d39] rounded mb-2" />
              <div className="h-3 w-40 bg-[#2a2d39] rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <StatCard
        label={t.totalVolumeToday}
        value={formatCurrency(volume?.today ?? 0)}
        helper={pctChange === 0 ? t.noChangeFromYesterday : `${Math.abs(pctChange)}% ${t.fromYesterday}`}
        icon={DollarSign}
        trend={isPositive ? "up" : isNegative ? "down" : "neutral"}
        active
      />
      <StatCard
        label={t.activeShieldDomains}
        value={`${domains?.active ?? 0} / ${domains?.total ?? 0}`}
        helper={hasDegraded ? `${domains?.degraded} ${t.domainsDegraded}` : t.allDomainsHealthy}
        icon={Shield}
        trend={hasDegraded ? "down" : "up"}
      />
      <StatCard
        label={t.transactionsToday}
        value={txCount.toLocaleString()}
        helper={txCount > 0 ? t.processingNormally : t.noTransactionsYetToday}
        icon={Activity}
        trend={txCount > 0 ? "up" : "neutral"}
      />
    </div>
  )
}
