"use client"

import { useState, useEffect } from "react"
import { Key, EyeOff, Plus, ExternalLink, Loader2 } from "lucide-react"
import { SectionCard } from "./SectionCard"
import { DataTableShell } from "./DataTableShell"
import { StatusBadge } from "./StatusBadge"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { dashboardCopy } from "@/lib/i18n/dashboard"

// ─── Types ────────────────────────────────────────────────────────────────────

type StoreStatus = "Active" | "Suspended" | "Trial"

interface Store {
  id: string
  name: string
  platform: string
  tenantName?: string
  webhookUrl?: string | null
  totalVolume: number
  transactionCount: number
  isActive: boolean
  createdAt: string
}

interface StoreApiRow {
  id: string
  name: string
  platform?: string | null
  tenantName?: string
  webhookUrl?: string | null
  totalVolume?: number | null
  transactionCount?: number | null
  isActive?: boolean | null
  createdAt: string
}

// getStatus moved to ConnectedStores

// ─── API Key Modal (shows store ID — keys can only be seen once on creation) ──

function StoreInfoModal({ store, onClose, t }: { store: Store; onClose: () => void; t: any }) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#222530] border border-[#343947] rounded-lg p-5 w-full max-w-md shadow-[0_8px_24px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-[#e7edf8]">{store.name}</h3>
            <p className="text-xs text-[#97a3b6] font-mono">{store.id.slice(0, 8)}…</p>
          </div>
          <button onClick={onClose} className="text-[#97a3b6] hover:text-[#e7edf8] text-xs border border-[#343947] hover:bg-[#2a2d39] transition-colors rounded px-2 py-1">{t.close}</button>
        </div>
        <div className="space-y-3">
          <div className="bg-[#2a2d39] rounded-md p-3">
            <p className="text-xs font-bold text-[#97a3b6] mb-1.5 uppercase tracking-wider">{t.storeId}</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-cyan-400 flex-1 truncate">{store.id}</code>
              <button onClick={() => copy(store.id, "id")} className="text-xs text-[#97aac1] hover:text-[#e2eeff] shrink-0 transition-colors">
                {copied === "id" ? t.copied : t.copy}
              </button>
            </div>
          </div>
          <div className="bg-[#2a2d39] rounded-md p-3">
            <p className="text-xs font-bold text-[#97a3b6] mb-1.5 uppercase tracking-wider">{t.apiKey}</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-amber-400 flex-1">
                sk_live_••••••••••••••••
              </code>
              <EyeOff className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
            </div>
            <p className="text-[10px] font-mono text-[#97a3b6] mt-2">
              {t.apiSecurityNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ConnectedStores() {
  const { language } = useLanguage()
  const t = dashboardCopy[language]

  function getStatus(store: Store): StoreStatus {
    if (!store.isActive) return t.suspendedStatus as StoreStatus
    if (store.transactionCount === 0) return t.trialStatus as StoreStatus
    return t.activeStatus as StoreStatus
  }

  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)

  useEffect(() => {
    fetch("/api/merchant/stores")
      .then(r => r.json())
      .then(data => {
        setStores(
          ((data.stores ?? []) as StoreApiRow[]).map((s) => ({
            id: s.id,
            name: s.name,
            platform: s.platform ?? "Custom API",
            tenantName: s.tenantName,
            webhookUrl: s.webhookUrl,
            totalVolume: s.totalVolume ?? 0,
            transactionCount: s.transactionCount ?? 0,
            isActive: s.isActive ?? true,
            createdAt: s.createdAt,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeCount = stores.filter(s => s.isActive && s.transactionCount > 0).length

  return (
    <>
      {selectedStore && <StoreInfoModal store={selectedStore} onClose={() => setSelectedStore(null)} t={t} />}
      <SectionCard
        title={t.connectedStores}
        description={loading ? t.loadingStores : `${t.clientStoreManagement} ${activeCount} ${t.activeCount}`}
        noPadding
        action={
          <a
            href="/stores"
            className="flex items-center gap-1.5 text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/20 transition-colors rounded-md px-2.5 py-1.5 font-mono"
          >
            <Plus className="w-3 h-3" />
            {t.manageStores}
          </a>
        }
      >
        <DataTableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#343947] bg-[#1f222c]">
                {[t.storeName, t.platform, t.totalProcessed, t.transactions, t.status, t.actions].map((h, index) => (
                  <th key={index} className="px-5 py-4 text-left text-xs font-bold text-[#97a3b6] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <Loader2 className="w-5 h-5 text-[#6b7280] animate-spin mx-auto" />
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-[#97a3b6]">
                    {t.noStoresConfigured}
                  </td>
                </tr>
              ) : (
                stores.map((store, i) => {
                  const status = getStatus(store)
                  return (
                    <tr
                      key={store.id}
                      className={`border-b border-[#343947] hover:bg-[#2a2d39] transition-colors ${i % 2 === 0 ? "bg-[#222530]" : "bg-[#20232d]"}`}
                    >
                      <td className="px-5 py-4">
                        <div>
                          <p className="text-sm font-bold text-[#e7edf8]">{store.name}</p>
                          <p className="text-xs font-mono text-[#97a3b6]">{store.id.slice(0, 8)}…</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-semibold text-[#e7edf8]">{store.platform}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-semibold text-[#e7edf8]">
                          ${store.totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-semibold text-[#e7edf8]">{store.transactionCount.toLocaleString()}</span>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedStore(store)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[#97a3b6] hover:text-cyan-400 border border-[#343947] hover:bg-[#2a2d39] rounded px-2.5 py-1.5 transition-colors"
                          >
                            <Key className="w-3.5 h-3.5" />
                            {t.info}
                          </button>
                          <a href="/stores" className="text-[#97a3b6] hover:text-[#e7edf8] transition-colors p-1.5">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </DataTableShell>
      </SectionCard>
    </>
  )
}
