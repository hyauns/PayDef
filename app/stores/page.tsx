"use client"

import { useState, useCallback, useId } from "react"
import {
  Plus,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  X,
  Store as StoreIcon,
  ExternalLink,
  ChevronRight,
  Webhook,
  Key,
  MoreHorizontal,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Zap,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ────────────────────────────────────────────────────────────────────

type StoreStatus = "Active" | "Suspended" | "Trial"

interface Store {
  id: string          // UUID
  name: string
  platform: string
  apiKey: string      // sk_live_...
  webhookUrl: string
  totalProcessed: number
  txCount: number
  status: StoreStatus
  enabled: boolean
  createdAt: string
  lastPing: string
  successRate: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function genApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  return (
    "sk_live_" +
    Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  )
}

function maskKey(key: string): string {
  return key.slice(0, 12) + "•".repeat(18) + key.slice(-4)
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const initialStores: Store[] = [
  {
    id: "f7a3c1d2-4e5b-4f60-8a91-bc2de3f40152",
    name: "Tire Shop Pro",
    platform: "Shopify",
    apiKey: "sk_live_TiReShOpPrO9XaBcDeFgHiJkLmNoPqRsTuVwXy",
    webhookUrl: "https://tireshoppro.com/webhooks/gateway",
    totalProcessed: 214800.0,
    txCount: 1872,
    status: "Active",
    enabled: true,
    createdAt: "2024-01-08",
    lastPing: "2 min ago",
    successRate: 98.7,
  },
  {
    id: "a1b2c3d4-5e6f-7890-abcd-ef1234567890",
    name: "NovaBoutique",
    platform: "Shopify",
    apiKey: "sk_live_N0vAb0uTiQuE9XzYwVuTsRqPoNmLkJiHgFeDc",
    webhookUrl: "https://novaboutique.store/wh/payment",
    totalProcessed: 128450.0,
    txCount: 1024,
    status: "Active",
    enabled: true,
    createdAt: "2024-01-15",
    lastPing: "7 min ago",
    successRate: 97.2,
  },
  {
    id: "b2c3d4e5-6f70-8901-bcde-f12345678901",
    name: "TechGadget Store",
    platform: "WooCommerce",
    apiKey: "sk_live_TeCHgAdGeT5t0rE3ZxYwVuTsRqPoNmLkJiHg",
    webhookUrl: "https://techgadgetstore.net/wc-api/gateway",
    totalProcessed: 84200.5,
    txCount: 673,
    status: "Active",
    enabled: true,
    createdAt: "2024-02-03",
    lastPing: "23 min ago",
    successRate: 96.1,
  },
  {
    id: "c3d4e5f6-7081-9012-cdef-123456789012",
    name: "OrganicKitchen",
    platform: "Squarespace",
    apiKey: "sk_live_0rGaNiCkItCheN3AbCdEfGhIjKlMnOpQrStUv",
    webhookUrl: "https://organickitchen.co/webhooks/pay",
    totalProcessed: 12800.0,
    txCount: 94,
    status: "Trial",
    enabled: true,
    createdAt: "2024-03-10",
    lastPing: "1 hr ago",
    successRate: 94.7,
  },
  {
    id: "d4e5f6a7-8192-0123-defa-234567890123",
    name: "SportswearPro",
    platform: "Shopify",
    apiKey: "sk_live_SpOrTsWeArPrO7XxWwVvUuTtSsRrQqPpOoNn",
    webhookUrl: "https://sportswearpro.shop/hooks/gw",
    totalProcessed: 47300.0,
    txCount: 389,
    status: "Suspended",
    enabled: false,
    createdAt: "2024-01-22",
    lastPing: "3 days ago",
    successRate: 88.3,
  },
  {
    id: "e5f6a7b8-9203-1234-efab-345678901234",
    name: "LuxeWatches",
    platform: "Custom API",
    apiKey: "sk_live_LuXeWaTcHeS9ZzYyXxWwVvUuTtSsRrQqPpOo",
    webhookUrl: "https://api.luxewatches.com/gateway/webhook",
    totalProcessed: 315000.0,
    txCount: 2841,
    status: "Active",
    enabled: true,
    createdAt: "2023-11-05",
    lastPing: "just now",
    successRate: 99.1,
  },
  {
    id: "f6a7b8c9-0314-2345-fabc-456789012345",
    name: "HomeDecorHub",
    platform: "BigCommerce",
    apiKey: "sk_live_H0m3DeCOrHuB5NmLkJiHgFeDcBaZyXwVuTs",
    webhookUrl: "https://homedecorhub.com/api/payment-hook",
    totalProcessed: 63150.75,
    txCount: 502,
    status: "Active",
    enabled: true,
    createdAt: "2024-02-28",
    lastPing: "15 min ago",
    successRate: 97.8,
  },
]

// ─── Status config ─────────────────────────────────────────────────────────────

const statusConfig: Record<StoreStatus, {
  text: string; bg: string; dot: string; border: string; icon: React.ReactNode
}> = {
  Active: {
    text: "text-emerald-400",
    bg: "bg-emerald-400/10",
    dot: "bg-emerald-400",
    border: "border-emerald-400/20",
    icon: <ShieldCheck className="w-3 h-3" />,
  },
  Trial: {
    text: "text-sky-400",
    bg: "bg-sky-400/10",
    dot: "bg-sky-400",
    border: "border-sky-400/20",
    icon: <Clock className="w-3 h-3" />,
  },
  Suspended: {
    text: "text-red-400",
    bg: "bg-red-400/10",
    dot: "bg-red-400",
    border: "border-red-500/20",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        enabled ? "bg-emerald-500" : "bg-secondary border border-border"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  )
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StoreStatus }) {
  const cfg = statusConfig[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === "Active" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  )
}

// ─── Masked API Key cell ───────────────────────────────────────────────────────

function ApiKeyCell({
  apiKey,
  onRegenerate,
}: {
  apiKey: string
  onRegenerate: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenConfirm, setRegenConfirm] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [apiKey])

  const handleRegen = useCallback(() => {
    if (regenConfirm) {
      onRegenerate()
      setRegenConfirm(false)
      setRevealed(false)
    } else {
      setRegenConfirm(true)
      setTimeout(() => setRegenConfirm(false), 3000)
    }
  }, [regenConfirm, onRegenerate])

  return (
    <div className="flex items-center gap-1.5 min-w-[260px]">
      <code className="font-mono text-[11px] text-cyan-400 flex-1 truncate max-w-[180px]">
        {revealed ? apiKey : maskKey(apiKey)}
      </code>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => setRevealed((v) => !v)}
          title={revealed ? "Hide key" : "Reveal key"}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleCopy}
          title="Copy key"
          className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={handleRegen}
          title={regenConfirm ? "Click again to confirm" : "Regenerate key"}
          className={`p-1 transition-colors rounded ${
            regenConfirm
              ? "text-amber-400 hover:text-amber-300"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenConfirm ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  )
}

// ─── Webhook URL Cell ──────────────────────────────────────────────────────────

function WebhookCell({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = useCallback(() => {
    onChange(draft.trim())
    setEditing(false)
  }, [draft, onChange])

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[260px]">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") { setDraft(value); setEditing(false) }
          }}
          className="flex-1 bg-background border border-cyan-400/40 rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none min-w-0"
        />
        <button
          onClick={commit}
          className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { setDraft(value); setEditing(false) }}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors group min-w-[220px] text-left truncate max-w-[280px]"
      title={value}
    >
      <Webhook className="w-3.5 h-3.5 shrink-0 text-border group-hover:text-cyan-400/60 transition-colors" />
      <span className="truncate">{value || "—"}</span>
    </button>
  )
}

// ─── Create Store Modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  onCreate: (store: Store) => void
}

function CreateStoreModal({ onClose, onCreate }: CreateModalProps) {
  const formId = useId()
  const [name, setName] = useState("")
  const [platform, setPlatform] = useState("Shopify")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [generated, setGenerated] = useState<{ id: string; key: string } | null>(null)
  const [copied, setCopied] = useState<"id" | "key" | null>(null)

  const platforms = ["Shopify", "WooCommerce", "BigCommerce", "Squarespace", "Custom API", "Magento"]

  const handleGenerate = useCallback(() => {
    setGenerated({ id: genUUID(), key: genApiKey() })
  }, [])

  const handleCopy = useCallback((val: string, field: "id" | "key") => {
    navigator.clipboard.writeText(val)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const handleCreate = useCallback(() => {
    if (!name.trim() || !generated) return
    const newStore: Store = {
      id: generated.id,
      name: name.trim(),
      platform,
      apiKey: generated.key,
      webhookUrl: webhookUrl.trim(),
      totalProcessed: 0,
      txCount: 0,
      status: "Trial",
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      lastPing: "Never",
      successRate: 0,
    }
    onCreate(newStore)
    onClose()
  }, [name, platform, webhookUrl, generated, onCreate, onClose])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-card border border-border rounded-lg w-full max-w-[520px] shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-cyan-400/10 border border-cyan-400/30 rounded-md flex items-center justify-center">
                <StoreIcon className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold font-mono text-foreground">Create New Store</h2>
                <p className="text-[11px] font-mono text-muted-foreground">Generate credentials for a new client</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Store Name */}
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-name`} className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Store Name
              </label>
              <input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tire Shop Pro"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
              />
            </div>

            {/* Platform */}
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-platform`} className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Platform
              </label>
              <select
                id={`${formId}-platform`}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-webhook`} className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Webhook URL <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <input
                id={`${formId}-webhook`}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://yourstore.com/webhooks/gateway"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
              />
            </div>

            {/* Generate credentials */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Credentials</p>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  {generated ? "Regenerate" : "Generate Pair"}
                </button>
              </div>

              {generated ? (
                <div className="bg-background border border-border rounded-md p-3 space-y-2.5">
                  {/* Store ID */}
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Store ID</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-foreground flex-1 truncate">{generated.id}</code>
                      <button
                        onClick={() => handleCopy(generated.id, "id")}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {copied === "id" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {/* API Key */}
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">API Key</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-cyan-400 flex-1 truncate">{generated.key}</code>
                      <button
                        onClick={() => handleCopy(generated.key, "key")}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {copied === "key" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-amber-400/80">
                    Copy the API key now — it will be masked after creation.
                  </p>
                </div>
              ) : (
                <div className="bg-secondary/40 border border-dashed border-border rounded-md px-4 py-5 text-center">
                  <Key className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs font-mono text-muted-foreground">
                    Click &quot;Generate Pair&quot; to create a Store ID and API Key
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs font-mono text-muted-foreground border border-border rounded-md hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || !generated}
              className="flex-1 px-4 py-2 text-xs font-mono text-background bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Store
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Edit Slide-over ──────────────────────────────────────────────────────────

interface SlideOverProps {
  store: Store | null
  onClose: () => void
  onSave: (updated: Store) => void
  onDelete: (id: string) => void
}

function EditSlideOver({ store, onClose, onSave, onDelete }: SlideOverProps) {
  const [draft, setDraft] = useState<Store | null>(store)

  // Sync when a different store is opened
  if (draft?.id !== store?.id && store !== null) {
    setDraft(store)
  }

  if (!store || !draft) return null

  const update = (patch: Partial<Store>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const handleSave = () => {
    if (draft) onSave(draft)
    onClose()
  }

  const statuses: StoreStatus[] = ["Active", "Trial", "Suspended"]

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[500px] bg-card border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[11px] font-mono text-muted-foreground">Editing Store</p>
              <h2 className="text-sm font-semibold font-mono text-foreground">{draft.name}</h2>
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
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Volume", value: `$${(draft.totalProcessed / 1000).toFixed(1)}k` },
              { label: "Transactions", value: draft.txCount.toLocaleString() },
              { label: "Success Rate", value: `${draft.successRate}%` },
            ].map((s) => (
              <div key={s.label} className="bg-background border border-border rounded-md px-3 py-2.5 text-center">
                <p className="font-mono text-sm font-semibold text-foreground">{s.value}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Store Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Store Name</label>
            <input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            />
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Platform</label>
            <select
              value={draft.platform}
              onChange={(e) => update({ platform: e.target.value })}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
            >
              {["Shopify", "WooCommerce", "BigCommerce", "Squarespace", "Custom API", "Magento"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Webhook URL</label>
            <div className="flex items-center gap-2">
              <input
                value={draft.webhookUrl}
                onChange={(e) => update({ webhookUrl: e.target.value })}
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
              />
              {draft.webhookUrl && (
                <a
                  href={draft.webhookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* API Key (read-only in panel, managed via table) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">API Key</label>
            <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2">
              <code className="flex-1 font-mono text-[11px] text-cyan-400 truncate">{maskKey(draft.apiKey)}</code>
              <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">Use the Regenerate button in the table to rotate this key.</p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {statuses.map((s) => {
                const c = statusConfig[s]
                const active = draft.status === s
                return (
                  <button
                    key={s}
                    onClick={() => update({ status: s, enabled: s !== "Suspended" })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-mono transition-colors ${
                      active
                        ? `${c.bg} ${c.text} ${c.border}`
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? c.dot : "bg-border"}`} />
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Gateway Access toggle */}
          <div className="flex items-center justify-between border border-border rounded-md px-4 py-3 bg-background">
            <div>
              <p className="text-xs font-mono font-medium text-foreground">Gateway Access</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {draft.enabled ? "Store can route payments through the gateway" : "Store is blocked from the gateway"}
              </p>
            </div>
            <ToggleSwitch enabled={draft.enabled} onChange={(v) => update({ enabled: v })} />
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background border border-border rounded-md px-3 py-2.5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Created</p>
              <p className="text-xs font-mono text-foreground">{draft.createdAt}</p>
            </div>
            <div className="bg-background border border-border rounded-md px-3 py-2.5">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Last Ping</p>
              <p className="text-xs font-mono text-foreground">{draft.lastPing}</p>
            </div>
          </div>

          {/* Danger zone */}
          <div className="border border-red-500/20 rounded-lg p-4 space-y-2 bg-red-500/5">
            <p className="text-[10px] font-mono text-red-400 uppercase tracking-wider font-semibold">Danger Zone</p>
            <p className="text-[11px] font-mono text-muted-foreground">
              Permanently removes this store and invalidates all API credentials. This cannot be undone.
            </p>
            <button
              onClick={() => { onDelete(draft.id); onClose() }}
              className="flex items-center gap-2 text-xs font-mono text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-md px-3 py-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Store
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border shrink-0">
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

// ─── Row context menu ─────────────────────────────────────────────────────────

function RowMenu({
  store,
  onEdit,
  onToggle,
  onDelete,
}: {
  store: Store
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-card border border-border rounded-md shadow-xl z-20 overflow-hidden">
            {[
              { label: "Edit Details", icon: <ChevronRight className="w-3.5 h-3.5" />, action: onEdit },
              {
                label: store.enabled ? "Disable Access" : "Enable Access",
                icon: store.enabled ? <AlertTriangle className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />,
                action: onToggle,
              },
              { label: "Delete Store", icon: <Trash2 className="w-3.5 h-3.5" />, action: onDelete, danger: true },
            ].map((item) => (
              <button
                key={item.label}
                onClick={(e) => { e.stopPropagation(); item.action(); setOpen(false) }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs font-mono transition-colors ${
                  item.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>(initialStores)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<StoreStatus | "All">("All")

  const totalVolume = stores.reduce((sum, s) => sum + s.totalProcessed, 0)
  const activeCount = stores.filter((s) => s.status === "Active").length
  const trialCount = stores.filter((s) => s.status === "Trial").length
  const suspendedCount = stores.filter((s) => s.status === "Suspended").length

  const filtered = filter === "All" ? stores : stores.filter((s) => s.status === filter)

  const handleSave = useCallback((updated: Store) => {
    setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }, [])

  const handleCreate = useCallback((store: Store) => {
    setStores((prev) => [store, ...prev])
  }, [])

  const handleDelete = useCallback((id: string) => {
    setStores((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handleToggle = useCallback((id: string) => {
    setStores((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled, status: !s.enabled ? "Active" : "Suspended" } : s
      )
    )
  }, [])

  const handleRegen = useCallback((id: string) => {
    setStores((prev) =>
      prev.map((s) => (s.id === id ? { ...s, apiKey: genApiKey() } : s))
    )
  }, [])

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold font-mono text-foreground">Client Store Management</h1>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              Manage API access, webhooks, and routing permissions for connected stores.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-xs font-mono font-semibold text-background bg-cyan-400 hover:bg-cyan-300 transition-colors rounded-md px-3.5 py-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Create New Store
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Total Connected Stores",
              value: stores.length.toString(),
              sub: `${activeCount} active`,
              accent: "text-foreground",
              border: "border-border",
            },
            {
              label: "Total Processed",
              value: `$${(totalVolume / 1000).toFixed(1)}k`,
              sub: "across all stores",
              accent: "text-cyan-400",
              border: "border-cyan-400/20",
            },
            {
              label: "Active Stores",
              value: activeCount.toString(),
              sub: `${trialCount} on trial`,
              accent: "text-emerald-400",
              border: "border-emerald-400/20",
            },
            {
              label: "Suspended",
              value: suspendedCount.toString(),
              sub: "access revoked",
              accent: "text-red-400",
              border: "border-red-500/20",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`bg-card border ${card.border} rounded-lg px-4 py-3.5`}
            >
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">{card.label}</p>
              <p className={`text-2xl font-mono font-bold ${card.accent}`}>{card.value}</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">

          {/* Table toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-4">
            <div className="flex items-center gap-1">
              {(["All", "Active", "Trial", "Suspended"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                    filter === f
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {f}
                  {f !== "All" && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {stores.filter((s) => s.status === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs font-mono text-muted-foreground">
              {filtered.length} store{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "Store",
                    "Store ID",
                    "API Key",
                    "Webhook URL",
                    "Volume",
                    "Status",
                    "Access",
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
                {filtered.map((store, i) => (
                  <tr
                    key={store.id}
                    onClick={() => setSelectedStore(store)}
                    className={`border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors ${
                      !store.enabled ? "opacity-60" : ""
                    } ${i % 2 !== 0 ? "bg-secondary/10" : ""}`}
                  >
                    {/* Store Name */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-secondary border border-border rounded-md flex items-center justify-center shrink-0">
                          <StoreIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold font-mono text-foreground">{store.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{store.platform}</p>
                        </div>
                      </div>
                    </td>

                    {/* Store ID */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-[11px] text-muted-foreground truncate max-w-[120px]" title={store.id}>
                          {store.id.slice(0, 8)}…
                        </code>
                        <CopyButton value={store.id} />
                      </div>
                    </td>

                    {/* API Key */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <ApiKeyCell
                        apiKey={store.apiKey}
                        onRegenerate={() => handleRegen(store.id)}
                      />
                    </td>

                    {/* Webhook URL */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <WebhookCell
                        value={store.webhookUrl}
                        onChange={(url) =>
                          setStores((prev) =>
                            prev.map((s) => (s.id === store.id ? { ...s, webhookUrl: url } : s))
                          )
                        }
                      />
                    </td>

                    {/* Volume */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <p className="font-mono text-xs font-semibold text-foreground">
                          ${store.totalProcessed.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {store.txCount.toLocaleString()} txns
                        </p>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={store.status} />
                    </td>

                    {/* Toggle */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch
                          enabled={store.enabled}
                          onChange={() => handleToggle(store.id)}
                        />
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {store.enabled ? "On" : "Off"}
                        </span>
                      </div>
                    </td>

                    {/* Context menu */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        store={store}
                        onEdit={() => setSelectedStore(store)}
                        onToggle={() => handleToggle(store.id)}
                        onDelete={() => handleDelete(store.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <StoreIcon className="w-8 h-8 text-border mx-auto mb-3" />
                <p className="text-sm font-mono text-muted-foreground">No stores match this filter.</p>
              </div>
            )}
          </div>

          {/* Table footer */}
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
            <p className="text-[10px] font-mono text-muted-foreground">
              Showing {filtered.length} of {stores.length} stores
            </p>
            <p className="text-[10px] font-mono text-muted-foreground">
              Last updated: just now
            </p>
          </div>
        </div>

      </main>

      {/* Modals */}
      {showCreate && (
        <CreateStoreModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
      <EditSlideOver
        store={selectedStore}
        onClose={() => setSelectedStore(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}

// ─── Tiny inline copy button ──────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded shrink-0"
      title="Copy full ID"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}
