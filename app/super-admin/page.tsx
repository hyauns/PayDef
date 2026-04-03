"use client"

import { useState, Fragment } from "react"
import {
  TrendingUp,
  DollarSign,
  Users,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MoreHorizontal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Layers,
  Percent,
  BadgeDollarSign,
  Server,
  Flag,
  Eye,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ────────────────────────────────────────────────────────────────────

type TenantStatus = "Active" | "Suspended" | "Trial"
type FeeStatus = "Paid" | "Pending" | "Overdue"
type DomainStatus = "Healthy" | "Degraded" | "Down" | "Flagged"

interface Tenant {
  id: string
  name: string
  email: string
  plan: string
  status: TenantStatus
  totalVolume: number
  currentMonthVolume: number
  commissionRate: number
  feesCollected: number
  feesPending: number
  feeStatus: FeeStatus
  merchantAccounts: number
  stores: number
  joinedAt: string
  lastActive: string
  country: string
}

interface ShieldDomain {
  id: string
  domain: string
  tenant: string
  tenantId: string
  status: DomainStatus
  latencyMs: number
  ssl: boolean
  sslExpiry: string
  flagReason?: string
  uptime: number
  lastChecked: string
  ip: string
  region: string
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const tenants: Tenant[] = [
  {
    id: "t-001", name: "AlphaCommerce", email: "ops@alphacommerce.io", plan: "Enterprise",
    status: "Active", totalVolume: 1_842_500, currentMonthVolume: 312_400,
    commissionRate: 2.5, feesCollected: 46_062, feesPending: 7_810, feeStatus: "Paid",
    merchantAccounts: 12, stores: 34, joinedAt: "2023-03-12", lastActive: "2 min ago", country: "US",
  },
  {
    id: "t-002", name: "BetaRetail Group", email: "admin@betaretail.com", plan: "Pro",
    status: "Active", totalVolume: 984_200, currentMonthVolume: 178_600,
    commissionRate: 3.0, feesCollected: 29_526, feesPending: 5_358, feeStatus: "Pending",
    merchantAccounts: 7, stores: 19, joinedAt: "2023-07-08", lastActive: "18 min ago", country: "GB",
  },
  {
    id: "t-003", name: "GammaPay Solutions", email: "billing@gammapay.net", plan: "Enterprise",
    status: "Active", totalVolume: 2_310_000, currentMonthVolume: 498_000,
    commissionRate: 2.0, feesCollected: 46_200, feesPending: 9_960, feeStatus: "Paid",
    merchantAccounts: 18, stores: 52, joinedAt: "2022-11-20", lastActive: "5 min ago", country: "DE",
  },
  {
    id: "t-004", name: "DeltaShops", email: "tech@deltashops.co", plan: "Pro",
    status: "Suspended", totalVolume: 412_000, currentMonthVolume: 0,
    commissionRate: 3.0, feesCollected: 12_360, feesPending: 4_200, feeStatus: "Overdue",
    merchantAccounts: 4, stores: 8, joinedAt: "2024-01-05", lastActive: "14 days ago", country: "CA",
  },
  {
    id: "t-005", name: "EpsilonStore", email: "hello@epsilonstore.io", plan: "Trial",
    status: "Trial", totalVolume: 28_400, currentMonthVolume: 28_400,
    commissionRate: 3.5, feesCollected: 994, feesPending: 994, feeStatus: "Pending",
    merchantAccounts: 2, stores: 3, joinedAt: "2025-03-18", lastActive: "1 hour ago", country: "AU",
  },
  {
    id: "t-006", name: "ZetaPayments", email: "finance@zetapayments.com", plan: "Enterprise",
    status: "Active", totalVolume: 3_120_000, currentMonthVolume: 620_000,
    commissionRate: 1.8, feesCollected: 56_160, feesPending: 11_160, feeStatus: "Paid",
    merchantAccounts: 22, stores: 67, joinedAt: "2022-06-01", lastActive: "Just now", country: "US",
  },
]

const shieldDomains: ShieldDomain[] = [
  {
    id: "sd-001", domain: "chococlose.com", tenant: "AlphaCommerce", tenantId: "t-001",
    status: "Healthy", latencyMs: 42, ssl: true, sslExpiry: "2026-01-15",
    uptime: 99.98, lastChecked: "30s ago", ip: "104.21.18.44", region: "US-East",
  },
  {
    id: "sd-002", domain: "safepay-hub.io", tenant: "BetaRetail Group", tenantId: "t-002",
    status: "Degraded", latencyMs: 389, ssl: true, sslExpiry: "2025-08-22",
    uptime: 97.4, lastChecked: "1m ago", ip: "172.67.142.9", region: "EU-West",
  },
  {
    id: "sd-003", domain: "gateway-shield.net", tenant: "GammaPay Solutions", tenantId: "t-003",
    status: "Healthy", latencyMs: 28, ssl: true, sslExpiry: "2026-03-10",
    uptime: 99.99, lastChecked: "15s ago", ip: "104.18.7.211", region: "EU-Central",
  },
  {
    id: "sd-004", domain: "payrouter-safe.com", tenant: "GammaPay Solutions", tenantId: "t-003",
    status: "Flagged", latencyMs: 120, ssl: true, sslExpiry: "2025-11-30",
    flagReason: "PayPal policy violation detected",
    uptime: 94.1, lastChecked: "2m ago", ip: "185.93.2.18", region: "EU-Central",
  },
  {
    id: "sd-005", domain: "secure-checkout-hub.io", tenant: "DeltaShops", tenantId: "t-004",
    status: "Down", latencyMs: 0, ssl: false, sslExpiry: "2024-12-01",
    flagReason: "SSL expired — tenant suspended",
    uptime: 61.2, lastChecked: "5m ago", ip: "82.145.210.33", region: "CA-Central",
  },
  {
    id: "sd-006", domain: "txroute-alpha.com", tenant: "AlphaCommerce", tenantId: "t-001",
    status: "Healthy", latencyMs: 55, ssl: true, sslExpiry: "2026-02-18",
    uptime: 99.95, lastChecked: "45s ago", ip: "104.21.66.78", region: "US-West",
  },
  {
    id: "sd-007", domain: "zeta-gateway.net", tenant: "ZetaPayments", tenantId: "t-006",
    status: "Healthy", latencyMs: 31, ssl: true, sslExpiry: "2026-04-05",
    uptime: 99.99, lastChecked: "20s ago", ip: "172.67.88.144", region: "US-East",
  },
  {
    id: "sd-008", domain: "zeta-relay-eu.io", tenant: "ZetaPayments", tenantId: "t-006",
    status: "Healthy", latencyMs: 38, ssl: true, sslExpiry: "2026-04-05",
    uptime: 99.97, lastChecked: "20s ago", ip: "172.67.90.12", region: "EU-West",
  },
  {
    id: "sd-009", domain: "epsilon-pay-test.com", tenant: "EpsilonStore", tenantId: "t-005",
    status: "Degraded", latencyMs: 280, ssl: true, sslExpiry: "2025-09-14",
    uptime: 96.8, lastChecked: "3m ago", ip: "199.60.103.22", region: "AP-Southeast",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

const tenantStatusCfg: Record<TenantStatus, { label: string; bg: string; text: string; dot: string }> = {
  Active:    { label: "Active",    bg: "bg-emerald-400/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Trial:     { label: "Trial",     bg: "bg-cyan-400/10",    text: "text-cyan-400",    dot: "bg-cyan-400" },
  Suspended: { label: "Suspended", bg: "bg-red-400/10",     text: "text-red-400",     dot: "bg-red-400" },
}

const feeStatusCfg: Record<FeeStatus, { label: string; bg: string; text: string }> = {
  Paid:    { label: "Paid",    bg: "bg-emerald-400/10", text: "text-emerald-400" },
  Pending: { label: "Pending", bg: "bg-amber-400/10",   text: "text-amber-400" },
  Overdue: { label: "Overdue", bg: "bg-red-400/10",     text: "text-red-400" },
}

const domainStatusCfg: Record<DomainStatus, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  Healthy:  { label: "Healthy",  bg: "bg-emerald-400/10", text: "text-emerald-400", border: "border-emerald-400/20", Icon: ShieldCheck },
  Degraded: { label: "Degraded", bg: "bg-amber-400/10",   text: "text-amber-400",   border: "border-amber-400/20",  Icon: ShieldAlert },
  Down:     { label: "Down",     bg: "bg-red-400/10",     text: "text-red-400",     border: "border-red-400/30",    Icon: ShieldOff },
  Flagged:  { label: "Flagged",  bg: "bg-orange-400/10",  text: "text-orange-400",  border: "border-orange-400/30", Icon: Flag },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent, Icon, trend,
}: {
  label: string
  value: string
  sub?: string
  accent: string
  Icon: React.ElementType
  trend?: { value: string; up: boolean }
}) {
  return (
    <div className={`bg-card border rounded-lg p-4 flex flex-col gap-3 ${accent}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${accent.includes("emerald") ? "bg-emerald-400/10" : accent.includes("cyan") ? "bg-cyan-400/10" : "bg-purple-400/10"}`}>
          <Icon className={`w-3.5 h-3.5 ${accent.includes("emerald") ? "text-emerald-400" : accent.includes("cyan") ? "text-cyan-400" : "text-purple-400"}`} />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-mono font-bold ${accent.includes("emerald") ? "text-emerald-400" : accent.includes("cyan") ? "text-cyan-400" : "text-foreground"}`}>
          {value}
        </p>
        {sub && <p className="text-xs font-mono text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-mono ${trend.up ? "text-emerald-400" : "text-red-400"}`}>
          {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {trend.value} vs last month
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground font-mono">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "billing" | "infrastructure">("overview")
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)
  const [testingDomain, setTestingDomain] = useState<string | null>(null)
  const [sortField, setSortField] = useState<"volume" | "fees" | "rate">("volume")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Aggregate metrics
  const totalVolume = tenants.reduce((s, t) => s + t.totalVolume, 0)
  const totalFees = tenants.reduce((s, t) => s + t.feesCollected, 0)
  const totalPending = tenants.reduce((s, t) => s + t.feesPending, 0)
  const activeTenants = tenants.filter((t) => t.status === "Active").length
  const totalMerchants = tenants.reduce((s, t) => s + t.merchantAccounts, 0)
  const totalStores = tenants.reduce((s, t) => s + t.stores, 0)

  const domainHealthCounts = shieldDomains.reduce(
    (acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc },
    {} as Record<string, number>
  )

  const sortedTenants = [...tenants].sort((a, b) => {
    const aVal = sortField === "volume" ? a.currentMonthVolume : sortField === "fees" ? a.feesCollected : a.commissionRate
    const bVal = sortField === "volume" ? b.currentMonthVolume : sortField === "fees" ? b.feesCollected : b.commissionRate
    return sortDir === "desc" ? bVal - aVal : aVal - bVal
  })

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else { setSortField(field); setSortDir("desc") }
  }

  function handleTest(id: string) {
    setTestingDomain(id)
    setTimeout(() => setTestingDomain(null), 2000)
  }

  const tabs = [
    { id: "overview" as const, label: "Platform Overview" },
    { id: "billing" as const, label: "Billing & Commissions" },
    { id: "infrastructure" as const, label: "Infrastructure Health" },
  ]

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="px-4 md:px-6 py-5 max-w-[1600px] mx-auto space-y-5">

        {/* Page Title */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Super Admin Console</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground">Platform Management Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Full network visibility — {tenants.length} tenants, {totalMerchants} merchant accounts, {totalStores} stores</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-secondary border border-border text-muted-foreground hover:text-foreground rounded-md transition-colors">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/20 rounded-md transition-colors">
              <Activity className="w-3 h-3" />
              Export Report
            </button>
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="col-span-2 md:col-span-1 xl:col-span-2">
            <MetricCard
              label="Total Network Volume"
              value={fmt(totalVolume)}
              sub={`${fmtFull(tenants.reduce((s, t) => s + t.currentMonthVolume, 0))} this month`}
              accent="border-emerald-400/20"
              Icon={TrendingUp}
              trend={{ value: "+18.4%", up: true }}
            />
          </div>
          <div className="col-span-2 md:col-span-1 xl:col-span-2">
            <MetricCard
              label="Total Platform Fees"
              value={fmt(totalFees)}
              sub={`${fmt(totalPending)} pending collection`}
              accent="border-emerald-400/20"
              Icon={BadgeDollarSign}
              trend={{ value: "+22.1%", up: true }}
            />
          </div>
          <div className="xl:col-span-2">
            <MetricCard
              label="Active Merchants (Users)"
              value={`${activeTenants} / ${tenants.length}`}
              sub={`${totalMerchants} merchant accounts • ${totalStores} stores`}
              accent="border-cyan-400/20"
              Icon={Users}
              trend={{ value: "+3 new", up: true }}
            />
          </div>
          {/* Mini stat cards */}
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col justify-between">
            <span className="text-xs font-mono text-muted-foreground">Domains Online</span>
            <div className="mt-2">
              <p className="text-xl font-mono font-bold text-foreground">{domainHealthCounts["Healthy"] || 0}<span className="text-muted-foreground text-sm">/{shieldDomains.length}</span></p>
              <div className="flex gap-1 mt-1.5">
                {shieldDomains.map((d) => (
                  <div key={d.id} className={`h-1 flex-1 rounded-full ${d.status === "Healthy" ? "bg-emerald-400" : d.status === "Degraded" ? "bg-amber-400" : d.status === "Flagged" ? "bg-orange-400" : "bg-red-400"}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col justify-between">
            <span className="text-xs font-mono text-muted-foreground">Avg Commission</span>
            <div className="mt-2">
              <p className="text-xl font-mono font-bold text-emerald-400">
                {(tenants.reduce((s, t) => s + t.commissionRate, 0) / tenants.length).toFixed(2)}%
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-0.5">across all tenants</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 flex flex-col justify-between">
            <span className="text-xs font-mono text-muted-foreground">Flagged Domains</span>
            <div className="mt-2">
              <p className="text-xl font-mono font-bold text-orange-400">{(domainHealthCounts["Flagged"] || 0) + (domainHealthCounts["Down"] || 0)}</p>
              <p className="text-xs font-mono text-muted-foreground mt-0.5">need attention</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-foreground border-emerald-400"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ───────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <SectionHeader
              title="Tenant Overview"
              sub="All registered tenants and their network contribution"
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-secondary border border-border px-2.5 py-1 rounded-md">
                  <Layers className="w-3 h-3" />
                  {tenants.length} tenants
                </div>
              </div>
            </SectionHeader>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Tenant</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Plan / Status</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Total Volume</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">This Month</th>
                    <th className="text-center px-4 py-2.5 text-muted-foreground font-medium">Accounts / Stores</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Last Active</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => {
                    const scfg = tenantStatusCfg[t.status]
                    const isExpanded = expandedTenant === t.id
                    const monthShare = (t.currentMonthVolume / Math.max(...tenants.map((x) => x.currentMonthVolume))) * 100
                    return (
                      <Fragment key={t.id}>
                        <tr
                          className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors"
                          onClick={() => setExpandedTenant(isExpanded ? null : t.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-md bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold shrink-0">
                                {t.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-foreground font-semibold">{t.name}</p>
                                <p className="text-muted-foreground">{t.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground">{t.plan}</span>
                              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded w-fit ${scfg.bg} ${scfg.text}`}>
                                <span className={`w-1 h-1 rounded-full ${scfg.dot}`} />
                                {scfg.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-foreground">{fmt(t.totalVolume)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-foreground">{fmt(t.currentMonthVolume)}</span>
                              <div className="w-24 h-1 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${monthShare}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-cyan-400">{t.merchantAccounts}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-foreground">{t.stores}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {t.lastActive}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${t.id}-exp`} className="border-b border-border/50 bg-secondary/10">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-card border border-border rounded-md p-3">
                                  <p className="text-muted-foreground text-xs mb-1">Commission Rate</p>
                                  <p className="text-emerald-400 font-bold text-sm">{t.commissionRate}%</p>
                                </div>
                                <div className="bg-card border border-border rounded-md p-3">
                                  <p className="text-muted-foreground text-xs mb-1">Fees Collected</p>
                                  <p className="text-emerald-400 font-bold text-sm">{fmtFull(t.feesCollected)}</p>
                                </div>
                                <div className="bg-card border border-border rounded-md p-3">
                                  <p className="text-muted-foreground text-xs mb-1">Fees Pending</p>
                                  <p className="text-amber-400 font-bold text-sm">{fmtFull(t.feesPending)}</p>
                                </div>
                                <div className="bg-card border border-border rounded-md p-3">
                                  <p className="text-muted-foreground text-xs mb-1">Member Since</p>
                                  <p className="text-foreground font-bold text-sm">{t.joinedAt}</p>
                                </div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <button className="px-3 py-1.5 text-xs font-mono bg-secondary border border-border text-muted-foreground hover:text-foreground rounded-md transition-colors flex items-center gap-1.5">
                                  <Eye className="w-3 h-3" /> View Full Dashboard
                                </button>
                                <button className="px-3 py-1.5 text-xs font-mono bg-secondary border border-border text-muted-foreground hover:text-foreground rounded-md transition-colors">
                                  Edit Commission Rate
                                </button>
                                {t.status === "Active" ? (
                                  <button className="px-3 py-1.5 text-xs font-mono bg-red-400/10 border border-red-400/20 text-red-400 hover:bg-red-400/20 rounded-md transition-colors">
                                    Suspend Tenant
                                  </button>
                                ) : (
                                  <button className="px-3 py-1.5 text-xs font-mono bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/20 rounded-md transition-colors">
                                    Reactivate Tenant
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Billing Tab ────────────────────────────────────────────────── */}
        {activeTab === "billing" && (
          <div className="space-y-4">
            {/* Billing summary bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-card border border-emerald-400/20 rounded-lg p-3">
                <p className="text-xs font-mono text-muted-foreground mb-1">Total Fees Collected</p>
                <p className="text-xl font-mono font-bold text-emerald-400">{fmtFull(totalFees)}</p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">all time</p>
              </div>
              <div className="bg-card border border-amber-400/20 rounded-lg p-3">
                <p className="text-xs font-mono text-muted-foreground mb-1">Pending Collection</p>
                <p className="text-xl font-mono font-bold text-amber-400">{fmtFull(totalPending)}</p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">awaiting payment</p>
              </div>
              <div className="bg-card border border-red-400/20 rounded-lg p-3">
                <p className="text-xs font-mono text-muted-foreground mb-1">Overdue Accounts</p>
                <p className="text-xl font-mono font-bold text-red-400">
                  {tenants.filter((t) => t.feeStatus === "Overdue").length}
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">require action</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs font-mono text-muted-foreground mb-1">Net Revenue (MTD)</p>
                <p className="text-xl font-mono font-bold text-foreground">
                  {fmt(tenants.reduce((s, t) => s + (t.currentMonthVolume * t.commissionRate / 100), 0))}
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">month-to-date</p>
              </div>
            </div>

            <SectionHeader title="Commission & Billing Table" sub="Per-tenant processing volume, rates, and fee collection status">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">Sort by:</span>
                {(["volume", "fees", "rate"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleSort(f)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-md border transition-colors ${
                      sortField === f
                        ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "volume" ? "Volume" : f === "fees" ? "Fees" : "Rate"}
                    {sortField === f && (sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                  </button>
                ))}
              </div>
            </SectionHeader>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Merchant (Tenant)</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Processing Volume</th>
                    <th className="text-center px-4 py-2.5 text-muted-foreground font-medium">Commission Rate</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Fees Collected</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Fees Pending</th>
                    <th className="text-center px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedTenants.map((t) => {
                    const fcfg = feeStatusCfg[t.feeStatus]
                    const scfg = tenantStatusCfg[t.status]
                    const expectedFee = t.currentMonthVolume * (t.commissionRate / 100)
                    const collectionRate = expectedFee > 0 ? Math.min((t.feesCollected / (t.totalVolume * t.commissionRate / 100)) * 100, 100) : 0
                    return (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 text-[9px] font-bold shrink-0">
                              {t.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-foreground font-semibold">{t.name}</p>
                              <span className={`inline-flex items-center gap-1 text-[10px] px-1 py-0.5 rounded ${scfg.bg} ${scfg.text}`}>
                                <span className={`w-1 h-1 rounded-full ${scfg.dot}`} />
                                {scfg.label}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div>
                            <p className="text-foreground">{fmt(t.currentMonthVolume)}</p>
                            <p className="text-muted-foreground text-[10px]">{fmt(t.totalVolume)} total</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 text-emerald-400 font-bold">
                              <Percent className="w-3 h-3" />
                              {t.commissionRate.toFixed(1)}
                            </div>
                            <p className="text-muted-foreground text-[10px]">{fmt(expectedFee)} / mo</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div>
                            <p className="text-emerald-400 font-semibold">{fmtFull(t.feesCollected)}</p>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${collectionRate}%` }} />
                              </div>
                              <span className="text-muted-foreground text-[10px]">{collectionRate.toFixed(0)}%</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className={t.feesPending > 0 ? "text-amber-400" : "text-muted-foreground"}>
                            {fmtFull(t.feesPending)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${fcfg.bg} ${fcfg.text}`}>
                            {t.feeStatus === "Paid" ? <CheckCircle2 className="w-3 h-3" /> : t.feeStatus === "Overdue" ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {fcfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-secondary/30 border-t border-border">
                    <td className="px-4 py-3 text-muted-foreground font-semibold">TOTALS</td>
                    <td className="px-4 py-3 text-right text-foreground font-semibold">
                      {fmt(tenants.reduce((s, t) => s + t.currentMonthVolume, 0))}
                    </td>
                    <td className="px-4 py-3 text-center text-emerald-400 font-semibold">
                      {(tenants.reduce((s, t) => s + t.commissionRate, 0) / tenants.length).toFixed(2)}% avg
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmtFull(totalFees)}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-semibold">{fmtFull(totalPending)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Infrastructure Tab ─────────────────────────────────────────── */}
        {activeTab === "infrastructure" && (
          <div className="space-y-4">
            {/* Health summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(["Healthy", "Degraded", "Flagged", "Down"] as DomainStatus[]).map((status) => {
                const cfg = domainStatusCfg[status]
                const count = domainHealthCounts[status] || 0
                const StatusIcon = cfg.Icon
                return (
                  <div key={status} className={`bg-card border rounded-lg p-3 ${cfg.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-muted-foreground">{status}</span>
                      <StatusIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
                    </div>
                    <p className={`text-2xl font-mono font-bold ${cfg.text}`}>{count}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      {((count / shieldDomains.length) * 100).toFixed(0)}% of domains
                    </p>
                  </div>
                )
              })}
            </div>

            <SectionHeader title="Global Shield Domain Health" sub="All domains across all tenants — real-time connectivity status">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-secondary border border-border text-muted-foreground hover:text-foreground rounded-md transition-colors">
                <RefreshCw className="w-3 h-3" />
                Test All
              </button>
            </SectionHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {shieldDomains.map((d) => {
                const cfg = domainStatusCfg[d.status]
                const DomainIcon = cfg.Icon
                const isTesting = testingDomain === d.id
                return (
                  <div key={d.id} className={`bg-card border rounded-lg p-4 ${cfg.border} transition-all hover:bg-secondary/10`}>
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${cfg.bg}`}>
                          <DomainIcon className={`w-4 h-4 ${cfg.text}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground">{d.domain}</p>
                            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <p className="text-xs text-muted-foreground">{d.tenant}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Flag reason */}
                    {d.flagReason && (
                      <div className="flex items-start gap-2 mb-3 bg-orange-400/5 border border-orange-400/20 rounded-md px-2.5 py-2">
                        <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 shrink-0" />
                        <p className="text-xs font-mono text-orange-400">{d.flagReason}</p>
                      </div>
                    )}

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-secondary/40 rounded-md p-2 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Latency</p>
                        <p className={`text-xs font-mono font-semibold ${d.latencyMs === 0 ? "text-red-400" : d.latencyMs > 200 ? "text-amber-400" : "text-emerald-400"}`}>
                          {d.latencyMs === 0 ? "—" : `${d.latencyMs}ms`}
                        </p>
                      </div>
                      <div className="bg-secondary/40 rounded-md p-2 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Uptime</p>
                        <p className={`text-xs font-mono font-semibold ${d.uptime >= 99 ? "text-emerald-400" : d.uptime >= 95 ? "text-amber-400" : "text-red-400"}`}>
                          {d.uptime.toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-secondary/40 rounded-md p-2 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">SSL</p>
                        <p className={`text-xs font-mono font-semibold ${d.ssl ? "text-emerald-400" : "text-red-400"}`}>
                          {d.ssl ? "Valid" : "Expired"}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-mono text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Server className="w-2.5 h-2.5" />
                          {d.ip} · {d.region}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-2.5 h-2.5" />
                          Checked {d.lastChecked}
                        </div>
                      </div>
                      <button
                        onClick={() => handleTest(d.id)}
                        disabled={isTesting}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                          isTesting
                            ? "bg-cyan-400/10 border-cyan-400/20 text-cyan-400 cursor-wait"
                            : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {isTesting
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> Testing...</>
                          : <><Wifi className="w-3 h-3" /> Test</>
                        }
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
