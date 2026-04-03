"use client"

import { useState } from "react"
import { MoreHorizontal, Pause, Play, RefreshCw } from "lucide-react"

type Status = "Active" | "Limited" | "Paused"

interface Merchant {
  id: string
  email: string
  shieldDomain: string
  currentVolume: number
  limit: number
  txCount: number
  status: Status
}

const initialMerchants: Merchant[] = [
  { id: "pp-001", email: "payments.primary@store.com", shieldDomain: "chococlose.com", currentVolume: 1200, limit: 5000, txCount: 48, status: "Active" },
  { id: "pp-002", email: "gateway.relay@shopify.net", shieldDomain: "safepay-hub.io", currentVolume: 4750, limit: 5000, txCount: 201, status: "Limited" },
  { id: "pp-003", email: "checkout.node2@retail.co", shieldDomain: "payshield-cdn.com", currentVolume: 320, limit: 3000, txCount: 14, status: "Active" },
  { id: "pp-004", email: "store.relay@commerce.io", shieldDomain: "trustedcheck.net", currentVolume: 0, limit: 5000, txCount: 0, status: "Paused" },
  { id: "pp-005", email: "alt.paypal@merchant.co", shieldDomain: "relay-secure.org", currentVolume: 2900, limit: 5000, txCount: 113, status: "Active" },
  { id: "pp-006", email: "backup.gateway@pay.net", shieldDomain: "checkout-proxy.com", currentVolume: 4980, limit: 5000, txCount: 218, status: "Limited" },
]

const statusConfig: Record<Status, { label: string; dot: string; text: string; bg: string }> = {
  Active: { label: "Active", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400/10" },
  Limited: { label: "Limited", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-400/10" },
  Paused: { label: "Paused", dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-500/10" },
}

function VolumeBar({ current, limit }: { current: number; limit: number }) {
  const pct = Math.min((current / limit) * 100, 100)
  const color = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-cyan-400"
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        ${current.toLocaleString()} / ${limit.toLocaleString()}
      </span>
    </div>
  )
}

export function MerchantAccounts() {
  const [merchants, setMerchants] = useState<Merchant[]>(initialMerchants)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const toggleStatus = (id: string, action: "pause" | "resume") => {
    setMerchants((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, status: action === "pause" ? "Paused" : "Active" } : m
      )
    )
    setOpenMenu(null)
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Merchant Accounts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">PayPal account rotator — {merchants.length} accounts configured</p>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-2.5 py-1.5">
          <RefreshCw className="w-3 h-3" />
          Sync
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Account ID", "PayPal Email", "Shield Domain", "Daily Volume", "Tx Count", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {merchants.map((m, i) => {
              const cfg = statusConfig[m.status]
              return (
                <tr
                  key={m.id}
                  className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-cyan-400">{m.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-foreground">{m.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{m.shieldDomain}</span>
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <VolumeBar current={m.currentVolume} limit={m.limit} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-foreground">{m.txCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${m.status === "Active" ? "animate-pulse" : ""}`} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                      className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {openMenu === m.id && (
                      <div className="absolute right-2 top-8 z-10 bg-popover border border-border rounded-md shadow-xl text-xs font-mono min-w-[140px]">
                        {m.status !== "Paused" ? (
                          <button
                            onClick={() => toggleStatus(m.id, "pause")}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary text-amber-400 transition-colors"
                          >
                            <Pause className="w-3 h-3" /> Pause Account
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleStatus(m.id, "resume")}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary text-emerald-400 transition-colors"
                          >
                            <Play className="w-3 h-3" /> Resume Account
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
