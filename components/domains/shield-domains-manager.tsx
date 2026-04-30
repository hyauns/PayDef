"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Store,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { GridBackground } from "@/components/ui/grid-background"

type Role = "SUPER_ADMIN" | "MERCHANT"

type VercelState = {
  integrationEnabled: boolean
  projectRef: string | null
  teamContext: string | null
  domainAdded: boolean
  verified: boolean | null
  projectStatus: "Integration Off" | "Linked" | "Not Linked" | "Error"
  dnsStatus: "Integration Off" | "Ready" | "Verification Required" | "Needs DNS" | "Not Linked" | "Error"
  configuredBy: string | null
  misconfigured: boolean | null
  requiredRecordType: string | null
  requiredRecordName: string | null
  requiredRecordValue: string | null
  verificationReason: string | null
  bridgeOk: boolean
  bridgeUrl: string
  bridgeHealthy: boolean | null
  bridgeStatusCode: number | null
  bridgeCheckedAt: string | null
  bridgeMessage: string | null
  statusMessage: string
  lastCheckedAt: string
}

type DomainStoreAssignment = {
  id: string
  name: string
  tenantId: string
  tenantName: string | null
}

type ShieldDomain = {
  id: string
  domain: string
  isActive: boolean
  tenantId: string | null
  tenantName: string | null
  healthOk: boolean
  lastCheck: string | null
  createdAt: string
  updatedAt: string
  ownership: "shared" | "tenant"
  canManage: boolean
  assignedStores: DomainStoreAssignment[]
  vercel: VercelState
}

type DomainStoreOption = {
  id: string
  name: string
  tenantId: string
  tenantName: string | null
  shieldDomain: string | null
  isActive: boolean
}

type TenantOption = {
  id: string
  name: string
}

type TenantApiRow = {
  id: string
  name: string
}

type IntegrationInfo = {
  enabled: boolean
  projectRef: string | null
  teamContext: string | null
}

type DomainApiResponse = {
  domains?: ShieldDomain[]
  stores?: DomainStoreOption[]
  integration?: IntegrationInfo
}

const CARD = "bg-[#151821] border border-[#343947] rounded-lg"

