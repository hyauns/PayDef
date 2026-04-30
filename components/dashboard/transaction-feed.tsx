"use client"

import { useEffect, useState } from "react"
import { ArrowRightLeft, Zap } from "lucide-react"
import { SectionCard } from "./SectionCard"

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

interface FeedTransactionApiRow {
  id?: string | null
  storeName?: string | null
  originalAmount?: number | string | null
  accountName?: string | null
  status?: string | null
  createdAt?: string | null
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_CFG: Record<TxStatus, { bg: string; text: string; label: string; amountColor: string }> = {
  completed: { bg: "bg-[#063f33]", text: "text-[#34d399]", label: "COMPLETED", amountColor: "text-[#34d399]" },
  pending:   { bg: "bg-[#4a3908]", text: "text-[#facc15]", label: "PENDING",   amountColor: "text-[#facc15]" },
  failed:    { bg: "bg-[#4a1d24]", text: "text-[#fb7185]", label: "FAILED",    amountColor: "text-[#fb7185]" },
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="overflow-y-auto flex-1 max-h-[420px] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#1f222c] [&::-webkit-scrollbar-thumb]:bg-[#6b7280] [&::-webkit-scrollbar-thumb]:rounded-full">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-6 py-4 border-b border-[#343947]">
          <div className="w-8 h-8 rounded-lg bg-[#2a2d39] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between gap-2">
              <div className="h-4 w-24 bg-[#2a2d39] rounded" />
              <div className="h-4 w-14 bg-[#2a2d39] rounded" />
            </div>
            <div className="h-3 w-40 bg-[#2a2d39] rounded" />
            <div className="h-3 w-28 bg-[#2a2d39] rounded" />
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
      const txns = (data.transactions ?? []) as FeedTransactionApiRow[]

      setFeed(
        txns.map(tx => {
          const amount = typeof tx.originalAmount === "number"
            ? tx.originalAmount
            : parseFloat(tx.originalAmount ?? "0")

          return {
            id: tx.id?.slice(0, 12) ?? `TX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            store: tx.storeName ?? "Unknown",
            amount,
            paypalAccount: tx.accountName ?? "—",
            shieldDomain: "—",
            status: mapStatus(tx.status ?? ""),
            timestamp: new Date(tx.createdAt ?? Date.now()),
          }
        })
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
      <div className="flex-1 flex items-center justify-center text-center px-5 py-10">
        <div>
          <ArrowRightLeft className="w-6 h-6 text-[#37394d] mx-auto mb-2" />
          <p className="text-xs font-mono text-[#97aac1]">No transactions yet</p>
          <p className="text-[10px] font-mono text-[#6b7280] mt-1">Transactions will appear here as they come in</p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1 max-h-[420px] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#1f222c] [&::-webkit-scrollbar-thumb]:bg-[#6b7280] [&::-webkit-scrollbar-thumb]:rounded-full">
      {feed.map((tx, i) => {
        const cfg = STATUS_CFG[tx.status]
        return (
          <div
            key={`${tx.id}-${i}`}
            className={`group flex items-start gap-3 px-6 py-4 border-b border-[#343947] hover:bg-[#2a2d39] transition-all ${i % 2 === 0 ? "bg-[#222530]" : "bg-[#20232d]"}`}
          >
            <div className="mt-0.5 shrink-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                <ArrowRightLeft className={`w-3.5 h-3.5 ${cfg.text}`} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[#e7edf8] truncate">{tx.store}</span>
                <span className={`font-mono text-[15px] font-bold ${cfg.amountColor} whitespace-nowrap`}>
                  ${tx.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-xs font-semibold text-cyan-400">{tx.paypalAccount}</span>
                {tx.shieldDomain !== "—" && (
                  <>
                    <span className="text-[#6b7280] text-xs">via</span>
                    <span className="font-mono text-xs text-[#97a3b6] truncate">{tx.shieldDomain}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-transparent ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="font-mono text-xs text-[#aab4c5]">{timeAgo(tx.timestamp)}</span>
                <span className="font-mono text-[10px] text-[#7f8aa0] group-hover:text-[#aab4c5] transition-colors">{tx.id}</span>
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
    <SectionCard
      noPadding
      title="Live Transaction Feed"
      className="h-full flex flex-col"
      action={
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400">LIVE</span>
        </div>
      }
    >
      <FeedList />
    </SectionCard>
  )
}
