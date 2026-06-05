"use client"

import { useState } from "react"
import useSWR from "swr"
import { X, Loader2, Globe, CheckCircle2, AlertTriangle } from "lucide-react"

interface DomainRow {
  id: string
  domain: string
  is_active: boolean
  health_ok: boolean
  bundle_id: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onChanged: () => void
  bundleId: string
  bundleName: string
}

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

export function PaymentIdentityDomainsDialog({ open, onClose, onChanged, bundleId, bundleName }: Props) {
  const { data, error, isLoading, mutate } = useSWR(
    open ? `/api/merchant/payment-identities/domains?bundleId=${bundleId}` : null,
    fetcher
  )
  const domains: DomainRow[] = data?.domains ?? []
  const assignedCount = domains.filter(d => d.bundle_id === bundleId).length

  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function toggle(domain: DomainRow) {
    setActionError(null)
    setTogglingId(domain.id)
    const action = domain.bundle_id === bundleId ? "unassign" : "assign"
    try {
      const res = await fetch("/api/merchant/payment-identities/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId, domainId: domain.id, action }),
      })
      const result = await res.json()
      if (!res.ok) { setActionError(result.error || `Failed (${res.status})`); return }
      mutate()
      onChanged()
    } catch (err: any) {
      setActionError(err.message || "Network error")
    } finally {
      setTogglingId(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[680px] bg-[#151821] border border-[#343947] rounded-xl shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#343947] bg-[#1f222c]/60 rounded-t-xl">
          <div>
            <h2 className="text-base font-mono font-semibold text-[#e7edf8]">Shield Domains — {bundleName}</h2>
            <p className="text-xs text-[#6b7280] mt-0.5 font-mono">
              Pick the domains this identity rotates through. Checkout picks one at random per order.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#343947]/40 text-[#6b7280] hover:text-[#e7edf8] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-[#97a3b6]">
              {isLoading ? "Loading…" : `${assignedCount} of ${domains.length} assigned to this identity`}
            </span>
            <a href="/domains" className="text-xs font-mono text-[#FFD600] hover:underline">+ Manage domains</a>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 font-mono">
              Failed to load domains.
            </div>
          )}
          {actionError && (
            <div className="flex items-center gap-2 text-sm text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError}
            </div>
          )}

          {!isLoading && !error && domains.length === 0 && (
            <div className="text-center py-10">
              <Globe className="w-10 h-10 text-[#343947] mx-auto mb-3" />
              <p className="text-sm text-[#6b7280] font-mono">You have no shield domains yet.</p>
              <p className="text-xs text-[#4a5568] font-mono mt-1">Register them under <a href="/domains" className="text-[#FFD600] hover:underline">Domains</a> first.</p>
            </div>
          )}

          {!isLoading && domains.length > 0 && (
            <div className="bg-[#0d0f14] border border-[#343947] rounded-lg divide-y divide-[#343947]/40">
              {domains.map(d => {
                const assignedHere = d.bundle_id === bundleId
                const assignedElsewhere = d.bundle_id != null && !assignedHere
                const healthy = d.is_active && d.health_ok
                return (
                  <label key={d.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#151821]/60">
                    <input
                      type="checkbox"
                      checked={assignedHere}
                      disabled={togglingId === d.id}
                      onChange={() => toggle(d)}
                      className="accent-[#FFD600]"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-mono text-[#e7edf8] truncate">{d.domain}</span>
                      <span className="flex items-center gap-2 mt-0.5">
                        {healthy ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Healthy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
                            <AlertTriangle className="w-2.5 h-2.5" /> Needs attention
                          </span>
                        )}
                        {assignedElsewhere && (
                          <span className="text-[10px] font-mono text-[#6b7280]">• linked to another identity (checking moves it here)</span>
                        )}
                      </span>
                    </span>
                    {togglingId === d.id && <Loader2 className="w-4 h-4 animate-spin text-[#6b7280]" />}
                  </label>
                )
              })}
            </div>
          )}

          <p className="text-xs text-[#6b7280] font-mono">
            Only domains you own are listed. Unhealthy domains are skipped at checkout, so assign at least two healthy domains for rotation.
          </p>
        </div>
      </div>
    </div>
  )
}
