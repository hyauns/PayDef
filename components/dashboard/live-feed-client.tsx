"use client"

import { useEffect, useState } from "react"
import { ArrowRightLeft, Zap } from "lucide-react"

interface Transaction {
  id: string
  store: string
  amount: number
  paypalAccount: string
  shieldDomain: string
  timestamp: Date
  status: "success" | "pending" | "failed"
}

const STORES = ["NovaBoutique", "TechGadgetStore", "LuxeWatches", "OrganicKitchen"]
const ACCOUNTS = ["pp-001", "pp-002", "pp-003", "pp-005"]
const DOMAINS = ["chococlose.com", "safepay-hub.io", "payshield-cdn.com", "relay-secure.org"]
const STATUSES: Transaction["status"][] = ["success", "success", "success", "success", "pending", "failed"]

function randomTx(): Transaction {
  const store = STORES[Math.floor(Math.random() * STORES.length)]
  const idx = Math.floor(Math.random() * ACCOUNTS.length)
  return {
    id: `tx-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    store,
    amount: parseFloat((Math.random() * 490 + 10).toFixed(2)),
    paypalAccount: ACCOUNTS[idx],
    shieldDomain: DOMAINS[idx],
    timestamp: new Date(),
    status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
  }
}

function buildInitialFeed(): Transaction[] {
  return Array.from({ length: 8 }, (_, i) => ({
    ...randomTx(),
    timestamp: new Date(Date.now() - i * 14000),
  }))
}

const statusConfig = {
  success: { text: "text-emerald-400", bg: "bg-emerald-400/10", label: "SUCCESS" },
  pending: { text: "text-amber-400", bg: "bg-amber-400/10", label: "PENDING" },
  failed: { text: "text-red-400", bg: "bg-red-400/10", label: "FAILED" },
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 5) return "just now"
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

export function LiveFeedClient() {
  const [feed, setFeed] = useState<Transaction[]>([])
  const [, setTicker] = useState(0)

  useEffect(() => {
    setFeed(buildInitialFeed())
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setFeed((prev) => [randomTx(), ...prev.slice(0, 19)])
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTicker((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="overflow-y-auto flex-1 max-h-[420px]">
      {feed.map((tx, i) => {
        const cfg = statusConfig[tx.status]
        const isNew = i === 0
        return (
          <div
            key={tx.id}
            className={`flex items-start gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-secondary/20 transition-all ${
              isNew ? "bg-cyan-400/5" : ""
            }`}
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
                <span className="text-muted-foreground text-xs">via</span>
                <span className="font-mono text-xs text-muted-foreground truncate">{tx.shieldDomain}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{timeAgo(tx.timestamp)}</span>
                <span className="font-mono text-xs text-muted-foreground opacity-50">{tx.id}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
