"use client"

import { useState, useCallback } from "react"
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
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "Active" | "Limited" | "Warm-up" | "Paused"

interface Merchant {
  id: string
  accountName: string
  email: string
  clientId: string
  clientSecret: string
  shieldDomain: string
  status: Status
  priority: number // 1–5
  currentVolume: number
  softLimit: number  // lower bound of adaptive range
  hardLimit: number  // upper bound of adaptive range
  txCount: number
  createdAt: string
  lastActive: string
  successRate: number
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const seedMerchants: Merchant[] = [
  {
    id: "pp-001",
    accountName: "PP-Main-01",
    email: "payments.primary@store.com",
    clientId: "AeBFXkzLmNoPQrStUvWxYz1234567890abcdef",
    clientSecret: "EGfghIjkLMNopQRstUVwxYZ0987654321zyxwv",
    shieldDomain: "chococlose.com",
    status: "Active",
    priority: 5,
    currentVolume: 4250,
    softLimit: 4200,
    hardLimit: 4800,
    txCount: 187,
    createdAt: "2024-01-15",
    lastActive: "2 min ago",
    successRate: 98.4,
  },
  {
    id: "pp-002",
    accountName: "PP-Relay-02",
    email: "gateway.relay@shopify.net",
    clientId: "BcDEFgHiJklMNoPqRsTuVwXy9876543210fedcba",
    clientSecret: "FHijkLmNoOPqRSTuvWXyz1234567890abcdefgh",
    shieldDomain: "safepay-hub.io",
    status: "Limited",
    priority: 4,
    currentVolume: 4780,
    softLimit: 4600,
    hardLimit: 5000,
    txCount: 214,
    createdAt: "2024-02-03",
    lastActive: "8 min ago",
    successRate: 96.1,
  },
  {
    id: "pp-003",
    accountName: "PP-Node-03",
    email: "checkout.node2@retail.co",
    clientId: "CdEFGhIjKlMnOpQrStUvWx1234509876abcdefij",
    clientSecret: "GIjklMnOpPQrSTuvwXYZ0987612345zyxwvuts",
    shieldDomain: "payshield-cdn.com",
    status: "Active",
    priority: 3,
    currentVolume: 1320,
    softLimit: 3000,
    hardLimit: 3500,
    txCount: 58,
    createdAt: "2024-02-18",
    lastActive: "34 min ago",
    successRate: 99.1,
  },
  {
    id: "pp-004",
    accountName: "PP-Backup-04",
    email: "store.relay@commerce.io",
    clientId: "DeEFgHiJKlmnOpqRSTUvwXy5678901234klmnop",
    clientSecret: "HJklmNoPqQRsTuvwXYZ1234509876wvutsrq",
    shieldDomain: "trustedcheck.net",
    status: "Paused",
    priority: 2,
    currentVolume: 0,
    softLimit: 4000,
    hardLimit: 5000,
    txCount: 0,
    createdAt: "2024-03-01",
    lastActive: "3 days ago",
    successRate: 91.5,
  },
  {
    id: "pp-005",
    accountName: "PP-Alt-05",
    email: "alt.paypal@merchant.co",
    clientId: "EfGHIjKlMnOpQrStUvWxYz0987654321mnopqr",
    clientSecret: "IKlmnOpQqRStUvwXYZ9876501234utsrqpon",
    shieldDomain: "relay-secure.org",
    status: "Active",
    priority: 4,
    currentVolume: 2900,
    softLimit: 4000,
    hardLimit: 4500,
    txCount: 113,
    createdAt: "2024-03-10",
    lastActive: "12 min ago",
    successRate: 97.8,
  },
  {
    id: "pp-006",
    accountName: "PP-Overflow-06",
    email: "backup.gateway@pay.net",
    clientId: "FgHIJkLmNoPqRstUVwXyZ1234567890nopqrst",
    clientSecret: "JLmnoOpRrSTuVwxYZ0987623451srqponmlk",
    shieldDomain: "checkout-proxy.com",
    status: "Limited",
    priority: 3,
    currentVolume: 4960,
    softLimit: 4800,
    hardLimit: 5000,
    txCount: 221,
    createdAt: "2024-03-22",
    lastActive: "1 min ago",
    successRate: 94.3,
  },
  {
    id: "pp-007",
    accountName: "PP-Warmup-07",
    email: "new.account@gateway.co",
    clientId: "GhIJKlMnOpQrStUvWxYz9876543210pqrstuv",
    clientSecret: "KMnopPqQrSTuVwXyz1234567890rqponmlkji",
    shieldDomain: "chococlose.com",
    status: "Warm-up",
    priority: 1,
    currentVolume: 320,
    softLimit: 500,
    hardLimit: 800,
    txCount: 14,
    createdAt: "2024-04-01",
    lastActive: "2 hours ago",
    successRate: 100,
  },
]

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

function VolumeBar({ current, soft, hard }: { current: number; soft: number; hard: number }) {
  const pct = Math.min((current / hard) * 100, 100)
  const softPct = Math.min((soft / hard) * 100, 100)
  const color =
    pct >= 98 ? "bg-red-500" :
    pct >= 90 ? "bg-amber-400" :
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
  onClose: () => void
  onSave: (updated: Merchant) => void
}

function SlideOver({ merchant, onClose, onSave }: SlideOverProps) {
  const [draft, setDraft] = useState<Merchant | null>(merchant)

  // sync when a new merchant is opened
  if (draft?.id !== merchant?.id && merchant !== null) {
    setDraft(merchant)
  }

  if (!merchant || !draft) return null

  const cfg = statusConfig[draft.status]
  const statuses: Status[] = ["Active", "Limited", "Warm-up", "Paused"]

  const update = (patch: Partial<Merchant>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const handleSave = () => {
    if (draft) onSave(draft)
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
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Shield Domain
            </label>
            <input
              value={draft.shieldDomain}
              onChange={(e) => update({ shieldDomain: e.target.value })}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            />
          </div>

          {/* Credentials */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">API Credentials</p>
            <MaskedField value={draft.clientId} label="Client ID" />
            <MaskedField value={draft.clientSecret} label="Client Secret" />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {statuses.map((s) => {
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
            className="flex-1 px-4 py-2 text-xs font-mono text-background bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors font-semibold"
          >
            Save Changes
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Add Merchant Modal ───────────────────────────────────────────────────────

function AddMerchantModal({ onClose, onAdd }: { onClose: () => void; onAdd: (m: Merchant) => void }) {
  const [form, setForm] = useState({
    accountName: "",
    email: "",
    clientId: "",
    clientSecret: "",
    shieldDomain: "",
    softLimit: 4000,
    hardLimit: 5000,
  })

  const update = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }))

  const handleAdd = () => {
    if (!form.accountName || !form.email) return
    const newMerchant: Merchant = {
      id: `pp-${Date.now()}`,
      accountName: form.accountName,
      email: form.email,
      clientId: form.clientId || "pending-configuration",
      clientSecret: form.clientSecret || "pending-configuration",
      shieldDomain: form.shieldDomain || "unassigned.com",
      status: "Warm-up",
      priority: 1,
      currentVolume: 0,
      softLimit: form.softLimit,
      hardLimit: form.hardLimit,
      txCount: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      lastActive: "never",
      successRate: 0,
    }
    onAdd(newMerchant)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold font-mono text-foreground">Add Merchant Account</h3>
            <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Account Name", key: "accountName", placeholder: "PP-Main-01" },
              { label: "PayPal Email", key: "email", placeholder: "payments@store.com" },
              { label: "Client ID", key: "clientId", placeholder: "AeBFXk..." },
              { label: "Client Secret", key: "clientSecret", placeholder: "EGfghI..." },
              { label: "Shield Domain", key: "shieldDomain", placeholder: "chococlose.com" },
            ].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{f.label}</label>
                <input
                  value={form[f.key as keyof typeof form].toString()}
                  onChange={(e) => update({ [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Soft Limit ($)", key: "softLimit" },
                { label: "Hard Limit ($)", key: "hardLimit" },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{f.label}</label>
                  <input
                    type="number"
                    value={form[f.key as keyof typeof form]}
                    onChange={(e) => update({ [f.key]: Number(e.target.value) })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 px-5 py-4 border-t border-border">
            <button onClick={onClose} className="flex-1 px-4 py-2 text-xs font-mono text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!form.accountName || !form.email}
              className="flex-1 px-4 py-2 text-xs font-mono text-background bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors font-semibold"
            >
              Add Account
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>(seedMerchants)
  const [selected, setSelected] = useState<Merchant | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<Status | "All">("All")

  const filtered = filterStatus === "All"
    ? merchants
    : merchants.filter((m) => m.status === filterStatus)

  const handleSave = (updated: Merchant) => {
    setMerchants((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    setSelected(null)
  }

  const toggleStatus = (id: string, action: "pause" | "resume") => {
    setMerchants((prev) =>
      prev.map((m) => m.id === id ? { ...m, status: action === "pause" ? "Paused" : "Active" } : m)
    )
    setOpenMenu(null)
  }

  const handleAdd = (m: Merchant) => {
    setMerchants((prev) => [...prev, m])
  }

  const statusCounts = (["Active", "Limited", "Warm-up", "Paused"] as Status[]).map((s) => ({
    status: s,
    count: merchants.filter((m) => m.status === s).length,
  }))

  const totalVolume = merchants.reduce((sum, m) => sum + m.currentVolume, 0)
  const activeCount = merchants.filter((m) => m.status === "Active").length

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
            <button className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-secondary transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Sync
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
              {(["All", "Active", "Limited", "Warm-up", "Paused"] as const).map((s) => (
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

                    {/* Volume */}
                    <td className="px-4 py-3 min-w-[220px]">
                      <VolumeBar
                        current={m.currentVolume}
                        soft={m.softLimit}
                        hard={m.hardLimit}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                        className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenu === m.id && (
                        <div className="absolute right-2 top-10 z-20 bg-popover border border-border rounded-lg shadow-xl text-xs font-mono min-w-[160px] py-1">
                          <button
                            onClick={() => { setSelected(m); setOpenMenu(null) }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary text-foreground transition-colors"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                            Edit Details
                          </button>
                          {m.status !== "Paused" ? (
                            <button
                              onClick={() => toggleStatus(m.id, "pause")}
                              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary text-amber-400 transition-colors"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              Pause Account
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleStatus(m.id, "resume")}
                              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary text-emerald-400 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Resume Account
                            </button>
                          )}
                          <div className="border-t border-border my-1" />
                          <button className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                      )}
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
        onClose={() => setSelected(null)}
        onSave={handleSave}
      />

      {/* Add merchant modal */}
      {showAdd && (
        <AddMerchantModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />
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
