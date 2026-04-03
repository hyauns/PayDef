"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  RefreshCw,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ───────────────────────────────────────────────────────────────────

type LogLevel = "success" | "error" | "warning" | "info"
type LogEntry = {
  id: string
  ts: Date
  level: LogLevel
  event: string
  account: string
  store: string
  amount?: number
  txId?: string
  detail: string
}

// ─── Seed data ───────────────────────────────────────────────────────────────

function sr(seed: number) { const x = Math.sin(seed + 1) * 10000; return x - Math.floor(x) }
function pick<T>(arr: T[], seed: number) { return arr[Math.floor(sr(seed) * arr.length)] }

const ACCOUNTS = ["PP-Main-01", "PP-Relay-02", "PP-Node-03", "PP-Backup-04", "PP-Alt-05", "PP-Overflow-06"]
const STORES   = ["Tire Shop Pro", "Yoga Bliss", "Pet Paradise", "TechNova", "GlowUp Beauty", "FitGear Store"]
const EVENTS: { event: string; level: LogLevel; detail: string }[] = [
  { event: "Transaction Routed",    level: "success", detail: "Order successfully routed to merchant account" },
  { event: "Payment Confirmed",     level: "success", detail: "PayPal IPN confirmed, funds captured" },
  { event: "Daily Limit Reached",   level: "warning", detail: "Account reached 90% of its daily limit, rotation paused" },
  { event: "Account Rotated",       level: "info",    detail: "Gateway switched to next account in rotation pool" },
  { event: "IPN Webhook Received",  level: "info",    detail: "Incoming PayPal IPN payload parsed and verified" },
  { event: "Transaction Failed",    level: "error",   detail: "PayPal returned PAYMENT_NOT_COMPLETED — retrying" },
  { event: "Fraud Flag Raised",     level: "error",   detail: "IP reputation check failed; transaction blocked" },
  { event: "Shield Domain Changed", level: "info",    detail: "Masking domain rotated per schedule" },
  { event: "Price Mismatch",        level: "warning", detail: "Server-side price re-validation failed; order held" },
  { event: "Chargeback Received",   level: "error",   detail: "Dispute raised by buyer; account flagged" },
  { event: "Account Warm-up Done",  level: "success", detail: "New account cleared warm-up phase, added to active pool" },
  { event: "Config Updated",        level: "info",    detail: "Admin updated rotation strategy settings" },
]

function buildLogs(): LogEntry[] {
  const now = new Date(2026, 3, 3, 14, 30)
  return Array.from({ length: 120 }, (_, i) => {
    const seed  = i * 83 + 7
    const minsAgo = Math.floor(sr(seed) * 48 * 60)
    const ev    = pick(EVENTS, seed + 1)
    const hex   = "0123456789abcdef"
    const txId  = ev.level === "success" || ev.level === "error"
      ? "txn_" + Array.from({ length: 12 }, (_, j) => hex[Math.floor(sr(seed * 17 + j) * 16)]).join("")
      : undefined
    return {
      id:      `log_${i}`,
      ts:      new Date(now.getTime() - minsAgo * 60 * 1000),
      level:   ev.level,
      event:   ev.event,
      account: pick(ACCOUNTS, seed + 3),
      store:   pick(STORES, seed + 4),
      amount:  txId ? parseFloat((sr(seed + 5) * 490 + 10).toFixed(2)) : undefined,
      txId,
      detail:  ev.detail,
    }
  }).sort((a, b) => b.ts.getTime() - a.ts.getTime())
}

