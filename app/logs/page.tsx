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
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { DataTableShell } from "@/components/dashboard/DataTableShell"
import { StatusBadge } from "@/components/dashboard/StatusBadge"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { logsCopy } from "@/lib/i18n/logs"

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
      <div className="w-3.5 h-3.5 bg-[#2a2d39] rounded-full" />
      <div className="h-3 w-28 bg-[#2a2d39] rounded" />
      <div className="h-3 w-14 bg-[#2a2d39] rounded" />
      <div className="h-3 w-44 bg-[#2a2d39] rounded" />
      <div className="h-3 w-24 bg-[#2a2d39] rounded" />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const { language } = useLanguage()
  const t = logsCopy[language]

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

  const { data, error, isLoading, isValidating } = useSWR<LogsResponse>(
    buildUrl(),
    fetcher,
    { refreshInterval: 5_000, revalidateOnFocus: true }
  )

  const logs        = data?.logs ?? []
  const accounts    = data?.accounts ?? []
  const pagination  = data?.pagination
  const totalPages  = pagination?.totalPages ?? 1
  const totalCount  = pagination?.total ?? 0

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
    <DashboardShell data-ui-version="logs-i18n-vi-phase5">
      <div className="w-full px-6 md:px-8 py-8 space-y-6">

        {/* Header */}
        <DashboardPageHeader
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
          action={
            <div className="flex items-center gap-3">
              {isValidating && !isLoading && (
                <span className="inline-flex items-center gap-1 text-cyan-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" /> {t.updating}
                </span>
              )}
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#222530] border border-[#343947] rounded-md text-xs font-bold text-[#97a3b6] hover:text-[#e7edf8] hover:bg-[#2a2d39] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t.exportCsv}
              </button>
            </div>
          }
        />

        {/* Error state */}
        {error && (
          <div className="flex items-start gap-3 bg-red-400/5 border border-red-400/20 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono">
              <span className="text-red-400 font-semibold">{t.failedToLoad}</span>
              <span className="text-[#97aac1]">{t.autoRetry}</span>
            </div>
          </div>
        )}

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {([
            { key: "all",     label: t.filterAll,      cls: "border-[#343947] text-[#97a3b6]", dot: "bg-[#97a3b6]" },
            { key: "success", label: t.filterSuccess,   cls: "border-emerald-400/30 text-emerald-400", dot: "bg-emerald-400" },
            { key: "error",   label: t.filterErrors,    cls: "border-red-400/30 text-red-400", dot: "bg-red-400" },
            { key: "warning", label: t.filterWarnings,  cls: "border-amber-400/30 text-amber-400", dot: "bg-amber-400" },
            { key: "info",    label: t.filterInfo,       cls: "border-cyan-400/30 text-cyan-400", dot: "bg-cyan-400" },
          ] as const).map(chip => (
            <button
              key={chip.key}
              onClick={() => { setLevel(chip.key as LogLevel | "all"); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all
                ${levelFilter === chip.key ? "bg-[#343947]" : "bg-transparent hover:bg-[#222530]"}
                ${chip.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#97a3b6] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t.searchPlaceholder}
              className="w-full bg-[#222530] border border-[#343947] rounded-md pl-9 pr-3 py-2 text-sm font-semibold text-[#e7edf8] placeholder:text-[#97a3b6] focus:outline-none focus:border-[#404656] transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={accountFilter}
              onChange={e => { setAccount(e.target.value); setPage(1) }}
              className="appearance-none bg-[#222530] border border-[#343947] rounded-md pl-3 pr-8 py-2 text-sm font-semibold text-[#e7edf8] focus:outline-none focus:border-[#404656] cursor-pointer"
            >
              <option value="all">{t.allAccounts}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#97a3b6] pointer-events-none" />
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#222530] border border-[#343947] hover:bg-[#2a2d39] rounded-md text-sm font-bold text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {t.reset}
          </button>
        </div>

        {/* Log table */}
        <DataTableShell>
          <div className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.2)] relative">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#343947] to-transparent opacity-50" />
          {/* Table header */}
          <div className="grid grid-cols-[24px_160px_80px_1fr_140px] gap-3 px-4 py-4 border-b border-[#343947] bg-[#1f222c] text-xs font-bold text-[#97a3b6] uppercase tracking-wider">
            <span />
            <span>{t.thTimestamp}</span>
            <span>{t.thLevel}</span>
            <span>{t.thEvent}</span>
            <span>{t.thAccount}</span>
          </div>

          {/* Loading skeleton */}
          {isLoading ? (
            <div className="divide-y divide-[#343947]">
              {Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#97a3b6]">
              <Filter className="w-8 h-8 opacity-30" />
              <p className="text-sm font-semibold">{t.noLogsMatch}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#343947]">
              {logs.map(log => {
                const isOpen = expanded === log.id
                const meta = log.metadata as Record<string, unknown>
                
                let variant: "success" | "warning" | "error" | "neutral" = "neutral"
                if (log.level === "success") variant = "success"
                if (log.level === "warning") variant = "warning"
                if (log.level === "error") variant = "error"
                if (log.level === "info") variant = "neutral"

                const bgClass = log.level === "error" ? "bg-red-400/5" : log.level === "warning" ? "bg-amber-400/5" : "bg-[#222530]"
                const borderClass = log.level === "error" ? "border-red-400/20" : log.level === "warning" ? "border-amber-400/20" : "border-[#343947]"

                return (
                  <div key={log.id} className="hover:bg-[#2a2d39] transition-colors">
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full grid grid-cols-[24px_160px_80px_1fr_140px] gap-3 px-4 py-4 items-center text-left"
                    >
                      <LevelIcon level={log.level} />
                      <span className="text-xs font-semibold text-[#97a3b6] truncate">{fmtTs(log.createdAt)}</span>
                      <div className="flex items-center">
                        <StatusBadge 
                          status={log.level} 
                          label={
                            log.level === "success" ? t.filterSuccess :
                            log.level === "error" ? t.filterErrors :
                            log.level === "warning" ? t.filterWarnings :
                            log.level === "info" ? t.filterInfo : log.level
                          }
                        />
                      </div>
                      <span className="text-sm font-bold text-[#e7edf8] truncate">{(t.events as Record<string, string>)[log.action] || log.action}</span>
                      <span className="text-sm font-semibold text-[#97a3b6] truncate">{log.accountName ?? "—"}</span>
                    </button>
                    {isOpen && (
                      <div className={`mx-4 mb-3 mt-1 px-4 py-3 rounded-lg border text-xs font-mono space-y-1.5 ${bgClass} ${borderClass}`}>
                        <div className="flex justify-between items-start gap-4">
                          <p className={`font-semibold text-[#e7edf8]`}>{(t.events as Record<string, string>)[log.action] || log.action}</p>
                          <span className="text-[#97a3b6] opacity-50 select-all">{log.action}</span>
                        </div>
                        <p className="text-[#97a3b6]">{log.status} — {String(meta.detail ?? meta.message ?? t.noAdditionalDetails)}</p>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-[#97a3b6] pt-2 border-t border-[#343947] mt-2">
                          {log.storeName && <span>{t.metaStore} <span className="text-[#e7edf8]">{log.storeName}</span></span>}
                          {log.tenantName && <span>{t.metaTenant} <span className="text-[#e7edf8]">{log.tenantName}</span></span>}
                          {meta.amount !== undefined && <span>{t.metaAmount} <span className="text-[#e7edf8]">${Number(meta.amount).toFixed(2)}</span></span>}
                          {meta.txId ? <span>{t.metaTxId} <span className="text-[#e7edf8]">{String(meta.txId)}</span></span> : null}
                          <span>{t.metaTime} <span className="text-[#e7edf8]">{fmtTs(log.createdAt)}</span></span>
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#343947] bg-[#222530]">
              <span className="text-xs font-bold text-[#97a3b6]">
                {totalCount} {t.paginationResults} &bull; {t.paginationPage} {page} {t.paginationOf} {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-xs font-bold bg-[#2a2d39] border border-[#343947] rounded-md disabled:opacity-40 hover:bg-[#343947] text-[#e7edf8] transition-colors"
                >
                  {t.btnPrev}
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 text-xs font-bold bg-[#2a2d39] border border-[#343947] rounded-md disabled:opacity-40 hover:bg-[#343947] text-[#e7edf8] transition-colors"
                >
                  {t.btnNext}
                </button>
              </div>
            </div>
          )}
          </div>
        </DataTableShell>

      </div>
    </DashboardShell>
  )
}
