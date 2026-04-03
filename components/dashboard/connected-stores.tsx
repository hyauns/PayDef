"use client"

import { useState } from "react"
import { Key, Eye, EyeOff, Plus, ExternalLink } from "lucide-react"

type StoreStatus = "Active" | "Suspended" | "Trial"

interface Store {
  id: string
  name: string
  platform: string
  totalProcessed: number
  txCount: number
  status: StoreStatus
  apiKey: string
  secretKey: string
}

const stores: Store[] = [
  { id: "s-001", name: "NovaBoutique", platform: "Shopify", totalProcessed: 128450.0, txCount: 1024, status: "Active", apiKey: "gw_live_pk_n0v4b0uTique9X", secretKey: "gw_live_sk_X9aBcDeFgHiJkLmN" },
  { id: "s-002", name: "TechGadgetStore", platform: "WooCommerce", totalProcessed: 84200.5, txCount: 673, status: "Active", apiKey: "gw_live_pk_tGadg3t5t0r3Xz", secretKey: "gw_live_sk_ZxYwVuTsRqPoNmLk" },
  { id: "s-003", name: "OrganicKitchen", platform: "Squarespace", totalProcessed: 12800.0, txCount: 94, status: "Trial", apiKey: "gw_trial_pk_0rg4nicK1tch3n", secretKey: "gw_trial_sk_AbCdEfGhIjKlMnOp" },
  { id: "s-004", name: "SportswearPro", platform: "Shopify", totalProcessed: 0, txCount: 0, status: "Suspended", apiKey: "gw_live_pk_Sp0rtsw3arPr0Xx", secretKey: "gw_live_sk_XxWwVvUuTtSsRrQq" },
  { id: "s-005", name: "LuxeWatches", platform: "Custom API", totalProcessed: 315000.0, txCount: 2841, status: "Active", apiKey: "gw_live_pk_Lux3W4tch3s99Z", secretKey: "gw_live_sk_ZzYyXxWwVvUuTtSs" },
]

const statusConfig: Record<StoreStatus, { text: string; bg: string; dot: string }> = {
  Active: { text: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  Suspended: { text: "text-red-400", bg: "bg-red-400/10", dot: "bg-red-400" },
  Trial: { text: "text-cyan-400", bg: "bg-cyan-400/10", dot: "bg-cyan-400" },
}

function ApiKeyModal({ store, onClose }: { store: Store; onClose: () => void }) {
  const [showSecret, setShowSecret] = useState(false)
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
            <p className="text-xs text-muted-foreground font-mono">{store.id} · {store.platform}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs border border-border rounded px-2 py-1">Close</button>
        </div>
        <div className="space-y-3">
          <div className="bg-secondary rounded-md p-3">
            <p className="text-xs text-muted-foreground font-mono mb-1.5 uppercase tracking-wider">Publishable Key</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-cyan-400 flex-1 truncate">{store.apiKey}</code>
              <button onClick={() => copy(store.apiKey, "pk")} className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                {copied === "pk" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="bg-secondary rounded-md p-3">
            <p className="text-xs text-muted-foreground font-mono mb-1.5 uppercase tracking-wider">Secret Key</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-amber-400 flex-1 truncate">
                {showSecret ? store.secretKey : "gw_live_sk_••••••••••••••••"}
              </code>
              <button onClick={() => setShowSecret(!showSecret)} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => copy(store.secretKey, "sk")} className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                {copied === "sk" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 font-mono">Keep your secret key private. Never expose it in client-side code.</p>
      </div>
    </div>
  )
}

export function ConnectedStores() {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)

  return (
    <>
      {selectedStore && <ApiKeyModal store={selectedStore} onClose={() => setSelectedStore(null)} />}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Connected Stores</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Client store management — {stores.filter(s => s.status === "Active").length} active</p>
          </div>
          <button className="flex items-center gap-1.5 text-xs bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/20 transition-colors rounded-md px-2.5 py-1.5 font-mono">
            <Plus className="w-3 h-3" />
            Add Store
          </button>
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
              {stores.map((store, i) => {
                const cfg = statusConfig[store.status]
                return (
                  <tr
                    key={store.id}
                    className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{store.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{store.id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{store.platform}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-foreground">${store.totalProcessed.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-foreground">{store.txCount.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {store.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedStore(store)}
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-cyan-400 border border-border hover:border-cyan-400/30 rounded px-2 py-1 transition-colors"
                        >
                          <Key className="w-3 h-3" />
                          API Keys
                        </button>
                        <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
