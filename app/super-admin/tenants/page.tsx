
"use client"

import { useState, useEffect, Fragment } from "react"
import {
  Search,
  Filter,
  MoreHorizontal,
  UserX,
  Percent,
  LogIn,
  ChevronDown,
  ChevronUp,
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
  Plus,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

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

interface TenantApiRow {
  id: string
  name: string
  ownerEmail?: string | null
  plan?: string | null
  status?: string | null
  totalVolume?: number | null
  monthlyVolume?: number | null
  gatewayFeePercent?: number | null
  accountCount?: number | null
  storeCount?: number | null
  createdAt?: string | null
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed"
}

// ─── Seed Data (fallback if API fails) ──────────────────────────────────────

const SEED_TENANTS: Tenant[] = []

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

function renderSortIcon(field: SortField, sortField: SortField, sortDir: SortDir) {
  if (sortField !== field) {
    return <ArrowUpDown className="w-3 h-3 ml-1 text-muted-foreground opacity-50" />
  }

  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-cyan-400" />
    : <ChevronDown className="w-3 h-3 ml-1 text-cyan-400" />
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

// ─── Create Tenant Modal ──────────────────────────────────────────────────────

function CreateTenantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (tenant: Tenant) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [plan, setPlan] = useState<Plan>("Basic")
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const planMap: Record<Plan, string> = { Basic: "STARTER", Pro: "PRO", Enterprise: "ENTERPRISE" }

  const canSubmit =
    name.trim().length >= 2 &&
    email.includes("@") &&
    password.length >= 8 &&
    !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError("")

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          plan: planMap[plan],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create tenant")

      const statusMap: Record<string, TenantStatus> = { ACTIVE: "Active", SUSPENDED: "Suspended", TRIAL: "Trial" }
      const revPlanMap: Record<string, Plan> = { STARTER: "Basic", BASIC: "Basic", PRO: "Pro", ENTERPRISE: "Enterprise" }

      onCreated({
        id: data.id,
        business: data.name,
        ownerEmail: data.ownerEmail ?? email,
        plan: revPlanMap[data.plan?.toUpperCase()] ?? "Basic",
        status: statusMap[data.status?.toUpperCase()] ?? "Active",
        country: "—",
        totalVolume: 0,
        monthlyVolume: 0,
        commissionRate: data.gatewayFeePercent ?? 2.0,
        merchantAccounts: 0,
        stores: 0,
        joinedAt: new Date().toISOString().slice(0, 10),
        lastActive: "—",
      })
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create New Tenant</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              This will create both the tenant account and the merchant user login.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-md px-3 py-2">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Business Name */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Business Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/50"
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Owner Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@acmecorp.com"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/50"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full bg-secondary border border-border rounded-md px-3 pr-10 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/50"
              />
              <button
                onClick={() => setShowPw(p => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {password.length > 0 && password.length < 8 && (
              <p className="text-[10px] font-mono text-red-400">Minimum 8 characters required</p>
            )}
          </div>

          {/* Plan */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Plan</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Basic", "Pro", "Enterprise"] as Plan[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                    plan === p
                      ? planColors[p]
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-muted-foreground bg-secondary border border-border rounded-md hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-xs font-mono text-background bg-cyan-400 border border-cyan-400 rounded-md hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {saving ? "Creating..." : "Create Tenant"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>(SEED_TENANTS)
  const [loading, setLoading] = useState(true)
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
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Fetch real tenant data from API
  useEffect(() => {
    fetch("/api/admin/tenants")
      .then(r => r.json())
      .then(data => {
        if (data.tenants && data.tenants.length > 0) {
          const mapped: Tenant[] = (data.tenants as TenantApiRow[]).map((t) => {
            const statusMap: Record<string, TenantStatus> = { ACTIVE: "Active", SUSPENDED: "Suspended", TRIAL: "Trial" }
            const planMap: Record<string, Plan> = { STARTER: "Basic", BASIC: "Basic", PRO: "Pro", ENTERPRISE: "Enterprise" }
            const planKey = t.plan?.toUpperCase()
            const statusKey = t.status?.toUpperCase()
            return {
              id:               t.id,
              business:         t.name,
              ownerEmail:       t.ownerEmail ?? "—",
              plan:             (planKey ? planMap[planKey] : undefined) ?? "Basic",
              status:           (statusKey ? statusMap[statusKey] : undefined) ?? "Active",
              country:          "—",
              totalVolume:      t.totalVolume ?? 0,
              monthlyVolume:    t.monthlyVolume ?? 0,
              commissionRate:   t.gatewayFeePercent ?? 2.0,
              merchantAccounts: t.accountCount ?? 0,
              stores:           t.storeCount ?? 0,
              joinedAt:         t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : "—",
              lastActive:       "—",
            }
          })
          setTenants(mapped)
        }
      })
      .catch(() => {}) // Keep seed data on error
      .finally(() => setLoading(false))
  }, [])

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
    // Wire to API
    fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: suspendTarget.id, status: "SUSPENDED" }),
    }).catch(() => {})
    setTenants(prev => prev.map(t => t.id === suspendTarget.id ? { ...t, status: "Suspended", suspendReason: reason } : t))
    setSuspendTarget(null)
  }

  const handleFeeUpdate = (rate: number) => {
    if (!feeTarget) return
    fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: feeTarget.id, gatewayFeePercent: rate }),
    }).catch(() => {})
    setTenants(prev => prev.map(t => t.id === feeTarget.id ? { ...t, commissionRate: rate } : t))
    setFeeTarget(null)
  }

  const handleUnsuspend = (id: string) => {
    fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "ACTIVE" }),
    }).catch(() => {})
    setTenants(prev => prev.map(t => t.id === id ? { ...t, status: "Active", suspendReason: undefined } : t))
    setOpenMenu(null)
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
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-background bg-cyan-400 rounded-md hover:bg-cyan-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Tenant
            </button>
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
                    <span className="flex items-center">Business Name{renderSortIcon("name", sortField, sortDir)}</span>
                  </th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Owner Email</th>
                  <th
                    className="text-left px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("plan")}
                  >
                    <span className="flex items-center">Plan{renderSortIcon("plan", sortField, sortDir)}</span>
                  </th>
                  <th
                    className="text-left px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("status")}
                  >
                    <span className="flex items-center">Status{renderSortIcon("status", sortField, sortDir)}</span>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("volume")}
                  >
                    <span className="flex items-center justify-end">Total Volume{renderSortIcon("volume", sortField, sortDir)}</span>
                  </th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Commission</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-4 bg-secondary/60 rounded animate-pulse" style={{ width: `${60 + (i * 7) % 30}%` }} />
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-xs">
                      {tenants.length === 0 ? "No tenants found. Data will appear once tenants are created." : "No tenants match your filters."}
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
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(tenant) => setTenants(prev => [tenant, ...prev])}
        />
      )}

      {/* Click-outside handler for context menus */}
      {openMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  )
}
