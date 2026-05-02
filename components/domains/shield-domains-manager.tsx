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
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { domainsCopy } from "@/lib/i18n/domains"

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

function timeAgo(iso: string | null, t: any): string {
  if (!iso) return t.never
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t.justNow
  if (mins < 60) return `${mins}${t.mAgo}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}${t.hAgo}`
  return `${Math.floor(hrs / 24)}${t.dAgo}`
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
  t,
}: {
  tenants: TenantOption[]
  allowTenantAssignment: boolean
  onClose: () => void
  onConfirm: (domain: string, tenantId: string | null) => void
  t: any
}) {
  const [domain, setDomain] = useState("")
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const handleSubmit = () => {
    const normalized = domain.trim().toLowerCase()
    if (!normalized) {
      setError(t.domainRequired)
      return
    }
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(normalized)) {
      setError(t.invalidDomain)
      return
    }

    onConfirm(normalized, allowTenantAssignment ? tenantId : null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-[#151821] border border-[#343947] rounded-lg w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#e7edf8]">{t.addDomainTitle}</h3>
            <p className="text-xs text-[#97a3b6] mt-0.5">
              {t.addDomainDesc}
            </p>
          </div>
          <button onClick={onClose} className="text-[#97a3b6] hover:text-[#e7edf8]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-[#97a3b6]">{t.domainLabel}</label>
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
                <label className="text-xs font-semibold font-mono text-[#FFD600]">{t.tenantAssignment}</label>
                <p className="text-[10px] text-[#97a3b6] mt-0.5 leading-tight">{t.tenantAssignmentDesc}</p>
              </div>
              <select
                value={tenantId ?? ""}
                onChange={(event) => setTenantId(event.target.value || null)}
                className="w-full bg-[#151821] border border-[#343947] rounded-md px-3 py-2 text-xs font-mono text-[#e7edf8] focus:outline-none focus:border-[#FFD600]/50"
              >
                <option value="">{t.sharedPoolAll}</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-md border border-[#FFD600]/20 bg-[#FFD600]/5 px-3 py-2 text-sm font-mono text-[#FFD600]">
              {t.merchantAutoAssigned}
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
            {t.cancel}
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-xs font-mono text-background bg-[#FFD600] border border-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            {t.addDomain}
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
  t,
}: {
  domain: ShieldDomain
  onClose: () => void
  onConfirm: () => void
  t: any
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-[#151821] border border-[#343947] rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold font-mono text-[#e7edf8]">{t.deleteDomainTitle}</p>
            <p className="text-xs font-mono text-[#97a3b6] mt-1">
              {t.deleteDomainDesc1} <span className="text-[#e7edf8] font-semibold">{domain.domain}</span> {t.deleteDomainDesc2}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono bg-[#2a2d39] border border-[#343947] rounded-md text-[#e7edf8] hover:bg-[#2a2d39]/80 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-mono bg-red-500/10 border border-red-500/30 rounded-md text-red-400 hover:bg-red-500/20 transition-colors"
          >
            {t.deleteDomainBtn}
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
  t,
}: {
  domain: ShieldDomain
  stores: DomainStoreOption[]
  onClose: () => void
  onAssign: (storeId: string) => void
  onUnassign: (storeId: string) => void
  t: any
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
            <h3 className="text-sm font-semibold text-[#e7edf8]">{t.assignStoreTitle}</h3>
            <p className="text-xs text-[#97a3b6] mt-0.5">
              {t.assignStoreDesc1} <span className="text-[#e7edf8]">{domain.domain}</span> {t.assignStoreDesc2}
            </p>
          </div>
          <button onClick={onClose} className="text-[#97a3b6] hover:text-[#e7edf8]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-[#343947] bg-[#2a2d39]/30 px-3 py-2">
            <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.currentAssignments}</p>
            {domain.assignedStores.length === 0 ? (
              <p className="text-xs font-mono text-[#97a3b6] mt-2">{t.noStoresLinkedYet}</p>
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
                      {t.unassign}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-[#97a3b6]">{t.addStore}</label>
            <div className="flex gap-2">
              <select
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                className="w-full bg-[#2a2d39] border border-[#343947] rounded-md px-3 py-2 text-xs font-mono text-[#e7edf8] focus:outline-none focus:border-[#FFD600]/50"
              >
                <option value="">{t.selectStore}</option>
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
                {t.assign}
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
  t,
}: {
  isAdmin: boolean
  integration: IntegrationInfo
  domains: ShieldDomain[]
  t: any
}) {
  const steps = [
    {
      label: t.step1Label,
      done: integration.enabled,
      detail: integration.enabled
        ? t.step1Done(integration.projectRef)
        : t.step1Pending,
    },
    {
      label: t.step2Label,
      done: domains.length > 0,
      detail: domains.length > 0
        ? t.step2Done(domains.length)
        : t.step2Pending,
    },
    {
      label: t.step3Label,
      done: domains.some((domain) => domain.vercel.domainAdded),
      detail: domains.some((domain) => domain.vercel.requiredRecordType)
        ? t.step3Done
        : t.step3Pending,
    },
    {
      label: t.step4Label,
      done: domains.some((domain) => domain.vercel.bridgeOk),
      detail: domains.some((domain) => domain.vercel.bridgeHealthy === false)
        ? t.step4Done
        : t.step4Pending,
    },
    {
      label: t.step5Label,
      done: domains.some((domain) => domain.assignedStores.length > 0),
      detail: isAdmin
        ? t.step5DoneAdmin
        : t.step5DoneMerchant,
    },
  ]

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-[#343947] flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-[#FFD600]" />
        <div>
          <h2 className="text-sm font-semibold text-[#e7edf8]">{t.onboardingTitle}</h2>
          <p className="text-xs text-[#97a3b6] mt-0.5">
            {isAdmin ? t.onboardingDescAdmin : t.onboardingDescMerchant}
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

  const { language } = useLanguage()
  const t = domainsCopy[language]

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
        alert(data.error ?? t.errAddDomain)
        return
      }

      setShowAdd(false)
      await fetchDomains()
    } catch {
      alert(t.errNetwork)
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
        alert(data.error ?? t.errUpdateDomain)
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
        alert(data.error ?? t.errSyncDomain)
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
        alert(data.error ?? t.errVerifyDns)
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
        alert(data.error ?? t.errAssignStore)
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
        alert(data.error ?? t.errUnassignStore)
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
        alert(data.error ?? t.errDeleteDomain)
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
          t={t}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          domain={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          t={t}
        />
      )}

      {assignTarget && (
        <AssignStoreModal
          domain={assignTarget}
          stores={stores}
          onClose={() => setAssignTarget(null)}
          onAssign={(storeId) => handleAssignStore(assignTarget.id, storeId)}
          onUnassign={(storeId) => handleUnassignStore(assignTarget.id, storeId)}
          t={t}
        />
      )}

      <main className="w-full px-6 md:px-8 py-8 space-y-6 w-full" data-ui-version="domains-i18n-vi-phase4">
        <DashboardPageHeader
  title={isAdmin ? t.superAdminTitle : t.merchantTitle}
  description={isAdmin ? t.superAdminDesc : t.merchantDesc}
  eyebrow={
    isAdmin ? (
      <div className="flex items-center gap-2">
        <span className="bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">{t.superAdminBadge}</span>
        <span>{t.superAdminEyebrow}</span>
      </div>
    ) : t.merchantEyebrow
  }
  action={
    <div className="flex items-center gap-2">
      <a
        href="/docs/shield-domain"
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#e7edf8] bg-[#2a2d39] border border-[#343947] rounded-md hover:bg-[#343947] transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        {t.shieldGuide}
      </a>
      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#151821] bg-[#FFD600] border border-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t.addDomain}
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
                <h2 className="text-sm font-semibold text-[#e7edf8]">{t.saDomainControl}</h2>
                <p className="text-xs text-[#97a3b6] mt-0.5">
                  {t.saDomainControlDesc}
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
                  {integration.enabled ? t.vercelConnected : t.vercelRequired}
                </p>
                <p className="text-sm text-[#97a3b6]">
                  {integration.enabled
                    ? t.vercelConnectedDesc(integration.projectRef ?? "", integration.teamContext)
                    : t.vercelRequiredDesc}
                </p>
              </div>
            </div>
            <div className="text-sm font-mono text-[#97a3b6]">
              {t.popupBridgeTarget} <span className="text-[#e7edf8]">/checkout/popup</span>
            </div>
          </div>
        </div>

        <OnboardingChecklist isAdmin={isAdmin} integration={integration} domains={domains} t={t} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.totalDomains}</span>
            <span className="text-xl font-mono font-bold text-[#e7edf8]">{domains.length}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.activeCount}</span>
            <span className="text-xl font-mono font-bold text-emerald-400">{activeCount}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.bridgeReady}</span>
            <span className="text-xl font-mono font-bold text-[#FFD600]">{readyCount}</span>
          </div>
          <div className={`${CARD} px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.needsAction}</span>
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
                placeholder={t.searchPlaceholder}
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
                  {option === "all" ? t.filterAll :
                   option === "active" ? t.filterActive :
                   option === "inactive" ? t.filterInactive :
                   option === "shared" ? t.filterShared :
                   option === "tenant" ? t.filterTenant :
                   option === "verified" ? t.filterVerified :
                   option === "pending" ? t.filterPending :
                   option === "failed" ? t.filterFailed : option}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs font-mono text-[#97a3b6]">
              {t.domainsCount(filtered.length)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-[#343947] bg-[#2a2d39]/50">
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thDomain}</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thStatus}</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thVercel}</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thDns}</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thBridge}</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thAssignedTo}</th>
                  <th className="text-left px-4 py-2.5 text-[#97a3b6] font-medium">{t.thAdded}</th>
                  <th className="text-right px-4 py-2.5 text-[#97a3b6] font-medium pr-6">{t.thActions}</th>
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
                        ? t.noDomainsYet
                        : t.noDomainsMatch}
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
                              {t.popupBridge} {domain.vercel.bridgeUrl}
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
                          {domain.isActive ? t.active : t.inactive}
                        </span>
                        <div className="text-xs text-[#97a3b6] mt-1">{t.checked} {timeAgo(domain.lastCheck, t)}</div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${vercelTone(domain.vercel.projectStatus)}`}>
                          {domain.vercel.projectStatus === "Integration Off" ? t.vIntegrationOff :
                           domain.vercel.projectStatus === "Error" ? t.vError :
                           domain.vercel.projectStatus === "Linked" ? t.vLinked :
                           domain.vercel.projectStatus === "Not Linked" ? t.vNotLinked : domain.vercel.projectStatus}
                        </span>
                        <div className="text-xs text-[#97a3b6] mt-1">
                          {domain.vercel.configuredBy ? `${t.configuredBy} ${domain.vercel.configuredBy}` : domain.vercel.statusMessage}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-sm font-semibold ${dnsTone(domain.vercel.dnsStatus)}`}>
                          {domain.vercel.dnsStatus === "Ready" ? t.vReady :
                           domain.vercel.dnsStatus === "Verification Required" ? t.vVerificationRequired :
                           domain.vercel.dnsStatus === "Needs DNS" ? t.vNeedsDns :
                           domain.vercel.dnsStatus === "Integration Off" ? t.vIntegrationOff :
                           domain.vercel.dnsStatus === "Error" ? t.vError :
                           domain.vercel.dnsStatus === "Not Linked" ? t.vNotLinked : domain.vercel.dnsStatus}
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
                            ? t.healthy
                            : domain.vercel.bridgeHealthy === false
                              ? t.failed
                              : t.pending}
                        </span>
                        <div className="text-xs text-[#97a3b6] mt-1">
                          {domain.vercel.bridgeCheckedAt
                            ? `${t.popupChecked} ${timeAgo(domain.vercel.bridgeCheckedAt, t)}${domain.vercel.bridgeStatusCode ? ` • ${t.http} ${domain.vercel.bridgeStatusCode}` : ""}`
                            : domain.vercel.bridgeMessage || t.bridgeHealthAuto}
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
                              {t.sharedPool}
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
                            <div className="text-xs text-[#97a3b6]">{t.noStoreLinked}</div>
                          )}
                          {domain.assignedStores.length > 2 && (
                            <div className="text-xs text-[#97a3b6]">
                              {t.moreStores(domain.assignedStores.length - 2)}
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
                                title={t.assignToStore}
                                className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-[#FFD600] hover:border-[#FFD600]/30 hover:bg-[#FFD600]/10 transition-colors disabled:opacity-50"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleSync(domain.id)}
                                disabled={busyKey === `sync-${domain.id}`}
                                title={t.syncWithVercel}
                                className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-[#FFD600] hover:border-[#FFD600]/30 hover:bg-[#FFD600]/10 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${busyKey === `sync-${domain.id}` ? "animate-spin" : ""}`} />
                              </button>
                              {!domain.vercel.bridgeOk && (
                                <button
                                  onClick={() => handleVerify(domain.id)}
                                  disabled={busyKey === `verify-${domain.id}` || !integration.enabled}
                                  title={t.verifyDns}
                                  className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-emerald-400 hover:border-emerald-400/30 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                                >
                                  <Activity className={`w-3.5 h-3.5 ${busyKey === `verify-${domain.id}` ? "animate-pulse" : ""}`} />
                                </button>
                              )}
                              <button
                                onClick={() => handleToggle(domain.id, domain.isActive)}
                                disabled={busyKey === `toggle-${domain.id}`}
                                title={domain.isActive ? t.deactivate : t.activate}
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
                                title={t.deleteDomain}
                                className="p-1.5 rounded-md border border-[#343947] text-[#97a3b6] hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {!domain.canManage && <span className="text-xs text-[#97a3b6]">{t.readOnly}</span>}
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
