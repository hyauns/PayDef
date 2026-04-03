
"use client"

import { useState, Fragment } from "react"
import {
  Search,
  Filter,
  MoreHorizontal,
  UserX,
  Percent,
  LogIn,
  ChevronDown,
  ChevronUp,
  Building2,
  Mail,
  Globe,
  ShieldCheck,
  Store,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  X,
  Check,
  Minus,
  ExternalLink,
} from "lucide-react"
import { DashboardHeader } from "@/components/nav/top-bar"

// ─── Types ────────────────────────────────────────────────────────────────────

type TenantStatus = "Active" | "Suspended" | "Trial"
type Plan = "Basic" | "Pro" | "Enterprise"
type SortField = "name" | "plan" | "volume" | "status" | "joined"
type SortDir = "asc" | "desc"

interface Tenant {
  id: string
  business: string
  ownerEmail: string
  plan: Plan
  status: TenantStatus
  country: string
  totalVolume: number
  monthlyVolume: number
  commissionRate: number
  merchantAccounts: number
  stores: number
  joinedAt: string
  lastActive: string
  suspendReason?: string
}

// ─── Seed Data ─────────────────────────────────────────────────────────────────

const SEED_TENANTS: Tenant[] = [
  {
    id: "t-001", business: "AlphaCommerce", ownerEmail: "ops@alphacommerce.io",
    plan: "Enterprise", status: "Active", country: "US",
    totalVolume: 1_842_500, monthlyVolume: 312_400, commissionRate: 2.5,
    merchantAccounts: 12, stores: 34, joinedAt: "2023-03-12", lastActive: "2 min ago",
  },
  {
    id: "t-002", business: "BetaRetail Group", ownerEmail: "admin@betaretail.com",
    plan: "Pro", status: "Active", country: "GB",
    totalVolume: 984_200, monthlyVolume: 178_600, commissionRate: 3.0,
    merchantAccounts: 7, stores: 19, joinedAt: "2023-07-08", lastActive: "18 min ago",
  },
  {
    id: "t-003", business: "GammaPay Solutions", ownerEmail: "billing@gammapay.net",
    plan: "Enterprise", status: "Active", country: "DE",
    totalVolume: 2_310_000, monthlyVolume: 498_000, commissionRate: 2.0,
    merchantAccounts: 18, stores: 52, joinedAt: "2022-11-20", lastActive: "5 min ago",
  },
  {
    id: "t-004", business: "DeltaShops", ownerEmail: "tech@deltashops.co",
    plan: "Pro", status: "Suspended", country: "CA",
    totalVolume: 412_000, monthlyVolume: 0, commissionRate: 3.0,
    merchantAccounts: 4, stores: 8, joinedAt: "2024-01-05", lastActive: "14 days ago",
    suspendReason: "Chargeback ratio exceeded 2% threshold",
  },
  {
    id: "t-005", business: "EpsilonStore", ownerEmail: "hello@epsilonstore.io",
    plan: "Basic", status: "Trial", country: "AU",
    totalVolume: 8_400, monthlyVolume: 8_400, commissionRate: 4.5,
    merchantAccounts: 1, stores: 2, joinedAt: "2025-03-28", lastActive: "1 hour ago",
  },
  {
    id: "t-006", business: "ZetaMarket", ownerEmail: "cto@zetamarket.com",
    plan: "Enterprise", status: "Active", country: "SG",
    totalVolume: 3_120_000, monthlyVolume: 620_000, commissionRate: 1.8,
    merchantAccounts: 24, stores: 71, joinedAt: "2022-06-14", lastActive: "just now",
  },
  {
    id: "t-007", business: "EtaCommerce", ownerEmail: "ops@etacommerce.app",
    plan: "Pro", status: "Active", country: "FR",
    totalVolume: 540_000, monthlyVolume: 98_000, commissionRate: 2.8,
    merchantAccounts: 6, stores: 15, joinedAt: "2023-10-30", lastActive: "32 min ago",
  },
  {
    id: "t-008", business: "ThetaStore Inc.", ownerEmail: "admin@thetastore.shop",
    plan: "Basic", status: "Suspended", country: "IN",
    totalVolume: 62_000, monthlyVolume: 0, commissionRate: 4.5,
    merchantAccounts: 2, stores: 3, joinedAt: "2024-08-12", lastActive: "3 days ago",
    suspendReason: "Payment dispute — pending review",
  },
  {
    id: "t-009", business: "IotaRetail", ownerEmail: "finance@iotaretail.net",
    plan: "Pro", status: "Active", country: "BR",
    totalVolume: 724_800, monthlyVolume: 145_600, commissionRate: 3.2,
    merchantAccounts: 8, stores: 22, joinedAt: "2023-05-17", lastActive: "9 min ago",
  },
  {
    id: "t-010", business: "KappaPay", ownerEmail: "dev@kappapay.io",
    plan: "Enterprise", status: "Active", country: "NL",
    totalVolume: 1_580_000, monthlyVolume: 280_000, commissionRate: 2.2,
    merchantAccounts: 14, stores: 41, joinedAt: "2023-01-09", lastActive: "4 min ago",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`

const planColors: Record<Plan, string> = {
  Basic: "text-muted-foreground bg-secondary border-border",
  Pro: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  Enterprise: "text-amber-400 bg-amber-400/10 border-amber-400/20",
}

const statusConfig: Record<TenantStatus, { icon: React.ReactNode; cls: string; label: string }> = {
  Active: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    label: "Active",
  },
  Suspended: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    cls: "text-red-400 bg-red-400/10 border-red-400/20",
    label: "Suspended",
  },
  Trial: {
    icon: <Clock className="w-3.5 h-3.5" />,
    cls: "text-violet-400 bg-violet-400/10 border-violet-400/20",
    label: "Trial",
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`bg-card border rounded-lg px-4 py-3 flex flex-col gap-0.5 ${accent ? "border-emerald-400/30" : "border-border"}`}>
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-xl font-mono font-bold ${accent ? "text-emerald-400" : "text-foreground"}`}>{value}</span>
      {sub && <span className="text-xs font-mono text-muted-foreground">{sub}</span>}
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function SuspendModal({ tenant, onClose, onConfirm }: { tenant: Tenant; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Suspend Tenant</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              This will immediately revoke gateway access for <span className="text-foreground font-semibold">{tenant.business}</span>.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">Suspension reason</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Chargeback ratio exceeded threshold..."
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-cyan-400/50"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-mono text-muted-foreground bg-secondary border border-border rounded-md hover:text-foreground">Cancel</button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
            className="px-3 py-1.5 text-xs font-mono text-white bg-red-500 border border-red-500 rounded-md hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Suspension
          </button>
        </div>
      </div>
    </div>
  )
}

function FeeModal({ tenant, onClose, onConfirm }: { tenant: Tenant; onClose: () => void; onConfirm: (rate: number) => void }) {
  const [rate, setRate] = useState(tenant.commissionRate)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Adjust Commission Rate</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{tenant.business}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">New rate</span>
            <span className="text-lg font-mono font-bold text-cyan-400">{rate.toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.1}
            value={rate}
            onChange={e => setRate(parseFloat(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>0.5%</span>
            <span>10%</span>
          </div>
          <div className="bg-secondary border border-border rounded-md p-3 space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">Monthly volume</span>
              <span className="text-foreground">{fmt(tenant.monthlyVolume)}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">Projected fee / mo</span>
              <span className="text-emerald-400 font-semibold">{fmt(tenant.monthlyVolume * rate / 100)}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-mono text-muted-foreground bg-secondary border border-border rounded-md hover:text-foreground">Cancel</button>
          <button
            onClick={() => onConfirm(rate)}
            className="px-3 py-1.5 text-xs font-mono text-background bg-cyan-400 border border-cyan-400 rounded-md hover:bg-cyan-300"
          >
            Save Rate
          </button>
        </div>
      </div>
    </div>
  )
}

function ImpersonateModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-card border border-amber-400/30 rounded-lg w-full max-w-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Impersonate Session</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                You will gain full access to <span className="text-foreground font-semibold">{tenant.business}</span>&apos;s dashboard. All actions will be logged.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-md p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between"><span className="text-muted-foreground">Tenant</span><span className="text-foreground">{tenant.business}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Owner</span><span className="text-foreground">{tenant.ownerEmail}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Session logged</span><span className="text-amber-400">Yes — admin audit trail</span></div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setConfirmed(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${confirmed ? "bg-amber-400 border-amber-400" : "border-border bg-secondary"}`}
          >
            {confirmed && <Check className="w-2.5 h-2.5 text-background" />}
          </div>
          <span className="text-xs font-mono text-muted-foreground">I understand this session will be logged</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-mono text-muted-foreground bg-secondary border border-border rounded-md hover:text-foreground">Cancel</button>
          <button
            disabled={!confirmed}
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-background bg-amber-400 border border-amber-400 rounded-md hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            Launch Session
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Row expand detail ────────────────────────────────────────────────────────

function TenantExpandedRow({ tenant }: { tenant: Tenant }) {
  return (
    <tr className="bg-secondary/30">
      <td colSpan={8} className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block">Contact</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-foreground">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />{tenant.ownerEmail}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <Globe className="w-3.5 h-3.5" />{tenant.country}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block">Infrastructure</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />{tenant.merchantAccounts} merchant accounts
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-foreground">
              <Store className="w-3.5 h-3.5 text-cyan-400" />{tenant.stores} connected stores
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block">Revenue</span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />{fmt(tenant.totalVolume)} lifetime
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <Percent className="w-3.5 h-3.5" />{tenant.commissionRate}% commission rate
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block">Account</span>
            <div className="text-xs font-mono text-muted-foreground">Joined {tenant.joinedAt}</div>
            <div className="text-xs font-mono text-muted-foreground">Active {tenant.lastActive}</div>
            {tenant.suspendReason && (
              <div className="flex items-start gap-1.5 text-xs font-mono text-red-400 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {tenant.suspendReason}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>(SEED_TENANTS)
  const [search, setSearch] = useState("")
  const [filterPlan, setFilterPlan] = useState<Plan | "All">("All")
  const [filterStatus, setFilterStatus] = useState<TenantStatus | "All">("All")
  const [sortField, setSortField] = useState<SortField>("volume")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<Tenant | null>(null)
  const [feeTarget, setFeeTarget] = useState<Tenant | null>(null)
  const [impersonateTarget, setImpersonateTarget] = useState<Tenant | null>(null)

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("desc") }
  }

  const filtered = tenants
    .filter(t => {
      const q = search.toLowerCase()
      if (q && !t.business.toLowerCase().includes(q) && !t.ownerEmail.toLowerCase().includes(q)) return false
      if (filterPlan !== "All" && t.plan !== filterPlan) return false
      if (filterStatus !== "All" && t.status !== filterStatus) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortField === "name") cmp = a.business.localeCompare(b.business)
      else if (sortField === "plan") cmp = a.plan.localeCompare(b.plan)
      else if (sortField === "volume") cmp = a.totalVolume - b.totalVolume
      else if (sortField === "status") cmp = a.status.localeCompare(b.status)
      else if (sortField === "joined") cmp = a.joinedAt.localeCompare(b.joinedAt)
      return sortDir === "asc" ? cmp : -cmp
    })

  const handleSuspend = (reason: string) => {
    if (!suspendTarget) return
    setTenants(prev => prev.map(t => t.id === suspendTarget.id ? { ...t, status: "Suspended", suspendReason: reason } : t))
    setSuspendTarget(null)
  }

  const handleFeeUpdate = (rate: number) => {
    if (!feeTarget) return
    setTenants(prev => prev.map(t => t.id === feeTarget.id ? { ...t, commissionRate: rate } : t))
    setFeeTarget(null)
  }

  const handleUnsuspend = (id: string) => {
    setTenants(prev => prev.map(t => t.id === id ? { ...t, status: "Active", suspendReason: undefined } : t))
    setOpenMenu(null)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 text-muted-foreground opacity-50" />
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 ml-1 text-cyan-400" />
      : <ChevronDown className="w-3 h-3 ml-1 text-cyan-400" />
  }

  // Summary stats
  const totalVolume = tenants.reduce((s, t) => s + t.totalVolume, 0)
  const totalMonthly = tenants.reduce((s, t) => s + t.monthlyVolume, 0)
  const totalFees = tenants.reduce((s, t) => s + t.monthlyVolume * t.commissionRate / 100, 0)
  const activeCount = tenants.filter(t => t.status === "Active").length
  const suspendedCount = tenants.filter(t => t.status === "Suspended").length

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* Page title */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">SUPER ADMIN</span>
              <span className="text-xs font-mono text-muted-foreground">/</span>
              <span className="text-xs font-mono text-cyan-400">TENANTS</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground mt-0.5">Tenant Management</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground bg-secondary border border-border px-2.5 py-1.5 rounded-md">
              {tenants.length} tenants total
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Lifetime Volume" value={fmt(totalVolume)} sub="all tenants" />
          <StatCard label="Monthly Volume" value={fmt(totalMonthly)} sub="current month" />
          <StatCard label="Platform Fees (MTD)" value={fmt(totalFees)} accent sub="projected" />
          <StatCard label="Active Tenants" value={String(activeCount)} sub={`${tenants.length} total`} />
          <StatCard label="Suspended" value={String(suspendedCount)} sub="requires review" />
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
            {/* Search */}
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-1.5 flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search business or email..."
                className="bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none w-full"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Plan filter */}
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground mr-1">Plan:</span>
              {(["All", "Basic", "Pro", "Enterprise"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPlan(p)}
                  className={`px-2 py-1 text-xs font-mono rounded-md border transition-colors ${
                    filterPlan === p
                      ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-400"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono text-muted-foreground mr-1">Status:</span>
              {(["All", "Active", "Suspended", "Trial"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2 py-1 text-xs font-mono rounded-md border transition-colors ${
                    filterStatus === s
                      ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-400"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs font-mono text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-8"></th>
                  <th
                    className="text-left px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("name")}
                  >
                    <span className="flex items-center">Business Name<SortIcon field="name" /></span>
                  </th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Owner Email</th>
                  <th
                    className="text-left px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("plan")}
                  >
                    <span className="flex items-center">Plan<SortIcon field="plan" /></span>
                  </th>
                  <th
                    className="text-left px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("status")}
                  >
                    <span className="flex items-center">Status<SortIcon field="status" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("volume")}
                  >
                    <span className="flex items-center justify-end">Total Volume<SortIcon field="volume" /></span>
                  </th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Commission</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-xs">
                      No tenants match your filters.
                    </td>
                  </tr>
                )}
                {filtered.map(tenant => {
                  const sc = statusConfig[tenant.status]
                  const isExpanded = expandedRow === tenant.id
                  const menuOpen = openMenu === tenant.id
                  return (
                    <Fragment key={tenant.id}>
                      <tr
                        onClick={() => setExpandedRow(isExpanded ? null : tenant.id)}
                        className="border-b border-border/60 hover:bg-secondary/30 cursor-pointer transition-colors"
                      >
                        {/* Expand chevron */}
                        <td className="px-4 py-3 text-muted-foreground">
                          {isExpanded
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />}
                        </td>

                        {/* Business name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-secondary border border-border flex items-center justify-center text-foreground font-bold text-xs shrink-0">
                              {tenant.business[0]}
                            </div>
                            <div>
                              <div className="text-foreground font-semibold">{tenant.business}</div>
                              <div className="text-muted-foreground text-[11px]">{tenant.id} · {tenant.country}</div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3 h-3 shrink-0" />
                            {tenant.ownerEmail}
                          </div>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${planColors[tenant.plan]}`}>
                            {tenant.plan}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${sc.cls}`}>
                            {sc.icon}{sc.label}
                          </span>
                        </td>

                        {/* Volume */}
                        <td className="px-4 py-3 text-right">
                          <div className="text-foreground font-semibold">{fmt(tenant.totalVolume)}</div>
                          <div className="text-muted-foreground text-[11px]">{fmt(tenant.monthlyVolume)} this mo.</div>
                        </td>

                        {/* Commission */}
                        <td className="px-4 py-3 text-right">
                          <div className="text-cyan-400 font-semibold">{tenant.commissionRate}%</div>
                          <div className="text-emerald-400 text-[11px]">{fmt(tenant.monthlyVolume * tenant.commissionRate / 100)} /mo</div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 pr-4 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* Suspend / Unsuspend */}
                            {tenant.status === "Suspended" ? (
                              <button
                                onClick={() => handleUnsuspend(tenant.id)}
                                title="Unsuspend"
                                className="p-1.5 rounded-md border border-border text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setSuspendTarget(tenant)}
                                title="Suspend tenant"
                                className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-colors"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Adjust fee */}
                            <button
                              onClick={() => setFeeTarget(tenant)}
                              title="Adjust commission rate"
                              className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-cyan-400 hover:border-cyan-400/30 hover:bg-cyan-400/10 transition-colors"
                            >
                              <Percent className="w-3.5 h-3.5" />
                            </button>

                            {/* Impersonate */}
                            <button
                              onClick={() => setImpersonateTarget(tenant)}
                              title="Impersonate user"
                              className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-amber-400 hover:border-amber-400/30 hover:bg-amber-400/10 transition-colors"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                            </button>

                            {/* More */}
                            <div className="relative">
                              <button
                                onClick={() => setOpenMenu(menuOpen ? null : tenant.id)}
                                className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                              {menuOpen && (
                                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-20 py-1 min-w-[160px]">
                                  <button
                                    onClick={() => setOpenMenu(null)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />View Full Profile
                                  </button>
                                  <button
                                    onClick={() => { setFeeTarget(tenant); setOpenMenu(null) }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Percent className="w-3.5 h-3.5" />Adjust Fee Rate
                                  </button>
                                  <div className="h-px bg-border my-1" />
                                  <button
                                    onClick={() => { setSuspendTarget(tenant); setOpenMenu(null) }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                                  >
                                    <Minus className="w-3.5 h-3.5" />Force Suspend
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && <TenantExpandedRow tenant={tenant} />}
                    </Fragment>
                  )
                })}
              </tbody>
              {/* Footer totals */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/50">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                      Showing {filtered.length} of {tenants.length} tenants
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono font-semibold text-foreground">
                      {fmt(filtered.reduce((s, t) => s + t.totalVolume, 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono font-semibold text-emerald-400">
                      {fmt(filtered.reduce((s, t) => s + t.monthlyVolume * t.commissionRate / 100, 0))} /mo
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>

      {/* Modals */}
      {suspendTarget && (
        <SuspendModal tenant={suspendTarget} onClose={() => setSuspendTarget(null)} onConfirm={handleSuspend} />
      )}
      {feeTarget && (
        <FeeModal tenant={feeTarget} onClose={() => setFeeTarget(null)} onConfirm={handleFeeUpdate} />
      )}
      {impersonateTarget && (
        <ImpersonateModal tenant={impersonateTarget} onClose={() => setImpersonateTarget(null)} />
      )}

      {/* Click-outside handler for context menus */}
      {openMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  )
}