function timeAgo(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function dnsTone(status: VercelState["dnsStatus"]) {
  switch (status) {
    case "Ready":
      return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
    case "Verification Required":
      return "text-amber-400 bg-amber-400/10 border-amber-400/20"
    case "Needs DNS":
      return "text-red-400 bg-red-400/10 border-red-400/20"
    case "Integration Off":
      return "text-[#97a3b6] bg-[#2a2d39] border-[#343947]"
    case "Error":
      return "text-red-400 bg-red-400/10 border-red-400/20"
    default:
      return "text-[#97a3b6] bg-[#2a2d39] border-[#343947]"
  }
}

function vercelTone(status: VercelState["projectStatus"]) {
  switch (status) {
    case "Linked":
      return "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20"
    case "Error":
      return "text-red-400 bg-red-400/10 border-red-400/20"
    case "Integration Off":
      return "text-[#97a3b6] bg-[#2a2d39] border-[#343947]"
    default:
      return "text-amber-400 bg-amber-400/10 border-amber-400/20"
  }
}

function bridgeTone(healthy: boolean | null) {
  if (healthy === true) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
  if (healthy === false) return "text-red-400 bg-red-400/10 border-red-400/20"
  return "text-[#97a3b6] bg-[#2a2d39] border-[#343947]"
}

function shouldShowDnsRecord(state: VercelState) {
  return (
    (state.dnsStatus === "Verification Required" || state.dnsStatus === "Needs DNS") &&
    Boolean(state.requiredRecordType && state.requiredRecordValue)
  )
}

function AddDomainModal({
  tenants,
  allowTenantAssignment,
  onClose,
  onConfirm,
}: {
  tenants: TenantOption[]
  allowTenantAssignment: boolean
  onClose: () => void
  onConfirm: (domain: string, tenantId: string | null) => void
}) {
  const [domain, setDomain] = useState("")
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const handleSubmit = () => {
    const normalized = domain.trim().toLowerCase()
    if (!normalized) {
      setError("Domain is required.")
      return
    }
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(normalized)) {
      setError("Invalid domain format.")
      return
    }

    onConfirm(normalized, allowTenantAssignment ? tenantId : null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-[#151821] border border-[#343947] rounded-lg w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#e7edf8]">Add Shield Domain</h3>
            <p className="text-xs text-[#97a3b6] mt-0.5">
              The domain will be added to your rotation pool and synced to Vercel when integration is configured.
            </p>
          </div>
          <button onClick={onClose} className="text-[#97a3b6] hover:text-[#e7edf8]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-[#97a3b6]">Domain</label>
            <input
              value={domain}
              onChange={(event) => {
                setDomain(event.target.value)
                setError("")
              }}
              placeholder="shield-01.example.com"
              className="w-full bg-[#2a2d39] border border-[#343947] rounded-md px-3 py-2 text-xs font-mono text-[#e7edf8] placeholder:text-[#97a3b6] focus:outline-none focus:border-[#FFD600]/50"
            />
          </div>

          {allowTenantAssignment ? (
            <div className="space-y-2 border border-[#FFD600]/20 bg-[#FFD600]/5 rounded-md p-3">
              <div>
                <label className="text-xs font-semibold font-mono text-[#FFD600]">Tenant Assignment</label>
                <p className="text-[10px] text-[#97a3b6] mt-0.5 leading-tight">Super Admins can assign this domain to a tenant or keep it in the shared pool.</p>
              </div>
              <select
                value={tenantId ?? ""}
                onChange={(event) => setTenantId(event.target.value || null)}
                className="w-full bg-[#151821] border border-[#343947] rounded-md px-3 py-2 text-xs font-mono text-[#e7edf8] focus:outline-none focus:border-[#FFD600]/50"
              >
                <option value="">Shared Pool (all tenants)</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-md border border-[#FFD600]/20 bg-[#FFD600]/5 px-3 py-2 text-sm font-mono text-[#FFD600]">
              Domains added here are automatically assigned to your merchant tenant.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-[#97a3b6] bg-[#2a2d39] border border-[#343947] rounded-md hover:text-[#e7edf8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-xs font-mono text-background bg-[#FFD600] border border-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            Add Domain
          </button>
        </div>
      </div>
    </div>
  )
}

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
      <div className="bg-[#151821] border border-[#343947] rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold font-mono text-[#e7edf8]">Delete Shield Domain</p>
            <p className="text-xs font-mono text-[#97a3b6] mt-1">
              Remove <span className="text-[#e7edf8] font-semibold">{domain.domain}</span> from the rotation pool? This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono bg-[#2a2d39] border border-[#343947] rounded-md text-[#e7edf8] hover:bg-[#2a2d39]/80 transition-colors"
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

function AssignStoreModal({
  domain,
  stores,
  onClose,
  onAssign,
  onUnassign,
}: {
  domain: ShieldDomain
  stores: DomainStoreOption[]
  onClose: () => void
  onAssign: (storeId: string) => void
  onUnassign: (storeId: string) => void
}) {
  const eligibleStores = stores.filter((store) => {
    if (domain.tenantId && store.tenantId !== domain.tenantId) return false
    return true
  })
  const [storeId, setStoreId] = useState("")
  const assignedIds = new Set(domain.assignedStores.map((store) => store.id))
  const assignableStores = eligibleStores.filter((store) => !assignedIds.has(store.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-[#151821] border border-[#343947] rounded-lg w-full max-w-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#e7edf8]">Assign Domain to Store</h3>
            <p className="text-xs text-[#97a3b6] mt-0.5">
              Link <span className="text-[#e7edf8]">{domain.domain}</span> to one or more stores so storefront settings stay aligned with the shield facade.
            </p>
          </div>
          <button onClick={onClose} className="text-[#97a3b6] hover:text-[#e7edf8]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-[#343947] bg-[#2a2d39]/30 px-3 py-2">
            <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">Current Assignments</p>
            {domain.assignedStores.length === 0 ? (
              <p className="text-xs font-mono text-[#97a3b6] mt-2">No stores linked yet.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {domain.assignedStores.map((store) => (
                  <div key={store.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-[#e7edf8] truncate">{store.name}</p>
                      <p className="text-xs font-mono text-[#97a3b6] truncate">
                        {store.tenantName ?? "Tenant"} • {store.id.slice(0, 8)}
                      </p>
                    </div>
                    <button
                      onClick={() => onUnassign(store.id)}
                      className="px-2 py-1 text-xs font-mono text-red-400 border border-red-400/20 rounded-md hover:bg-red-400/10 transition-colors"
                    >
                      Unassign
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-[#97a3b6]">Add Store</label>
            <div className="flex gap-2">
              <select
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                className="w-full bg-[#2a2d39] border border-[#343947] rounded-md px-3 py-2 text-xs font-mono text-[#e7edf8] focus:outline-none focus:border-[#FFD600]/50"
              >
                <option value="">Select a store</option>
                {assignableStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}{store.tenantName ? ` • ${store.tenantName}` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!storeId) return
                  onAssign(storeId)
                }}
                disabled={!storeId}
                className="px-3 py-1.5 text-xs font-mono text-background bg-[#FFD600] border border-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OnboardingChecklist({
  isAdmin,
  integration,
  domains,
}: {
  isAdmin: boolean
  integration: IntegrationInfo
  domains: ShieldDomain[]
}) {
  const steps = [
    {
      label: "Connect Vercel project",
      done: integration.enabled,
      detail: integration.enabled
        ? `Project ${integration.projectRef} is linked for live domain onboarding.`
        : "Add VERCEL_API_TOKEN and VERCEL_PROJECT_ID, then restart the app.",
    },
    {
      label: "Add a shield domain",
      done: domains.length > 0,
      detail: domains.length > 0
        ? `${domains.length} domain${domains.length !== 1 ? "s" : ""} currently in the rotation pool.`
        : "Use Add Domain to insert the hostname into your shield pool.",
    },
    {
      label: "Point DNS to Vercel",
      done: domains.some((domain) => domain.vercel.domainAdded),
      detail: domains.some((domain) => domain.vercel.requiredRecordType)
        ? "Use Sync / Verify DNS to confirm the recommended Vercel record is in place."
        : "After adding the domain, configure the DNS record Vercel returns.",
    },
    {
      label: "Verify popup bridge",
      done: domains.some((domain) => domain.vercel.bridgeOk),
      detail: domains.some((domain) => domain.vercel.bridgeHealthy === false)
        ? "At least one domain reaches DNS Ready but its /checkout/popup health check is failing."
        : "When DNS turns Ready, the dashboard auto-checks /checkout/popup health.",
    },
    {
      label: "Assign to store",
      done: domains.some((domain) => domain.assignedStores.length > 0),
      detail: isAdmin
        ? "Map each ready domain to the right tenant store from the Domains table."
        : "Link the domain to the store that should expose the matching shield facade.",
    },
  ]

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-[#343947] flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-[#FFD600]" />
        <div>
          <h2 className="text-sm font-semibold text-[#e7edf8]">Onboarding Checklist</h2>
          <p className="text-xs text-[#97a3b6] mt-0.5">
            {isAdmin
              ? "Use this sequence to add, verify, and hand off shield domains safely."
              : "Follow this flow to bring a domain live without leaving the dashboard."}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-0">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`px-4 py-4 ${index < steps.length - 1 ? "border-b md:border-b-0 md:border-r border-[#343947]" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${
                  step.done
                    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                    : "text-[#97a3b6] bg-[#2a2d39] border-[#343947]"
                }`}
              >
                {step.done ? <CheckCircle2 className="w-3 h-3" /> : index + 1}
              </span>
              <span className="text-xs font-semibold text-[#e7edf8]">{step.label}</span>
            </div>
            <p className="text-sm text-[#97a3b6] mt-2 leading-5">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ShieldDomainsManagerPage() {
  const { data: session, status } = useSession()
  const role = (session?.user?.role as Role | undefined) ?? null
  const isAdmin = role === "SUPER_ADMIN"
  const apiBase = isAdmin ? "/api/admin/shield-domains" : "/api/merchant/shield-domains"

  const [domains, setDomains] = useState<ShieldDomain[]>([])
  const [stores, setStores] = useState<DomainStoreOption[]>([])
  const [integration, setIntegration] = useState<IntegrationInfo>({ enabled: false, projectRef: null, teamContext: null })
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ShieldDomain | null>(null)
  const [assignTarget, setAssignTarget] = useState<ShieldDomain | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "shared" | "tenant" | "verified" | "pending" | "failed">("all")
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const fetchDomains = useCallback(async () => {
    if (!role) return

    setLoading(true)
    try {
      const res = await fetch(apiBase, { cache: "no-store" })
      const data = (await res.json()) as DomainApiResponse
      setDomains(data.domains ?? [])
      setStores(data.stores ?? [])
      setIntegration(data.integration ?? { enabled: false, projectRef: null, teamContext: null })
    } catch {
      setDomains([])
      setStores([])
    } finally {
      setLoading(false)
    }
  }, [apiBase, role])

  useEffect(() => {
    if (status !== "authenticated" || !role) return

    fetchDomains()

    if (isAdmin) {
      fetch("/api/admin/tenants")
        .then((res) => res.json())
        .then((data) => {
          setTenants(((data.tenants ?? []) as TenantApiRow[]).map((tenant) => ({
            id: tenant.id,
            name: tenant.name,
          })))
        })
        .catch(() => {})
    }
  }, [fetchDomains, isAdmin, role, status])

  const handleAdd = async (domain: string, tenantId: string | null) => {
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, tenantId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Failed to add domain.")
        return
      }

      setShowAdd(false)
      await fetchDomains()
    } catch {
      alert("Network error.")
    }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    setBusyKey(`toggle-${id}`)
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !isActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Failed to update domain.")
        return
      }
      await fetchDomains()
    } finally {
      setBusyKey(null)
    }
  }

  const handleSync = async (id: string) => {
    setBusyKey(`sync-${id}`)
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "syncVercel" }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Failed to sync domain with Vercel.")
        return
      }
      await fetchDomains()
    } finally {
      setBusyKey(null)
    }
  }

  const handleVerify = async (id: string) => {
    setBusyKey(`verify-${id}`)
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "verifyDns" }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Failed to verify DNS.")
        return
      }
      await fetchDomains()
    } finally {
      setBusyKey(null)
    }
  }

  const handleAssignStore = async (domainId: string, storeId: string) => {
    setBusyKey(`assign-${domainId}`)
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: domainId, action: "assignStore", storeId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Failed to assign store.")
        return
      }

      setDomains((prev) => prev.map((item) => (item.id === domainId ? (data.domain as ShieldDomain) : item)))
      setStores((data.stores as DomainStoreOption[]) ?? stores)
    } finally {
      setBusyKey(null)
    }
  }

  const handleUnassignStore = async (domainId: string, storeId: string) => {
    setBusyKey(`assign-${domainId}`)
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: domainId, action: "unassignStore", storeId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Failed to unassign store.")
        return
      }

      setDomains((prev) => prev.map((item) => (item.id === domainId ? (data.domain as ShieldDomain) : item)))
      setStores((data.stores as DomainStoreOption[]) ?? stores)
    } finally {
      setBusyKey(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setBusyKey(`delete-${deleteTarget.id}`)
    try {
      const res = await fetch(`${apiBase}?id=${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Failed to delete domain.")
        return
      }
      setDeleteTarget(null)
      await fetchDomains()
    } finally {
      setBusyKey(null)
    }
  }

  const filtered = useMemo(
    () =>
      domains.filter((domain) => {
        if (filter === "active" && !domain.isActive) return false
        if (filter === "inactive" && domain.isActive) return false
        if (filter === "shared" && domain.tenantId) return false
        if (filter === "tenant" && !domain.tenantId) return false
        if (filter === "verified" && domain.vercel.bridgeHealthy !== true) return false
        if (filter === "failed" && domain.vercel.bridgeHealthy !== false) return false
        if (filter === "pending" && domain.vercel.bridgeHealthy !== null) return false

        if (search && !domain.domain.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [domains, filter, search]
  )

  const readyCount = domains.filter((domain) => domain.vercel.bridgeOk).length
  const activeCount = domains.filter((domain) => domain.isActive).length
  const needsActionCount = domains.filter((domain) => !domain.vercel.bridgeOk).length

  return (
    <DashboardShell>

      {showAdd && (
        <AddDomainModal
          tenants={tenants}
          allowTenantAssignment={isAdmin}
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

      {assignTarget && (
        <AssignStoreModal
          domain={assignTarget}
          stores={stores}
          onClose={() => setAssignTarget(null)}
          onAssign={(storeId) => handleAssignStore(assignTarget.id, storeId)}
          onUnassign={(storeId) => handleUnassignStore(assignTarget.id, storeId)}
        />
      )}

      <main className="w-full px-6 md:px-8 py-8 space-y-6 w-full">
        <DashboardPageHeader
  title="Domain Rotation Pool"
  description={isAdmin ? "Manage shared and tenant-specific shield domains, then verify DNS directly against Vercel." : "Manage your shield domains and verify popup bridge readiness before assigning them to stores."}
  eyebrow={
    isAdmin ? (
      <div className="flex items-center gap-2">
        <span className="bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">SUPER ADMIN</span>
        <span>SHIELD DOMAINS</span>
      </div>
    ) : "MERCHANT / SHIELD DOMAINS"
  }
  action={
    <div className="flex items-center gap-2">
      <a
        href="/docs/shield-domain"
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#e7edf8] bg-[#2a2d39] border border-[#343947] rounded-md hover:bg-[#343947] transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Shield Guide
      </a>
      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#151821] bg-[#FFD600] border border-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Domain
      </button>
    </div>
  }
/>

        {isAdmin && (
          <div className="bg-[#151821] border-y border-r border-[#343947] border-l-4 border-l-[#FFD600] rounded-r-lg relative overflow-hidden shadow-sm" data-ui-version="grid-background-v1">
            <GridBackground />
            <div className="relative z-10 px-5 py-4 flex items-start gap-3 bg-[#1f222c]/80 backdrop-blur-sm">
              <Shield className="w-5 h-5 text-[#FFD600] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-[#e7edf8]">Super Admin Domain Control</h2>
                <p className="text-xs text-[#97a3b6] mt-0.5">
                  Manage shield domains across tenants, shared pools, store assignments, DNS verification, and routing ownership.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={`${CARD} relative overflow-hidden`} data-ui-version="grid-background-v1">
          <GridBackground />
          <div className="relative z-10 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between bg-[#1f222c]/80 backdrop-blur-sm">
            <div className="flex items-start gap-2">
              <Activity className={`w-4 h-4 mt-0.5 ${integration.enabled ? "text-[#FFD600]" : "text-amber-400"}`} />
              <div>
                <p className="text-xs font-semibold text-[#e7edf8]">
                  {integration.enabled ? "Vercel Project Connected" : "Vercel API Integration Required"}
                </p>
                <p className="text-sm text-[#97a3b6]">
                  {integration.enabled
                    ? `Domains sync against project ${integration.projectRef}${integration.teamContext ? ` (${integration.teamContext})` : ""}.`
                    : "Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID in Vercel project settings, then restart the app to enable live add, sync, and DNS verification."}
                </p>
              </div>
            </div>
            <div className="text-sm font-mono text-[#97a3b6]">
              Popup bridge target: <span className="text-[#e7edf8]">/checkout/popup</span>
            </div>
          </div>
        </div>

        <OnboardingChecklist isAdmin={isAdmin} integration={integration} domains={domains} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">Total Domains</span>
            <span className="text-xl font-mono font-bold text-[#e7edf8]">{domains.length}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">Active</span>
            <span className="text-xl font-mono font-bold text-emerald-400">{activeCount}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">Bridge Ready</span>
            <span className="text-xl font-mono font-bold text-[#FFD600]">{readyCount}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">Needs Action</span>
            <span className="text-xl font-mono font-bold text-amber-400">{needsActionCount}</span>
          </div>
        </div>

        <div className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#343947]">
            <div className="flex items-center gap-2 bg-[#2a2d39] border border-[#343947] rounded-md px-3 py-1.5 flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-[#97a3b6] shrink-0" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search domains..."
                className="bg-transparent text-xs font-mono text-[#e7edf8] placeholder:text-[#97a3b6] focus:outline-none w-full"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-[#97a3b6] hover:text-[#e7edf8]">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {(isAdmin
                ? ["all", "active", "inactive", "shared", "tenant", "verified", "pending", "failed"]
                : ["all", "active", "inactive", "verified", "pending", "failed"]
              ).map((option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option as any)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors capitalize ${
                    filter === option
                      ? "bg-[#FFD600]/10 border-[#FFD600]/30 text-[#FFD600]"
                      : "bg-[#2a2d39] border-[#343947] text-[#97a3b6] hover:text-[#e7edf8]"
                  }`}
                >
                  {option === "shared" ? "Shared Pool" : option === "tenant" ? "Tenant Domains" : option}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs font-mono text-[#97a3b6]">
              {filtered.length} domain{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-[#343947] bg-[#2a2d39]/50">
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">Domain</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">Vercel</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">DNS</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">Bridge</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">Assigned To</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">Added</th>
                  <th className="text-right px-4 py-2.5 text-[#97a3b6] font-medium pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  [...Array(4)].map((_, index) => (
                    <tr key={index} className="border-b border-[#343947]/60">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="h-4 bg-[#2a2d39]/60 rounded animate-pulse" style={{ width: `${50 + (index * 13) % 40}%` }} />
                      </td>
                    </tr>
                  ))}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[#97a3b6]">
                      {domains.length === 0
                        ? 'No shield domains configured yet. Click "Add Domain" to get started.'
                        : "No domains match your search."}
                    </td>
                  </tr>
                )}

                {!loading &&
                  filtered.map((domain) => (
                    <tr key={domain.id} className="border-b border-[#343947]/60 hover:bg-[#2a2d39]/30 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-2">
                          <div className="w-7 h-7 rounded-md bg-[#2a2d39] border border-[#343947] flex items-center justify-center shrink-0 mt-0.5">
                            <Globe className="w-3.5 h-3.5 text-[#FFD600]" />
                          </div>
                          <div className="min-w-[220px]">
                            <div className="flex items-center gap-2">
                              <span className="text-[#e7edf8] font-semibold">{domain.domain}</span>
                              <a
                                href={`https://${domain.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#97a3b6] hover:text-[#e7edf8]"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-xs text-[#97a3b6] mt-0.5">
                              Popup bridge: {domain.vercel.bridgeUrl}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${
                            domain.isActive
                              ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                              : "text-red-400 bg-red-400/10 border-red-400/20"
                          }`}
                        >
                          {domain.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {domain.isActive ? "Active" : "Inactive"}
                        </span>
                        <div className="text-xs text-[#97a3b6] mt-1">Checked {timeAgo(domain.lastCheck)}</div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${vercelTone(domain.vercel.projectStatus)}`}>
                          {domain.vercel.projectStatus}
                        </span>
                        <div className="text-xs text-[#97a3b6] mt-1">
                          {domain.vercel.configuredBy ? `Configured by ${domain.vercel.configuredBy}` : domain.vercel.statusMessage}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${dnsTone(domain.vercel.dnsStatus)}`}>
                          {domain.vercel.dnsStatus}
                        </span>
                        {shouldShowDnsRecord(domain.vercel) ? (
                          <div className="text-xs text-[#97a3b6] mt-1 max-w-[220px] break-all">
                            {domain.vercel.requiredRecordType} {domain.vercel.requiredRecordName || domain.domain} → {domain.vercel.requiredRecordValue}
                          </div>
                        ) : (
                          <div className="text-xs text-[#97a3b6] mt-1">{domain.vercel.statusMessage}</div>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${bridgeTone(domain.vercel.bridgeHealthy)}`}>
                          {domain.vercel.bridgeHealthy === true
                            ? "Healthy"
                            : domain.vercel.bridgeHealthy === false
                              ? "Failed"
                              : "Pending"}
                        </span>
                        <div className="text-xs text-[#97a3b6] mt-1">
                          {domain.vercel.bridgeCheckedAt
                            ? `Popup checked ${timeAgo(domain.vercel.bridgeCheckedAt)}${domain.vercel.bridgeStatusCode ? ` • HTTP ${domain.vercel.bridgeStatusCode}` : ""}`
                            : domain.vercel.bridgeMessage || "Bridge health runs automatically once DNS is ready."}
                        </div>
                        {domain.vercel.bridgeMessage && domain.vercel.bridgeCheckedAt ? (
                          <div className="text-xs text-[#97a3b6] mt-1 max-w-[240px] break-words">
                            {domain.vercel.bridgeMessage}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="space-y-1">
                          {domain.tenantName ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-violet-400/20 bg-violet-400/10 text-violet-400 text-[11px] font-semibold w-fit">
                              <Building2 className="w-3 h-3" />
                              {domain.tenantName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-sky-400/20 bg-sky-400/10 text-sky-400 text-[11px] font-semibold w-fit">
                              <Shield className="w-3 h-3" />
                              Shared Pool
                            </span>
                          )}

                          {domain.assignedStores.length > 0 ? (
                            domain.assignedStores.slice(0, 2).map((store) => (
                              <div key={store.id} className="flex items-center gap-1.5 text-xs text-[#97a3b6]">
                                <Store className="w-3 h-3 text-[#FFD600]" />
                                <span className="truncate">{store.name}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-[#97a3b6]">No store linked</div>
                          )}
                          {domain.assignedStores.length > 2 && (
                            <div className="text-xs text-[#97a3b6]">
                              +{domain.assignedStores.length - 2} more
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-[#97a3b6] align-top">
                        {domain.createdAt ? new Date(domain.createdAt).toISOString().slice(0, 10) : "—"}
                      </td>

                      <td className="px-4 py-3 pr-4 text-right align-top">
                        <div className="flex items-center justify-end gap-1">
                          {domain.canManage && (
                            <>
                              <button
                                onClick={() => setAssignTarget(domain)}
                                disabled={busyKey === `assign-${domain.id}`}
                                title="Assign to store"
                                className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-[#FFD600] hover:border-[#FFD600]/30 hover:bg-[#FFD600]/10 transition-colors disabled:opacity-50"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleSync(domain.id)}
                                disabled={busyKey === `sync-${domain.id}`}
                                title="Sync with Vercel"
                                className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-[#FFD600] hover:border-[#FFD600]/30 hover:bg-[#FFD600]/10 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${busyKey === `sync-${domain.id}` ? "animate-spin" : ""}`} />
                              </button>
                              {!domain.vercel.bridgeOk && (
                                <button
                                  onClick={() => handleVerify(domain.id)}
                                  disabled={busyKey === `verify-${domain.id}` || !integration.enabled}
                                  title="Verify DNS"
                                  className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                                >
                                  <Activity className={`w-3.5 h-3.5 ${busyKey === `verify-${domain.id}` ? "animate-pulse" : ""}`} />
                                </button>
                              )}
                              <button
                                onClick={() => handleToggle(domain.id, domain.isActive)}
                                disabled={busyKey === `toggle-${domain.id}`}
                                title={domain.isActive ? "Deactivate" : "Activate"}
                                className={`p-1.5 rounded-md border transition-colors disabled:opacity-50 ${
                                  domain.isActive
                                    ? "border-[#343947] text-[#97a3b6] hover:text-amber-400 hover:border-amber-400/30 hover:bg-amber-400/10"
                                    : "border-emerald-400/30 text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                                }`}
                              >
                                {domain.isActive ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => setDeleteTarget(domain)}
                                disabled={busyKey === `delete-${domain.id}`}
                                title="Delete domain"
                                className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {!domain.canManage && <span className="text-xs text-[#97a3b6]">Read only</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </DashboardShell>
  )
}
