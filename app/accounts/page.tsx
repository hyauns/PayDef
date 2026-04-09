// Cache invalidation: 2026-04-04
"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Plus,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Star,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
  X,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock,
  SlidersHorizontal,
  Globe,
  Package,
  Link2,
  Lock,
  Wifi,
  Info,
  Ban,
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "Active" | "Limited" | "Warm-up" | "Paused" | "Suspended"
type DomainType = "platform" | "custom"

interface Merchant {
  id: string
  accountName: string
  email: string
  clientId: string
  clientSecret: string
  proxyUrl: string
  shieldDomain: string
  domainType: DomainType
  status: Status
  priority: number // 1–5
  currentVolume: number
  softLimit: number  // lower bound of adaptive range
  hardLimit: number  // upper bound of adaptive range
  itemMasking: boolean
  fakeProductName: string
  txCount: number
  createdAt: string
  lastActive: string
  successRate: number
}

interface MerchantApiRow {
  id: string
  name: string
  email?: string | null
  clientId: string
  proxyUrl?: string | null
  shieldDomain?: string | null
  status: string
  isLimited?: boolean | null
  priority?: number | null
  currentVolume?: number | null
  softLimit?: number | null
  dailyLimit?: number | null
  itemMasking?: boolean | null
  fakeProductName?: string | null
  transactionCount?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  successRate?: number | null
}

interface ShieldDomainApiRow {
  id: string
  domain: string
  isActive: boolean
  vercel?: {
    bridgeOk?: boolean | null
  } | null
}

// ─── Platform shield domains provided by Gateway Central ─────────────────────
const FAKE_PRODUCT_PRESETS = [
  "Digital Service Upgrade",
  "Premium Content License",
  "Software Activation Key",
  "Consulting Service Package",
  "Online Course Access",
  "API Credits Bundle",
  "Cloud Storage Subscription",
  "Design Asset Pack",
]

// (Seed data removed — fetched from API)

// ─── Status config ─────────────────────────────────────────────────────────