const ALL_LOGS = buildLogs()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTs(d: Date) {
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

const LEVEL_STYLES: Record<LogLevel, { text: string; bg: string; border: string; dot: string }> = {
  success: { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", dot: "bg-emerald-400" },
  error:   { text: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20",     dot: "bg-red-400" },
  warning: { text: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   dot: "bg-amber-400" },
  info:    { text: "text-cyan-400",    bg: "bg-cyan-400/10",    border: "border-cyan-400/20",    dot: "bg-cyan-400" },
}

function LevelIcon({ level }: { level: LogLevel }) {
  if (level === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  if (level === "error")   return <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />
  if (level === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
  return <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [search, setSearch]         = useState("")
  const [levelFilter, setLevel]     = useState<LogLevel | "all">("all")
  const [accountFilter, setAccount] = useState("all")
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [page, setPage]             = useState(0)
  const PAGE_SIZE = 40

  const filtered = useMemo(() => {
    return ALL_LOGS.filter(log => {
      if (levelFilter !== "all" && log.level !== levelFilter) return false
      if (accountFilter !== "all" && log.account !== accountFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!log.event.toLowerCase().includes(q) &&
            !log.detail.toLowerCase().includes(q) &&
            !log.account.toLowerCase().includes(q) &&
            !log.store.toLowerCase().includes(q) &&
            !(log.txId ?? "").includes(q)) return false
      }
      return true
    })
  }, [search, levelFilter, accountFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const counts = useMemo(() => ({
    total:   ALL_LOGS.length,
    success: ALL_LOGS.filter(l => l.level === "success").length,
    error:   ALL_LOGS.filter(l => l.level === "error").length,
    warning: ALL_LOGS.filter(l => l.level === "warning").length,
    info:    ALL_LOGS.filter(l => l.level === "info").length,
  }), [])

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">System Logs</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Real-time gateway event log — last 48 hours</p>
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {([
            { key: "all",     label: "All",     count: counts.total,   cls: "border-border text-muted-foreground" },
            { key: "success", label: "Success",  count: counts.success, cls: "border-emerald-400/30 text-emerald-400" },
            { key: "error",   label: "Errors",   count: counts.error,   cls: "border-red-400/30 text-red-400" },
            { key: "warning", label: "Warnings", count: counts.warning, cls: "border-amber-400/30 text-amber-400" },
            { key: "info",    label: "Info",     count: counts.info,    cls: "border-cyan-400/30 text-cyan-400" },
          ] as const).map(chip => (
            <button
              key={chip.key}
              onClick={() => { setLevel(chip.key as LogLevel | "all"); setPage(0) }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono transition-all
                ${levelFilter === chip.key ? "bg-secondary" : "bg-transparent hover:bg-secondary/50"}
                ${chip.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_STYLES[chip.key as LogLevel]?.dot ?? "bg-muted-foreground"}`} />
              {chip.label}
              <span className="opacity-70">{chip.count}</span>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search events, accounts, tx IDs..."
              className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={accountFilter}
              onChange={e => { setAccount(e.target.value); setPage(0) }}
              className="appearance-none bg-card border border-border rounded-md pl-3 pr-8 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 cursor-pointer"
            >
              <option value="all">All Accounts</option>
              {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={() => { setSearch(""); setLevel("all"); setAccount("all"); setPage(0) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Reset
          </button>
        </div>

        {/* Log table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[24px_160px_80px_1fr_140px] gap-3 px-4 py-2.5 border-b border-border bg-secondary/30 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            <span />
            <span>Timestamp</span>
            <span>Level</span>
            <span>Event</span>
            <span>Account</span>
          </div>

          {paged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Filter className="w-8 h-8 opacity-30" />
              <p className="text-sm font-mono">No logs match the current filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {paged.map(log => {
                const st = LEVEL_STYLES[log.level]
                const isOpen = expanded === log.id
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full grid grid-cols-[24px_160px_80px_1fr_140px] gap-3 px-4 py-2.5 items-center text-left hover:bg-secondary/30 transition-colors"
                    >
                      <LevelIcon level={log.level} />
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{fmtTs(log.ts)}</span>
                      <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${st.text}`}>
                        {log.level}
                      </span>
                      <span className="text-xs font-mono text-foreground truncate">{log.event}</span>
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{log.account}</span>
                    </button>
                    {isOpen && (
                      <div className={`mx-4 mb-2 px-3 py-3 rounded-lg border text-xs font-mono space-y-1.5 ${st.bg} ${st.border}`}>
                        <p className={`font-semibold ${st.text}`}>{log.event}</p>
                        <p className="text-muted-foreground">{log.detail}</p>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pt-1">
                          <span>Store: <span className="text-foreground">{log.store}</span></span>
                          {log.amount !== undefined && <span>Amount: <span className="text-foreground">${log.amount.toFixed(2)}</span></span>}
                          {log.txId && <span>Tx ID: <span className="text-foreground">{log.txId}</span></span>}
                          <span>Time: <span className="text-foreground">{fmtTs(log.ts)}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-[11px] font-mono text-muted-foreground">
                {filtered.length} results &bull; page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2.5 py-1 text-xs font-mono bg-background border border-border rounded-md disabled:opacity-40 hover:bg-secondary transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-2.5 py-1 text-xs font-mono bg-background border border-border rounded-md disabled:opacity-40 hover:bg-secondary transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
