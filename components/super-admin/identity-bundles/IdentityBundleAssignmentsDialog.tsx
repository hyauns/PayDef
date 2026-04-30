"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  X, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Users, Globe, Link2, Unlink,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string
  name: string
  email: string
  status: string
  bundle_id: string | null
  display_profile_id: string | null
  display_profile_name: string | null
}

interface DomainRow {
  id: string
  domain: string
  is_active: boolean
  health_ok: boolean
  tenant_id: string | null
  bundle_id: string | null
  display_profile_id: string | null
  tenant_name: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onAssignmentsChanged: () => void
  bundleId: string
  bundleName: string
  publicBrandName: string | null
  industryVertical: string
}

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

// ─── Component ────────────────────────────────────────────────────────────────

export function IdentityBundleAssignmentsDialog({
  open, onClose, onAssignmentsChanged,
  bundleId, bundleName, publicBrandName, industryVertical,
}: Props) {
  const { data, error, isLoading, mutate } = useSWR(
    open ? `/api/admin/identity-bundles/assignments?bundleId=${bundleId}` : null,
    fetcher
  )

  const accounts: AccountRow[] = data?.accounts ?? []
  const domains: DomainRow[] = data?.domains ?? []

  const [activeTab, setActiveTab] = useState<"accounts" | "domains">("accounts")
  const [actionTarget, setActionTarget] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  async function handleAssignment(type: "merchant_account" | "shield_domain", targetId: string, action: "assign" | "unassign") {
    setActionTarget(targetId)
    setActionError(null)
    setActionSuccess(null)

    try {
      const res = await fetch("/api/admin/identity-bundles/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId, type, targetId, action }),
      })
      const result = await res.json()
      if (!res.ok) {
        setActionError(result.error || `Failed (${res.status})`)
        return
      }
      setActionSuccess(action === "assign" ? "Assigned" : "Unassigned")
      mutate()
      onAssignmentsChanged()
      setTimeout(() => setActionSuccess(null), 2000)
    } catch (err: any) {
      setActionError(err.message || "Network error")
    } finally {
      setActionTarget(null)
    }
  }

  if (!open) return null

  const assignedAccounts = accounts.filter(a => a.bundle_id === bundleId)
  const unassignedAccounts = accounts.filter(a => a.bundle_id !== bundleId)
  const assignedDomains = domains.filter(d => d.bundle_id === bundleId)
  const unassignedDomains = domains.filter(d => d.bundle_id !== bundleId)

  const TAB = "px-4 py-2 text-sm font-mono rounded-t-lg border border-b-0 transition-colors"
  const TAB_ACTIVE = `${TAB} bg-[#151821] text-[#e7edf8] border-[#343947]`
  const TAB_INACTIVE = `${TAB} bg-transparent text-[#6b7280] border-transparent hover:text-[#97a3b6]`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-[860px] bg-[#151821] border border-[#343947] rounded-xl shadow-2xl mx-4"
        data-ui-version="identity-bundle-assignments-manager-v1"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#343947] bg-[#1f222c]/60 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-mono font-semibold text-[#e7edf8]">
                Assignments — {bundleName}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                {publicBrandName && (
                  <span className="text-xs font-mono text-[#97a3b6]">Brand: {publicBrandName}</span>
                )}
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1f222c] text-[#97a3b6] border border-[#343947]">
                  {industryVertical}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#343947]/40 text-[#6b7280] hover:text-[#e7edf8] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[calc(100vh-160px)] overflow-y-auto">

          {/* Status messages */}
          {actionError && (
            <div className="flex items-center gap-2 text-sm text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError}
            </div>
          )}
          {actionSuccess && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {actionSuccess}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 font-mono">
              Failed to load assignments.
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-10 text-[#6b7280]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading assignments…
            </div>
          )}

          {!isLoading && !error && (
            <>
              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-[#343947]">
                <button className={activeTab === "accounts" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setActiveTab("accounts")}>
                  <Users className="w-3.5 h-3.5 inline mr-1.5" />
                  Merchant Accounts ({assignedAccounts.length}/{accounts.length})
                </button>
                <button className={activeTab === "domains" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setActiveTab("domains")}>
                  <Globe className="w-3.5 h-3.5 inline mr-1.5" />
                  Shield Domains ({assignedDomains.length}/{domains.length})
                </button>
              </div>

              {/* ── Merchant Accounts Tab ───────────────────────────────── */}
              {activeTab === "accounts" && (
                <div className="space-y-4">
                  {/* Assigned */}
                  <div>
                    <h4 className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                      Assigned to this Bundle ({assignedAccounts.length})
                    </h4>
                    {assignedAccounts.length === 0 ? (
                      <p className="text-sm text-[#6b7280] font-mono py-3">No merchant accounts assigned.</p>
                    ) : (
                      <div className="bg-[#0d0f14] border border-[#343947] rounded-lg divide-y divide-[#343947]/40">
                        {assignedAccounts.map(a => (
                          <div key={a.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <div className="text-sm font-mono text-[#e7edf8]">{a.name || a.email}</div>
                              <div className="text-xs text-[#6b7280] font-mono">
                                {a.email}{a.display_profile_name ? ` · Profile: ${a.display_profile_name}` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={a.status} />
                              <button
                                onClick={() => handleAssignment("merchant_account", a.id, "unassign")}
                                disabled={actionTarget === a.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-mono transition-colors disabled:opacity-50"
                              >
                                {actionTarget === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                                Unassign
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unassigned */}
                  {unassignedAccounts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-mono font-semibold text-[#97a3b6] uppercase tracking-wider mb-2">
                        Available ({unassignedAccounts.length})
                      </h4>
                      <div className="bg-[#0d0f14] border border-[#343947] rounded-lg divide-y divide-[#343947]/40">
                        {unassignedAccounts.map(a => (
                          <div key={a.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <div className="text-sm font-mono text-[#e7edf8]">{a.name || a.email}</div>
                              <div className="text-xs text-[#6b7280] font-mono">
                                {a.email}
                                {a.bundle_id ? ` · Bundle: other` : ""}
                                {a.display_profile_name ? ` · Profile: ${a.display_profile_name}` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={a.status} />
                              <button
                                onClick={() => handleAssignment("merchant_account", a.id, "assign")}
                                disabled={actionTarget === a.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#FFD600]/10 text-[#FFD600] hover:bg-[#FFD600]/20 border border-[#FFD600]/20 text-xs font-mono transition-colors disabled:opacity-50"
                              >
                                {actionTarget === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                                Assign
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Shield Domains Tab ──────────────────────────────────── */}
              {activeTab === "domains" && (
                <div className="space-y-4">
                  {/* Assigned */}
                  <div>
                    <h4 className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                      Assigned to this Bundle ({assignedDomains.length})
                    </h4>
                    {assignedDomains.length === 0 ? (
                      <p className="text-sm text-[#6b7280] font-mono py-3">No shield domains assigned.</p>
                    ) : (
                      <div className="bg-[#0d0f14] border border-[#343947] rounded-lg divide-y divide-[#343947]/40">
                        {assignedDomains.map(d => (
                          <div key={d.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <div className="text-sm font-mono text-[#e7edf8]">{d.domain}</div>
                              <div className="text-xs text-[#6b7280] font-mono">
                                {d.tenant_name || "Shared Pool"}
                                {d.display_profile_id ? " · Has profile" : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <DomainStatusBadge active={d.is_active} healthy={d.health_ok} />
                              <button
                                onClick={() => handleAssignment("shield_domain", d.id, "unassign")}
                                disabled={actionTarget === d.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-mono transition-colors disabled:opacity-50"
                              >
                                {actionTarget === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                                Unassign
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unassigned */}
                  {unassignedDomains.length > 0 && (
                    <div>
                      <h4 className="text-xs font-mono font-semibold text-[#97a3b6] uppercase tracking-wider mb-2">
                        Available ({unassignedDomains.length})
                      </h4>
                      <div className="bg-[#0d0f14] border border-[#343947] rounded-lg divide-y divide-[#343947]/40">
                        {unassignedDomains.map(d => (
                          <div key={d.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <div className="text-sm font-mono text-[#e7edf8]">{d.domain}</div>
                              <div className="text-xs text-[#6b7280] font-mono">
                                {d.tenant_name || "Shared Pool"}
                                {d.bundle_id ? " · Bundle: other" : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <DomainStatusBadge active={d.is_active} healthy={d.health_ok} />
                              <button
                                onClick={() => handleAssignment("shield_domain", d.id, "assign")}
                                disabled={actionTarget === d.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#FFD600]/10 text-[#FFD600] hover:bg-[#FFD600]/20 border border-[#FFD600]/20 text-xs font-mono transition-colors disabled:opacity-50"
                              >
                                {actionTarget === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                                Assign
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active" || status === "ACTIVE"
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
      isActive
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
    }`}>
      {status}
    </span>
  )
}

function DomainStatusBadge({ active, healthy }: { active: boolean; healthy: boolean }) {
  if (active && healthy) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="w-2.5 h-2.5" /> Healthy
      </span>
    )
  }
  if (active && !healthy) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <AlertTriangle className="w-2.5 h-2.5" /> Degraded
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
      <XCircle className="w-2.5 h-2.5" /> Inactive
    </span>
  )
}
