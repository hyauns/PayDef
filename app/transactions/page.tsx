
"use client"

import { useState, useMemo, Fragment } from "react"
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
} from "lucide-react"
import { DashboardHeader } from "@/components/nav/top-bar"

// ─── Types ───────────────────────────────────────────────────────────────────

type TxStatus = "Completed" | "Pending" | "Failed" | "Refunded" | "Disputed"

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

// ─── Seed data ───────────────────────────────────────────────────────────────

const STORES = ["Tire Shop Pro", "AutoParts Direct", "Moto Gear Hub", "Wheel World", "DriveSync"]
const SHIELD_DOMAINS = ["chococlose.com", "safepay-hub.io", "payshield-cdn.com", "relay-secure.org", "checkout-proxy.com"]
const PP_ACCOUNTS = ["PP-Main-01", "PP-Relay-02", "PP-Node-03", "PP-Alt-05", "PP-Overflow-06"]

const REAL_PRODUCTS = [
  "265/70R17 All-Season Tire",
  "Brake Pad Set - Front Axle",
  "Oil Filter Premium",
  "LED Headlight Conversion Kit",
  "Serpentine Belt 6-Rib",
  "Shock Absorber Pair",
  "Cabin Air Filter",
  "Wiper Blade Set 24/20",
  "Coolant Flush Kit",
  "Wheel Hub Assembly",
]

const MASKED_PRODUCTS = [
  "Digital Service Upgrade",
  "Premium Content License",
  "Software Activation Key",
  "Consulting Service Package",
  "Online Course Access",
  "API Credits Bundle",
  "Cloud Storage Subscription",
  "Design Asset Pack",
  "Professional Toolkit",
  "Platform Membership",
]

const COUNTRIES = ["US", "CA", "GB", "AU", "DE", "FR", "NL", "SG"]

function seededRand(seed: number) {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function genTxId(seed: number): string {
  const hex = "0123456789abcdef"
  return "txn_" + Array.from({ length: 16 }, (_, i) => hex[Math.floor(seededRand(seed * 17 + i) * 16)]).join("")
}

function genOrderId(seed: number): string {
  const r = (n: number) => Math.floor(seededRand(seed + n) * 10)
  return `ORD-${r(1)}${r(2)}${r(3)}${r(4)}-${r(5)}${r(6)}${r(7)}${r(8)}`
}

function genPaypalTxId(seed: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  return Array.from({ length: 17 }, (_, i) => chars[Math.floor(seededRand(seed * 31 + i) * chars.length)]).join("")
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seededRand(seed) * arr.length)]
}

function buildTransactions(): Transaction[] {
  const now = new Date(2026, 3, 3) // April 3 2026
  return Array.from({ length: 80 }, (_, i) => {
    const seed = i * 97 + 13
    const minsAgo = Math.floor(seededRand(seed) * 72 * 60)
    const date = new Date(now.getTime() - minsAgo * 60 * 1000)
    const store = pick(STORES, seed + 1)
    const shield = pick(SHIELD_DOMAINS, seed + 2)
    const pp = pick(PP_ACCOUNTS, seed + 3)
    const realIdx = Math.floor(seededRand(seed + 4) * REAL_PRODUCTS.length)
    const maskedIdx = Math.floor(seededRand(seed + 5) * MASKED_PRODUCTS.length)
    const amount = parseFloat((seededRand(seed + 6) * 490 + 10).toFixed(2))
    const masked = seededRand(seed + 9) > 0.15
    const statuses: TxStatus[] = ["Completed", "Completed", "Completed", "Completed", "Pending", "Failed", "Refunded", "Disputed"]
    const status = pick(statuses, seed + 10)
    const storeSlug = store.toLowerCase().replace(/\s+/g, "")
    return {
      id: `tx-${i}`,
      orderId: genOrderId(seed + 7),
      date: date.toISOString().slice(0, 10),
      time: date.toTimeString().slice(0, 5),
      storeName: store,
      storeId: `store-${Math.floor(seededRand(seed + 11) * 1000).toString().padStart(4, "0")}`,
      paypalAccount: pp,
      shieldDomain: shield,
      referrerUrl: `https://${shield}/ref/${storeSlug}/${genOrderId(seed + 12).toLowerCase()}`,
      originalProduct: REAL_PRODUCTS[realIdx],
      maskedProduct: masked ? MASKED_PRODUCTS[maskedIdx] : REAL_PRODUCTS[realIdx],
      amount,
      fee: parseFloat((amount * 0.025).toFixed(2)),
      status,
      customerEmail: `buyer${Math.floor(seededRand(seed + 8) * 9000 + 1000)}@example.com`,
      paypalTxId: genPaypalTxId(seed + 13),
      ipCountry: pick(COUNTRIES, seed + 14),
      masked,
    }
  }).sort((a, b) => (a.date + a.time > b.date + b.time ? -1 : 1))
}

