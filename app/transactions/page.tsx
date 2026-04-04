// Cache invalidation: 2026-04-04-v2
"use client"

import { useState, Fragment, useCallback } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  ArrowRightLeft,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Store,
  CreditCard,
  Package,
  Eye,
  EyeOff,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Zap,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ───────────────────────────────────────────────────────────────────

type TxStatus = "Completed" | "Pending" | "Authorized" | "Failed" | "Refunded" | "Disputed"

interface Transaction {
  id: string
  orderId: string
  date: string
  time: string
  storeName: string
  storeId: string
  paypalAccount: string
  shieldDomain: string
  referrerUrl: string
  originalProduct: string
  maskedProduct: string
  amount: number
  fee: number
  status: TxStatus
  customerEmail: string
  paypalTxId: string
  ipCountry: string
  masked: boolean
}

interface LogsApiResponse {
  transactions: Array<{
    id: string
    storeId: string
    storeName: string | null
    merchantId: string
    accountName: string | null
    accountClientId: string | null
    originalAmount: number
    originalCurrency: string
    originalItemName: string | null
    maskedItemName: string | null
    gatewayFee: number
    status: string
    paypalOrderId: string | null
    paypalCaptureId: string | null
    customerEmail: string | null
    buyerIp: string | null
    buyerCountry: string | null
    ipAddress: string | null
    createdAt: string
    updatedAt: string
  }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

// ─── Map API status → UI status ──────────────────────────────────────────────

function mapStatus(dbStatus: string): TxStatus {
  switch (dbStatus) {
    case "COMPLETED": return "Completed"
    case "AUTHORIZED": return "Authorized"
    case "PENDING": return "Pending"
    case "FAILED": return "Failed"
    case "REFUNDED": return "Refunded"
    case "DISPUTED": return "Disputed"
    default: return "Pending"
  }
}

// ─── Map API → internal Transaction type ─────────────────────────────────────

function mapTransaction(tx: LogsApiResponse["transactions"][number]): Transaction {
  const d = new Date(tx.createdAt)
  const originalProduct = tx.originalItemName ?? "—"
  const maskedProduct = tx.maskedItemName ?? originalProduct
  const isMasked = !!tx.maskedItemName && tx.maskedItemName !== tx.originalItemName

  return {
    id: tx.id,
    orderId: tx.paypalOrderId ?? tx.id.slice(0, 16),
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
    storeName: tx.storeName ?? "—",
    storeId: tx.storeId ?? "—",
    paypalAccount: tx.accountName ?? "—",
    shieldDomain: "—",
    referrerUrl: "—",
    originalProduct,
    maskedProduct,
    amount: tx.originalAmount,
    fee: tx.gatewayFee,
    status: mapStatus(tx.status),
    customerEmail: tx.customerEmail ?? "—",
    paypalTxId: tx.paypalCaptureId ?? tx.paypalOrderId ?? "—",
    ipCountry: tx.buyerCountry ?? tx.ipAddress ?? "—",
    masked: isMasked,
  }
}

// ─── SWR Fetcher ─────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TxStatus, { label: string; bg: string; text: string; dot: string }> = {
  Completed:  { label: "Completed",  bg: "bg-emerald-400/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Authorized: { label: "Authorized", bg: "bg-indigo-400/10",  text: "text-indigo-400",  dot: "bg-indigo-400" },
  Pending:    { label: "Pending",    bg: "bg-amber-400/10",   text: "text-amber-400",   dot: "bg-amber-400" },
  Failed:     { label: "Failed",     bg: "bg-rose-400/10",    text: "text-rose-400",    dot: "bg-rose-400" },
  Refunded:   { label: "Refunded",   bg: "bg-blue-400/10",   text: "text-blue-400",   dot: "bg-blue-400" },
  Disputed:   { label: "Disputed",   bg: "bg-amber-500/10",  text: "text-amber-500",  dot: "bg-amber-500" },
}

const ALL_STATUSES: TxStatus[] = ["Completed", "Authorized", "Pending", "Failed", "Refunded", "Disputed"]

// ─── Map UI status → DB status for API filter ────────────────────────────────

function statusToDb(s: TxStatus): string {
  switch (s) {
    case "Completed":  return "COMPLETED"
    case "Authorized": return "AUTHORIZED"
    case "Pending":    return "PENDING"
    case "Failed":     return "FAILED"
    case "Refunded":   return "REFUNDED"
    case "Disputed":   return "DISPUTED"
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border/40 animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-16 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 bg-secondary rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-14 bg-secondary rounded" /></td>
    </tr>
  )
}

// ─── Detail slide-over ────────────────────────────────────────────────────────

function TxDetailPanel({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const [showEmail, setShowEmail] = useState(false)
  const cfg = STATUS_CFG[tx.status]

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-card border-l border-border z-50 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <p className="text-xs font-mono text-muted-foreground">Transaction Detail</p>
            <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{tx.orderId}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Amount hero */}
          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-mono font-bold text-foreground">{fmt(tx.amount)}</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">Platform fee: {fmt(tx.fee)} (2.5%)</p>
            <p className="text-xs font-mono text-emerald-400 mt-0.5">Net to merchant: {fmt(tx.amount - tx.fee)}</p>
          </div>

          {/* Item masking detail */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-xs font-mono font-semibold text-foreground">Item Masking</p>
              {tx.masked ? (
                <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-400/10 text-violet-400 border border-violet-400/20">Active</span>
              ) : (
                <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">Disabled</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Original Product</p>
                <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border border-border">
                  <span className="text-xs font-mono text-foreground">{tx.originalProduct}</span>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <div className="h-px w-8 bg-border" />
                  {tx.masked ? "masked to" : "sent as-is"}
                  <div className="h-px w-8 bg-border" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Sent to PayPal as</p>
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 border ${tx.masked ? "bg-violet-400/5 border-violet-400/20" : "bg-background border-border"}`}>
                  <span className={`text-xs font-mono ${tx.masked ? "text-violet-400" : "text-foreground"}`}>{tx.maskedProduct}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Routing info */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-mono font-semibold text-foreground">Routing Details</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "PayPal Account", value: tx.paypalAccount, color: "text-foreground" },
                { label: "PayPal Tx ID", value: tx.paypalTxId, color: "text-foreground", copy: true },
                { label: "Store", value: tx.storeName, color: "text-foreground" },
                { label: "Store ID", value: tx.storeId, color: "text-muted-foreground" },
                { label: "Date", value: tx.date, color: "text-foreground" },
                { label: "Time (UTC)", value: tx.time, color: "text-foreground" },
                { label: "IP / Country", value: tx.ipCountry, color: "text-foreground" },
                { label: "Order ID", value: tx.orderId, color: "text-cyan-400", copy: true },
              ].map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{row.label}</p>
                  <div className="flex items-center gap-1">
                    <p className={`text-xs font-mono ${row.color} truncate`}>{row.value}</p>
                    {row.copy && <CopyButton text={row.value} />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-mono font-semibold text-foreground">Customer</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">Email:</span>
              <span className="text-xs font-mono text-foreground flex-1">
                {showEmail ? tx.customerEmail : tx.customerEmail.replace(/(.{3}).*(@.*)/, "$1•••$2")}
              </span>
              <button
                onClick={() => setShowEmail((v) => !v)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showEmail ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <CopyButton text={tx.customerEmail} />
            </div>
          </div>

          {/* Actions */}
          {(tx.status === "Completed" || tx.status === "Disputed") && (
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
                Issue Refund
              </button>
              {tx.status === "Disputed" && (
                <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Dispute Evidence
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TxStatus | "All">("All")
  const [maskFilter, setMaskFilter] = useState<"All" | "Masked" | "Unmasked">("All")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  // Build the API URL with filters
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", String(PER_PAGE))
    if (statusFilter !== "All") params.set("status", statusToDb(statusFilter))
    if (search.trim()) params.set("search", search.trim())
    if (dateFrom) params.set("startDate", dateFrom)
    if (dateTo) params.set("endDate", dateTo)
    return `/api/merchant/logs?${params.toString()}`
  }, [page, statusFilter, search, dateFrom, dateTo])

  const { data, error, isLoading, isValidating } = useSWR<LogsApiResponse>(
    buildUrl(),
    fetcher,
    { refreshInterval: 5_000, revalidateOnFocus: true }
  )

  const transactions = (data?.transactions ?? []).map(mapTransaction)
  const pagination = data?.pagination
  const totalPages = pagination?.totalPages ?? 1
  const totalCount = pagination?.total ?? 0

  // Summary stats from current page data
  const totalVolume = transactions.reduce((s, t) => s + t.amount, 0)
  const totalFees = transactions.reduce((s, t) => s + t.fee, 0)
  const completedCount = transactions.filter((t) => t.status === "Completed").length
  const maskedCount = transactions.filter((t) => t.masked).length

  // Export CSV of current page
  const handleExportCsv = () => {
    if (transactions.length === 0) return
    const headers = ["Date", "Time", "Order ID", "Store", "Original Product", "Masked Product", "Account", "Amount", "Fee", "Status"]
    const rows = transactions.map(tx => [
      tx.date, tx.time, tx.orderId, tx.storeName,
      tx.originalProduct, tx.maskedProduct, tx.paypalAccount,
      tx.amount.toFixed(2), tx.fee.toFixed(2), tx.status,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Manual capture handler ────────────────────────────────────────────────
  const [capturingId, setCapturingId] = useState<string | null>(null)
  const [captureToast, setCaptureToast] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  const handleCapture = async (txId: string) => {
    if (capturingId) return // prevent double-click
    setCapturingId(txId)
    setCaptureToast(null)
    try {
      const res = await fetch("/api/merchant/transactions/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCaptureToast({ type: "error", msg: data.error ?? "Capture failed" })
      } else {
        setCaptureToast({ type: "success", msg: `Captured $${data.amount} successfully` })
        // Refresh the data
        globalMutate(buildUrl())
      }
    } catch {
      setCaptureToast({ type: "error", msg: "Network error" })
    } finally {
      setCapturingId(null)
      // Clear toast after 4 seconds
      setTimeout(() => setCaptureToast(null), 4000)
    }
  }

  // Check if a transaction is capturable (< 3 days old)
  const isCapturable = (tx: Transaction) => {
    if (tx.status !== "Authorized") return false
    const created = new Date(`${tx.date}T${tx.time}:00Z`)
    const ageHours = (Date.now() - created.getTime()) / (1000 * 60 * 60)
    return ageHours < 72
  }

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* Page title + actions */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-foreground">Transaction Log</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full audit trail of all gateway-routed payments
              {isValidating && !isLoading && (
                <span className="inline-flex items-center gap-1 ml-2 text-cyan-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> updating
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
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
              <span className="text-red-400 font-semibold">Failed to load transactions.</span>
              <span className="text-muted-foreground"> Auto-retry in 5 seconds.</span>
            </div>
          </div>
        )}

        {/* Capture toast */}
        {captureToast && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono border ${
            captureToast.type === "success"
              ? "bg-emerald-400/5 border-emerald-400/20 text-emerald-400"
              : "bg-red-400/5 border-red-400/20 text-red-400"
          }`}>
            {captureToast.type === "success" ? <Zap className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {captureToast.msg}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Volume (Page)", value: fmt(totalVolume), sub: `${transactions.length} of ${totalCount} transactions`, color: "border-cyan-400/20", accent: "text-cyan-400" },
            { label: "Platform Fees", value: fmt(totalFees), sub: "2.5% commission", color: "border-emerald-400/20", accent: "text-emerald-400" },
            { label: "Completed", value: completedCount.toString(), sub: `${((completedCount / Math.max(transactions.length, 1)) * 100).toFixed(1)}% success rate`, color: "border-border", accent: "text-foreground" },
            { label: "Item Masking Active", value: maskedCount.toString(), sub: `${((maskedCount / Math.max(transactions.length, 1)) * 100).toFixed(0)}% of page`, color: "border-violet-400/20", accent: "text-violet-400" },
          ].map((s) => (
            <div key={s.label} className={`bg-card border ${s.color} rounded-lg p-4`}>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={`text-xl font-mono font-bold mt-1 ${s.accent}`}>{s.value}</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Search + filter bar */}
        <div className="bg-card border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-background border border-border rounded-md px-3 py-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search order ID, product, store, PayPal account..."
                className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Status pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {(["All", ...ALL_STATUSES] as const).map((s) => {
                const active = statusFilter === s
                const cfg = s !== "All" ? STATUS_CFG[s] : null
                return (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setPage(1) }}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors ${
                      active
                        ? cfg ? `${cfg.bg} ${cfg.text} border-transparent` : "bg-secondary text-foreground border-border"
                        : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>

            {/* More filters toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border rounded-md transition-colors ${
                showFilters ? "bg-secondary text-foreground border-border" : "text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
              {/* Masking filter */}
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Item Masking</p>
                <div className="flex rounded-md overflow-hidden border border-border">
                  {(["All", "Masked", "Unmasked"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => { setMaskFilter(v); setPage(1) }}
                      className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${
                        maskFilter === v ? "bg-violet-400/10 text-violet-400" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Date From</p>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                  className="bg-background border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Date To</p>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                  className="bg-background border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                />
              </div>

              {/* Clear */}
              <div className="flex items-end">
                <button
                  onClick={() => { setMaskFilter("All"); setDateFrom(""); setDateTo(""); setPage(1) }}
                  className="px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <p className="text-xs font-mono text-muted-foreground">
              Showing <span className="text-foreground">{transactions.length}</span> of{" "}
              <span className="text-foreground">{totalCount}</span> transactions
              {" "}&bull; page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-mono text-emerald-400">{fmt(totalVolume)} page total</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {["Date / Time", "Order ID", "Store", "Original Product", "Masked Product", "PayPal Account", "Amount", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <ArrowRightLeft className="w-8 h-8 mb-3 opacity-30" />
                        <p className="text-sm font-mono">No transactions match your filters</p>
                        <button
                          onClick={() => { setSearch(""); setStatusFilter("All"); setMaskFilter("All"); setDateFrom(""); setDateTo("") }}
                          className="mt-3 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          Clear all filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const cfg = STATUS_CFG[tx.status]
                    const isSelected = selectedTx?.id === tx.id
                    return (
                      <Fragment key={tx.id}>
                        <tr
                          onClick={() => setSelectedTx(tx)}
                          className={`border-b border-border/40 cursor-pointer transition-colors hover:bg-secondary/20 ${isSelected ? "bg-cyan-400/5 border-l-2 border-l-cyan-400" : ""}`}
                        >
                          {/* Date/Time */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div>
                              <p className="text-foreground">{tx.date}</p>
                              <p className="text-muted-foreground text-[10px]">{tx.time} UTC</p>
                            </div>
                          </td>

                          {/* Order ID */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-cyan-400">{tx.orderId}</span>
                              <CopyButton text={tx.orderId} />
                            </div>
                          </td>

                          {/* Store */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-foreground">{tx.storeName}</span>
                            </div>
                          </td>

                          {/* Original Product */}
                          <td className="px-4 py-3 max-w-[180px]">
                            <span className="text-foreground truncate block" title={tx.originalProduct}>{tx.originalProduct}</span>
                          </td>

                          {/* Masked Product */}
                          <td className="px-4 py-3 max-w-[180px]">
                            {tx.masked ? (
                              <div className="flex items-center gap-1.5">
                                <Package className="w-3 h-3 text-violet-400 shrink-0" />
                                <span className="text-violet-400 truncate" title={tx.maskedProduct}>{tx.maskedProduct}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">— not masked</span>
                            )}
                          </td>

                          {/* PayPal Account */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-foreground">{tx.paypalAccount}</span>
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-foreground font-semibold">{fmt(tx.amount)}</span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                              {isCapturable(tx) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCapture(tx.id) }}
                                  disabled={capturingId === tx.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-md hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                                >
                                  {capturingId === tx.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Zap className="w-3 h-3" />
                                  )}
                                  Capture
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs font-mono text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-mono border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-7 text-xs font-mono rounded-md border transition-colors ${
                        p === page ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/30" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-mono border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail panel */}
      {selectedTx && <TxDetailPanel tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  )
}
