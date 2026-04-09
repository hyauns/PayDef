"use client"

import { useState, useEffect } from "react"
import { Key, EyeOff, Plus, ExternalLink, Loader2 } from "lucide-react"

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

const statusConfig: Record<StoreStatus, { text: string; bg: string; dot: string }> = {
  Active: { text: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  Suspended: { text: "text-red-400", bg: "bg-red-400/10", dot: "bg-red-400" },
  Trial: { text: "text-cyan-400", bg: "bg-cyan-400/10", dot: "bg-cyan-400" },
}

function getStatus(store: Store): StoreStatus {
  if (!store.isActive) return "Suspended"
  if (store.transactionCount === 0) return "Trial"
  return "Active"
}

// ─── API Key Modal (shows store ID — keys can only be seen once on creation) ──

function StoreInfoModal({ store, onClose }: { store: Store; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-5 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground">{store.name}</h3>
            <p className="text-xs text-muted-foreground font-mono">{store.id.slice(0, 8)}…</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs border border-border rounded px-2 py-1">Close</button>
        </div>
        <div className="space-y-3">
          <div className="bg-secondary rounded-md p-3">
            <p className="text-xs text-muted-foreground font-mono mb-1.5 uppercase tracking-wider">Store ID</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-cyan-400 flex-1 truncate">{store.id}</code>
              <button onClick={() => copy(store.id, "id")} className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                {copied === "id" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="bg-secondary rounded-md p-3">
            <p className="text-xs text-muted-foreground font-mono mb-1.5 uppercase tracking-wider">API Key</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-amber-400 flex-1">
                sk_live_••••••••••••••••
              </code>
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-2">
              For security, API keys are only shown once on creation. Use &quot;Regenerate&quot; in Stores to get a new one.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ConnectedStores() {
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
      {selectedStore && <StoreInfoModal store={selectedStore} onClose={() => setSelectedStore(null)} />}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Connected Stores</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `Client store management — ${activeCount} active`}
            </p>
          </div>
          <a
            href="/stores"
            className="flex items-center gap-1.5 text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/20 transition-colors rounded-md px-2.5 py-1.5 font-mono"
          >
            <Plus className="w-3 h-3" />
            Manage Stores
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Store", "Platform", "Total Processed", "Transactions", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mx-auto" />
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs font-mono text-muted-foreground">
                    No stores connected yet
                  </td>
                </tr>
              ) : (
                stores.map((store, i) => {
                  const status = getStatus(store)
                  const cfg = statusConfig[status]
                  return (
                    <tr
                      key={store.id}
                      className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{store.name}</p>
                          <p className="text-xs font-mono text-muted-foreground">{store.id.slice(0, 8)}…</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{store.platform}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-foreground">
                          ${store.totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{store.transactionCount.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedStore(store)}
                            className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-cyan-400 border border-border hover:border-cyan-400/30 rounded px-2 py-1 transition-colors"
                          >
                            <Key className="w-3 h-3" />
                            Info
                          </button>
                          <a href="/stores" className="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
