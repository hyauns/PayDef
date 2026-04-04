"use client"

import { useState, useEffect, useCallback } from "react"
import { MoreHorizontal, Pause, Play, RefreshCw, Loader2 } from "lucide-react"

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

const statusConfig: Record<Status, { label: string; dot: string; text: string; bg: string }> = {
  Active: { label: "Active", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400/10" },
  Limited: { label: "Limited", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-400/10" },
  Paused: { label: "Paused", dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-500/10" },
  "Warm-up": { label: "Warm-up", dot: "bg-sky-400", text: "text-sky-400", bg: "bg-sky-400/10" },
  Suspended: { label: "Suspended", dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
}

function mapDbStatus(dbStatus: string, isLimited?: boolean): Status {
  if (isLimited) return "Limited"
  switch (dbStatus) {
    case "ACTIVE": return "Active"
    case "WARMING_UP": return "Warm-up"
    case "PAUSED": return "Paused"
    case "SUSPENDED": return "Suspended"
    default: return "Active"
  }
}

function VolumeBar({ current, soft, limit }: { current: number; soft: number; limit: number }) {
  const pct = Math.min((current / limit) * 100, 100)
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-400" : "bg-cyan-400"
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden relative">
        {/* soft limit marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-amber-400/50 z-10"
          style={{ left: `${Math.min((soft / limit) * 100, 100)}%` }}
        />
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        ${current.toLocaleString()} / ${limit.toLocaleString()}
      </span>
    </div>
  )
}

export function MerchantAccounts() {
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const fetchMerchants = useCallback(() => {
    fetch("/api/merchant/accounts")
      .then(r => r.json())
      .then(data => {
        setMerchants(
          (data.accounts ?? []).map((a: any) => ({
            id: a.id,
            name: a.name,
            email: a.email ?? "",
            shieldDomain: a.shieldDomain ?? "—",
            currentVolume: a.currentVolume ?? 0,
            softLimit: a.softLimit ?? 4000,
            dailyLimit: a.dailyLimit ?? 5000,
            txCount: a.transactionCount ?? 0,
            status: mapDbStatus(a.status, a.isLimited),
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
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Merchant Accounts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">PayPal account rotator — {merchants.length} accounts configured</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-2.5 py-1.5 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-mono">Loading accounts...</span>
        </div>
      ) : merchants.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-mono text-sm text-muted-foreground">No merchant accounts configured yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Account", "PayPal Email", "Shield Domain", "Daily Volume", "Tx Count", "Status", ""].map((h) => (
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
                      <span className="font-mono text-xs text-cyan-400">{m.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-foreground">{m.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{m.shieldDomain}</span>
                    </td>
                    <td className="px-4 py-3 min-w-[220px]">
                      <VolumeBar current={m.currentVolume} soft={m.softLimit} limit={m.dailyLimit} />
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
      )}
    </div>
  )
}
