"use client"

import { useState, useEffect, useCallback } from "react"
import { MoreHorizontal, Pause, Play, RefreshCw, Loader2 } from "lucide-react"
import { SectionCard } from "./SectionCard"
import { DataTableShell } from "./DataTableShell"
import { StatusBadge } from "./StatusBadge"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { dashboardCopy } from "@/lib/i18n/dashboard"

type Status = "Active" | "Limited" | "Paused" | "Warm-up" | "Suspended"

interface Merchant {
  id: string
  name: string
  email: string
  shieldDomain: string
  currentVolume: number
  softLimit: number
  dailyLimit: number
  txCount: number
  status: Status
  isLimited: boolean
}

interface MerchantApiRow {
  id: string
  name: string
  email?: string | null
  shieldDomain?: string | null
  currentVolume?: number | null
  softLimit?: number | null
  dailyLimit?: number | null
  transactionCount?: number | null
  status: string
  isLimited?: boolean | null
}

// mapDbStatus moved to MerchantAccounts to use translation

function VolumeBar({ current, soft, limit, t }: { current: number; soft: number; limit: number; t: any }) {
  const pct = Math.min((current / limit) * 100, 100)
  const isZero = current === 0
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-400" : "bg-emerald-400"
  
  return (
    <div className="flex items-center gap-4 min-w-0 group-hover:opacity-100 opacity-90 transition-opacity">
      <div className="w-24 h-2 bg-[#343947] group-hover:bg-[#3a4050] transition-colors rounded-full overflow-hidden relative flex-shrink-0">
        {/* soft limit marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-amber-400/50 z-10"
          style={{ left: `${Math.min((soft / limit) * 100, 100)}%` }}
        />
        {isZero ? (
          <div className="absolute inset-y-0 left-0 bg-[#475569] w-1" />
        ) : (
          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="font-mono text-xs whitespace-nowrap flex items-center gap-1.5">
        <span className="font-bold text-[#e7edf8]">${current.toLocaleString()}</span>
        <span className="text-[#6b7280]">/</span>
        <span className="font-medium text-[#97a3b6]">${limit.toLocaleString()}</span>
        {isZero && <span className="ml-2 text-[10px] text-[#6b7280] uppercase tracking-wider bg-[#2a2d39] group-hover:bg-[#1f222c] px-1.5 py-0.5 rounded transition-colors">0% {t.used}</span>}
      </div>
    </div>
  )
}

export function MerchantAccounts() {
  const { language } = useLanguage()
  const t = dashboardCopy[language]

  function mapDbStatus(dbStatus: string, isLimited?: boolean): Status {
    if (isLimited) return t.limitedStatus as Status
    switch (dbStatus) {
      case "ACTIVE": return t.activeStatus as Status
      case "WARMING_UP": return t.warmupStatus as Status
      case "PAUSED": return t.pausedStatus as Status
      case "SUSPENDED": return t.suspendedStatus as Status
      default: return t.activeStatus as Status
    }
  }

  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const fetchMerchants = useCallback(() => {
    fetch("/api/merchant/accounts")
      .then(r => r.json())
      .then(data => {
        setMerchants(
          ((data.accounts ?? []) as MerchantApiRow[]).map((a) => ({
            id: a.id,
            name: a.name,
            email: a.email ?? "",
            shieldDomain: a.shieldDomain ?? "—",
            currentVolume: a.currentVolume ?? 0,
            softLimit: a.softLimit ?? 4000,
            dailyLimit: a.dailyLimit ?? 5000,
            txCount: a.transactionCount ?? 0,
            status: mapDbStatus(a.status, a.isLimited ?? undefined),
            isLimited: a.isLimited ?? false,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchMerchants() }, [fetchMerchants])

  // Refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchMerchants, 10_000)
    return () => clearInterval(interval)
  }, [fetchMerchants])

  const toggleStatus = useCallback(async (id: string, action: "pause" | "resume") => {
    setMerchants((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, status: (action === "pause" ? "Paused" : "Active") as Status } : m
      )
    )
    setOpenMenu(null)
    try {
      await fetch(`/api/merchant/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action === "pause" ? "PAUSED" : "ACTIVE" }),
      })
    } catch {}
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch("/api/merchant/accounts/sync", { method: "POST" })
      fetchMerchants()
    } catch {}
    setSyncing(false)
  }, [fetchMerchants])

  return (
    <SectionCard
      title={t.merchantAccounts}
      description={`${t.paypalAccountRotator} ${merchants.length} ${t.accountsConfigured}`}
      noPadding
      action={
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#97a3b6] hover:text-[#e7edf8] transition-colors border border-[#343947] bg-[#222530] rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {syncing ? t.syncing : t.sync}
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-[#97a3b6]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">{t.loadingAccounts}</span>
        </div>
      ) : merchants.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-mono text-sm text-[#97aac1]">{t.noMerchantAccounts}</p>
        </div>
      ) : (
        <DataTableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#343947] bg-[#1f222c]">
                {[t.account, t.paypalEmail, t.shieldDomain, t.dailyVolume, t.txCount, t.status, ""].map((h, index) => (
                  <th key={index} className="px-5 py-4 text-left text-xs font-bold text-[#97a3b6] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merchants.map((m, i) => (
                <tr
                  key={m.id}
                  className={`group border-b border-[#343947] hover:bg-[#2a2d39] transition-colors ${i % 2 === 0 ? "bg-[#222530]" : "bg-[#20232d]"}`}
                >
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs text-cyan-400">{m.name}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm font-semibold text-[#e7edf8]">{m.email}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm font-medium text-[#97a3b6]">{m.shieldDomain}</span>
                  </td>
                  <td className="px-5 py-4 min-w-[220px]">
                    <VolumeBar current={m.currentVolume} soft={m.softLimit} limit={m.dailyLimit} t={t} />
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm font-semibold text-[#e7edf8]">{m.txCount}</span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-5 py-4 relative text-right">
                    <button
                      onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                      className="p-1.5 rounded-lg hover:bg-[#2a2d39] transition-colors text-[#97a3b6] hover:text-[#e7edf8]"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                    {openMenu === m.id && (
                      <div className="absolute right-6 top-8 z-10 bg-[#222530] border border-[#343947] rounded-md shadow-xl text-xs font-semibold min-w-[140px]">
                        {m.status !== t.pausedStatus ? (
                          <button
                            onClick={() => toggleStatus(m.id, "pause")}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[#2a2d39] text-amber-400 transition-colors"
                          >
                            <Pause className="w-3 h-3" /> {t.pauseAccount}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleStatus(m.id, "resume")}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[#2a2d39] text-emerald-400 transition-colors"
                          >
                            <Play className="w-3 h-3" /> {t.resumeAccount}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      )}
    </SectionCard>
  )
}
