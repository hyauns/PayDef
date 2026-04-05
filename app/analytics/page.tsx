"use client"

import { useState } from "react"
import useSWR from "swr"
import { TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle, BarChart2 } from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = "24h" | "7d" | "30d"

interface AnalyticsResponse {
  range: string
  summary: {
    totalRevenue: number
    totalTransactions: number
    completedCount: number
    failedCount: number
    refundedCount: number
    disputedCount: number
    successRate: number
    refundRate: number
    disputeRate: number
    avgTransaction: number
    gatewayFees: number
    activeAccounts: number
    totalAccounts: number
  }
  timeSeries: { label: string; revenue: number; transactions: number }[]
  merchantData: { name: string; volume: number; txCount: number }[]
  storeData: { name: string; value: number }[]
}

interface TooltipDatum {
  value?: number
  name?: string
  payload?: {
    fill?: string
  }
}

interface ChartTooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipDatum[]
}

// ─── SWR Fetcher ──────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

// Colors — passed as JS values, not CSS vars (recharts requirement)
const PIE_COLORS = ["#22d3ee", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c", "#60a5fa"]
const CYAN   = "#22d3ee"
const EMERALD = "#34d399"

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtK(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
}

function fmtFull(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0 })}`
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, trend, trendUp, accent,
}: {
  label: string
  value: string
  sub?: string
  trend?: string
  trendUp?: boolean
  accent?: string
}) {
  return (
    <div className={`bg-card border rounded-lg p-4 flex flex-col gap-2 ${accent ?? "border-border"}`}>
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs font-mono text-muted-foreground">{sub}</p>}
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-mono ${trendUp ? "text-emerald-400" : "text-red-400"}`}>
          {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {trend}
        </div>
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <div className="text-cyan-400">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {sub && <p className="text-[10px] font-mono text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="text-cyan-400">Revenue: {fmtFull(payload[0]?.value ?? 0)}</p>
      <p className="text-emerald-400">Txns: {payload[1]?.value ?? 0}</p>
    </div>
  )
}

function BarTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-foreground font-semibold mb-1">{label}</p>
      <p className="text-cyan-400">Volume: {fmtFull(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

function PieTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const firstItem = payload[0]

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-foreground font-semibold">{firstItem?.name ?? "Unknown"}</p>
      <p style={{ color: firstItem?.payload?.fill ?? "inherit" }}>{fmtFull(firstItem?.value ?? 0)}</p>
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3 animate-pulse">
      <div className="h-3 w-20 bg-secondary rounded" />
      <div className="h-7 w-24 bg-secondary rounded" />
      <div className="h-3 w-32 bg-secondary rounded" />
    </div>
  )
}

