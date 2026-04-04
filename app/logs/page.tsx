"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
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
  Loader2,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ───────────────────────────────────────────────────────────────────

type LogLevel = "success" | "error" | "warning" | "info"

interface LogEntry {
  id: string
  action: string
  status: string
  level: LogLevel
  metadata: Record<string, unknown>
  tenantId: string | null
  tenantName: string | null
  accountId: string | null
  accountName: string | null
  storeId: string | null
  storeName: string | null
  createdAt: string
}

interface AccountOption {
  id: string
  name: string
}

interface LogsResponse {
  logs: LogEntry[]
  accounts: AccountOption[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ─── SWR Fetcher ──────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTs(iso: string) {
  const d = new Date(iso)
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[24px_160px_80px_1fr_140px] gap-3 px-4 py-2.5 items-center animate-pulse">
      <div className="w-3.5 h-3.5 bg-secondary rounded-full" />
      <div className="h-3 w-28 bg-secondary rounded" />
      <div className="h-3 w-14 bg-secondary rounded" />
      <div className="h-3 w-44 bg-secondary rounded" />
      <div className="h-3 w-24 bg-secondary rounded" />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [search, setSearch]         = useState("")
  const [levelFilter, setLevel]     = useState<LogLevel | "all">("all")
  const [accountFilter, setAccount] = useState("all")
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [page, setPage]             = useState(1)
  const PAGE_SIZE = 40

  // Build the query URL
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", String(PAGE_SIZE))
    if (levelFilter !== "all") params.set("level", levelFilter)
    if (accountFilter !== "all") params.set("account", accountFilter)
    if (search.trim()) params.set("search", search.trim())
    return `/api/admin/logs?${params.toString()}`
  }, [page, levelFilter, accountFilter, search])

  const { data, error, isLoading, isValidating, mutate } = useSWR<LogsResponse>(
    buildUrl(),
    fetcher,
    { refreshInterval: 5_000, revalidateOnFocus: true }
  )

  const logs        = data?.logs ?? []
  const accounts    = data?.accounts ?? []
  const pagination  = data?.pagination
  const totalPages  = pagination?.totalPages ?? 1
  const totalCount  = pagination?.total ?? 0

  // Count by level (from the current page — for quick visual indicators)
  // We'll show total count from API
  const handleReset = () => {
    setSearch("")
    setLevel("all")
    setAccount("all")
    setPage(1)
  }

  const handleExportCsv = () => {
    // Build a CSV from current logs
    if (logs.length === 0) return
    const headers = ["Timestamp", "Level", "Action", "Status", "Account", "Store", "Details"]
    const rows = logs.map(log => [
      fmtTs(log.createdAt),
      log.level,
      log.action,
      log.status,
      log.accountName ?? "",
      log.storeName ?? "",
      JSON.stringify(log.metadata),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `system-logs-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">System Logs</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time gateway event log
              {isValidating && !isLoading && (
                <span className="inline-flex items-center gap-1 ml-2 text-cyan-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> updating
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-start gap-3 bg-red-400/5 border border-red-400/20 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono">
              <span className="text-red-400 font-semibold">Failed to load logs.</span>
              <span className="text-muted-foreground"> Auto-retry in 5 seconds.</span>
            </div>
          </div>
        )}

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {([
            { key: "all",     label: "All",      cls: "border-border text-muted-foreground" },
            { key: "success", label: "Success",   cls: "border-emerald-400/30 text-emerald-400" },
            { key: "error",   label: "Errors",    cls: "border-red-400/30 text-red-400" },
            { key: "warning", label: "Warnings",  cls: "border-amber-400/30 text-amber-400" },
            { key: "info",    label: "Info",       cls: "border-cyan-400/30 text-cyan-400" },
          ] as const).map(chip => (
            <button
              key={chip.key}
              onClick={() => { setLevel(chip.key as LogLevel | "all"); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono transition-all
                ${levelFilter === chip.key ? "bg-secondary" : "bg-transparent hover:bg-secondary/50"}
                ${chip.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_STYLES[chip.key as LogLevel]?.dot ?? "bg-muted-foreground"}`} />
              {chip.label}
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
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search actions, metadata..."
              className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={accountFilter}
              onChange={e => { setAccount(e.target.value); setPage(1) }}
              className="appearance-none bg-card border border-border rounded-md pl-3 pr-8 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 cursor-pointer"
            >
              <option value="all">All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={handleReset}
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

          {/* Loading skeleton */}
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Filter className="w-8 h-8 opacity-30" />
              <p className="text-sm font-mono">No logs match the current filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map(log => {
                const st = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info
                const isOpen = expanded === log.id
                const meta = log.metadata as Record<string, unknown>
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full grid grid-cols-[24px_160px_80px_1fr_140px] gap-3 px-4 py-2.5 items-center text-left hover:bg-secondary/30 transition-colors"
                    >
                      <LevelIcon level={log.level} />
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{fmtTs(log.createdAt)}</span>
                      <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${st.text}`}>
                        {log.level}
                      </span>
                      <span className="text-xs font-mono text-foreground truncate">{log.action}</span>
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{log.accountName ?? "—"}</span>
                    </button>
                    {isOpen && (
                      <div className={`mx-4 mb-2 px-3 py-3 rounded-lg border text-xs font-mono space-y-1.5 ${st.bg} ${st.border}`}>
                        <p className={`font-semibold ${st.text}`}>{log.action}</p>
                        <p className="text-muted-foreground">{log.status} — {String(meta.detail ?? meta.message ?? "No additional details")}</p>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pt-1">
                          {log.storeName && <span>Store: <span className="text-foreground">{log.storeName}</span></span>}
                          {log.tenantName && <span>Tenant: <span className="text-foreground">{log.tenantName}</span></span>}
                          {meta.amount !== undefined && <span>Amount: <span className="text-foreground">${Number(meta.amount).toFixed(2)}</span></span>}
                          {meta.txId ? <span>Tx ID: <span className="text-foreground">{String(meta.txId)}</span></span> : null}
                          <span>Time: <span className="text-foreground">{fmtTs(log.createdAt)}</span></span>
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
                {totalCount} results &bull; page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-xs font-mono bg-background border border-border rounded-md disabled:opacity-40 hover:bg-secondary transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
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
