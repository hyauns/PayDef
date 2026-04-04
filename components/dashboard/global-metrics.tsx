"use client"

import useSWR from "swr"
import { DollarSign, Shield, Activity, TrendingUp, TrendingDown, Minus } from "lucide-react"

const fetcher = (url: string) => fetch(url).then(r => {
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
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus

  // ── Domains data ────────────────────────────────────────────────────────────
  const domains = data?.domains
  const hasDegraded = (domains?.degraded ?? 0) > 0

  // ── Transactions data ───────────────────────────────────────────────────────
  const txCount = data?.transactions?.countToday ?? 0

  // ── Skeleton card ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-secondary rounded-md" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-28 bg-secondary rounded" />
                <div className="h-7 w-32 bg-secondary rounded" />
                <div className="h-3 w-24 bg-secondary rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const metrics = [
    {
      label: "Total Volume Today",
      value: formatCurrency(volume?.today ?? 0),
      sub: pctChange === 0
        ? "No change from yesterday"
        : `${isPositive ? "+" : ""}${pctChange}% from yesterday`,
      subColor: isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-muted-foreground",
      icon: DollarSign,
      trendIcon: TrendIcon,
      iconColor: "text-cyan-400",
      iconBg: "bg-cyan-400/10",
      border: "border-cyan-400/20",
    },
    {
      label: "Active Shield Domains",
      value: `${domains?.active ?? 0} / ${domains?.total ?? 0}`,
      sub: hasDegraded
        ? `${domains?.degraded} domain${(domains?.degraded ?? 0) > 1 ? "s" : ""} degraded`
        : "All domains healthy",
      subColor: hasDegraded ? "text-amber-400" : "text-emerald-400",
      icon: Shield,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-400/10",
      border: "border-emerald-400/20",
    },
    {
      label: "Transactions Today",
      value: txCount.toLocaleString(),
      sub: txCount > 0 ? "Processing normally" : "No transactions yet today",
      subColor: txCount > 0 ? "text-emerald-400" : "text-muted-foreground",
      icon: Activity,
      iconColor: "text-emerald-400",
      iconBg: "bg-emerald-400/10",
      border: "border-emerald-400/20",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <div
            key={m.label}
            className={`bg-card border ${m.border} rounded-lg p-4 flex items-start gap-4`}
          >
            <div className={`${m.iconBg} rounded-md p-2.5 mt-0.5 shrink-0`}>
              <Icon className={`w-4 h-4 ${m.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-1">
                {m.label}
              </p>
              <p className="text-2xl font-mono font-semibold text-foreground leading-none mb-1">
                {m.value}
              </p>
              <div className="flex items-center gap-1">
                {m.trendIcon && <m.trendIcon className={`w-3 h-3 ${m.subColor}`} />}
                <p className={`text-xs font-mono ${m.subColor}`}>{m.sub}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
