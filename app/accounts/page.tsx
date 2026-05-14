// Cache invalidation: 2026-04-04
"use client"

import { useState, useCallback, useEffect } from "react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { accountsCopy } from "@/lib/i18n/accounts"
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
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { GridBackground } from "@/components/ui/grid-background"

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
  displayProfileId: string | null
  bundleId: string | null
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
  displayProfileId?: string | null
  bundleId?: string | null
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
  healthOk?: boolean
  vercel?: {
    bridgeOk?: boolean | null
  } | null
}

interface PaymentDisplayProfile {
  id: string
  profile_name: string
}

interface PaymentIdentity {
  id: string
  bundle_name: string
  public_brand_name: string | null
  primary_shield_domain: string | null
  is_active: boolean
  active_item_count: number
  support_email: string | null
  tracking_url: string | null
  shipping_policy_url: string | null
  refund_policy_url: string | null
  privacy_policy_url: string | null
  terms_url: string | null
  has_long_descriptor?: boolean
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
  return domain.isActive && (domain.healthOk === true || domain.vercel?.bridgeOk === true)
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
  displayProfiles: PaymentDisplayProfile[]
  paymentIdentities: PaymentIdentity[]
  onClose: () => void
  onSave: (updated: Merchant) => void
}

function SlideOver({ merchant, verifiedPlatformDomains, displayProfiles, paymentIdentities, onClose, onSave }: SlideOverProps) {
  const { language } = useLanguage()
  const t = accountsCopy[language]

  const [draft, setDraft] = useState<Merchant | null>(merchant)
  const [activeTab, setActiveTab] = useState<"overview" | "credentials" | "routing" | "identity" | "legacy">("overview")
  const fallbackPlatformDomain = verifiedPlatformDomains[0] ?? ""
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // sync when a new merchant is opened
  if (draft?.id !== merchant?.id && merchant !== null) {
    setDraft(merchant)
    setActiveTab("overview")
    setSaveError(null)
    setSaveSuccess(false)
  }

  if (!merchant || !draft) return null

  const update = (patch: Partial<Merchant>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setSaveSuccess(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!draft) return
    const nextDraft =
      draft.domainType === "platform" && !verifiedPlatformDomains.includes(draft.shieldDomain)
        ? { ...draft, shieldDomain: fallbackPlatformDomain }
        : draft
    if (nextDraft.domainType === "platform" && !nextDraft.shieldDomain) {
      return
    }

    setIsSaving(true)
    setSaveSuccess(false)
    setSaveError(null)

    try {
      await onSave(nextDraft)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      setSaveError(err.message || "Unable to save changes. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />

      <aside data-ui-version="account-edit-boron-tabs-v3" className="fixed right-0 top-0 bottom-0 w-full max-w-[800px] xl:max-w-[900px] bg-[#222530] border-l border-[#343947] z-50 flex flex-col shadow-2xl">
        <div className="flex flex-col border-b border-[#343947] shrink-0 bg-[#1f222c]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button onClick={onClose} className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors bg-[#151821] hover:bg-[#2a2d39]">
                <ChevronRight className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono text-[#97a3b6] uppercase tracking-[0.08em]">{t.editing}</p>
                  <StatusBadge status={draft.status} />
                </div>
                <h2 className="text-xl font-semibold text-[#e7edf8] mt-0.5">{draft.accountName}</h2>
                {draft.email && <p className="text-sm text-[#97a3b6] mt-0.5">{draft.email}</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors bg-[#151821] hover:bg-[#2a2d39]">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-8 px-6 overflow-x-auto">
            {[
              { id: "overview", label: t.tabOverview },
              { id: "credentials", label: t.tabCredentials },
              { id: "routing", label: t.tabRouting },
              { id: "identity", label: t.tabIdentity },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 text-sm font-semibold uppercase tracking-[0.08em] border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-[#FFD600] text-[#FFD600]"
                    : "border-transparent text-[#97a3b6] hover:text-[#e7edf8]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "overview" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: t.statTransactions, value: draft.txCount.toString() },
                  { label: t.statSuccessRate, value: `${draft.successRate}%` },
                  { label: t.statLastActive, value: draft.lastActive },
                ].map((s) => (
                  <div key={s.label} className="bg-[#151821] border border-[#343947] rounded-md px-4 py-3 text-center">
                    <p className="font-mono text-base font-semibold text-[#e7edf8]">{s.value}</p>
                    <p className="text-xs text-[#97a3b6] mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelAccountName}</label>
                <input
                  value={draft.accountName}
                  onChange={(e) => update({ accountName: e.target.value })}
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelEmail}</label>
                <input
                  value={draft.email}
                  onChange={(e) => update({ email: e.target.value })}
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
              </div>
            </div>
          )}

          {activeTab === "credentials" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.paypalApiCredentials}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.paypalApiDesc}
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelClientId}</label>
                  <input
                    value={draft.clientId}
                    onChange={(e) => update({ clientId: e.target.value })}
                    placeholder="AeBFXkz..."
                    className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/50 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <MaskedField value={draft.clientSecret} label={t.labelClientSecret} />
                </div>
                <div className="flex items-center gap-2 text-sm text-[#aab4c5] leading-6 bg-[#2a2d39]/50 rounded-md px-4 py-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  {t.credsEncrypted}
                </div>
              </div>
            </div>
          )}

          {activeTab === "routing" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-3">
                <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelStatus}</label>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {(["Active", "Warm-up", "Limited", "Paused", "Suspended"] as Status[]).map((s) => {
                    const c = statusConfig[s]
                    const active = draft.status === s
                    return (
                      <button
                        key={s}
                        onClick={() => update({ status: s })}
                        className={`flex items-center gap-2 px-4 py-3 rounded-md border text-sm transition-colors font-semibold ${
                          active
                            ? `${c.bg} ${c.text} ${c.border}`
                            : "bg-[#151821] border-[#343947] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${active ? c.dot : "bg-border"}`} />
                        {s === "Active" ? t.filterActive : s === "Limited" ? t.filterLimited : s === "Warm-up" ? t.filterWarmUp : s === "Paused" ? t.filterPaused : s === "Suspended" ? t.filterSuspended : s}
                      </button>
                    )
                  })}
                </div>
                {draft.status === "Warm-up" && (
                  <div className="flex items-start gap-2 mt-3 px-4 py-3 rounded-md bg-sky-400/5 border border-sky-400/20">
                    <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-sky-300/80 leading-6">
                      <p className="font-semibold text-sky-400 mb-1">{t.warmupModeActive}</p>
                      <p>{t.warmupDescEdit1}<span className="text-sky-400">{t.warmupDescEdit1Val}</span>{t.warmupDescEdit1End}</p>
                      <p>{t.warmupDescEdit2}<span className="text-sky-400">{t.warmupDescEdit2Val1}</span>{t.warmupDescEdit2Day1}<span className="text-sky-400">{t.warmupDescEdit2Val2}</span>{t.warmupDescEdit2Day7}</p>
                      <p>{t.warmupDescEdit3}</p>
                    </div>
                  </div>
                )}
                {draft.status === "Suspended" && (
                  <div className="flex items-start gap-2 mt-3 px-4 py-3 rounded-md bg-red-500/5 border border-red-500/20">
                    <Ban className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300/80 leading-6">
                      {t.suspendedDesc}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">
                  {t.labelPriority} — {draft.priority}/5
                </label>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <button key={i} onClick={() => update({ priority: i + 1 })} className="p-1 transition-colors rounded">
                      <Star className={`w-6 h-6 transition-colors ${i < draft.priority ? "text-[#FFD600] fill-[#FFD600]" : "text-border hover:text-[#97a3b6]"}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.adaptiveLimits}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.adaptiveLimitsDescEdit}
                </p>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelSoftLimit}</label>
                    <input
                      type="number"
                      value={draft.softLimit}
                      onChange={(e) => update({ softLimit: Number(e.target.value) })}
                      className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/40 focus:border-amber-400/40 transition-colors"
                    />
                    <p className="text-sm text-[#aab4c5] leading-6">{t.descSoftLimit}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelHardLimit}</label>
                    <input
                      type="number"
                      value={draft.hardLimit}
                      onChange={(e) => update({ hardLimit: Number(e.target.value) })}
                      className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-red-400 focus:outline-none focus:ring-1 focus:ring-red-400/40 focus:border-red-400/40 transition-colors"
                    />
                    <p className="text-sm text-[#aab4c5] leading-6">{t.descHardLimit}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="relative h-3 bg-[#2a2d39] rounded-full overflow-hidden">
                    <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 rounded-full" style={{ left: `${Math.min((draft.softLimit / draft.hardLimit) * 100, 100)}%` }} />
                    <div className="h-full bg-[#FFD600]/70 rounded-full transition-all" style={{ width: `${Math.min((draft.currentVolume / draft.hardLimit) * 100, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-sm text-[#aab4c5] leading-6">
                    <span>$0</span>
                    <span className="text-amber-400">${draft.softLimit.toLocaleString()} soft</span>
                    <span className="text-red-400">${draft.hardLimit.toLocaleString()} hard</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "identity" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.tabIdentity || "Payment Identity"}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.identityDescEdit ?? "Choose the brand/domain/descriptor set this PayPal account should use during checkout."}
                </p>
                
                <select
                  value={draft.bundleId || ""}
                  onChange={(e) => {
                     const selectedBundleId = e.target.value || null
                     const selectedBundle = paymentIdentities.find(b => b.id === selectedBundleId)
                     update({ 
                       bundleId: selectedBundleId,
                       shieldDomain: selectedBundle?.primary_shield_domain || draft.shieldDomain
                     })
                  }}
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors appearance-none"
                >
                  <option value="">{t.noneProfile ?? "No Payment Identity assigned"}</option>
                  {paymentIdentities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.bundle_name} {p.primary_shield_domain ? `(${p.primary_shield_domain})` : ""}
                    </option>
                  ))}
                </select>

                {draft.bundleId && paymentIdentities.find(b => b.id === draft.bundleId) && (
                  (() => {
                    const bundle = paymentIdentities.find(b => b.id === draft.bundleId)!
                    const hasBrand = !!bundle.public_brand_name
                    const hasDomain = !!bundle.primary_shield_domain
                    const hasItems = bundle.active_item_count > 0
                    const hasEmail = !!bundle.support_email
                    const hasPolicies = !!(bundle.shipping_policy_url && bundle.refund_policy_url && bundle.privacy_policy_url && bundle.terms_url)
                    const hasLongDescriptor = !!bundle.has_long_descriptor
                    
                    const isReady = bundle.is_active && hasBrand && hasDomain && hasItems && !hasLongDescriptor && hasEmail && hasPolicies
                    
                    const reasons = []
                    if (!bundle.is_active) reasons.push("Identity is inactive")
                    if (!hasBrand) reasons.push("Missing Public Brand Name")
                    if (!hasDomain) reasons.push("Missing Shield Domain")
                    if (!hasItems) reasons.push("Missing Active Descriptor Item")
                    if (hasLongDescriptor) reasons.push("Descriptor Too Long (>127 chars)")
                    if (!hasEmail) reasons.push("Missing Support Email")
                    if (!hasPolicies) reasons.push("Missing one or more Policy URLs")

                    return (
                      <div className="mt-4 p-4 bg-[#222530] border border-[#343947] rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#e7edf8]">Identity Preview</p>
                          {isReady ? (
                             <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                               <CheckCircle2 className="w-3 h-3" /> Ready
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono bg-red-500/10 text-red-400 border-red-500/20">
                               <XCircle className="w-3 h-3" /> Needs Attention
                             </span>
                          )}
                        </div>

                        {!isReady && reasons.length > 0 && (
                          <div className="flex flex-col gap-1 mt-2 bg-red-500/5 p-2 rounded border border-red-500/10">
                            {reasons.map((r, idx) => (
                              <span key={idx} className="text-[11px] text-red-400 flex items-start gap-1">
                                <span className="mt-1">-</span> {r}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-sm mt-3 border-t border-[#343947] pt-3">
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Brand</p>
                            <p className="text-[#e7edf8] font-medium">{bundle.public_brand_name || bundle.bundle_name}</p>
                          </div>
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Shield Domain</p>
                            <p className="text-[#FFD600]">{bundle.primary_shield_domain || "Not configured"}</p>
                          </div>
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Items / Descriptor</p>
                            <p className="text-[#e7edf8]">{bundle.active_item_count} active items</p>
                          </div>
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Support Email</p>
                            <p className="text-[#e7edf8]">{bundle.support_email || "No email"}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })()
                )}

              </div>
              
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-orange-400" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.staticProxy}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.proxyDescEdit}
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelProxyOptional}</label>
                  {draft.proxyUrl ? (
                    <MaskedField value={draft.proxyUrl} label="" />
                  ) : (
                    <input
                      value={draft.proxyUrl}
                      onChange={(e) => update({ proxyUrl: e.target.value })}
                      placeholder="http://user:pass@proxy.example.com:8080"
                      className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/50 focus:outline-none focus:ring-1 focus:ring-orange-400/40 focus:border-orange-400/40 transition-colors"
                    />
                  )}
                  {draft.proxyUrl && (
                    <button onClick={() => update({ proxyUrl: "" })} className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors mt-2">
                      {t.btnRemoveProxy}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-[#aab4c5] leading-6 bg-[#2a2d39]/50 rounded-md px-4 py-3">
                  <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
                  {t.proxyHiddenWarning}
                </div>
              </div>
              <details className="group border border-[#343947] rounded-lg bg-[#151821] overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#97a3b6]" />
                    <p className="text-base font-semibold text-[#e7edf8]">Advanced / Legacy Settings</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#97a3b6] group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-5 pb-5 pt-1 border-t border-[#343947] space-y-6 mt-2">
                  <p className="text-sm text-[#aab4c5] leading-6">
                    These fields are kept for backward compatibility. Most merchants should use Payment Identity instead.
                  </p>

                  {draft.bundleId && draft.shieldDomain && (
                    paymentIdentities.find(b => b.id === draft.bundleId)?.primary_shield_domain !== draft.shieldDomain
                  ) && (
                    <div className="bg-[#4a3908]/50 border border-[#ca8a04]/50 text-[#facc15] text-sm leading-6 px-4 py-3 rounded-md border-l-[3px] border-l-[#ca8a04]">
                      Legacy domain ({draft.shieldDomain}) differs from selected Payment Identity. Checkout will use the Payment Identity domain.
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#97a3b6]" />
                      <p className="text-sm font-semibold text-[#e7edf8]">Legacy Shield Domain</p>
                    </div>
                    <div className="flex rounded-md overflow-hidden border border-[#343947]">
                      {(["platform", "custom"] as DomainType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => update({ domainType: type, shieldDomain: type === "platform" ? fallbackPlatformDomain : "" })}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
                            draft.domainType === type ? "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]" : "text-[#97a3b6] hover:text-[#e7edf8] bg-[#2a2d39] border border-[#343947]"
                          }`}
                        >
                          {type === "platform" ? <Lock className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                          {type === "platform" ? t.btnPlatformDomain : t.btnCustomDomain}
                        </button>
                      ))}
                    </div>
                    {draft.domainType === "platform" ? (
                      <select
                        value={verifiedPlatformDomains.includes(draft.shieldDomain) ? draft.shieldDomain : ""}
                        onChange={(e) => update({ shieldDomain: e.target.value })}
                        disabled={!verifiedPlatformDomains.length}
                        className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors appearance-none"
                      >
                        <option value="" disabled>{verifiedPlatformDomains.length ? t.selectVerifiedPlaceholder : t.noVerifiedPlaceholder}</option>
                        {verifiedPlatformDomains.map((d) => (<option key={d} value={d}>{d}</option>))}
                      </select>
                    ) : (
                      <input
                        value={draft.shieldDomain}
                        onChange={(e) => update({ shieldDomain: e.target.value })}
                        placeholder="my-custom-domain.com"
                        className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                      />
                    )}
                  </div>

                  <div className="space-y-4 pt-4 border-t border-[#343947]">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#97a3b6]" />
                      <p className="text-sm font-semibold text-[#e7edf8]">Legacy Payment Display Profile</p>
                    </div>
                    <select
                      value={draft.displayProfileId || ""}
                      onChange={(e) => update({ displayProfileId: e.target.value || null })}
                      className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors appearance-none"
                    >
                      <option value="">{t.noneProfile}</option>
                      {displayProfiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.profile_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-[#343947]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#97a3b6]" />
                        <p className="text-sm font-semibold text-[#e7edf8]">{t.legacyMasking}</p>
                      </div>
                      <button
                        onClick={() => update({ itemMasking: !draft.itemMasking })}
                        className={`relative w-12 h-6 rounded-full transition-colors ${draft.itemMasking ? "bg-violet-500" : "bg-[#2a2d39] border border-[#343947]"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-foreground shadow transition-all ${draft.itemMasking ? "left-6" : "left-0.5"}`} />
                      </button>
                    </div>

                    {draft.itemMasking && (
                      <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelLegacyProduct}</label>
                          <input
                            value={draft.fakeProductName}
                            onChange={(e) => update({ fakeProductName: e.target.value })}
                            placeholder="e.g. Digital Service Upgrade"
                            className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base text-violet-400 placeholder:text-[#97a3b6]/50 focus:outline-none focus:ring-1 focus:ring-violet-400/40 focus:border-violet-400/40 transition-colors"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelPresets}</p>
                          <div className="flex flex-wrap gap-2">
                            {FAKE_PRODUCT_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                onClick={() => update({ fakeProductName: preset })}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                                  draft.fakeProductName === preset ? "bg-violet-400/10 text-violet-400 border-violet-400/30" : "bg-[#2a2d39] text-[#97a3b6] border-[#343947] hover:text-[#e7edf8] hover:border-[#343947]/80"
                                }`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="bg-[#2a2d39]/50 rounded-md px-4 py-3 text-sm text-[#aab4c5] leading-6">
                          <span className="text-[#97a3b6]">{t.receiptWillShow}</span>
                          <span className="text-violet-400 font-semibold">{draft.fakeProductName || "(empty)"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </details>

              <div className="border border-red-500/20 rounded-lg p-5 space-y-3 bg-red-500/5">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red-400">{t.dangerZone}</p>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.dangerDesc}
                </p>
                <button className="flex items-center gap-2 text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-md px-4 py-2 transition-colors">
                  <Trash2 className="w-4 h-4" />
                  {t.btnRemoveAccount}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col px-6 py-4 border-t border-[#343947] shrink-0 bg-[#1f222c]">
          {saveSuccess && (
            <div className="mb-4 flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-md transition-all">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t.msgSavedSuccess}</span>
            </div>
          )}
          {saveError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-md transition-all">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <button onClick={onClose} className="flex-1 px-5 py-2.5 text-sm font-semibold text-[#97a3b6] border border-[#343947] rounded-md hover:bg-[#2a2d39] transition-colors">
              {t.btnCancel}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || (draft.domainType === "platform" && !fallbackPlatformDomain)}
              className="flex-1 px-5 py-2.5 text-sm font-semibold text-[#151821] bg-[#FFD600] hover:bg-[#e6c100] rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.btnSaving}
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  {t.btnSaved}
                </>
              ) : (
                t.btnSave
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}


// ─── Add Merchant Modal ───────────────────��───────────────────────────────────

function AddMerchantModal({
  verifiedPlatformDomains,
  displayProfiles,
  paymentIdentities,
  onClose,
  onAdd,
}: {
  verifiedPlatformDomains: string[]
  displayProfiles: PaymentDisplayProfile[]
  paymentIdentities: PaymentIdentity[]
  onClose: () => void
  onAdd: (m: Merchant) => void
}) {
  const { language } = useLanguage()
  const t = accountsCopy[language]

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
    displayProfileId: "",
    bundleId: "",
    softLimit: 4000,
    hardLimit: 5000,
    itemMasking: false,
    fakeProductName: "Digital Service Upgrade",
  })
  const [activeTab, setActiveTab] = useState<"info" | "credentials" | "routing" | "identity" | "legacy" | "review">("info")
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]   = useState("")
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const update = (patch: Partial<typeof form>) => {
    setForm((p) => ({ ...p, ...patch }))
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
          displayProfileId: form.displayProfileId || undefined,
          bundleId: form.bundleId || undefined,
          proxyUrl: form.proxyUrl || undefined,
          shieldDomain: form.domainType === "platform" ? form.shieldDomain : form.shieldDomain,
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
        displayProfileId: acct.displayProfileId ?? form.displayProfileId ?? null,
        bundleId: acct.bundleId ?? form.bundleId ?? null,
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
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />

      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[800px] xl:max-w-[900px] bg-[#222530] border-l border-[#343947] z-50 flex flex-col shadow-2xl">
        <div className="flex flex-col border-b border-[#343947] shrink-0 bg-[#1f222c]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button onClick={onClose} className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors bg-[#151821] hover:bg-[#2a2d39]">
                <ChevronRight className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-xl font-semibold text-[#e7edf8] mt-0.5">{t.addModalTitle}</h2>
                <p className="text-sm text-[#97a3b6] mt-0.5">{t.addModalDesc}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors bg-[#151821] hover:bg-[#2a2d39]">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-8 px-6 overflow-x-auto">
            {[
              { id: "info", label: t.tabInfo },
              { id: "credentials", label: t.tabCredentials },
              { id: "routing", label: t.tabRouting },
              { id: "identity", label: t.tabIdentity },
              { id: "review", label: t.tabReview },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 text-sm font-semibold uppercase tracking-[0.08em] border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-[#FFD600] text-[#FFD600]"
                    : "border-transparent text-[#97a3b6] hover:text-[#e7edf8]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "info" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelAccountName} <span className="text-red-400">*</span></label>
                  <input
                    value={form.accountName}
                    onChange={(e) => update({ accountName: e.target.value })}
                    placeholder="e.g. PP-Main-01"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelEmail} <span className="text-red-400">*</span></label>
                  <input
                    value={form.email}
                    onChange={(e) => update({ email: e.target.value })}
                    placeholder="payments@store.com"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelInitialStatus}</label>
                  <div className="flex rounded-md overflow-hidden border border-[#343947]">
                    {(["Active", "Warm-up"] as Status[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => update({ status: s })}
                        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                          form.status === s ? "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]" : "text-[#97a3b6] bg-[#2a2d39] border border-[#343947] hover:text-[#e7edf8]"
                        }`}
                      >
                        {s === "Active" ? t.filterActive : s === "Warm-up" ? t.filterWarmUp : s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "credentials" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.paypalApiCredentials}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.paypalApiDesc}
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelClientId} <span className="text-red-400">*</span></label>
                  <input
                    value={form.clientId}
                    onChange={(e) => update({ clientId: e.target.value })}
                    placeholder="AeBFXkzLmNoPQ..."
                    className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/50 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelClientSecret} <span className="text-red-400">*</span></label>
                  <input
                    value={form.clientSecret}
                    onChange={(e) => update({ clientSecret: e.target.value })}
                    placeholder="EGfghIjkLMNop..."
                    type="password"
                    className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/50 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-[#aab4c5] leading-6 bg-[#2a2d39]/50 rounded-md px-4 py-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  {t.credsEncrypted}
                </div>

                <button
                  type="button"
                  onClick={handleTestPaypal}
                  disabled={testing || !form.clientId || !form.clientSecret}
                  className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-md border transition-colors
                    ${ testResult?.ok
                      ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-400"
                      : testResult && !testResult.ok
                        ? "bg-red-400/10 border-red-400/30 text-red-400"
                        : "bg-[#2a2d39] border-[#343947] text-[#97a3b6] hover:text-[#e7edf8] hover:border-[#343947]/80"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {testing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t.btnTesting}</>
                  ) : testResult?.ok ? (
                    <><CheckCircle2 className="w-4 h-4" /> {testResult.message}</>
                  ) : testResult && !testResult.ok ? (
                    <><XCircle className="w-4 h-4" /> {testResult.message}</>
                  ) : (
                    <><Zap className="w-4 h-4 text-[#FFD600]" /> {t.btnTestPaypal}</>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === "routing" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.adaptiveLimits}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.adaptiveLimitsDescAdd}
                </p>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelSoftLimit}</label>
                    <input
                      type="number"
                      value={form.softLimit}
                      onChange={(e) => update({ softLimit: Number(e.target.value) })}
                      className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/40 focus:border-amber-400/40 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelHardLimit}</label>
                    <input
                      type="number"
                      value={form.hardLimit}
                      onChange={(e) => update({ hardLimit: Number(e.target.value) })}
                      className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base font-mono text-red-400 focus:outline-none focus:ring-1 focus:ring-red-400/40 focus:border-red-400/40 transition-colors"
                    />
                  </div>
                </div>

                {form.status === "Warm-up" && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-md bg-sky-400/5 border border-sky-400/20 mt-4">
                    <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-sky-300/80 leading-6">
                      {t.warmupDescAdd}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "identity" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.tabIdentity || "Payment Identity"}</p>
                </div>
                <p className="text-sm text-[#aab4c5] leading-6">
                  {t.identityDescEdit ?? "Choose the brand/domain/descriptor set this PayPal account should use during checkout."}
                </p>
                
                <select
                  value={form.bundleId || ""}
                  onChange={(e) => {
                     const selectedBundleId = e.target.value || null
                     const selectedBundle = paymentIdentities.find(b => b.id === selectedBundleId)
                     update({ 
                       bundleId: selectedBundleId || "",
                       shieldDomain: selectedBundle?.primary_shield_domain || form.shieldDomain
                     })
                  }}
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors appearance-none"
                >
                  <option value="">{t.noneProfile ?? "No Payment Identity assigned"}</option>
                  {paymentIdentities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.bundle_name} {p.primary_shield_domain ? `(${p.primary_shield_domain})` : ""}
                    </option>
                  ))}
                </select>

                {form.bundleId && paymentIdentities.find(b => b.id === form.bundleId) && (
                  (() => {
                    const bundle = paymentIdentities.find(b => b.id === form.bundleId)!
                    const hasBrand = !!bundle.public_brand_name
                    const hasDomain = !!bundle.primary_shield_domain
                    const hasItems = bundle.active_item_count > 0
                    const hasEmail = !!bundle.support_email
                    const hasPolicies = !!(bundle.shipping_policy_url && bundle.refund_policy_url && bundle.privacy_policy_url && bundle.terms_url)
                    const hasLongDescriptor = !!bundle.has_long_descriptor
                    
                    const isReady = bundle.is_active && hasBrand && hasDomain && hasItems && !hasLongDescriptor && hasEmail && hasPolicies
                    
                    const reasons = []
                    if (!bundle.is_active) reasons.push("Identity is inactive")
                    if (!hasBrand) reasons.push("Missing Public Brand Name")
                    if (!hasDomain) reasons.push("Missing Shield Domain")
                    if (!hasItems) reasons.push("Missing Active Descriptor Item")
                    if (hasLongDescriptor) reasons.push("Descriptor Too Long (>127 chars)")
                    if (!hasEmail) reasons.push("Missing Support Email")
                    if (!hasPolicies) reasons.push("Missing one or more Policy URLs")

                    return (
                      <div className="mt-4 p-4 bg-[#222530] border border-[#343947] rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#e7edf8]">Identity Preview</p>
                          {isReady ? (
                             <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                               <CheckCircle2 className="w-3 h-3" /> Ready
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono bg-red-500/10 text-red-400 border-red-500/20">
                               <XCircle className="w-3 h-3" /> Needs Attention
                             </span>
                          )}
                        </div>

                        {!isReady && reasons.length > 0 && (
                          <div className="flex flex-col gap-1 mt-2 bg-red-500/5 p-2 rounded border border-red-500/10">
                            {reasons.map((r, idx) => (
                              <span key={idx} className="text-[11px] text-red-400 flex items-start gap-1">
                                <span className="mt-1">-</span> {r}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-sm mt-3 border-t border-[#343947] pt-3">
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Brand</p>
                            <p className="text-[#e7edf8] font-medium">{bundle.public_brand_name || bundle.bundle_name}</p>
                          </div>
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Shield Domain</p>
                            <p className="text-[#FFD600]">{bundle.primary_shield_domain || "Not configured"}</p>
                          </div>
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Items / Descriptor</p>
                            <p className="text-[#e7edf8]">{bundle.active_item_count} active items</p>
                          </div>
                          <div>
                            <p className="text-[#97a3b6] text-xs uppercase tracking-wider font-mono mb-1">Support Email</p>
                            <p className="text-[#e7edf8]">{bundle.support_email || "No email"}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })()
                )}

              </div>
              
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-[#FFD600]" />
                  <p className="text-base font-semibold text-[#e7edf8]">{t.staticProxyAdd}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Static Proxy (Optional)</label>
                  <input
                    value={form.proxyUrl}
                    onChange={(e) => update({ proxyUrl: e.target.value })}
                    placeholder="http://user:pass@host:port"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                  <p className="text-sm text-[#97a3b6]">Used to assign a dedicated static IP for PayPal API calls.</p>
                </div>
              </div>

              <details className="group border border-[#343947] rounded-lg bg-[#151821] overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#97a3b6]" />
                    <p className="text-base font-semibold text-[#e7edf8]">Advanced / Legacy Settings</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#97a3b6] group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-5 pb-5 pt-1 border-t border-[#343947] space-y-6 mt-2">
                  <div className="bg-[#4a3908]/50 border border-[#ca8a04]/50 text-[#facc15] text-sm leading-6 px-4 py-3 rounded-md border-l-[3px] border-l-[#ca8a04]">
                    <p className="font-semibold mb-1">Legacy settings are kept only for older accounts. For new setup, use Payment Identity. Checkout now prioritizes Payment Identity when assigned.</p>
                    {form.bundleId ? (
                      <p className="mt-2 text-amber-400">These values may be ignored at checkout when Payment Identity is assigned.</p>
                    ) : (
                      <p className="mt-2 text-amber-400">This account is using legacy checkout identity settings. Assign a Payment Identity for the recommended setup.</p>
                    )}
                  </div>

                  {form.bundleId && form.shieldDomain && (
                    paymentIdentities.find(b => b.id === form.bundleId)?.primary_shield_domain !== form.shieldDomain
                  ) && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm leading-6 px-4 py-3 rounded-md border-l-[3px] border-l-red-500">
                      Legacy domain differs from Payment Identity. Checkout will use the Payment Identity domain.
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#97a3b6]" />
                      <p className="text-sm font-semibold text-[#e7edf8]">Legacy Shield Domain</p>
                    </div>
                    <div className="flex rounded-md overflow-hidden border border-[#343947]">
                      {(["platform", "custom"] as DomainType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => update({ domainType: type, shieldDomain: type === "platform" ? fallbackPlatformDomain : "" })}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
                            form.domainType === type ? "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]" : "text-[#97a3b6] hover:text-[#e7edf8] bg-[#2a2d39] border border-[#343947]"
                          }`}
                        >
                          {type === "platform" ? <Lock className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                          {type === "platform" ? t.btnPlatformDomain : t.btnCustomDomain}
                        </button>
                      ))}
                    </div>
                    {form.domainType === "platform" ? (
                      <select
                        value={verifiedPlatformDomains.includes(form.shieldDomain) ? form.shieldDomain : ""}
                        onChange={(e) => update({ shieldDomain: e.target.value })}
                        disabled={!verifiedPlatformDomains.length}
                        className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors appearance-none"
                      >
                        <option value="" disabled>{verifiedPlatformDomains.length ? t.selectVerifiedPlaceholder : t.noVerifiedPlaceholder}</option>
                        {verifiedPlatformDomains.map((d) => (<option key={d} value={d}>{d}</option>))}
                      </select>
                    ) : (
                      <input
                        value={form.shieldDomain}
                        onChange={(e) => update({ shieldDomain: e.target.value })}
                        placeholder="my-custom-domain.com"
                        className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                      />
                    )}
                  </div>

                  <div className="space-y-4 pt-4 border-t border-[#343947]">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#97a3b6]" />
                      <p className="text-sm font-semibold text-[#e7edf8]">Legacy Payment Display Profile</p>
                    </div>
                    <select
                      value={form.displayProfileId || ""}
                      onChange={(e) => update({ displayProfileId: e.target.value || "" })}
                      className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-4 py-3 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors appearance-none"
                    >
                      <option value="">{t.noneProfile}</option>
                      {displayProfiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.profile_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-[#343947]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#97a3b6]" />
                        <p className="text-sm font-semibold text-[#e7edf8]">{t.legacyMasking || "Legacy Masking"}</p>
                      </div>
                      <button
                        onClick={() => update({ itemMasking: !form.itemMasking })}
                        className={`relative w-12 h-6 rounded-full transition-colors ${form.itemMasking ? "bg-violet-500" : "bg-[#2a2d39] border border-[#343947]"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-foreground shadow transition-all ${form.itemMasking ? "left-6" : "left-0.5"}`} />
                      </button>
                    </div>

                    {form.itemMasking && (
                      <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.labelLegacyProduct || "Legacy Fake Product Name"}</label>
                          <input
                            value={form.fakeProductName}
                            onChange={(e) => update({ fakeProductName: e.target.value })}
                            placeholder="e.g. Digital Service Upgrade"
                            className="w-full bg-[#222530] border border-[#343947] rounded-md px-4 py-3 text-base text-violet-400 placeholder:text-[#97a3b6]/50 focus:outline-none focus:ring-1 focus:ring-violet-400/40 focus:border-violet-400/40 transition-colors"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>
          )}

          {activeTab === "review" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 border border-[#343947] rounded-lg p-5 bg-[#151821]">
                <p className="text-base font-semibold text-[#e7edf8]">{t.reviewAccountDetails}</p>
                <div className="space-y-3">
                  {[
                    { label: t.reviewName, value: form.accountName || "—" },
                    { label: t.reviewEmail, value: form.email || "—" },
                    { label: t.reviewInitialStatus, value: form.status === "Active" ? t.filterActive : form.status === "Warm-up" ? t.filterWarmUp : form.status },
                    { label: t.tabIdentity || "Payment Identity", value: paymentIdentities.find(b => b.id === form.bundleId)?.bundle_name || "None" },
                    { label: t.reviewLimits, value: `$${form.softLimit}${t.softSuffix} / $${form.hardLimit}${t.hardSuffix}` },
                    { label: t.reviewProxy, value: form.proxyUrl ? t.reviewProxyYes : t.reviewProxyNo },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between items-center py-2 border-b border-[#343947]/50 last:border-0">
                      <span className="text-sm text-[#97a3b6]">{s.label}</span>
                      <span className="text-sm font-semibold text-[#e7edf8]">{s.value}</span>
                    </div>
                  ))}
                </div>
                
                <div className="bg-[#2a2d39]/50 rounded-md px-4 py-3 mt-4">
                  <p className="text-sm text-[#aab4c5] leading-6">
                    {t.reviewEncryptedWarning}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col px-6 py-4 border-t border-[#343947] shrink-0 bg-[#1f222c]">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-md transition-all">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-2 rounded-md transition-all">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t.msgCreatedSuccess}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <button onClick={onClose} className="flex-1 px-5 py-2.5 text-sm font-semibold text-[#97a3b6] border border-[#343947] rounded-md hover:bg-[#2a2d39] transition-colors">
              {t.btnCancel}
            </button>
            <button
              onClick={handleAdd}
              disabled={
                !form.accountName ||
                !form.email ||
                !form.clientId ||
                !form.clientSecret ||
                saving || success ||
                (form.domainType === "platform" && !form.shieldDomain)
              }
              className="flex-1 px-5 py-2.5 text-sm font-semibold text-[#151821] bg-[#FFD600] hover:bg-[#e6c100] rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t.btnAdding}</>
              ) : success ? (
                <><Check className="w-4 h-4" /> {t.btnAdded}</>
              ) : (
                t.btnAdd
              )}
            </button>
          </div>
        </div>
      </aside>
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
    displayProfileId: a.displayProfileId ?? null,
    bundleId: a.bundleId ?? null,
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
  const { language } = useLanguage()
  const t = accountsCopy[language]

  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [platformDomains, setPlatformDomains] = useState<string[]>([])
  const [verifiedPlatformDomains, setVerifiedPlatformDomains] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Merchant | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [filterStatus, setFilterStatus] = useState<Status | "All">("All")
  const [displayProfiles, setDisplayProfiles] = useState<PaymentDisplayProfile[]>([])
  const [paymentIdentities, setPaymentIdentities] = useState<PaymentIdentity[]>([])

  const fetchProfiles = useCallback(() => {
    fetch("/api/merchant/display-profiles")
      .then(r => r.json())
      .then(data => {
        setDisplayProfiles(data.profiles ?? [])
      })
      .catch(() => {})
  }, [])

  const fetchPaymentIdentities = useCallback(() => {
    fetch("/api/merchant/payment-identities")
      .then(r => r.json())
      .then(data => {
        setPaymentIdentities(data.bundles ?? [])
      })
      .catch(() => {})
  }, [])

  // Fetch real data from API
  const fetchAccounts = useCallback(() => {
    fetch("/api/merchant/accounts", { cache: "no-store" })
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
  useEffect(() => { fetchProfiles() }, [fetchProfiles])
  useEffect(() => { fetchPaymentIdentities() }, [fetchPaymentIdentities])

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

    // Persist to backend
    const res = await fetch(`/api/merchant/accounts/${updated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.accountName,
        email: updated.email,
        clientId: updated.clientId,
        shieldDomain: updated.shieldDomain,
        displayProfileId: updated.displayProfileId || null,
        bundleId: updated.bundleId || null,
        proxyUrl: updated.proxyUrl,
        status: mapUiStatus(updated.status),
        priority: updated.priority,
        softLimit: updated.softLimit,
        hardLimit: updated.hardLimit,
        itemMasking: updated.itemMasking,
        fakeProductName: updated.fakeProductName,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Unable to save changes. Please try again.")
    }
  }, [])

  const toggleStatus = useCallback(async (id: string, action: "pause" | "resume") => {
    const newStatus = action === "pause" ? "Paused" : "Active"
    setMerchants((prev) =>
      prev.map((m) => m.id === id ? { ...m, status: newStatus as Status } : m)
    )

    try {
      await fetch(`/api/merchant/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action === "pause" ? "PAUSED" : "ACTIVE" }),
      })
    } catch {}
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t.dangerDesc + "\n\nNote: accounts with linked transactions cannot be deleted. Set them to Suspended instead.")) return

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
    <DashboardShell>
      <main data-ui-version="accounts-legacy-deprecation-v1" className="w-full px-6 md:px-8 py-8 space-y-6">
        {/* Page header */}
        <DashboardPageHeader 
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md px-4 py-2 hover:bg-[#2a2d39] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? t.syncing : t.sync}
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#151821] bg-[#FFD600] hover:bg-[#e6c100] rounded-md px-4 py-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addAccount}
              </button>
            </div>
          }
        />

        {/* Summary stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="col-span-2 md:col-span-2 bg-[#222530] border border-[#343947] rounded-lg px-4 py-3 relative overflow-hidden" data-ui-version="grid-background-v1">
            <GridBackground />
            <div className="relative z-10">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.totalVolumeToday}</p>
              <p className="text-xl font-mono font-semibold text-[#e7edf8] mt-1">${totalVolume.toLocaleString()}</p>
              <p className="text-sm text-[#aab4c5] leading-6 mt-1">{activeCount} {t.activeAccounts}</p>
            </div>
          </div>
          {statusCounts.map(({ status, count }) => {
            const cfg = statusConfig[status]
            return (
              <div key={status} className="bg-[#222530] border border-[#343947] rounded-lg px-4 py-3 relative overflow-hidden" data-ui-version="grid-background-v1">
                <GridBackground />
                <div className="relative z-10">
                  <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${cfg.text}`}>
                    {cfg.icon}
                    {status === "Active" ? t.filterActive : status === "Limited" ? t.filterLimited : status === "Warm-up" ? t.filterWarmUp : status === "Paused" ? t.filterPaused : status === "Suspended" ? t.filterSuspended : status}
                  </div>
                  <p className="text-xl font-mono font-semibold text-[#e7edf8] mt-2">{count}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Main content area */}
        <div className="bg-[#222530] border border-[#343947] rounded-lg shadow-sm">
          {/* Tabs */}
          <div className="flex items-center gap-6 px-6 border-b border-[#343947] bg-[#1f222c] rounded-t-lg overflow-x-auto">
            {(["All", "Active", "Limited", "Warm-up", "Paused", "Suspended"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`py-4 text-sm font-semibold uppercase tracking-[0.08em] transition-colors border-b-2 whitespace-nowrap ${
                  filterStatus === s
                    ? "border-[#FFD600] text-[#FFD600]"
                    : "border-transparent text-[#97a3b6] hover:text-[#e7edf8]"
                }`}
              >
                {s === "All" ? t.filterAll : s === "Active" ? t.filterActive : s === "Limited" ? t.filterLimited : s === "Warm-up" ? t.filterWarmUp : s === "Paused" ? t.filterPaused : s === "Suspended" ? t.filterSuspended : s}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  filterStatus === s ? "bg-[#FFD600]/10 text-[#FFD600]" : "bg-[#2a2d39] text-[#97a3b6]"
                }`}>
                  {s === "All" ? merchants.length : merchants.filter((m) => m.status === s).length}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#343947] bg-[#1a1d24]">
                  {[
                    t.thAccountName,
                    t.thShieldDomain,
                    t.thStatus,
                    t.tabIdentity || "Payment Identity",
                    t.thDailyVolume,
                    t.thPriority,
                    t.thTx,
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#b6c2d3] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={`border-b border-[#343947] cursor-pointer transition-colors hover:bg-[#2a2d39] ${
                      selected?.id === m.id ? "bg-[#FFD600]/5 border-l-2 border-l-[#FFD600]" : ""
                    }`}
                  >
                    {/* Account Name */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-[#e7edf8]">{m.accountName}</span>
                        <span className="text-xs text-[#97a3b6]">{m.email}</span>
                      </div>
                    </td>

                    {/* Shield Domain */}
                    <td className="px-6 py-4">
                      <a
                        href={`https://${m.shieldDomain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[#FFD600] hover:text-[#e6c100] transition-colors group max-w-[140px] md:max-w-[180px]" title={m.shieldDomain}
                      >
                        <span className="truncate">{m.shieldDomain}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-70 group-hover:opacity-100 transition-colors" />
                      </a>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <StatusBadge status={m.status} />
                    </td>

                    {/* Payment Identity */}
                    <td className="px-6 py-4">
                      {(() => {
                        const bundle = paymentIdentities.find(b => b.id === m.bundleId)
                        if (!bundle) {
                          return (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 w-fit px-2 py-0.5 rounded border text-[11px] font-mono bg-[#2a2d39] text-[#97a3b6] border-[#343947]">None</span>
                              <div className="flex items-start gap-1 text-[11px] text-amber-400 mt-1 max-w-[180px]">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="leading-tight">No Payment Identity assigned. This account may use legacy checkout identity settings.</span>
                              </div>
                            </div>
                          )
                        }
                        
                        const hasBrand = !!bundle.public_brand_name
                        const hasDomain = !!bundle.primary_shield_domain
                        const hasItems = bundle.active_item_count > 0
                        const hasEmail = !!bundle.support_email
                        const hasPolicies = !!(bundle.shipping_policy_url && bundle.refund_policy_url && bundle.privacy_policy_url && bundle.terms_url)
                        const hasLongDescriptor = !!bundle.has_long_descriptor
                        const isReady = bundle.is_active && hasBrand && hasDomain && hasItems && !hasLongDescriptor && hasEmail && hasPolicies
                        
                        const reasons = []
                        if (!bundle.is_active) reasons.push("Identity is inactive")
                        if (!hasBrand) reasons.push("Missing Public Brand Name")
                        if (!hasDomain) reasons.push("Missing Shield Domain")
                        if (!hasItems) reasons.push("Missing Active Descriptor Item")
                        if (hasLongDescriptor) reasons.push("Descriptor Too Long (>127 chars)")
                        if (!hasEmail) reasons.push("Missing Support Email")
                        if (!hasPolicies) reasons.push("Missing one or more Policy URLs")

                        const hasLegacyMismatch = m.shieldDomain && bundle.primary_shield_domain && m.shieldDomain !== bundle.primary_shield_domain

                        return (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-[#e7edf8]">{bundle.bundle_name}</span>
                            <span className={`inline-flex items-center gap-1.5 w-fit px-1.5 py-0.5 rounded border text-[10px] font-mono ${isReady ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                              {isReady ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {isReady ? "Ready" : "Needs Attention"}
                            </span>
                            
                            {!isReady && reasons.length > 0 && (
                              <div className="flex flex-col gap-0.5 mt-1">
                                {reasons.map((r, idx) => (
                                  <span key={idx} className="text-[11px] text-amber-400 leading-tight">
                                    - {r}
                                  </span>
                                ))}
                              </div>
                            )}

                            {hasLegacyMismatch && (
                              <div className="flex items-start gap-1 text-[11px] text-amber-400 mt-1 max-w-[180px]">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="leading-tight">Legacy domain mismatch (using Identity domain at runtime)</span>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>

                    {/* Volume */}
                    <td className="px-6 py-4 min-w-[220px]">
                      <VolumeBar
                        current={m.currentVolume}
                        soft={m.softLimit}
                        hard={m.hardLimit}
                      />
                    </td>

                    {/* Priority */}
                    <td className="px-6 py-4">
                      <PriorityStars value={m.priority} />
                    </td>

                    {/* Tx Count */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-[#e7edf8]">{m.txCount}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setSelected(m)}
                        className="p-2 text-[#97a3b6] hover:text-[#FFD600] transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-full bg-[#1a1d24] flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-[#343947]" />
              </div>
              <p className="text-lg font-semibold text-[#e7edf8] mb-2">{t.noAccountsFound}</p>
              <p className="text-[#97a3b6] max-w-sm">{t.noAccountsDesc}</p>
            </div>
          )}
        </div>
      </main>


      {/* Slide-over edit panel */}
      <SlideOver
        merchant={selected}
        verifiedPlatformDomains={verifiedPlatformDomains}
        displayProfiles={displayProfiles}
        paymentIdentities={paymentIdentities}
        onClose={() => setSelected(null)}
        onSave={handleSave}
      />

      {/* Add merchant modal */}
      {showAdd && (
        <AddMerchantModal
          verifiedPlatformDomains={verifiedPlatformDomains}
          displayProfiles={displayProfiles}
          paymentIdentities={paymentIdentities}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}
    </DashboardShell>
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


function PaymentDisplayProfileBadge({ profileId, profiles, isActive }: { profileId: string | null, profiles: PaymentDisplayProfile[], isActive: boolean }) {
  const { language } = useLanguage()
  const t = accountsCopy[language]

  if (!profileId) {
    return (
      <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947]">
        <span className="text-xs font-medium text-[#97a3b6]">{t.inheritStoreDefault}</span>
      </div>
    )
  }
  
  const p = profiles.find(x => x.id === profileId)
  
  if (!p) {
    return (
      <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20">
        <span className="text-xs font-medium text-red-400">{t.unknownProfile}</span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-400/10 border border-cyan-400/20" title={p.profile_name}>
      <Package className="w-3.5 h-3.5 text-cyan-400" />
      <span className="truncate max-w-[140px] text-xs font-medium text-cyan-400">{p.profile_name}</span>
    </div>
  )
}
