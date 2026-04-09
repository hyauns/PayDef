// Cache invalidation: 2026-04-08-hardening
"use client"

import { Fragment, useCallback, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import {
  Search,
  Filter,
  Download,
  X,
  ArrowRightLeft,
  Copy,
  Check,
  Store,
  CreditCard,
  Package,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Zap,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

type TxStatus =
  | "Completed"
  | "Pending"
  | "Authorized"
  | "Failed"
  | "Refunded"
  | "Disputed"
  | "Canceled"
  | "Expired"

interface Transaction {
  id: string
  orderId: string
  date: string
  time: string
  storeName: string
  storeId: string
  paypalAccount: string
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

interface TransactionDetailResponse {
  transaction_id: string
  tenant_id: string
  store_id: string
  merchant_id: string
  store_name: string | null
  account_name: string | null
  shield_domain: string | null
  amount: string
  currency: string
  original_item_name: string | null
  masked_item_name: string | null
  gateway_fee: string
  status: string
  paypal_order_id: string | null
  paypal_capture_id: string | null
  authorization_id: string | null
  customer_email: string | null
  buyer_ip: string | null
  buyer_country: string | null
  ip_address: string | null
  timestamps: {
    created_at: string
    updated_at: string
    authorized_at: string | null
    completed_at: string | null
    failed_at: string | null
    refunded_at: string | null
    disputed_at: string | null
    canceled_at: string | null
    checkout_expires_at: string | null
    authorization_expires_at: string | null
  }
  status_reason: string | null
  merchant_success_url: string | null
  merchant_cancel_url: string | null
  event_history: Array<{
    event_id: string
    event: string
    delivery_status: string
    created_at: string
    delivered_at: string | null
    next_retry_at: string | null
    attempt_count: number
    latest_http_status: number | null
    latest_error: string | null
    last_delivery_id: string | null
    source: string
    trigger_origin: string
    deliveries: Array<{
      delivery_id: string
      attempt_number: number
      trigger_origin: string
      final_status: string
      http_status: number | null
      response_snippet: string | null
      error_message: string | null
      next_retry_at: string | null
      delivered_at: string | null
      created_at: string
    }>
  }>
}

function mapStatus(dbStatus: string): TxStatus {
  switch (dbStatus) {
    case "COMPLETED": return "Completed"
    case "AUTHORIZED": return "Authorized"
    case "PENDING": return "Pending"
    case "FAILED": return "Failed"
    case "REFUNDED": return "Refunded"
    case "DISPUTED": return "Disputed"
    case "CANCELED": return "Canceled"
    case "EXPIRED": return "Expired"
    default: return "Pending"
  }
}

function mapTransaction(tx: LogsApiResponse["transactions"][number]): Transaction {
  const createdAt = new Date(tx.createdAt)
  const originalProduct = tx.originalItemName ?? "—"
  const maskedProduct = tx.maskedItemName ?? originalProduct
  const isMasked = !!tx.maskedItemName && tx.maskedItemName !== tx.originalItemName

  return {
    id: tx.id,
    orderId: tx.paypalOrderId ?? tx.id.slice(0, 16),
    date: createdAt.toISOString().slice(0, 10),
    time: createdAt.toTimeString().slice(0, 5),
    storeName: tx.storeName ?? "—",
    storeId: tx.storeId,
    paypalAccount: tx.accountName ?? "—",
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

const fetcher = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  })

const STATUS_CFG: Record<TxStatus, { label: string; bg: string; text: string; dot: string }> = {
  Completed: { label: "Completed", bg: "bg-emerald-400/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Authorized: { label: "Authorized", bg: "bg-indigo-400/10", text: "text-indigo-400", dot: "bg-indigo-400" },
  Pending: { label: "Pending", bg: "bg-amber-400/10", text: "text-amber-400", dot: "bg-amber-400" },
  Failed: { label: "Failed", bg: "bg-rose-400/10", text: "text-rose-400", dot: "bg-rose-400" },
  Refunded: { label: "Refunded", bg: "bg-blue-400/10", text: "text-blue-400", dot: "bg-blue-400" },
  Disputed: { label: "Disputed", bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  Canceled: { label: "Canceled", bg: "bg-zinc-400/10", text: "text-zinc-300", dot: "bg-zinc-400" },
  Expired: { label: "Expired", bg: "bg-orange-400/10", text: "text-orange-400", dot: "bg-orange-400" },
}

const ALL_STATUSES: TxStatus[] = ["Completed", "Authorized", "Pending", "Failed", "Refunded", "Disputed", "Canceled", "Expired"]

function statusToDb(status: TxStatus): string {
  switch (status) {
    case "Completed": return "COMPLETED"
    case "Authorized": return "AUTHORIZED"
    case "Pending": return "PENDING"
    case "Failed": return "FAILED"
    case "Refunded": return "REFUNDED"
    case "Disputed": return "DISPUTED"
    case "Canceled": return "CANCELED"
    case "Expired": return "EXPIRED"
  }
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={(event) => {
        event.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

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

function TxDetailPanel({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const [showEmail, setShowEmail] = useState(false)
  const [replayBusy, setReplayBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const detailKey = `/api/merchant/transactions/${tx.id}`
  const { data, error, isLoading, mutate } = useSWR<TransactionDetailResponse>(detailKey, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  })

  const status = data ? mapStatus(data.status) : tx.status
  const cfg = STATUS_CFG[status]
  const amount = data ? Number(data.amount) : tx.amount
  const fee = data ? Number(data.gateway_fee) : tx.fee
  const customerEmail = data?.customer_email ?? tx.customerEmail
  const masked = !!data?.masked_item_name && data.masked_item_name !== data.original_item_name

  const handleReplay = async (eventId?: string) => {
    setReplayBusy(true)
    setToast(null)

    try {
      const response = await fetch(`/api/merchant/transactions/${tx.id}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventId ? { eventId } : {}),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? "Replay failed")
      }

      setToast({ ok: true, msg: `Webhook replay created delivery ${payload.delivery_id ?? "pending"} with status ${payload.delivery_status}.` })
      await mutate()
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/merchant/logs"))
    } catch (replayError) {
      setToast({ ok: false, msg: replayError instanceof Error ? replayError.message : "Replay failed" })
    } finally {
      setReplayBusy(false)
    }
  }



  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[560px] bg-card border-l border-border z-50 overflow-y-auto flex flex-col">
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
        {toast && (
            <div className={`rounded-md border px-3 py-2 text-[11px] font-mono ${
              toast.ok
                ? "bg-emerald-400/5 border-emerald-400/20 text-emerald-400"
                : "bg-red-400/5 border-red-400/20 text-red-400"
            }`}>
              {toast.msg}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-mono text-red-400">
              Failed to load webhook delivery history for this transaction.
            </div>
          )}

          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-mono font-bold text-foreground">{fmt(amount)}</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">Platform fee: {fmt(fee)} (2.5%)</p>
            <p className="text-xs font-mono text-emerald-400 mt-0.5">Net to merchant: {fmt(amount - fee)}</p>
          </div>



          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "PayPal Order", value: data?.paypal_order_id ?? tx.orderId, color: "text-cyan-400", copy: true },
              { label: "Capture ID", value: data?.paypal_capture_id ?? tx.paypalTxId, color: "text-foreground", copy: !!data?.paypal_capture_id },
              { label: "Authorization", value: data?.authorization_id ?? "—", color: "text-foreground", copy: !!data?.authorization_id },
              { label: "Status Reason", value: data?.status_reason ?? "—", color: "text-muted-foreground" },
              { label: "Store", value: data?.store_name ?? tx.storeName, color: "text-foreground" },
              { label: "Shield Domain", value: data?.shield_domain ?? "—", color: "text-foreground" },
            ].map((row) => (
              <div key={row.label} className="space-y-0.5 rounded-md border border-border bg-background px-3 py-2.5">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{row.label}</p>
                <div className="flex items-center gap-1">
                  <p className={`text-xs font-mono truncate ${row.color}`}>{row.value}</p>
                  {row.copy && typeof row.value === "string" && row.value !== "—" && <CopyButton text={row.value} />}
                </div>
              </div>
            ))}
          </div>

          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-xs font-mono font-semibold text-foreground">Item Masking</p>
              {masked ? (
                <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-400/10 text-violet-400 border border-violet-400/20">Active</span>
              ) : (
                <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">Disabled</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Original Product</p>
                <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border border-border">
                  <span className="text-xs font-mono text-foreground">{data?.original_item_name ?? tx.originalProduct}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Sent to PayPal</p>
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 border ${masked ? "bg-violet-400/5 border-violet-400/20" : "bg-background border-border"}`}>
                  <span className={`text-xs font-mono ${masked ? "text-violet-400" : "text-foreground"}`}>
                    {data?.masked_item_name ?? tx.maskedProduct}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-mono font-semibold text-foreground">Customer</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">Email:</span>
              <span className="text-xs font-mono text-foreground flex-1">
                {showEmail || !customerEmail.includes("@")
                  ? customerEmail
                  : customerEmail.replace(/(.{3}).*(@.*)/, "$1•••$2")}
              </span>
              <button
                onClick={() => setShowEmail((value) => !value)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showEmail ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              {customerEmail !== "—" && <CopyButton text={customerEmail} />}
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-mono font-semibold text-foreground">Delivery Recovery</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  Manual sync refreshes canonical state. Replay re-sends the latest merchant webhook with the same event ID and a new delivery ID.
                </p>
              </div>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void mutate()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Manual Sync
              </button>
              <button
                onClick={() => void handleReplay()}
                disabled={replayBusy || !data?.event_history?.length}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {replayBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Replay Webhook
              </button>
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-mono font-semibold text-foreground">Webhook Delivery History</p>
            </div>
            {!data?.event_history?.length ? (
              <p className="text-[11px] font-mono text-muted-foreground">
                No gateway webhook event has been generated for this transaction yet.
              </p>
            ) : (
              <div className="space-y-3">
                {data.event_history.map((event) => (
                  <div key={event.event_id} className="rounded-md border border-border bg-background px-3 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-mono text-foreground">{event.event}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">Event ID: {event.event_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2 py-1 text-[10px] font-mono text-foreground">
                          {event.delivery_status}
                        </span>
                        <button
                          onClick={() => void handleReplay(event.event_id)}
                          disabled={replayBusy}
                          className="px-2.5 py-1 text-[10px] font-mono border border-cyan-400/30 text-cyan-400 rounded-md hover:bg-cyan-400/10 transition-colors disabled:opacity-40"
                        >
                          Replay
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground">
                      <div>Attempts: {event.attempt_count}</div>
                      <div>Latest HTTP: {event.latest_http_status ?? "—"}</div>
                      <div>Next Retry: {event.next_retry_at ?? "—"}</div>
                      <div>Last Delivery: {event.last_delivery_id ?? "—"}</div>
                    </div>

                    {event.latest_error && (
                      <p className="text-[10px] font-mono text-amber-400">{event.latest_error}</p>
                    )}

                    <div className="space-y-2 border-t border-border/60 pt-2">
                      {event.deliveries.map((delivery) => (
                        <div key={delivery.delivery_id} className="rounded-md border border-border/70 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-mono text-foreground">
                              Attempt #{delivery.attempt_number} · {delivery.final_status}
                            </p>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {delivery.http_status ?? "timeout"}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                            Delivery ID: {delivery.delivery_id}
                          </p>
                          {delivery.error_message && (
                            <p className="mt-1 text-[10px] font-mono text-amber-400">{delivery.error_message}</p>
                          )}
                          {delivery.response_snippet && (
                            <p className="mt-1 text-[10px] font-mono text-muted-foreground break-all">
                              Response: {delivery.response_snippet}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default function TransactionsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TxStatus | "All">("All")
  const [maskFilter, setMaskFilter] = useState<"All" | "Masked" | "Unmasked">("All")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const perPage = 20

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", String(perPage))
    if (statusFilter !== "All") params.set("status", statusToDb(statusFilter))
    if (search.trim()) params.set("search", search.trim())
    if (dateFrom) params.set("startDate", dateFrom)
    if (dateTo) params.set("endDate", dateTo)
    return `/api/merchant/logs?${params.toString()}`
  }, [dateFrom, dateTo, page, search, statusFilter])

  const { data, error, isLoading, isValidating } = useSWR<LogsApiResponse>(buildUrl(), fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  })

  const transactions = (data?.transactions ?? [])
    .map(mapTransaction)
    .filter((tx) => (maskFilter === "All" ? true : maskFilter === "Masked" ? tx.masked : !tx.masked))

  const pagination = data?.pagination
  const totalPages = pagination?.totalPages ?? 1
  const totalCount = pagination?.total ?? 0
  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalFees = transactions.reduce((sum, tx) => sum + tx.fee, 0)
  const completedCount = transactions.filter((tx) => tx.status === "Completed").length
  const maskedCount = transactions.filter((tx) => tx.masked).length

  const handleExportCsv = () => {
    if (transactions.length === 0) return

    const headers = ["Date", "Time", "Order ID", "Store", "Original Product", "Masked Product", "Account", "Amount", "Fee", "Status"]
    const rows = transactions.map((tx) => [
      tx.date,
      tx.time,
      tx.orderId,
      tx.storeName,
      tx.originalProduct,
      tx.maskedProduct,
      tx.paypalAccount,
      tx.amount.toFixed(2),
      tx.fee.toFixed(2),
      tx.status,
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }



  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="mx-auto max-w-[1500px] px-4 py-5 md:px-6 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Operations</p>
            <h1 className="text-xl font-semibold text-foreground mt-1">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review routed payments, webhook delivery history, and recovery actions.
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



        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Volume (Page)", value: fmt(totalVolume), sub: `${transactions.length} of ${totalCount} transactions`, color: "border-cyan-400/20", accent: "text-cyan-400" },
            { label: "Platform Fees", value: fmt(totalFees), sub: "2.5% commission", color: "border-emerald-400/20", accent: "text-emerald-400" },
            { label: "Completed", value: completedCount.toString(), sub: `${((completedCount / Math.max(transactions.length, 1)) * 100).toFixed(1)}% success rate`, color: "border-border", accent: "text-foreground" },
            { label: "Item Masking Active", value: maskedCount.toString(), sub: `${((maskedCount / Math.max(transactions.length, 1)) * 100).toFixed(0)}% of page`, color: "border-violet-400/20", accent: "text-violet-400" },
          ].map((item) => (
            <div key={item.label} className={`bg-card border ${item.color} rounded-lg p-4`}>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className={`text-xl font-mono font-bold mt-1 ${item.accent}`}>{item.value}</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-1">{item.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order, PayPal ID, store, product, or email"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {(["All", ...ALL_STATUSES] as const).map((status) => {
                    const active = statusFilter === status
                    const cfg = status === "All" ? null : STATUS_CFG[status]
                    return (
                      <button
                        key={status}
                        onClick={() => { setStatusFilter(status); setPage(1) }}
                        className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors ${
                          active
                            ? cfg ? `${cfg.bg} ${cfg.text} border-transparent` : "bg-secondary text-foreground border-border"
                            : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        {status}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setShowFilters((value) => !value)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border rounded-md transition-colors ${
                    showFilters ? "bg-secondary text-foreground border-border" : "text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filters
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="flex">
                    {(["All", "Masked", "Unmasked"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => { setMaskFilter(value); setPage(1) }}
                        className={`flex-1 px-3 py-1.5 text-[11px] font-mono transition-colors ${
                          maskFilter === value ? "bg-violet-400/10 text-violet-400" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">From</p>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">To</p>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>

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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/30 border-b border-border">
                <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Original Product</th>
                  <th className="px-4 py-3 font-medium">Masked Product</th>
                  <th className="px-4 py-3 font-medium">PayPal Account</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => <SkeletonRow key={index} />)
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-red-400">
                      Failed to load transactions.
                    </td>
                  </tr>
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
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div>
                              <p className="text-foreground">{tx.date}</p>
                              <p className="text-muted-foreground text-[10px]">{tx.time} UTC</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-cyan-400">{tx.orderId}</span>
                              <CopyButton text={tx.orderId} />
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-foreground">{tx.storeName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <span className="text-foreground truncate block" title={tx.originalProduct}>{tx.originalProduct}</span>
                          </td>
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
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-foreground">{tx.paypalAccount}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-foreground font-semibold">{fmt(tx.amount)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>

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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs font-mono text-muted-foreground">
                Page {page} of {totalPages} {isValidating ? "· refreshing" : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-mono border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, index) => {
                  const targetPage = totalPages <= 7
                    ? index + 1
                    : page <= 4
                    ? index + 1
                    : page >= totalPages - 3
                    ? totalPages - 6 + index
                    : page - 3 + index

                  return (
                    <button
                      key={targetPage}
                      onClick={() => setPage(targetPage)}
                      className={`w-8 h-7 text-xs font-mono rounded-md border transition-colors ${
                        targetPage === page ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/30" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {targetPage}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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

      {selectedTx && <TxDetailPanel tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  )
}
