"use client"

import { useState } from "react"
import useSWR from "swr"
import { TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle, BarChart2 } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { StatCard } from "@/components/dashboard/StatCard"
import { SectionCard } from "@/components/dashboard/SectionCard"
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
    voidedCount: number
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
const PIE_COLORS = ["#22d3ee", "#34d399", "#FFD600", "#f87171", "#a78bfa", "#fb923c", "#60a5fa"]
const CYAN   = "#22d3ee"
const EMERALD = "#34d399"

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtK(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
}

function fmtFull(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0 })}`
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#222530] border border-[#343947] rounded-lg px-3 py-2 text-xs font-mono shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
      <p className="text-[#97a3b6] mb-1">{label}</p>
      <p className="text-cyan-400 font-bold">Revenue: {fmtFull(payload[0]?.value ?? 0)}</p>
      <p className="text-emerald-400 font-bold">Txns: {payload[1]?.value ?? 0}</p>
    </div>
  )
}

function BarTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#222530] border border-[#343947] rounded-lg px-3 py-2 text-xs font-mono shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
      <p className="text-[#e7edf8] font-bold mb-1">{label}</p>
      <p className="text-cyan-400 font-bold">Volume: {fmtFull(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

function PieTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const firstItem = payload[0]

  return (
    <div className="bg-[#222530] border border-[#343947] rounded-lg px-3 py-2 text-xs font-mono shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
      <p className="text-[#e7edf8] font-bold">{firstItem?.name ?? "Unknown"}</p>
      <p className="font-bold" style={{ color: firstItem?.payload?.fill ?? "inherit" }}>{fmtFull(firstItem?.value ?? 0)}</p>
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] rounded-lg p-6 flex flex-col gap-3 animate-pulse shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
      <div className="h-3 w-20 bg-[#2a2d39] rounded" />
      <div className="h-8 w-24 bg-[#2a2d39] rounded" />
      <div className="h-3 w-32 bg-[#2a2d39] rounded" />
    </div>
  )
}

function SkeletonChart({ height = 280 }: { height?: number }) {
  return (
    <div className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] rounded-xl overflow-hidden animate-pulse shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
      <div className="px-6 py-5 border-b border-[#343947] bg-[#1f222c] flex items-center gap-2">
        <div className="h-4 w-4 bg-[#2a2d39] rounded" />
        <div className="h-4 w-40 bg-[#2a2d39] rounded" />
      </div>
      <div className="p-6 bg-[#222530]" style={{ height }}><div className="w-full h-full bg-[#2a2d39] rounded" /></div>
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
    <DashboardShell>
      <main className="w-full px-6 md:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <DashboardPageHeader
            eyebrow="Gateway Analytics"
            title="Performance Overview"
            description="Transaction performance and volume analytics across all connected stores and merchant accounts."
          />
          <div className="flex items-center gap-1 bg-[#222530] border border-[#343947] rounded-lg p-1.5 shadow-sm">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  range === r.key
                    ? "bg-[#343947] text-[#e7edf8]"
                    : "text-[#97a3b6] hover:text-[#e7edf8] hover:bg-[#2a2d39]"
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
              <span className="text-[#97aac1]"> Please check your connection and try again.</span>
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
            <StatCard
              label="Total Revenue"
              value={fmtK(s.totalRevenue)}
              helper={`${s.totalTransactions.toLocaleString()} transactions`}
              icon={DollarSign}
            />
            <StatCard
              label="Success Rate"
              value={`${s.successRate}%`}
              helper={`${s.completedCount} completed`}
              trend={s.successRate >= 95 ? "up" : "down"}
              trendValue={s.successRate >= 95 ? "Healthy" : "Below target"}
            />
            <StatCard
              label="Avg Transaction"
              value={`$${s.avgTransaction.toFixed(2)}`}
              helper={`${s.totalTransactions} total`}
              icon={Activity}
            />
            <StatCard
              label="Dispute Rate"
              value={`${s.disputeRate}%`}
              helper={`${s.disputedCount} disputes`}
              trend={s.disputeRate <= 0.5 ? "up" : "down"}
              trendValue={s.disputeRate <= 0.5 ? "Within threshold" : "Elevated"}
            />
            <StatCard
              label="Refund Rate"
              value={`${s.refundRate}%`}
              helper={`${s.refundedCount} refunded · ${s.voidedCount} voided`}
              trend={s.refundRate <= 2 ? "up" : "down"}
              trendValue={s.refundRate <= 2 ? "Normal" : "Elevated"}
            />
            <StatCard
              label="Active Accounts"
              value={`${s.activeAccounts} / ${s.totalAccounts}`}
              helper={`${s.totalAccounts - s.activeAccounts} paused or warm-up`}
              active={s.activeAccounts > 0}
            />
          </div>
        )}

        {/* ── Revenue Area Chart ───────────────────────────────────────────── */}
        {isLoading ? (
          <SkeletonChart />
        ) : (
          <SectionCard
            title="Revenue vs. Time"
            description={`Showing ${range === "24h" ? "hourly" : "daily"} breakdown`}
          >
            {timeSeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#6b7280] gap-2">
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#242833" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="rev"
                      tickFormatter={fmtK}
                      tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <YAxis
                      yAxisId="txn"
                      orientation="right"
                      tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
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
                <div className="flex items-center gap-6 mt-4 pl-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-0.5 bg-cyan-400 inline-block rounded" />
                    <span className="text-[10px] font-mono text-[#97aac1]">Revenue (USD)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-0.5 bg-emerald-400 inline-block rounded border-dashed" />
                    <span className="text-[10px] font-mono text-[#97aac1]">Transactions</span>
                  </div>
                </div>
              </>
            )}
          </SectionCard>
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
            <SectionCard
              title="Volume per Merchant Account"
              description="Total USD processed by each PayPal account"
            >
              {merchantData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#6b7280] gap-2">
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#242833" horizontal vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#6b7280", fontSize: 9, fontFamily: "monospace" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={fmtK}
                        tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
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
                              fill={isTop ? CYAN : "#2a2d39"}
                            />
                          )
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-5 space-y-2">
                    {[...merchantData]
                      .sort((a, b) => b.volume - a.volume)
                      .slice(0, 3)
                      .map((m, i) => (
                        <div key={m.name} className="flex items-center justify-between text-xs font-mono bg-[#2a2d39] border border-[#343947] px-4 py-3 rounded-md">
                          <div className="flex items-center gap-3">
                            <span className="text-[#97a3b6] font-bold w-4">#{i + 1}</span>
                            <span className="text-[#e7edf8] font-semibold">{m.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[#97a3b6] font-semibold">{m.txCount} txns</span>
                            <span className="text-cyan-400 font-bold">{fmtFull(m.volume)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </SectionCard>

            {/* Volume per Store — Pie Chart */}
            <SectionCard
              title="Volume per Store"
              description="Share of total gateway traffic by client store"
            >
              {storeData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#6b7280] gap-2">
                  <DollarSign className="w-6 h-6 opacity-30" />
                  <p className="text-xs font-mono">No store volume data</p>
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={storeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
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
                              <span className="text-[#e2eeff] truncate">{store.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[#6b7280]">{pct}%</span>
                              <span className="text-[#e2eeff]">{fmtK(store.value)}</span>
                            </div>
                          </div>
                        )
                      })}
                    <div className="pt-2 mt-2 border-t border-[#242833] flex items-center justify-between text-xs font-mono">
                      <span className="text-[#97aac1]">Total</span>
                      <span className="text-[#e2eeff] font-semibold">{fmtFull(storeTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
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
                  <span className="text-[#97aac1]"> is carrying {topPct}% of total network volume — consider rebalancing rotation weights to reduce concentration risk.</span>
                </div>
              </div>
            )
          }
          return null
        })()}

      </main>
    </DashboardShell>
  )
}