const ALL_TRANSACTIONS = buildTransactions()

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TxStatus, { label: string; bg: string; text: string; dot: string }> = {
  Completed: { label: "Completed", bg: "bg-emerald-400/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Pending:   { label: "Pending",   bg: "bg-amber-400/10",   text: "text-amber-400",   dot: "bg-amber-400" },
  Failed:    { label: "Failed",    bg: "bg-red-400/10",     text: "text-red-400",     dot: "bg-red-400" },
  Refunded:  { label: "Refunded",  bg: "bg-blue-400/10",    text: "text-blue-400",    dot: "bg-blue-400" },
  Disputed:  { label: "Disputed",  bg: "bg-orange-400/10",  text: "text-orange-400",  dot: "bg-orange-400" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
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

          {/* Shield Domain Proof — highlighted section */}
          <div className="border border-cyan-400/30 rounded-lg p-4 bg-cyan-400/5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <p className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider">Store-Hiding Proof</p>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
              This transaction was routed through the shield domain below. PayPal saw only the shield domain as the referrer — your actual store URL was never exposed.
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Shield Domain</p>
                <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border border-border">
                  <span className="font-mono text-sm text-cyan-400 flex-1">{tx.shieldDomain}</span>
                  <CopyButton text={tx.shieldDomain} />
                  <a href={`https://${tx.shieldDomain}`} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-cyan-400 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Referrer URL (seen by PayPal)</p>
                <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border border-border">
                  <span className="font-mono text-xs text-cyan-400/80 flex-1 break-all">{tx.referrerUrl}</span>
                  <CopyButton text={tx.referrerUrl} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-md px-3 py-2">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Store identity successfully hidden from PayPal
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
                { label: "IP Country", value: tx.ipCountry, color: "text-foreground" },
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

const ALL_STATUSES: TxStatus[] = ["Completed", "Pending", "Failed", "Refunded", "Disputed"]

export default function TransactionsPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TxStatus | "All">("All")
  const [storeFilter, setStoreFilter] = useState<string>("All")
  const [maskFilter, setMaskFilter] = useState<"All" | "Masked" | "Unmasked">("All")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  const filtered = useMemo(() => {
    return ALL_TRANSACTIONS.filter((tx) => {
      if (statusFilter !== "All" && tx.status !== statusFilter) return false
      if (storeFilter !== "All" && tx.storeName !== storeFilter) return false
      if (maskFilter === "Masked" && !tx.masked) return false
      if (maskFilter === "Unmasked" && tx.masked) return false
      if (dateFrom && tx.date < dateFrom) return false
      if (dateTo && tx.date > dateTo) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          tx.orderId.toLowerCase().includes(q) ||
          tx.storeName.toLowerCase().includes(q) ||
          tx.originalProduct.toLowerCase().includes(q) ||
          tx.maskedProduct.toLowerCase().includes(q) ||
          tx.paypalAccount.toLowerCase().includes(q) ||
          tx.shieldDomain.toLowerCase().includes(q) ||
          tx.paypalTxId.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [search, statusFilter, storeFilter, maskFilter, dateFrom, dateTo])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const totalVolume = filtered.reduce((s, t) => s + t.amount, 0)
  const totalFees = filtered.reduce((s, t) => s + t.fee, 0)
  const completedCount = filtered.filter((t) => t.status === "Completed").length
  const maskedCount = filtered.filter((t) => t.masked).length

  const handleRowClick = (tx: Transaction) => {
    setSelectedTx(tx)
    setExpandedId(null)
  }

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* Page title + actions */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-foreground">Transaction Log</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Full audit trail of all gateway-routed payments</p>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Volume (Filtered)", value: fmt(totalVolume), sub: `${filtered.length} transactions`, color: "border-cyan-400/20", accent: "text-cyan-400" },
            { label: "Platform Fees", value: fmt(totalFees), sub: "2.5% commission", color: "border-emerald-400/20", accent: "text-emerald-400" },
            { label: "Completed", value: completedCount.toString(), sub: `${((completedCount / Math.max(filtered.length, 1)) * 100).toFixed(1)}% success rate`, color: "border-border", accent: "text-foreground" },
            { label: "Item Masking Active", value: maskedCount.toString(), sub: `${((maskedCount / Math.max(filtered.length, 1)) * 100).toFixed(0)}% of filtered`, color: "border-violet-400/20", accent: "text-violet-400" },
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
              {/* Store filter */}
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Store</p>
                <select
                  value={storeFilter}
                  onChange={(e) => { setStoreFilter(e.target.value); setPage(1) }}
                  className="bg-background border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 appearance-none pr-7 min-w-[160px]"
                >
                  <option value="All">All Stores</option>
                  {STORES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

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
                  onClick={() => { setStoreFilter("All"); setMaskFilter("All"); setDateFrom(""); setDateTo(""); setPage(1) }}
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
              Showing <span className="text-foreground">{paginated.length}</span> of{" "}
              <span className="text-foreground">{filtered.length}</span> transactions
            </p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-mono text-emerald-400">{fmt(totalVolume)} total</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {["Date / Time", "Order ID", "Store", "Original Product", "Masked Product", "PayPal Account", "Shield Domain", "Amount", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((tx) => {
                  const cfg = STATUS_CFG[tx.status]
                  const isSelected = selectedTx?.id === tx.id
                  return (
                    <Fragment key={tx.id}>
                      <tr
                        onClick={() => handleRowClick(tx)}
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

                        {/* Shield Domain */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="text-cyan-400">{tx.shieldDomain}</span>
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-foreground font-semibold">{fmt(tx.amount)}</span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ArrowRightLeft className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm font-mono">No transactions match your filters</p>
                <button
                  onClick={() => { setSearch(""); setStatusFilter("All"); setStoreFilter("All"); setMaskFilter("All"); setDateFrom(""); setDateTo("") }}
                  className="mt-3 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )}
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
