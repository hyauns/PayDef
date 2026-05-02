// Cache invalidation: 2026-04-08-hardening
"use client"

import { Fragment, useCallback, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { toast } from "sonner"
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
  FlaskConical,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { GridBackground } from "@/components/ui/grid-background"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { transactionsCopy } from "@/lib/i18n/transactions"

type TxStatus =
  | "Completed"
  | "Pending"
  | "Authorized"
  | "Failed"
  | "Refunded"
  | "Disputed"
  | "Canceled"
  | "Expired"
  | "Voided"

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
  paymentMethodLabel: string
  isCardPayment: boolean
  cardBrand: string | null
  cardLast4: string | null
  buyerName: string | null
  billingAddress: Record<string, unknown> | string | null
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
    cardLast4: string | null
    cardBrand: string | null
    buyerName: string | null
    billingAddress: Record<string, unknown> | string | null
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
  latest_authorization_id: string | null
  customer_email: string | null
  card_last_4: string | null
  card_brand: string | null
  buyer_name: string | null
  billing_address: Record<string, unknown> | string | null
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

interface MockChargeFormState {
  storeId: string
  amount: string
  cardNumber: string
  cvv: string
  expMonth: string
  expYear: string
  buyerName: string
  billingAddress: string
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
    case "VOIDED": return "Voided"
    default: return "Pending"
  }
}

function mapTransaction(tx: LogsApiResponse["transactions"][number]): Transaction {
  const createdAt = new Date(tx.createdAt)
  const originalProduct = tx.originalItemName ?? "—"
  const maskedProduct = tx.maskedItemName ?? originalProduct
  const isMasked = !!tx.maskedItemName && tx.maskedItemName !== tx.originalItemName
  const isCardPayment = !!tx.cardBrand && !!tx.cardLast4
  const paymentMethodLabel = isCardPayment
    ? `${tx.cardBrand} •••• ${tx.cardLast4}`
    : "PayPal"

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
    paymentMethodLabel,
    isCardPayment,
    cardBrand: tx.cardBrand,
    cardLast4: tx.cardLast4,
    buyerName: tx.buyerName,
    billingAddress: tx.billingAddress,
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

const getStatusCfg = (t: any) => ({
  Completed: { label: t.statusCompleted, bg: "bg-emerald-400/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Authorized: { label: t.statusAuthorized, bg: "bg-[#00e5ff]/10", text: "text-[#00e5ff]", dot: "bg-[#00e5ff]" },
  Pending: { label: t.statusPending, bg: "bg-amber-400/10", text: "text-amber-400", dot: "bg-amber-400" },
  Failed: { label: t.statusFailed, bg: "bg-rose-400/10", text: "text-rose-400", dot: "bg-rose-400" },
  Refunded: { label: t.statusRefunded, bg: "bg-blue-400/10", text: "text-blue-400", dot: "bg-blue-400" },
  Disputed: { label: t.statusDisputed, bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  Canceled: { label: t.statusCanceled, bg: "bg-zinc-400/10", text: "text-zinc-300", dot: "bg-zinc-400" },
  Expired: { label: t.statusExpired, bg: "bg-orange-400/10", text: "text-orange-400", dot: "bg-orange-400" },
  Voided: { label: t.statusVoided, bg: "bg-slate-400/10", text: "text-slate-400", dot: "bg-slate-400" },
})

const ALL_STATUSES: TxStatus[] = ["Completed", "Authorized", "Pending", "Failed", "Refunded", "Disputed", "Canceled", "Expired", "Voided"]

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
    case "Voided": return "VOIDED"
  }
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function formatPaymentMethod(input: { cardBrand?: string | null; cardLast4?: string | null }) {
  if (input.cardBrand && input.cardLast4) {
    return `${input.cardBrand} •••• ${input.cardLast4}`
  }
  return "PayPal"
}

function formatBillingAddress(address: Record<string, unknown> | string | null | undefined) {
  if (!address) return "—"
  if (typeof address === "string") return address

  const fields = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.postalCode,
    address.country,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())

  if (fields.length > 0) {
    return fields.join(", ")
  }

  return JSON.stringify(address, null, 2)
}

function parseBillingAddressInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error("Billing Address must be valid JSON.")
  }
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
      className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[#343947]/40 animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-16 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 bg-[#2a2d39] rounded" /></td>
      <td className="px-4 py-3"><div className="h-3 w-14 bg-[#2a2d39] rounded" /></td>
    </tr>
  )
}

function MockChargeModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => Promise<void> | void
}) {
  const { language } = useLanguage()
  const t = transactionsCopy[language]
  
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MockChargeFormState>({
    storeId: "",
    amount: "",
    cardNumber: "4111111111111111",
    cvv: "123",
    expMonth: "12",
    expYear: String(new Date().getFullYear() + 1),
    buyerName: "",
    billingAddress: '{\n  "line1": "123 Test Street",\n  "city": "Bangkok",\n  "state": "Bangkok",\n  "postal_code": "10110",\n  "country": "TH"\n}',
  })

  if (!open) return null

  const setField = (field: keyof MockChargeFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const billingAddress = parseBillingAddressInput(form.billingAddress)
      const response = await fetch("/api/gateway/mock-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          store_id: form.storeId.trim(),
          amount: form.amount.trim(),
          currency: "USD",
          cardNumber: form.cardNumber.trim(),
          cvv: form.cvv.trim(),
          expMonth: form.expMonth.trim(),
          expYear: form.expYear.trim(),
          buyerName: form.buyerName.trim(),
          billingAddress,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? "Mock charge failed")
      }

      toast.success(`Mock charge completed for ${payload.card_brand ?? "card"} ${payload.card_last_4 ?? ""}`.trim())
      await onSuccess()
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Mock charge failed"
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-xl border border-[#343947] bg-[#151821] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#343947] px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-[#e7edf8]">{t.testMockCharge}</p>
              <p className="text-xs font-mono text-[#97a3b6] mt-1">
                {t.mockChargeDesc}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md border border-[#343947] p-1.5 text-[#97a3b6] transition-colors hover:text-[#e7edf8]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            {error && (
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm font-mono text-red-400">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.storeId}</span>
                <input
                  value={form.storeId}
                  onChange={(event) => setField("storeId", event.target.value)}
                  className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.amount}</span>
                <input
                  value={form.amount}
                  onChange={(event) => setField("amount", event.target.value)}
                  placeholder="49.99"
                  className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.mockCardNumber}</span>
                <input
                  value={form.cardNumber}
                  onChange={(event) => setField("cardNumber", event.target.value)}
                  className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.cvv}</span>
                <input
                  value={form.cvv}
                  onChange={(event) => setField("cvv", event.target.value)}
                  className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.expMonth}</span>
                  <input
                    value={form.expMonth}
                    onChange={(event) => setField("expMonth", event.target.value)}
                    className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.expYear}</span>
                  <input
                    value={form.expYear}
                    onChange={(event) => setField("expYear", event.target.value)}
                    className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                  />
                </label>
              </div>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.buyerNameModal}</span>
                <input
                  value={form.buyerName}
                  onChange={(event) => setField("buyerName", event.target.value)}
                  className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-sm text-[#e7edf8] focus:outline-none"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.billingAddressJson}</span>
                <textarea
                  value={form.billingAddress}
                  onChange={(event) => setField("billingAddress", event.target.value)}
                  rows={7}
                  className="w-full rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-xs text-[#e7edf8] focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#343947] px-5 py-4">
            <button
              onClick={onClose}
              className="rounded-md border border-[#343947] px-3 py-2 text-xs font-mono text-[#97a3b6] transition-colors hover:text-[#e7edf8]"
            >
              {t.cancel}
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md border border-[#FFD600]/30 px-3 py-2 text-xs font-mono text-[#FFD600] transition-colors hover:bg-[#FFD600]/10 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
              {t.submitMockCharge}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function TxDetailPanel({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { language } = useLanguage()
  const t = transactionsCopy[language]
  
  const [showEmail, setShowEmail] = useState(false)
  const [replayBusy, setReplayBusy] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ msg: string; ok: boolean } | null>(null)
  const detailKey = `/api/merchant/transactions/${tx.id}`
  const { data, error, isLoading, mutate } = useSWR<TransactionDetailResponse>(detailKey, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  })

  const status = data ? mapStatus(data.status) : tx.status
  const cfg = getStatusCfg(t)[status]
  const amount = data ? Number(data.amount) : tx.amount
  const fee = data ? Number(data.gateway_fee) : tx.fee
  const customerEmail = data?.customer_email ?? tx.customerEmail
  const masked = !!data?.masked_item_name && data.masked_item_name !== data.original_item_name
  const paymentMethod = formatPaymentMethod({
    cardBrand: data?.card_brand ?? tx.cardBrand,
    cardLast4: data?.card_last_4 ?? tx.cardLast4,
  })
  const buyerName = data?.buyer_name ?? tx.buyerName ?? "—"
  const billingAddress = formatBillingAddress(data?.billing_address ?? tx.billingAddress)

  const handleReplay = async (eventId?: string) => {
    setReplayBusy(true)
    setToastMsg(null)

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

      setToastMsg({ ok: true, msg: `Webhook replay created delivery ${payload.delivery_id ?? "pending"} with status ${payload.delivery_status}.` })
      await mutate()
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/merchant/logs"))
    } catch (replayError) {
      setToastMsg({ ok: false, msg: replayError instanceof Error ? replayError.message : "Replay failed" })
    } finally {
      setReplayBusy(false)
    }
  }

  const handleReauthorize = async () => {
    setReplayBusy(true)
    setToastMsg(null)
    try {
      const response = await fetch(`/api/merchant/transactions/${tx.id}/reauthorize`, {
        method: "POST",
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? "Reauthorize failed")
      }
      setToastMsg({ ok: true, msg: "Reauthorization successful. New ID: " + payload.new_authorization_id })
      await mutate()
    } catch (err) {
      setToastMsg({ ok: false, msg: err instanceof Error ? err.message : "Reauthorize failed" })
    } finally {
      setReplayBusy(false)
    }
  }



  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[560px] bg-[#151821] border-l border-[#343947] z-50 overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#343947] sticky top-0 bg-[#151821] z-10">
          <div>
            <p className="text-xs font-mono text-[#97a3b6]">{t.txDetail}</p>
            <p className="text-sm font-mono font-semibold text-[#e7edf8] mt-0.5">{tx.orderId}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            <button onClick={onClose} className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
        {toastMsg && (
            <div className={`rounded-md border px-3 py-2 text-sm font-mono ${
              toastMsg.ok
                ? "bg-emerald-400/5 border-emerald-400/20 text-emerald-400"
                : "bg-red-400/5 border-red-400/20 text-red-400"
            }`}>
              {toastMsg.msg}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm font-mono text-red-400">
              {t.failedToLoadWebhook}
            </div>
          )}

          <div className="bg-[#1a1d24] border border-[#343947] rounded-lg p-4 text-center">
            <p className="text-3xl font-mono font-bold text-[#e7edf8]">{fmt(amount)}</p>
            <p className="text-xs font-mono text-[#97a3b6] mt-1">{t.platformFee} {fmt(fee)} (2.5%)</p>
            <p className="text-xs font-mono text-emerald-400 mt-0.5">{t.netToMerchant} {fmt(amount - fee)}</p>
          </div>

          {status === "Authorized" && (
            <div className="border border-amber-400/20 bg-amber-400/5 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-semibold text-amber-400">Authorization Expiry Warning</p>
                  <p className="text-xs font-mono text-[#97a3b6] mt-1">
                    Expires at: {data?.timestamps.authorization_expires_at ? new Date(data.timestamps.authorization_expires_at).toLocaleString() : "—"}
                  </p>
                </div>
                <button
                  onClick={() => void handleReauthorize()}
                  disabled={replayBusy}
                  className="px-3 py-2 text-xs font-mono border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors disabled:opacity-40"
                >
                  {replayBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reauthorize"}
                </button>
              </div>
            </div>
          )}



          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t.paypalOrder, value: data?.paypal_order_id ?? tx.orderId, color: "text-[#FFD600]", copy: true },
              { label: t.captureId, value: data?.paypal_capture_id ?? tx.paypalTxId, color: "text-[#e7edf8]", copy: !!data?.paypal_capture_id },
              { label: t.authorization, value: data?.latest_authorization_id ?? data?.authorization_id ?? "—", color: "text-[#e7edf8]", copy: !!data?.authorization_id },
              { label: t.statusReason, value: data?.status_reason ?? "—", color: "text-[#97a3b6]" },
              { label: t.store, value: data?.store_name ?? tx.storeName, color: "text-[#e7edf8]" },
              { label: t.shieldDomain, value: data?.shield_domain ?? "—", color: "text-[#e7edf8]" },
            ].map((row) => (
              <div key={row.label} className="space-y-0.5 rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2.5">
                <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{row.label}</p>
                <div className="flex items-center gap-1">
                  <p className={`text-xs font-mono truncate ${row.color}`}>{row.value}</p>
                  {row.copy && typeof row.value === "string" && row.value !== "—" && <CopyButton text={row.value} />}
                </div>
              </div>
            ))}
          </div>

          <div className="border border-[#343947] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-xs font-mono font-semibold text-[#e7edf8]">{t.itemMasking}</p>
              {masked ? (
                <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-violet-400/10 text-violet-400 border border-violet-400/20">{t.active}</span>
              ) : (
                <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-[#2a2d39] text-[#97a3b6] border border-[#343947]">{t.disabled}</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.originalProduct}</p>
                <div className="flex items-center gap-2 bg-[#1a1d24] rounded-md px-3 py-2 border border-[#343947]">
                  <span className="text-xs font-mono text-[#e7edf8]">{data?.original_item_name ?? tx.originalProduct}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.sentToPaypal}</p>
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 border ${masked ? "bg-violet-400/5 border-violet-400/20" : "bg-[#1a1d24] border-[#343947]"}`}>
                  <span className={`text-xs font-mono ${masked ? "text-violet-400" : "text-[#e7edf8]"}`}>
                    {data?.masked_item_name ?? tx.maskedProduct}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-[#343947] rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-[#97a3b6]" />
              <p className="text-xs font-mono font-semibold text-[#e7edf8]">{t.customer}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#97a3b6]">{t.email}</span>
              <span className="text-xs font-mono text-[#e7edf8] flex-1">
                {showEmail || !customerEmail.includes("@")
                  ? customerEmail
                  : customerEmail.replace(/(.{3}).*(@.*)/, "$1•••$2")}
              </span>
              <button
                onClick={() => setShowEmail((value) => !value)}
                className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
              >
                {showEmail ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              {customerEmail !== "—" && <CopyButton text={customerEmail} />}
            </div>
          </div>

          <div className="border border-[#343947] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-[#FFD600]" />
              <p className="text-xs font-mono font-semibold text-[#e7edf8]">{t.paymentDetails}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.method}</p>
                <div className="rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-xs font-mono text-[#e7edf8]">
                  {paymentMethod}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.buyerName}</p>
                <div className="rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-xs font-mono text-[#e7edf8]">
                  {buyerName}
                </div>
              </div>
            </div>
            {(data?.card_brand || tx.cardBrand) ? (
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-wider text-[#97a3b6]">{t.billingAddress}</p>
                <div className="rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-2 text-xs font-mono text-[#e7edf8] whitespace-pre-wrap break-words">
                  {billingAddress}
                </div>
              </div>
            ) : (
              <p className="text-sm font-mono text-[#97a3b6]">
                {t.paypalNoMock}
              </p>
            )}
          </div>

          <div className="border border-[#343947] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-mono font-semibold text-[#e7edf8]">{t.deliveryRecovery}</p>
                <p className="text-xs font-mono text-[#97a3b6] mt-1">
                  {t.recoveryDesc}
                </p>
              </div>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-[#FFD600]" />}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void mutate()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono border border-[#343947] text-[#97a3b6] hover:text-[#e7edf8] hover:bg-[#2a2d39] rounded-md transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t.manualSync}
              </button>
              <button
                onClick={() => void handleReplay()}
                disabled={replayBusy || !data?.event_history?.length}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono border border-[#FFD600]/30 text-[#FFD600] hover:bg-[#FFD600]/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {replayBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t.replayWebhook}
              </button>
            </div>
          </div>

          <div className="border border-[#343947] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#97a3b6]" />
              <p className="text-xs font-mono font-semibold text-[#e7edf8]">{t.webhookHistory}</p>
            </div>
            {!data?.event_history?.length ? (
              <p className="text-sm font-mono text-[#97a3b6]">
                {t.noWebhookYet}
              </p>
            ) : (
              <div className="space-y-3">
                {data.event_history.map((event) => (
                  <div key={event.event_id} className="rounded-md border border-[#343947] bg-[#1a1d24] px-3 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-mono text-[#e7edf8]">{event.event}</p>
                        <p className="text-xs font-mono text-[#97a3b6]">{t.eventId} {event.event_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-[#343947] bg-[#2a2d39]/40 px-2 py-1 text-xs font-mono text-[#e7edf8]">
                          {event.delivery_status}
                        </span>
                        <button
                          onClick={() => void handleReplay(event.event_id)}
                          disabled={replayBusy}
                          className="px-2.5 py-1 text-xs font-mono border border-[#FFD600]/30 text-[#FFD600] rounded-md hover:bg-[#FFD600]/10 transition-colors disabled:opacity-40"
                        >
                          {t.replay}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#97a3b6]">
                      <div>{t.attempts} {event.attempt_count}</div>
                      <div>{t.latestHttp} {event.latest_http_status ?? "—"}</div>
                      <div>{t.nextRetry} {event.next_retry_at ?? "—"}</div>
                      <div>{t.lastDelivery} {event.last_delivery_id ?? "—"}</div>
                    </div>

                    {event.latest_error && (
                      <p className="text-xs font-mono text-amber-400">{event.latest_error}</p>
                    )}

                    <div className="space-y-2 border-t border-[#343947]/60 pt-2">
                      {event.deliveries.map((delivery) => (
                        <div key={delivery.delivery_id} className="rounded-md border border-[#343947]/70 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-mono text-[#e7edf8]">
                              {t.attemptNum}{delivery.attempt_number} · {delivery.final_status}
                            </p>
                            <span className="text-xs font-mono text-[#97a3b6]">
                              {delivery.http_status ?? t.timeout}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-mono text-[#97a3b6]">
                            {t.deliveryId} {delivery.delivery_id}
                          </p>
                          {delivery.error_message && (
                            <p className="mt-1 text-xs font-mono text-amber-400">{delivery.error_message}</p>
                          )}
                          {delivery.response_snippet && (
                            <p className="mt-1 text-xs font-mono text-[#97a3b6] break-all">
                              {t.response} {delivery.response_snippet}
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
  const { language } = useLanguage()
  const t = transactionsCopy[language]

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TxStatus | "All">("All")
  const [maskFilter, setMaskFilter] = useState<"All" | "Masked" | "Unmasked">("All")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showMockChargeModal, setShowMockChargeModal] = useState(false)
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

  const refreshTransactions = useCallback(async () => {
    await globalMutate((key) => typeof key === "string" && key.startsWith("/api/merchant/logs"))
  }, [])



  return (
    <DashboardShell data-ui-version="transactions-boron-v1">
      <main className="w-full px-6 md:px-8 py-8 space-y-6" data-ui-version="transactions-i18n-vi-phase3">
        <DashboardPageHeader
  title={t.title}
  description={t.description}
  eyebrow={t.eyebrow}
  action={
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowMockChargeModal(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#151821] bg-[#FFD600] border border-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors"
      >
        <FlaskConical className="w-4 h-4" />
        {t.testMockCharge}
      </button>
      <button
        onClick={handleExportCsv}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[#e7edf8] bg-[#2a2d39] border border-[#343947] rounded-md hover:bg-[#343947] transition-colors"
      >
        <Download className="w-4 h-4" />
        {t.exportCsv}
      </button>
    </div>
  }
/>



        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: t.volumePage, value: fmt(totalVolume), sub: `${transactions.length} ${t.ofTransactions} ${totalCount} ${t.transactionsLabel}`, color: "border-[#FFD600]/20", accent: "text-[#FFD600]" },
            { label: t.platformFees, value: fmt(totalFees), sub: `2.5% ${t.commission}`, color: "border-emerald-400/20", accent: "text-emerald-400" },
            { label: t.completed, value: completedCount.toString(), sub: `${((completedCount / Math.max(transactions.length, 1)) * 100).toFixed(1)}% ${t.successRate}`, color: "border-[#343947]", accent: "text-[#e7edf8]" },
            { label: t.itemMaskingActive, value: maskedCount.toString(), sub: `${((maskedCount / Math.max(transactions.length, 1)) * 100).toFixed(0)}% ${t.ofPage}`, color: "border-violet-400/20", accent: "text-violet-400" },
          ].map((item) => (
            <div key={item.label} className={`bg-[#151821] border ${item.color} rounded-lg p-4 relative overflow-hidden`} data-ui-version="grid-background-v1">
              <GridBackground />
              <p className="relative z-10 text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{item.label}</p>
              <p className={`relative z-10 text-xl font-mono font-bold mt-1 ${item.accent}`}>{item.value}</p>
              <p className="relative z-10 text-sm font-mono text-[#97a3b6] mt-1">{item.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#151821] border border-[#343947] rounded-lg overflow-hidden relative" data-ui-version="grid-background-v1">
          <GridBackground />
          <div className="relative z-10 p-4 border-b border-[#343947] space-y-3 bg-[#1f222c]/80 backdrop-blur-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 flex items-center gap-2 bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2">
                <Search className="w-3.5 h-3.5 text-[#97a3b6]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="flex-1 bg-transparent text-sm text-[#e7edf8] placeholder:text-[#97a3b6] focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-[#97a3b6] hover:text-[#e7edf8]">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {(["All", ...ALL_STATUSES] as const).map((status) => {
                    const active = statusFilter === status
                    const cfg = status === "All" ? null : getStatusCfg(t)[status]
                    return (
                      <button
                        key={status}
                        onClick={() => { setStatusFilter(status); setPage(1) }}
                        className={`px-2.5 py-1 text-sm font-mono rounded-md border transition-colors ${
                          active
                            ? cfg ? `${cfg.bg} ${cfg.text} border-transparent` : "bg-[#2a2d39] text-[#e7edf8] border-[#343947]"
                            : "bg-transparent text-[#97a3b6] border-[#343947] hover:text-[#e7edf8]"
                        }`}
                      >
                        {status === "All" ? t.all : cfg?.label}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setShowFilters((value) => !value)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border rounded-md transition-colors ${
                    showFilters ? "bg-[#2a2d39] text-[#e7edf8] border-[#343947]" : "text-[#97a3b6] border-[#343947] hover:text-[#e7edf8]"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {t.filters}
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-[#343947] overflow-hidden">
                  <div className="flex">
                    {(["All", "Masked", "Unmasked"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => { setMaskFilter(value); setPage(1) }}
                        className={`flex-1 px-3 py-1.5 text-sm font-mono transition-colors ${
                          maskFilter === value ? "bg-violet-400/10 text-violet-400" : "text-[#97a3b6] hover:text-[#e7edf8]"
                        }`}
                      >
                        {value === "All" ? t.all : value === "Masked" ? t.masked : t.unmasked}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.from}</p>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-xs text-[#e7edf8] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{t.to}</p>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-xs text-[#e7edf8] focus:outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => { setMaskFilter("All"); setDateFrom(""); setDateTo(""); setPage(1) }}
                    className="px-3 py-1.5 text-xs font-mono text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors"
                  >
                    {t.clearFilters}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative z-10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#2a2d39]/30 border-b border-[#343947]">
                <tr className="text-xs uppercase tracking-[0.22em] text-[#97a3b6]">
                  <th className="px-4 py-3 font-medium">{t.thDate}</th>
                  <th className="px-4 py-3 font-medium">{t.thOrderId}</th>
                  <th className="px-4 py-3 font-medium">{t.thStore}</th>
                  <th className="px-4 py-3 font-medium">{t.thOriginalProduct}</th>
                  <th className="px-4 py-3 font-medium">{t.thMaskedProduct}</th>
                  <th className="px-4 py-3 font-medium">{t.thAccount}</th>
                  <th className="px-4 py-3 font-medium">{t.thAmount}</th>
                  <th className="px-4 py-3 font-medium">{t.thPaymentMethod}</th>
                  <th className="px-4 py-3 font-medium">{t.thStatus}</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => <SkeletonRow key={index} />)
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-red-400">
                      {t.failedToLoadTx}
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="flex flex-col items-center justify-center py-16 text-[#97a3b6]">
                        <ArrowRightLeft className="w-8 h-8 mb-3 opacity-30" />
                        <p className="text-sm font-mono">{t.noTxMatch}</p>
                        <button
                          onClick={() => { setSearch(""); setStatusFilter("All"); setMaskFilter("All"); setDateFrom(""); setDateTo("") }}
                          className="mt-3 text-xs font-mono text-[#FFD600] hover:text-[#e6c100] transition-colors"
                        >
                          {t.clearAllFilters}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const cfg = getStatusCfg(t)[tx.status]
                    const isSelected = selectedTx?.id === tx.id
                    return (
                      <Fragment key={tx.id}>
                        <tr
                          onClick={() => setSelectedTx(tx)}
                          className={`border-b border-[#343947]/40 cursor-pointer transition-colors hover:bg-[#2a2d39]/20 ${isSelected ? "bg-[#FFD600]/5 border-l-2 border-l-cyan-400" : ""}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div>
                              <p className="text-[#e7edf8]">{tx.date}</p>
                              <p className="text-[#97a3b6] text-xs">{tx.time} UTC</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#FFD600]">{tx.orderId}</span>
                              <CopyButton text={tx.orderId} />
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-3 h-3 text-[#97a3b6] shrink-0" />
                              <span className="text-[#e7edf8]">{tx.storeName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <span className="text-[#e7edf8] truncate block" title={tx.originalProduct}>{tx.originalProduct}</span>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            {tx.masked ? (
                              <div className="flex items-center gap-1.5">
                                <Package className="w-3 h-3 text-violet-400 shrink-0" />
                                <span className="text-violet-400 truncate" title={tx.maskedProduct}>{tx.maskedProduct}</span>
                              </div>
                            ) : (
                              <span className="text-[#97a3b6] text-xs">— {t.notMasked}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-[#e7edf8]">{tx.paypalAccount}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-[#e7edf8] font-semibold">{fmt(tx.amount)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-[#e7edf8]">
                              <CreditCard className={`w-3 h-3 shrink-0 ${tx.isCardPayment ? "text-[#FFD600]" : "text-[#97a3b6]"}`} />
                              <span>{tx.paymentMethodLabel}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#343947]">
              <p className="text-xs font-mono text-[#97a3b6]">
                {t.page} {page} {t.of} {totalPages} {isValidating ? `· ${t.refreshing}` : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-mono border border-[#343947] text-[#97a3b6] hover:text-[#e7edf8] disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  {t.prev}
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
                        targetPage === page ? "bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/30" : "border-[#343947] text-[#97a3b6] hover:text-[#e7edf8]"
                      }`}
                    >
                      {targetPage}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-mono border border-[#343947] text-[#97a3b6] hover:text-[#e7edf8] disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  {t.next}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {selectedTx && <TxDetailPanel tx={selectedTx} onClose={() => setSelectedTx(null)} />}
      <MockChargeModal
        open={showMockChargeModal}
        onClose={() => setShowMockChargeModal(false)}
        onSuccess={refreshTransactions}
      />
    </DashboardShell>
  )
}
