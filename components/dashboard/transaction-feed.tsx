"use client"

import { useEffect, useState } from "react"
import { ArrowRightLeft, Zap, Loader2 } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type TxStatus = "completed" | "pending" | "failed"

interface Transaction {
  id: string
  store: string
  amount: number
  paypalAccount: string
  shieldDomain: string
  status: TxStatus
  timestamp: Date
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_CFG: Record<TxStatus, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-emerald-400/10", text: "text-emerald-400", label: "COMPLETED" },
  pending:   { bg: "bg-amber-400/10",   text: "text-amber-400",   label: "PENDING"   },
  failed:    { bg: "bg-red-400/10",     text: "text-red-400",     label: "FAILED"    },
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="overflow-y-auto flex-1 max-h-[420px]">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-border/40">
          <div className="w-7 h-7 rounded-md bg-secondary shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="flex justify-between gap-2">
              <div className="h-3 w-24 bg-secondary rounded" />
              <div className="h-3 w-14 bg-secondary rounded" />
            </div>
            <div className="h-2.5 w-40 bg-secondary rounded" />
            <div className="h-2.5 w-28 bg-secondary rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Feed list (fetches real data from API) ──────────────────────────────────

function FeedList() {
  const [feed, setFeed] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)

  const fetchTransactions = async () => {
    try {
      const res = await fetch("/api/merchant/logs?limit=20")
      if (!res.ok) return

      const data = await res.json()
      const txns: any[] = data.transactions ?? []

      setFeed(
        txns.map(tx => ({
          id: tx.id?.slice(0, 12) ?? `TX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          store: tx.storeName ?? "Unknown",
          amount: parseFloat(tx.originalAmount ?? 0),
          paypalAccount: tx.accountName ?? "—",
          shieldDomain: "—",
          status: mapStatus(tx.status),
          timestamp: new Date(tx.createdAt ?? Date.now()),
        }))
      )
    } catch {
      // Silently fail — keep showing whatever we have
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()

    // Poll for new transactions every 8 seconds
    const pollInterval = setInterval(fetchTransactions, 8_000)

    // Update relative timestamps every 5 seconds
    const tickInterval = setInterval(() => setTick(n => n + 1), 5_000)

    return () => {
      clearInterval(pollInterval)
      clearInterval(tickInterval)
    }
  }, [])

  if (loading) return <FeedSkeleton />

  if (feed.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4 py-10">
        <div>
          <ArrowRightLeft className="w-6 h-6 text-border mx-auto mb-2" />
          <p className="text-xs font-mono text-muted-foreground">No transactions yet</p>
          <p className="text-[10px] font-mono text-muted-foreground mt-1">Transactions will appear here as they come in</p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1 max-h-[420px]">
      {feed.map((tx, i) => {
        const cfg = STATUS_CFG[tx.status]
        return (
          <div
            key={`${tx.id}-${i}`}
            className={`flex items-start gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-secondary/20 transition-all ${i === 0 ? "bg-cyan-400/5" : ""}`}
          >
            <div className="mt-0.5 shrink-0">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${cfg.bg}`}>
                <ArrowRightLeft className={`w-3.5 h-3.5 ${cfg.text}`} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground truncate">{tx.store}</span>
                <span className="font-mono text-sm font-semibold text-foreground whitespace-nowrap">
                  ${tx.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-xs text-cyan-400">{tx.paypalAccount}</span>
                {tx.shieldDomain !== "—" && (
                  <>
                    <span className="text-muted-foreground text-xs">via</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">{tx.shieldDomain}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{timeAgo(tx.timestamp)}</span>
                <span className="font-mono text-[10px] text-muted-foreground opacity-40">{tx.id}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function mapStatus(raw: string): TxStatus {
  const s = (raw ?? "").toUpperCase()
  if (s === "COMPLETED" || s === "CAPTURED") return "completed"
  if (s === "FAILED" || s === "DECLINED" || s === "ERROR") return "failed"
  return "pending"
}

// ─── Public export ────────────────────────────────────────────────────────────

export function TransactionFeed() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-foreground">Live Transaction Feed</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400">LIVE</span>
        </div>
      </div>
      <FeedList />
    </div>
  )
}