function SkeletonChart({ height = 280 }: { height?: number }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-4 w-4 bg-secondary rounded" />
        <div className="h-4 w-40 bg-secondary rounded" />
      </div>
      <div className="p-4" style={{ height }}><div className="w-full h-full bg-secondary/30 rounded" /></div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("7d")

  const { data, error, isLoading } = useSWR<AnalyticsResponse>(
    `/api/merchant/analytics?range=${range}`,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  )

  const RANGES: { key: Range; label: string }[] = [
    { key: "24h", label: "Last 24h" },
    { key: "7d",  label: "7 Days"   },
    { key: "30d", label: "30 Days"  },
  ]

  const s = data?.summary
  const timeSeries    = data?.timeSeries ?? []
  const merchantData  = data?.merchantData ?? []
  const storeData     = data?.storeData ?? []
  const storeTotal    = storeData.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              Performance overview across all stores and merchant accounts
            </p>
          </div>

          {/* Date-range picker */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                  range === r.key
                    ? "bg-cyan-400/10 text-cyan-400 border border-cyan-400/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error State ──────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 bg-red-400/5 border border-red-400/20 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono">
              <span className="text-red-400 font-semibold">Failed to load analytics data.</span>
              <span className="text-muted-foreground"> Please check your connection and try again.</span>
            </div>
          </div>
        )}

        {/* ── Performance Metric Cards ─────────────────────────────────────── */}
        {isLoading || !s ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <MetricCard
              label="Total Revenue"
              value={fmtK(s.totalRevenue)}
              sub={`${s.totalTransactions.toLocaleString()} transactions`}
              accent="border-cyan-400/30"
            />
            <MetricCard
              label="Success Rate"
              value={`${s.successRate}%`}
              sub={`${s.completedCount} completed`}
              trend={s.successRate >= 95 ? "Healthy" : "Below target"}
              trendUp={s.successRate >= 95}
              accent="border-emerald-400/30"
            />
            <MetricCard
              label="Avg Transaction"
              value={`$${s.avgTransaction.toFixed(2)}`}
              sub={`${s.totalTransactions} total`}
            />
            <MetricCard
              label="Dispute Rate"
              value={`${s.disputeRate}%`}
              sub={`${s.disputedCount} disputes`}
              trend={s.disputeRate <= 0.5 ? "Within threshold" : "Elevated"}
              trendUp={s.disputeRate <= 0.5}
              accent={s.disputeRate <= 0.5 ? "border-emerald-400/20" : "border-red-400/20"}
            />
            <MetricCard
              label="Refund Rate"
              value={`${s.refundRate}%`}
              sub={`${s.refundedCount} refunded`}
              trend={s.refundRate <= 2 ? "Normal" : "Elevated"}
              trendUp={s.refundRate <= 2}
              accent="border-amber-400/20"
            />
            <MetricCard
              label="Active Accounts"
              value={`${s.activeAccounts} / ${s.totalAccounts}`}
              sub={`${s.totalAccounts - s.activeAccounts} paused or warm-up`}
              accent="border-border"
            />
          </div>
        )}

        {/* ── Revenue Area Chart ───────────────────────────────────────────── */}
        {isLoading ? (
          <SkeletonChart />
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <SectionHeader
              icon={<Activity className="w-4 h-4" />}
              title="Revenue vs. Time"
              sub={`Showing ${range === "24h" ? "hourly" : "daily"} breakdown`}
            />
            <div className="p-4">
              {timeSeries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <BarChart2 className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-mono">No transaction data for this period</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={timeSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={CYAN}    stopOpacity={0.25} />
                          <stop offset="95%" stopColor={CYAN}    stopOpacity={0}    />
                        </linearGradient>
                        <linearGradient id="txnGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={EMERALD} stopOpacity={0.2}  />
                          <stop offset="95%" stopColor={EMERALD} stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="rev"
                        tickFormatter={fmtK}
                        tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <YAxis
                        yAxisId="txn"
                        orientation="right"
                        tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip content={<RevenueTooltip />} />
                      <Area
                        yAxisId="rev"
                        type="monotone"
                        dataKey="revenue"
                        stroke={CYAN}
                        strokeWidth={2}
                        fill="url(#revenueGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: CYAN }}
                      />
                      <Area
                        yAxisId="txn"
                        type="monotone"
                        dataKey="transactions"
                        stroke={EMERALD}
                        strokeWidth={1.5}
                        fill="url(#txnGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: EMERALD }}
                        strokeDasharray="4 2"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-6 mt-2 pl-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-0.5 bg-cyan-400 inline-block rounded" />
                      <span className="text-[10px] font-mono text-muted-foreground">Revenue (USD)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-0.5 bg-emerald-400 inline-block rounded border-dashed" />
                      <span className="text-[10px] font-mono text-muted-foreground">Transactions</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Distribution Charts Row ───────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SkeletonChart height={300} />
            <SkeletonChart height={300} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Volume per Merchant — Bar Chart */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <SectionHeader
                icon={<BarChart2 className="w-4 h-4" />}
                title="Volume per Merchant Account"
                sub="Total USD processed by each PayPal account"
              />
              <div className="p-4">
                {merchantData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <BarChart2 className="w-6 h-6 opacity-30" />
                    <p className="text-xs font-mono">No merchant volume data</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={merchantData}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                        barCategoryGap="30%"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#71717a", fontSize: 9, fontFamily: "monospace" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={fmtK}
                          tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
                          axisLine={false}
                          tickLine={false}
                          width={48}
                        />
                        <Tooltip content={<BarTooltip />} />
                        <Bar dataKey="volume" radius={[3, 3, 0, 0]}>
                          {merchantData.map((entry) => {
                            const maxVol = Math.max(...merchantData.map((d) => d.volume))
                            const isTop = entry.volume === maxVol && entry.volume > 0
                            return (
                              <Cell
                                key={entry.name}
                                fill={isTop ? CYAN : "#22d3ee44"}
                              />
                            )
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 space-y-1.5">
                      {[...merchantData]
                        .sort((a, b) => b.volume - a.volume)
                        .slice(0, 3)
                        .map((m, i) => (
                          <div key={m.name} className="flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground w-4">#{i + 1}</span>
                              <span className="text-foreground">{m.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">{m.txCount} txns</span>
                              <span className="text-cyan-400 font-semibold">{fmtFull(m.volume)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Volume per Store — Pie Chart */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <SectionHeader
                icon={<DollarSign className="w-4 h-4" />}
                title="Volume per Store"
                sub="Share of total gateway traffic by client store"
              />
              <div className="p-4">
                {storeData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <DollarSign className="w-6 h-6 opacity-30" />
                    <p className="text-xs font-mono">No store volume data</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie
                          data={storeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {storeData.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                              opacity={0.85}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2 min-w-0">
                      {[...storeData]
                        .sort((a, b) => b.value - a.value)
                        .map((store, i) => {
                          const pct = storeTotal > 0 ? ((store.value / storeTotal) * 100).toFixed(1) : "0.0"
                          return (
                            <div key={store.name} className="flex items-center justify-between gap-2 text-xs font-mono">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                                />
                                <span className="text-foreground truncate">{store.name}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-muted-foreground">{pct}%</span>
                                <span className="text-foreground">{fmtK(store.value)}</span>
                              </div>
                            </div>
                          )
                        })}
                      <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Total</span>
                        <span className="text-foreground font-semibold">{fmtFull(storeTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Top merchant alert (only if data loaded and there are merchants) ── */}
        {!isLoading && merchantData.length > 0 && (() => {
          const totalVol = merchantData.reduce((s, d) => s + d.volume, 0)
          const top = [...merchantData].sort((a, b) => b.volume - a.volume)[0]
          const topPct = totalVol > 0 ? ((top.volume / totalVol) * 100).toFixed(0) : "0"
          if (parseInt(topPct) >= 25) {
            return (
              <div className="flex items-start gap-3 bg-amber-400/5 border border-amber-400/20 rounded-lg px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs font-mono">
                  <span className="text-amber-400 font-semibold">{top.name}</span>
                  <span className="text-muted-foreground"> is carrying {topPct}% of total network volume — consider rebalancing rotation weights to reduce concentration risk.</span>
                </div>
              </div>
            )
          }
          return null
        })()}

      </main>
    </div>
  )
}
