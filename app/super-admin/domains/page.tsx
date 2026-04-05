"use client"

import { useState, useEffect } from "react"
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  X,
  Shield,
  Activity,
  Building2,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShieldDomain {
  id: string
  domain: string
  isActive: boolean
  tenantId: string | null
  tenantName: string | null
  healthOk: boolean
  lastCheck: string | null
  createdAt: string
  updatedAt: string
}

interface TenantOption {
  id: string
  name: string
}

interface TenantApiRow {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CARD = "bg-card border border-border rounded-lg"

function timeAgo(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Add Domain Modal ─────────────────────────────────────────────────────────

function AddDomainModal({
  tenants,
  onClose,
  onConfirm,
}: {
  tenants: TenantOption[]
  onClose: () => void
  onConfirm: (domain: string, tenantId: string | null) => void
}) {
  const [domain, setDomain] = useState("")
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const handleSubmit = () => {
    const d = domain.trim().toLowerCase()
    if (!d) { setError("Domain is required."); return }
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)) { setError("Invalid domain format."); return }
    onConfirm(d, tenantId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Shield Domain</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add a new domain to the PayPal URL rotation pool.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground">Domain</label>
            <input
              value={domain}
              onChange={e => { setDomain(e.target.value); setError("") }}
              placeholder="shield-01.example.com"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground">Assign to Tenant (optional)</label>
            <select
              value={tenantId ?? ""}
              onChange={e => setTenantId(e.target.value || null)}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-cyan-400/50"
            >
              <option value="">Shared Pool (all tenants)</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-red-400">
              <AlertTriangle className="w-3 h-3" />{error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-mono text-muted-foreground bg-secondary border border-border rounded-md hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-xs font-mono text-background bg-cyan-400 border border-cyan-400 rounded-md hover:bg-cyan-300 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            Add Domain
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  domain,
  onClose,
  onConfirm,
}: {
  domain: ShieldDomain
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold font-mono text-foreground">Delete Shield Domain</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">
              Remove <span className="text-foreground font-semibold">{domain.domain}</span> from the rotation pool? This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono bg-secondary border border-border rounded-md text-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-mono bg-red-500/10 border border-red-500/30 rounded-md text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShieldDomainsPage() {
  const [domains, setDomains] = useState<ShieldDomain[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ShieldDomain | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")

  // Fetch domains and tenants
  const fetchDomains = () => {
    fetch("/api/admin/shield-domains")
      .then(r => r.json())
      .then(data => setDomains(data.domains ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDomains()
    fetch("/api/admin/tenants")
      .then(r => r.json())
      .then(data => {
        setTenants(((data.tenants ?? []) as TenantApiRow[]).map((t) => ({ id: t.id, name: t.name })))
      })
      .catch(() => {})
  }, [])

  // CRUD handlers
  const handleAdd = async (domain: string, tenantId: string | null) => {
    try {
      const res = await fetch("/api/admin/shield-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, tenantId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Failed to add domain.")
        return
      }
      setShowAdd(false)
      fetchDomains()
    } catch {
      alert("Network error.")
    }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    await fetch("/api/admin/shield-domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    })
    setDomains(prev => prev.map(d => d.id === id ? { ...d, isActive: !isActive } : d))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await fetch(`/api/admin/shield-domains?id=${deleteTarget.id}`, { method: "DELETE" })
    setDomains(prev => prev.filter(d => d.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  // Filter + search
  const filtered = domains
    .filter(d => {
      if (filter === "active" && !d.isActive) return false
      if (filter === "inactive" && d.isActive) return false
      if (search && !d.domain.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

  const activeCount   = domains.filter(d => d.isActive).length
  const inactiveCount = domains.length - activeCount
  const healthyCount  = domains.filter(d => d.healthOk && d.isActive).length

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      {showAdd && (
        <AddDomainModal
          tenants={tenants}
          onClose={() => setShowAdd(false)}
          onConfirm={handleAdd}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          domain={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1400px] mx-auto">

        {/* Breadcrumb + Title */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">SUPER ADMIN</span>
              <span className="text-xs font-mono text-muted-foreground">/</span>
              <span className="text-xs font-mono text-cyan-400">SHIELD DOMAINS</span>
            </div>
            <h1 className="text-lg font-semibold text-foreground mt-0.5">Domain Rotation Pool</h1>
            <p className="text-xs text-muted-foreground">Manage shield domains that mask PayPal return &amp; cancel URLs</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-background bg-cyan-400 border border-cyan-400 rounded-md hover:bg-cyan-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Domain
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Domains</span>
            <span className="text-xl font-mono font-bold text-foreground">{domains.length}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Active</span>
            <span className="text-xl font-mono font-bold text-emerald-400">{activeCount}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Inactive</span>
            <span className="text-xl font-mono font-bold text-red-400">{inactiveCount}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Healthy</span>
            <span className="text-xl font-mono font-bold text-cyan-400">{healthyCount}</span>
          </div>
        </div>

        {/* Table Card */}
        <div className={`${CARD} overflow-hidden`}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-1.5 flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search domains..."
                className="bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none w-full"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              {(["all", "active", "inactive"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors capitalize ${
                    filter === f
                      ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-400"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs font-mono text-muted-foreground">{filtered.length} domain{filtered.length !== 1 ? "s" : ""}</div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Domain</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Health</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Assigned To</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Added</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-4 bg-secondary/60 rounded animate-pulse" style={{ width: `${50 + (i * 13) % 40}%` }} />
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      {domains.length === 0
                        ? "No shield domains configured yet. Click \"Add Domain\" to get started."
                        : "No domains match your search."}
                    </td>
                  </tr>
                )}
                {!loading && filtered.map(d => (
                  <tr key={d.id} className="border-b border-border/60 hover:bg-secondary/30 transition-colors">
                    {/* Domain */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
                          <Globe className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                        <span className="text-foreground font-semibold">{d.domain}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${
                        d.isActive
                          ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                          : "text-red-400 bg-red-400/10 border-red-400/20"
                      }`}>
                        {d.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {d.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Health */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Activity className={`w-3.5 h-3.5 ${d.healthOk ? "text-emerald-400" : "text-amber-400"}`} />
                        <span className={`text-[11px] ${d.healthOk ? "text-emerald-400" : "text-amber-400"}`}>
                          {d.healthOk ? "Healthy" : "Degraded"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Checked {timeAgo(d.lastCheck)}
                      </div>
                    </td>

                    {/* Assigned To */}
                    <td className="px-4 py-3">
                      {d.tenantName ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-foreground">{d.tenantName}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Shield className="w-3 h-3" />
                          Shared Pool
                        </span>
                      )}
                    </td>

                    {/* Added */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggle(d.id, d.isActive)}
                          title={d.isActive ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded-md border transition-colors ${
                            d.isActive
                              ? "border-border text-muted-foreground hover:text-amber-400 hover:border-amber-400/30 hover:bg-amber-400/10"
                              : "border-emerald-400/30 text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                          }`}
                        >
                          {d.isActive ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(d)}
                          title="Delete domain"
                          className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