const statusConfig: Record<Status, { dot: string; text: string; bg: string; border: string; icon: React.ReactNode }> = {
  Active: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    icon: <ShieldCheck className="w-3 h-3" />,
  },
  Limited: {
    dot: "bg-amber-400",
    text: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  "Warm-up": {
    dot: "bg-sky-400",
    text: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/20",
    icon: <Clock className="w-3 h-3" />,
  },
  Paused: {
    dot: "bg-zinc-500",
    text: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/20",
    icon: <Pause className="w-3 h-3" />,
  },
  Suspended: {
    dot: "bg-red-500",
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    icon: <Ban className="w-3 h-3" />,
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const cfg = statusConfig[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === "Active" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  )
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed"
}

function isVerifiedPlatformDomain(domain: ShieldDomainApiRow): boolean {
  return domain.isActive && domain.vercel?.bridgeOk === true
}

function PriorityStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i < value ? "text-cyan-400 fill-cyan-400" : "text-border"}`}
        />
      ))}
      <span className="ml-1.5 text-xs font-mono text-muted-foreground">{value}/5</span>
    </div>
  )
}

function ItemMaskingBadge({ enabled, productName }: { enabled: boolean; productName: string }) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
        <Package className="w-3 h-3" />
        Off
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border bg-violet-400/10 text-violet-400 border-violet-400/20 max-w-[160px] truncate" title={productName}>
      <Package className="w-3 h-3 shrink-0" />
      <span className="truncate">{productName}</span>
    </span>
  )
}

function VolumeBar({ current, soft, hard }: { current: number; soft: number; hard: number }) {
  const pct = Math.min((current / hard) * 100, 100)
  const softPct = Math.min((soft / hard) * 100, 100)
  const color =
    pct > 90 ? "bg-red-500" :
    pct > 70 ? "bg-amber-400" :
    "bg-cyan-400"

  return (
    <div className="space-y-1.5 min-w-[200px]">
      <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
        {/* soft limit marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-amber-400/60 z-10"
          style={{ left: `${softPct}%` }}
        />
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="font-mono text-[11px] text-foreground">
          ${current.toLocaleString()}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          ${soft.toLocaleString()}–${hard.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

function MaskedField({ value, label }: { value: string; label: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const masked = value.slice(0, 6) + "•".repeat(20) + value.slice(-4)
  const display = revealed ? value : masked

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [value])

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
        <code className="flex-1 font-mono text-[11px] text-foreground truncate max-w-[260px]">
          {display}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setRevealed((v) => !v)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Slide-over panel ─────────────────────────────────────────────────────────

interface SlideOverProps {
  merchant: Merchant | null
  verifiedPlatformDomains: string[]
  onClose: () => void
  onSave: (updated: Merchant) => void
}

function SlideOver({ merchant, verifiedPlatformDomains, onClose, onSave }: SlideOverProps) {
  const [draft, setDraft] = useState<Merchant | null>(merchant)
  const fallbackPlatformDomain = verifiedPlatformDomains[0] ?? ""

  // sync when a new merchant is opened
  if (draft?.id !== merchant?.id && merchant !== null) {
    setDraft(merchant)
  }

  if (!merchant || !draft) return null

  const update = (patch: Partial<Merchant>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const handleSave = () => {
    if (!draft) return
    const nextDraft =
      draft.domainType === "platform" && !verifiedPlatformDomains.includes(draft.shieldDomain)
        ? { ...draft, shieldDomain: fallbackPlatformDomain }
        : draft
    if (nextDraft.domainType === "platform" && !nextDraft.shieldDomain) {
      return
    }
    onSave(nextDraft)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[520px] bg-card border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-mono text-muted-foreground">Editing</p>
              <h2 className="text-sm font-semibold font-mono text-foreground">{draft.accountName}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Transactions", value: draft.txCount.toString() },
              { label: "Success Rate", value: `${draft.successRate}%` },
              { label: "Last Active", value: draft.lastActive },
            ].map((s) => (
              <div key={s.label} className="bg-background border border-border rounded-md px-3 py-2.5 text-center">
                <p className="font-mono text-sm font-semibold text-foreground">{s.value}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Account Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Account Name
            </label>
            <input
              value={draft.accountName}
              onChange={(e) => update({ accountName: e.target.value })}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            />
          </div>

          {/* PayPal Email */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              PayPal Email
            </label>
            <input
              value={draft.email}
              onChange={(e) => update({ email: e.target.value })}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            />
          </div>

          {/* Shield Domain */}
          <div className="space-y-3 border border-border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <p className="text-xs font-mono font-semibold text-foreground">Shield Domain</p>
            </div>
            {/* Domain type toggle */}
            <div className="flex rounded-md overflow-hidden border border-border">
              {(["platform", "custom"] as DomainType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ domainType: t, shieldDomain: t === "platform" ? fallbackPlatformDomain : "" })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-mono transition-colors ${
                    draft.domainType === t
                      ? "bg-cyan-400/10 text-cyan-400 border-r border-border"
                      : "text-muted-foreground hover:text-foreground bg-transparent"
                  }`}
                >
                  {t === "platform" ? <Lock className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {t === "platform" ? "Platform Domain" : "Custom Domain"}
                </button>
              ))}
            </div>
            {draft.domainType === "platform" ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Select Platform Domain
                </label>
                <select
                  value={verifiedPlatformDomains.includes(draft.shieldDomain) ? draft.shieldDomain : ""}
                  onChange={(e) => update({ shieldDomain: e.target.value })}
                  disabled={!verifiedPlatformDomains.length}
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors appearance-none"
                >
                  <option value="" disabled>
                    {verifiedPlatformDomains.length ? "Select a verified platform domain" : "No verified platform domains available"}
                  </option>
                  {verifiedPlatformDomains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <p className="text-[10px] font-mono text-muted-foreground">Managed and monitored by Gateway Central</p>
                {!verifiedPlatformDomains.length && (
                  <p className="text-[10px] font-mono text-amber-400">Verify a domain in Domains before assigning it to an account.</p>
                )}
                {!!draft.shieldDomain && !verifiedPlatformDomains.includes(draft.shieldDomain) && verifiedPlatformDomains.length > 0 && (
                  <p className="text-[10px] font-mono text-amber-400">The current platform domain is no longer verified. Select another verified domain before saving.</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Custom Domain
                </label>
                <input
                  value={draft.shieldDomain}
                  onChange={(e) => update({ shieldDomain: e.target.value })}
                  placeholder="e.g. my-payment-shield.com"
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                />
                <p className="text-[10px] font-mono text-amber-400">You are responsible for DNS configuration and SSL</p>
              </div>
            )}
            {draft.shieldDomain && (
              <a
                href={`https://${draft.shieldDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {draft.shieldDomain}
              </a>
            )}
          </div>

          {/* PayPal Credentials */}
          <div className="space-y-3 border border-border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <p className="text-xs font-mono font-semibold text-foreground">PayPal API Credentials</p>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground">
              Enter your PayPal REST API Client ID and Secret from the PayPal Developer Dashboard.
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Client ID</label>
              <div className="flex gap-2">
                <input
                  value={draft.clientId}
                  onChange={(e) => update({ clientId: e.target.value })}
                  placeholder="AeBFXkz..."
                  className="flex-1 bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Client Secret</label>
              <MaskedField value={draft.clientSecret} label="" />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              Credentials are encrypted at rest with AES-256 and never logged
            </div>
          </div>

          {/* Proxy URL */}
          <div className="space-y-3 border border-border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5 text-orange-400" />
              <p className="text-xs font-mono font-semibold text-foreground">Proxy Configuration</p>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground">
              Route PayPal API calls through a proxy to diversify IP origins. Supports HTTP, HTTPS, and SOCKS5 protocols.
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Proxy URL</label>
              {draft.proxyUrl ? (
                <MaskedField value={draft.proxyUrl} label="" />
              ) : (
                <input
                  value={draft.proxyUrl}
                  onChange={(e) => update({ proxyUrl: e.target.value })}
                  placeholder="http://user:pass@proxy.example.com:8080"
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-orange-400/40 focus:border-orange-400/40 transition-colors"
                />
              )}
              {draft.proxyUrl && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => update({ proxyUrl: "" })}
                    className="text-[11px] font-mono text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove Proxy
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              Proxy URL may contain credentials — it is masked in the UI and never logged
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(["Active", "Warm-up", "Limited", "Paused", "Suspended"] as Status[]).map((s) => {
                const c = statusConfig[s]
                const active = draft.status === s
                return (
                  <button
                    key={s}
                    onClick={() => update({ status: s })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-mono transition-colors ${
                      active
                        ? `${c.bg} ${c.text} ${c.border}`
                        : "bg-background border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? c.dot : "bg-border"}`} />
                    {s}
                  </button>
                )
              })}
            </div>
            {/* Warm-up Info Tooltip */}
            {draft.status === "Warm-up" && (
              <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-md bg-sky-400/5 border border-sky-400/20">
                <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-[11px] font-mono text-sky-300/80 leading-relaxed">
                  <p className="font-semibold text-sky-400 mb-1">Warm-up Mode Active</p>
                  <p>• Max <span className="text-sky-400">$50</span> per transaction to build account trust</p>
                  <p>• Progressive daily cap: <span className="text-sky-400">$100</span> (Day 1) → <span className="text-sky-400">$500</span> (Day 7+)</p>
                  <p>• Account is deprioritised for orders over $100</p>
                </div>
              </div>
            )}
            {draft.status === "Suspended" && (
              <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-md bg-red-500/5 border border-red-500/20">
                <Ban className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[11px] font-mono text-red-300/80">
                  Suspended accounts are excluded from the rotation pool entirely.
                  No transactions will be routed to this account.
                </p>
              </div>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Rotation Priority — {draft.priority}/5
            </label>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => update({ priority: i + 1 })}
                  className="p-1 transition-colors rounded"
                >
                  <Star
                    className={`w-5 h-5 transition-colors ${
                      i < draft.priority
                        ? "text-cyan-400 fill-cyan-400"
                        : "text-border hover:text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Adaptive Limits */}
          <div className="space-y-4 border border-border rounded-lg p-4 bg-background">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <p className="text-xs font-mono font-semibold text-foreground">Adaptive Volume Limits</p>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground">
              Instead of a hard cutoff, the rotator shifts away from this account when it nears the soft limit,
              and locks it out at the hard limit.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Soft Limit ($)
                </label>
                <input
                  type="number"
                  value={draft.softLimit}
                  onChange={(e) => update({ softLimit: Number(e.target.value) })}
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/40 focus:border-amber-400/40 transition-colors"
                />
                <p className="text-[10px] font-mono text-muted-foreground">Begin de-weighting</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Hard Limit ($)
                </label>
                <input
                  type="number"
                  value={draft.hardLimit}
                  onChange={(e) => update({ hardLimit: Number(e.target.value) })}
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-red-400 focus:outline-none focus:ring-1 focus:ring-red-400/40 focus:border-red-400/40 transition-colors"
                />
                <p className="text-[10px] font-mono text-muted-foreground">Full lockout threshold</p>
              </div>
            </div>

            {/* Live preview bar */}
            <div className="space-y-1.5">
              <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 rounded-full"
                  style={{ left: `${Math.min((draft.softLimit / draft.hardLimit) * 100, 100)}%` }}
                />
                <div
                  className="h-full bg-cyan-400/70 rounded-full transition-all"
                  style={{ width: `${Math.min((draft.currentVolume / draft.hardLimit) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                <span>$0</span>
                <span className="text-amber-400">${draft.softLimit.toLocaleString()} soft</span>
                <span className="text-red-400">${draft.hardLimit.toLocaleString()} hard</span>
              </div>
            </div>
          </div>

          {/* Item Masking */}
          <div className="space-y-4 border border-border rounded-lg p-4 bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-violet-400" />
                <p className="text-xs font-mono font-semibold text-foreground">Item Masking</p>
              </div>
              {/* Toggle switch */}
              <button
                onClick={() => update({ itemMasking: !draft.itemMasking })}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  draft.itemMasking ? "bg-violet-500" : "bg-secondary border border-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground shadow transition-all ${
                    draft.itemMasking ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] font-mono text-muted-foreground">
              When enabled, PayPal receipts and checkout pages will show a generic product name
              instead of your actual item description, reducing payment disputes.
            </p>

            {draft.itemMasking && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Fake Product Name
                  </label>
                  <input
                    value={draft.fakeProductName}
                    onChange={(e) => update({ fakeProductName: e.target.value })}
                    placeholder="e.g. Digital Service Upgrade"
                    className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-violet-400 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-400/40 focus:border-violet-400/40 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Presets</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FAKE_PRODUCT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => update({ fakeProductName: preset })}
                        className={`text-[11px] font-mono px-2 py-1 rounded-md border transition-colors ${
                          draft.fakeProductName === preset
                            ? "bg-violet-400/10 text-violet-400 border-violet-400/30"
                            : "bg-secondary text-muted-foreground border-border hover:text-foreground hover:border-border/80"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-md px-3 py-2 text-[11px] font-mono text-muted-foreground">
                  <span className="text-muted-foreground">PayPal receipt will show: </span>
                  <span className="text-violet-400 font-semibold">{draft.fakeProductName || "(empty)"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="border border-red-500/20 rounded-lg p-4 space-y-2 bg-red-500/5">
            <p className="text-[10px] font-mono text-red-400 uppercase tracking-wider font-semibold">Danger Zone</p>
            <p className="text-[11px] font-mono text-muted-foreground">
              Permanently removes this account from the rotator. All routing will stop immediately.
            </p>
            <button className="flex items-center gap-2 text-xs font-mono text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-md px-3 py-1.5 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              Remove Account
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border shrink-0 gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-xs font-mono text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={draft.domainType === "platform" && !fallbackPlatformDomain}
            className="flex-1 px-4 py-2 text-xs font-mono text-background bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Add Merchant Modal ───────────────────��───────────────────────────────────

function AddMerchantModal({
  verifiedPlatformDomains,
  onClose,
  onAdd,
}: {
  verifiedPlatformDomains: string[]
  onClose: () => void
  onAdd: (m: Merchant) => void
}) {
  const fallbackPlatformDomain = verifiedPlatformDomains[0] ?? ""
  const [form, setForm] = useState({
    accountName: "",
    email: "",
    clientId: "",
    clientSecret: "",
    proxyUrl: "",
    status: "Warm-up" as Status,
    domainType: (fallbackPlatformDomain ? "platform" : "custom") as DomainType,
    shieldDomain: fallbackPlatformDomain,
    softLimit: 4000,
    hardLimit: 5000,
    itemMasking: false,
    fakeProductName: "Digital Service Upgrade",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState("")
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const update = (patch: Partial<typeof form>) => {
    setForm((p) => ({ ...p, ...patch }))
    // Reset test result if credentials change
    if ("clientId" in patch || "clientSecret" in patch) setTestResult(null)
  }

  const handleTestPaypal = async () => {
    if (!form.clientId || !form.clientSecret) {
      setTestResult({ ok: false, message: "Enter Client ID and Secret to test" })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch("/api/merchant/test-paypal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: form.clientId, clientSecret: form.clientSecret }),
      })
      const data = await res.json() as { ok: boolean; message?: string; error?: string; latencyMs?: number; env?: string }
      if (data.ok) {
        setTestResult({ ok: true, message: data.message ?? `Connected to PayPal ${data.env ?? "sandbox"} in ${data.latencyMs}ms` })
      } else {
        setTestResult({ ok: false, message: data.error ?? "Connection failed" })
      }
    } catch {
      setTestResult({ ok: false, message: "Network error — check your connection" })
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    if (
      form.domainType === "platform" &&
      (!form.shieldDomain || !verifiedPlatformDomains.includes(form.shieldDomain)) &&
      fallbackPlatformDomain
    ) {
      setForm((prev) => ({ ...prev, shieldDomain: fallbackPlatformDomain }))
    }
  }, [fallbackPlatformDomain, form.domainType, form.shieldDomain, verifiedPlatformDomains])

  const handleAdd = async () => {
    if (!form.accountName || !form.email) return
    setSaving(true)
    setError("")

    try {
      // Map UI status to DB enum
      const statusMap: Record<string, string> = {
        "Active": "ACTIVE",
        "Warm-up": "WARMING_UP",
      }

      const res = await fetch("/api/merchant/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.accountName,
          email: form.email,
          clientId: form.clientId,
          clientSecret: form.clientSecret,
          proxyUrl: form.proxyUrl || undefined,
          shieldDomain: form.shieldDomain || undefined,
          status: statusMap[form.status] || "WARMING_UP",
          softLimit: form.softLimit,
          hardLimit: form.hardLimit,
          priority: 1,
          itemMasking: form.itemMasking,
          fakeProductName: form.fakeProductName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create account")

      const acct = data.account
      const newMerchant: Merchant = {
        id: acct.id,
        accountName: acct.name,
        email: acct.email,
        clientId: acct.clientId,
        clientSecret: "(encrypted)",
        proxyUrl: acct.proxyUrl ?? "",
        shieldDomain: acct.shieldDomain ?? form.shieldDomain ?? "",
        domainType: verifiedPlatformDomains.includes(acct.shieldDomain ?? "") ? "platform" : "custom",
        status: form.status,
        priority: acct.priority ?? 1,
        currentVolume: 0,
        softLimit: acct.softLimit ?? form.softLimit,
        hardLimit: acct.dailyLimit ?? form.hardLimit,
        itemMasking: acct.itemMasking ?? false,
        fakeProductName: acct.fakeProductName ?? "Digital Service Upgrade",
        txCount: 0,
        createdAt: new Date(acct.createdAt).toISOString().slice(0, 10),
        lastActive: "never",
        successRate: 0,
      }
      onAdd(newMerchant)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <h3 className="text-sm font-semibold font-mono text-foreground">Add Merchant Account</h3>
            <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Basic info — standard fields */}
            {[
              { label: "Account Name", key: "accountName", placeholder: "PP-Main-01" },
              { label: "PayPal Email",  key: "email",       placeholder: "payments@store.com" },
            ].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{f.label}</label>
                <input
                  value={String(form[f.key as keyof typeof form])}
                  onChange={(e) => update({ [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                />
              </div>
            ))}

            {/* PayPal API Credentials + Test Connection */}
            <div className="space-y-3 border border-border rounded-lg p-4 bg-background">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <p className="text-xs font-mono font-semibold text-foreground">PayPal API Credentials</p>
              </div>
              {[
                { label: "Client ID",     key: "clientId",     placeholder: "AeBFXkzLmNoPQrStUvWxYz..." },
                { label: "Client Secret", key: "clientSecret", placeholder: "EGfghIjkLMNopQRstUVwx..." },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{f.label}</label>
                  <input
                    value={String(form[f.key as keyof typeof form])}
                    onChange={(e) => update({ [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    type={f.key === "clientSecret" ? "password" : "text"}
                    className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                  />
                </div>
              ))}

              {/* Test Connection button */}
              <button
                type="button"
                onClick={handleTestPaypal}
                disabled={testing || !form.clientId || !form.clientSecret}
                className={`w-full flex items-center justify-center gap-2 text-xs font-mono py-2 rounded-md border transition-colors
                  ${ testResult?.ok
                    ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-400"
                    : testResult && !testResult.ok
                      ? "bg-red-400/10 border-red-400/30 text-red-400"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-cyan-400/30"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {testing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing connection...</>
                ) : testResult?.ok ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> {testResult.message}</>
                ) : testResult && !testResult.ok ? (
                  <><XCircle className="w-3.5 h-3.5" /> {testResult.message}</>
                ) : (
                  <><Zap className="w-3.5 h-3.5" /> Test PayPal Connection</>
                )}
              </button>

              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Credentials are encrypted at rest with AES-256 and never logged
              </div>
            </div>

            {/* Proxy URL */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-orange-400" />
                Proxy URL (optional)
              </label>
              <input
                value={form.proxyUrl}
                onChange={(e) => update({ proxyUrl: e.target.value })}
                placeholder="http://user:pass@proxy.example.com:8080"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-orange-400/40 focus:border-orange-400/40 transition-colors"
              />
              <p className="text-[10px] font-mono text-muted-foreground">Supports HTTP, HTTPS, and SOCKS5 protocols</p>
            </div>

            {/* Initial Status */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Initial Status</label>
              <div className="flex rounded-md overflow-hidden border border-border">
                {(["Active", "Warm-up"] as Status[]).map((s) => {
                  const c = statusConfig[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update({ status: s })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-mono transition-colors ${
                        form.status === s
                          ? `${c.bg} ${c.text}`
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${form.status === s ? c.dot : "bg-border"}`} />
                      {s}
                    </button>
                  )
                })}
              </div>
              {form.status === "Warm-up" && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-sky-400/5 border border-sky-400/20">
                  <Info className="w-3 h-3 text-sky-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-mono text-sky-300/80">
                    Warm-up mode limits txns to $50 with a progressive daily cap ($100→$500 over 7 days)
                  </p>
                </div>
              )}
            </div>

            {/* Shield Domain */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Shield Domain</label>
              <div className="flex rounded-md overflow-hidden border border-border">
                {(["platform", "custom"] as DomainType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => update({ domainType: t, shieldDomain: t === "platform" ? fallbackPlatformDomain : "" })}
                    className={`flex-1 py-1.5 text-[11px] font-mono transition-colors ${
                      form.domainType === t
                        ? "bg-cyan-400/10 text-cyan-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "platform" ? "Platform Domain" : "Custom Domain"}
                  </button>
                ))}
              </div>
              {form.domainType === "platform" ? (
                <select
                  value={verifiedPlatformDomains.includes(form.shieldDomain) ? form.shieldDomain : ""}
                  onChange={(e) => update({ shieldDomain: e.target.value })}
                  disabled={!verifiedPlatformDomains.length}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 appearance-none"
                >
                  <option value="" disabled>
                    {verifiedPlatformDomains.length ? "Select a verified platform domain" : "No verified platform domains available"}
                  </option>
                  {verifiedPlatformDomains.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : (
                <input
                  value={form.shieldDomain}
                  onChange={(e) => update({ shieldDomain: e.target.value })}
                  placeholder="my-custom-domain.com"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                />
              )}
              {form.domainType === "platform" && (
                <p className={`text-[10px] font-mono ${verifiedPlatformDomains.length ? "text-muted-foreground" : "text-amber-400"}`}>
                  {verifiedPlatformDomains.length
                    ? "Only verified platform domains are shown here."
                    : "No verified platform domains available. Verify a domain in Domains first or use a custom domain."}
                </p>
              )}
            </div>

            {/* Volume limits */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Soft Limit ($)", key: "softLimit" as const },
                { label: "Hard Limit ($)", key: "hardLimit" as const },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{f.label}</label>
                  <input
                    type="number"
                    value={form[f.key]}
                    onChange={(e) => update({ [f.key]: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                  />
                </div>
              ))}
            </div>

            {/* Item masking */}
            <div className="space-y-3 border border-border rounded-lg p-3 bg-background">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-mono font-semibold text-foreground">Item Masking</span>
                </div>
                <button
                  onClick={() => update({ itemMasking: !form.itemMasking })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    form.itemMasking ? "bg-violet-500" : "bg-secondary border border-border"
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground shadow transition-all ${form.itemMasking ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
              {form.itemMasking && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Fake Product Name</label>
                  <input
                    value={form.fakeProductName}
                    onChange={(e) => update({ fakeProductName: e.target.value })}
                    placeholder="Digital Service Upgrade"
                    className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-violet-400 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-400/40 focus:border-violet-400/40 transition-colors"
                  />
                  <div className="flex flex-wrap gap-1">
                    {FAKE_PRODUCT_PRESETS.slice(0, 4).map((p) => (
                      <button
                        key={p}
                        onClick={() => update({ fakeProductName: p })}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mx-5 mb-0 flex items-center gap-2 text-xs font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button onClick={onClose} className="flex-1 px-4 py-2 text-xs font-mono text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={
                !form.accountName ||
                !form.email ||
                !form.clientId ||
                !form.clientSecret ||
                saving ||
                (form.domainType === "platform" && !form.shieldDomain)
              }
              className="flex-1 px-4 py-2 text-xs font-mono text-background bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors font-semibold flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? "Creating..." : "Add Account"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// Map DB status → UI status
function mapDbStatus(dbStatus: string, isLimited?: boolean): Status {
  if (isLimited) return "Limited"
  switch (dbStatus) {
    case "ACTIVE": return "Active"
    case "WARMING_UP": return "Warm-up"
    case "PAUSED": return "Paused"
    case "SUSPENDED": return "Suspended"
    default: return "Active"
  }
}

// Map UI status → DB status
function mapUiStatus(uiStatus: Status): string {
  switch (uiStatus) {
    case "Active": return "ACTIVE"
    case "Warm-up": return "WARMING_UP"
    case "Paused": return "PAUSED"
    case "Suspended": return "SUSPENDED"
    case "Limited": return "ACTIVE"  // Limited is UI-only
    default: return "ACTIVE"
  }
}

function mapApiToMerchant(a: MerchantApiRow, platformDomains: string[]): Merchant {
  const shieldDomain = a.shieldDomain ?? ""

  return {
    id: a.id,
    accountName: a.name,
    email: a.email ?? "",
    clientId: a.clientId,
    clientSecret: "(encrypted)",
    proxyUrl: a.proxyUrl ?? "",
    shieldDomain,
    domainType: platformDomains.includes(shieldDomain) ? "platform" : "custom",
    status: mapDbStatus(a.status, a.isLimited ?? undefined),
    priority: a.priority ?? 1,
    currentVolume: a.currentVolume ?? 0,
    softLimit: a.softLimit ?? 4000,
    hardLimit: a.dailyLimit ?? 5000,
    itemMasking: a.itemMasking ?? false,
    fakeProductName: a.fakeProductName ?? "Digital Service Upgrade",
    txCount: a.transactionCount ?? 0,
    createdAt: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : "—",
    lastActive: a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "—",
    successRate: a.successRate ?? 0,
  }
}

export default function AccountsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [platformDomains, setPlatformDomains] = useState<string[]>([])
  const [verifiedPlatformDomains, setVerifiedPlatformDomains] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Merchant | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<Status | "All">("All")

  // Fetch real data from API
  const fetchAccounts = useCallback(() => {
    fetch("/api/merchant/accounts")
      .then(r => r.json())
      .then(data => {
        setMerchants(((data.accounts ?? []) as MerchantApiRow[]).map((row) => mapApiToMerchant(row, platformDomains)))
      })
      .catch(() => {})
  }, [platformDomains])

  const fetchShieldDomains = useCallback(() => {
    fetch("/api/merchant/shield-domains")
      .then((r) => r.json())
      .then((data) => {
        const domains = ((data.domains ?? []) as ShieldDomainApiRow[]).filter((domain) => domain.isActive)
        setPlatformDomains(domains.map((domain) => domain.domain))
        setVerifiedPlatformDomains(domains.filter(isVerifiedPlatformDomain).map((domain) => domain.domain))
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchShieldDomains() }, [fetchShieldDomains])
  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccounts()
      fetchShieldDomains()
    }, 10_000)
    return () => clearInterval(interval)
  }, [fetchAccounts, fetchShieldDomains])

  const filtered = filterStatus === "All"
    ? merchants
    : merchants.filter((m) => m.status === filterStatus)

  const handleSave = useCallback(async (updated: Merchant) => {
    // Optimistic UI
    setMerchants((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    setSelected(null)

    // Persist to backend
    try {
      await fetch(`/api/merchant/accounts/${updated.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updated.accountName,
          email: updated.email,
          clientId: updated.clientId,
          shieldDomain: updated.shieldDomain,
          proxyUrl: updated.proxyUrl,
          status: mapUiStatus(updated.status),
          priority: updated.priority,
          softLimit: updated.softLimit,
          hardLimit: updated.hardLimit,
          itemMasking: updated.itemMasking,
          fakeProductName: updated.fakeProductName,
        }),
      })
    } catch {}
  }, [])

  const toggleStatus = useCallback(async (id: string, action: "pause" | "resume") => {
    const newStatus = action === "pause" ? "Paused" : "Active"
    setMerchants((prev) =>
      prev.map((m) => m.id === id ? { ...m, status: newStatus as Status } : m)
    )
    setOpenMenu(null)

    try {
      await fetch(`/api/merchant/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action === "pause" ? "PAUSED" : "ACTIVE" }),
      })
    } catch {}
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Remove this account from the rotation pool?\n\nNote: accounts with linked transactions cannot be deleted. Set them to Suspended instead.")) return
    setOpenMenu(null)

    try {
      const res = await fetch(`/api/merchant/accounts/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 409) {
          // FK constraint — has transactions, cannot delete
          alert(data.error ?? "Cannot delete: this account has linked transactions. Set it to Suspended instead.")
        } else {
          alert(data.error ?? "Failed to delete account. Please try again.")
        }
        return // DO NOT remove from UI
      }

      // Only remove from UI after confirmed server-side deletion
      setMerchants((prev) => prev.filter((m) => m.id !== id))
    } catch {
      alert("Network error while deleting account. Please try again.")
    }
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch("/api/merchant/accounts/sync", { method: "POST" })
      fetchAccounts()
    } catch {}
    setSyncing(false)
  }, [fetchAccounts])

  const handleAdd = (m: Merchant) => {
    setMerchants((prev) => [...prev, m])
  }

  const statusCounts = (["Active", "Limited", "Warm-up", "Paused"] as Status[]).map((s) => ({
    status: s,
    count: merchants.filter((m) => m.status === s).length,
  }))

  const totalVolume = merchants.reduce((sum, m) => sum + m.currentVolume, 0)
  const activeCount = merchants.filter((m) => m.status === "Active" || m.status === "Limited").length

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="px-4 md:px-6 py-5 max-w-[1600px] mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-foreground">Merchant Accounts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              PayPal account rotator — {merchants.length} accounts configured
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync"}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs font-mono text-background bg-cyan-400 hover:bg-cyan-300 rounded-md px-3 py-1.5 font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Merchant
            </button>
          </div>
        </div>

        {/* Summary stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="col-span-2 md:col-span-2 bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total Volume Today</p>
            <p className="text-xl font-mono font-semibold text-foreground mt-1">${totalVolume.toLocaleString()}</p>
            <p className="text-[10px] font-mono text-muted-foreground mt-1">{activeCount} active accounts</p>
          </div>
          {statusCounts.map(({ status, count }) => {
            const cfg = statusConfig[status]
            return (
              <div key={status} className="bg-card border border-border rounded-lg px-4 py-3">
                <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${cfg.text}`}>
                  {cfg.icon}
                  {status}
                </div>
                <p className="text-xl font-mono font-semibold text-foreground mt-1">{count}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">accounts</p>
              </div>
            )
          })}
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              {(["All", "Active", "Limited", "Warm-up", "Paused", "Suspended"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-colors ${
                    filterStatus === s
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {s}
                  <span className="ml-1 text-muted-foreground">
                    {s === "All" ? merchants.length : merchants.filter((m) => m.status === s).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "Account Name",
                    "Shield Domain",
                    "Credentials",
                    "Status",
                    "Priority",
                    "Item Masking",
                    "Daily Volume",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-secondary/40 ${
                      i % 2 === 0 ? "" : "bg-secondary/10"
                    } ${selected?.id === m.id ? "bg-cyan-400/5 border-l-2 border-l-cyan-400" : ""}`}
                  >
                    {/* Account Name */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-mono text-xs font-semibold text-cyan-400">{m.accountName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{m.email}</p>
                      </div>
                    </td>

                    {/* Shield Domain */}
                    <td className="px-4 py-3">
                      <a
                        href={`https://${m.shieldDomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-mono text-xs text-foreground hover:text-cyan-400 transition-colors group"
                      >
                        {m.shieldDomain}
                        <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
                      </a>
                    </td>

                    {/* Credentials */}
                    <td className="px-4 py-3">
                      <CredentialCell clientId={m.clientId} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <PriorityStars value={m.priority} />
                    </td>

                    {/* Item Masking */}
                    <td className="px-4 py-3">
                      <ItemMaskingBadge enabled={m.itemMasking} productName={m.fakeProductName} />
                    </td>

                    {/* Volume */}
                    <td className="px-4 py-3 min-w-[220px]">
                      <VolumeBar
                        current={m.currentVolume}
                        soft={m.softLimit}
                        hard={m.hardLimit}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground focus:outline-none">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 bg-popover border-border text-xs font-mono">
                          <DropdownMenuItem
                            onClick={() => { setSelected(m); setOpenMenu(null) }}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                            Edit Details
                          </DropdownMenuItem>
                          {m.status !== "Paused" ? (
                            <DropdownMenuItem
                              onClick={() => toggleStatus(m.id, "pause")}
                              className="flex items-center gap-2 text-amber-400 focus:text-amber-400 cursor-pointer"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              Pause Account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => toggleStatus(m.id, "resume")}
                              className="flex items-center gap-2 text-emerald-400 focus:text-emerald-400 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Resume Account
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            onClick={() => handleDelete(m.id)}
                            className="flex items-center gap-2 text-red-400 focus:text-red-400 focus:bg-red-400/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-mono text-sm text-muted-foreground">No accounts match the selected filter.</p>
            </div>
          )}
        </div>
      </main>

      {/* Slide-over edit panel */}
      <SlideOver
        merchant={selected}
        verifiedPlatformDomains={verifiedPlatformDomains}
        onClose={() => setSelected(null)}
        onSave={handleSave}
      />

      {/* Add merchant modal */}
      {showAdd && (
        <AddMerchantModal
          verifiedPlatformDomains={verifiedPlatformDomains}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}

// ─── Inline credential cell (no state leak between rows) ─────────────────────

function CredentialCell({ clientId }: { clientId: string }) {
  const [copied, setCopied] = useState(false)

  const masked = clientId.slice(0, 6) + "••••••••••" + clientId.slice(-4)

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(clientId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [clientId])

  return (
    <div className="flex items-center gap-1.5">
      <code className="font-mono text-[11px] text-muted-foreground">{masked}</code>
      <button
        onClick={handleCopy}
        className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
      >
        {copied
          ? <Check className="w-3 h-3 text-emerald-400" />
          : <Copy className="w-3 h-3" />
        }
      </button>
    </div>
  )
}
