"use client"

import Link from "next/link"
import { useState, useCallback, useId, useEffect } from "react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { storesCopy } from "@/lib/i18n/stores"
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
  Loader2,
} from "lucide-react"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { GridBackground } from "@/components/ui/grid-background"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// ─── Types ────────────────────────────────────────────────────────────────────

type StoreStatus = "Active" | "Suspended" | "Trial"
type CheckoutFlow = "REDIRECT" | "POPUP_BRIDGE"
type ProviderType = "PAYPAL" | "CUSTOM_MOCK" | "STRIPE" | "SHOPIFY"
type CopyField = "id" | "key" | "secret" | "checkout" | "webhookUrl"

const CHECKOUT_FLOW_OPTIONS: { value: CheckoutFlow; label: string; desc: string }[] = [
  {
    value: "REDIRECT",
    label: "Classic Redirect",
    desc: "Buyer leaves the storefront and completes approval on PayPal in the same tab.",
  },
  {
    value: "POPUP_BRIDGE",
    label: "Popup + Shield Bridge",
    desc: "Buyer approves in a popup while the shield domain handles the return and cancel flow.",
  },
]

const STORE_WEBHOOK_EVENTS = [
  "payment.authorization.created",
  "payment.capture.completed",
  "payment.capture.denied",
  "payment.capture.refunded",
  "payment.dispute.created",
]

const PROVIDER_OPTIONS: Array<{
  value: ProviderType
  label: string
  description: string
}> = [
  {
    value: "PAYPAL",
    label: "PayPal (Default)",
    description: "Includes item masking and account rotation for the current production flow.",
  },
  {
    value: "CUSTOM_MOCK",
    label: "Custom Mock",
    description: "Local testing mode for direct mock charges and webhook validation.",
  },
  {
    value: "STRIPE",
    label: "Stripe",
    description: "Placeholder for future direct-card orchestration.",
  },
  {
    value: "SHOPIFY",
    label: "Shopify Payment",
    description: "Redirects the buyer to your Shopify checkout (Shopify Payments + Shop Pay) via a Draft Order invoice.",
  },
]

/** Display name for a provider in the selector (keeps the dropdown labels short). */
function providerOptionLabel(value: ProviderType): string {
  if (value === "PAYPAL") return "PayPal"
  if (value === "STRIPE") return "Stripe"
  if (value === "SHOPIFY") return "Shopify Payment"
  return "Custom Mock"
}

interface Store {
  id: string          // UUID
  name: string
  providerType: ProviderType
  platform: string
  apiKey: string      // sk_live_...
  webhookUrl: string
  shieldDomain: string
  hasWebhookSecret: boolean
  totalProcessed: number
  txCount: number
  status: StoreStatus
  enabled: boolean
  createdAt: string
  lastPing: string
  successRate: number
  checkoutFlow: CheckoutFlow
  checkoutFlowOverride: boolean
  successReturnUrl: string
  cancelReturnUrl: string
  // Stripe connection status (read-only, from the API)
  hasStripeSecret?: boolean
  hasStripeWebhookSecret?: boolean
  stripePublishableKey?: string | null
  // Transient, write-only inputs for Stripe credentials (never returned by the API)
  stripePublishableKeyInput?: string
  stripeSecretKeyInput?: string
  stripeWebhookSecretInput?: string
  // Shopify connection status (read-only, from the API)
  shopifyStoreDomain?: string | null
  hasShopifyAccessToken?: boolean
  hasShopifyWebhookSecret?: boolean
  shopifyItemLabel?: string | null
  // Transient, write-only inputs for Shopify credentials (never returned by the API)
  shopifyStoreDomainInput?: string
  shopifyAccessTokenInput?: string
  shopifyWebhookSecretInput?: string
  shopifyItemLabelInput?: string
}

interface StoreApiRow {
  id: string
  name: string
  providerType?: ProviderType | null
  platform?: string | null
  status?: StoreStatus | null
  webhookUrl?: string | null
  shieldDomain?: string | null
  hasWebhookSecret?: boolean | null
  totalVolume?: number | null
  transactionCount?: number | null
  isActive?: boolean | null
  createdAt: string
  updatedAt?: string | null
  completedCount?: number | null
  checkoutFlow?: CheckoutFlow | null
  checkoutFlowOverride?: boolean | null
  successReturnUrl?: string | null
  cancelReturnUrl?: string | null
  hasStripeSecret?: boolean | null
  hasStripeWebhookSecret?: boolean | null
  stripePublishableKey?: string | null
  shopifyStoreDomain?: string | null
  hasShopifyAccessToken?: boolean | null
  hasShopifyWebhookSecret?: boolean | null
  shopifyItemLabel?: string | null
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed"
}

type ShieldDomainRow = {
  domain: string
  isActive: boolean
  vercel?: {
    bridgeOk?: boolean
  } | null
}

type ShieldDomainsApiResponse = {
  domains?: ShieldDomainRow[]
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error("Server returned an invalid JSON response.")
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (key.length < 16) return "sk_live_••••••••••••••••"
  return key.slice(0, 12) + "•".repeat(18) + key.slice(-4)
}

function canRevealApiKey(key: string): boolean {
  return /^(sk|gw)_live_[A-Za-z0-9_-]{16,}$/.test(key)
}

function getGatewayBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? ""
}

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
        enabled ? "bg-emerald-500" : "bg-[#2a2d39] border border-[#343947]"
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
      className={`inline-flex items-center gap-1.5 text-sm font-mono px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
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
  const { language } = useLanguage()
  const t = storesCopy[language]

  const [revealed, setRevealed] = useState(() => canRevealApiKey(apiKey))
  const [copied, setCopied] = useState(false)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const hasLiveKey = canRevealApiKey(apiKey)

  const handleCopy = useCallback(() => {
    if (!hasLiveKey) return
    void navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [apiKey, hasLiveKey])

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
    <div className="flex items-center gap-1.5 min-w-[300px]">
      <code className="font-mono text-sm text-[#FFD600] flex-1 truncate max-w-[220px]">
        {hasLiveKey ? (revealed ? apiKey : maskKey(apiKey)) : t.regenToReveal}
      </code>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => hasLiveKey && setRevealed((v) => !v)}
          title={hasLiveKey ? (revealed ? t.tooltipHide : t.tooltipReveal) : t.tooltipCannotReveal}
          disabled={!hasLiveKey}
          className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleCopy}
          title={hasLiveKey ? t.tooltipCopy : t.tooltipCannotCopy}
          disabled={!hasLiveKey}
          className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={handleRegen}
          title={regenConfirm ? t.tooltipConfirmRegen : t.tooltipRegen}
          className={`p-1 transition-colors rounded ${
            regenConfirm
              ? "text-amber-400 hover:text-amber-300"
              : "text-[#97a3b6] hover:text-[#e7edf8]"
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
      <div className="flex items-center gap-1 min-w-[300px]">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") { setDraft(value); setEditing(false) }
          }}
          className="flex-1 bg-[#1a1d24] border border-[#FFD600]/40 rounded px-2 py-1 text-xs font-mono text-[#e7edf8] focus:outline-none min-w-0"
        />
        <button
          onClick={commit}
          className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { setDraft(value); setEditing(false) }}
          className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 font-mono text-sm text-[#97a3b6] hover:text-[#e7edf8] transition-colors group min-w-[220px] text-left truncate max-w-[280px]"
      title={value}
    >
      <Webhook className="w-3.5 h-3.5 shrink-0 text-[#343947] group-hover:text-[#FFD600]/60 transition-colors" />
      <span className="truncate">{value || "—"}</span>
    </button>
  )
}

function IntegrationField({
  label,
  value,
  copyKey,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copyKey: CopyField
  copied: CopyField | null
  onCopy: (value: string, field: CopyField) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs text-[#e7edf8] flex-1 truncate">{value}</code>
        <button
          onClick={() => onCopy(value, copyKey)}
          className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors shrink-0"
        >
          {copied === copyKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

function IntegrationSummary({
  store,
  copied,
  onCopy,
  onRegenerateWebhookSecret,
  revealedWebhookSecret,
  webhookBusy = false,
}: {
  store: Store
  copied: CopyField | null
  onCopy: (value: string, field: CopyField) => void
  onRegenerateWebhookSecret: () => Promise<void> | void
  revealedWebhookSecret?: string | null
  webhookBusy?: boolean
}) {
  const { language } = useLanguage()
  const t = storesCopy[language]

  const gatewayBaseUrl = getGatewayBaseUrl()
  const checkoutEndpoint = `${gatewayBaseUrl}/api/gateway/checkout`

  return (
    <div className="space-y-3 border border-[#343947] rounded-lg p-4 bg-[#1a1d24]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.integration}</p>
          <p className="text-sm font-mono text-[#97a3b6] mt-1">
            {t.integrationDesc}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border ${
          store.hasWebhookSecret
            ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
            : "bg-amber-400/10 text-amber-400 border-amber-400/20"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${store.hasWebhookSecret ? "bg-emerald-400" : "bg-amber-400"}`} />
          {store.hasWebhookSecret ? t.webhookSigned : t.secretMissing}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <IntegrationField
          label={t.endpointCheckout}
          value={checkoutEndpoint}
          copyKey="checkout"
          copied={copied}
          onCopy={onCopy}
        />
        <IntegrationField
          label={t.endpointWebhook}
          value={store.webhookUrl || t.setWebhookUrlFirst}
          copyKey="webhookUrl"
          copied={copied}
          onCopy={onCopy}
        />
        {store.shieldDomain && (
          <IntegrationField
            label={t.assignedShield}
            value={store.shieldDomain}
            copyKey="webhookUrl"
            copied={copied}
            onCopy={onCopy}
          />
        )}
        {store.successReturnUrl && (
          <IntegrationField
            label={t.labelSuccessReturn}
            value={store.successReturnUrl}
            copyKey="webhookUrl"
            copied={copied}
            onCopy={onCopy}
          />
        )}
        {store.cancelReturnUrl && (
          <IntegrationField
            label={t.labelCancelReturn}
            value={store.cancelReturnUrl}
            copyKey="webhookUrl"
            copied={copied}
            onCopy={onCopy}
          />
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href="/docs/shield-domain"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-[#343947] text-[#e7edf8] hover:bg-[#2a2d39] transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t.btnShieldGuide}
        </Link>
        <Link
          href="/docs/api"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-[#FFD600]/30 text-[#FFD600] hover:bg-[#FFD600]/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t.btnOpenApiDocs}
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-[#343947] bg-[#2a2d39]/30 px-3 py-2">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.webhookSecret}</p>
          <p className="text-sm font-mono text-[#97a3b6] mt-1">
            {t.webhookSecretDesc}
          </p>
        </div>
        <button
          onClick={() => void onRegenerateWebhookSecret()}
          disabled={webhookBusy}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-[#FFD600]/30 text-[#FFD600] hover:bg-[#FFD600]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {webhookBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {store.hasWebhookSecret ? t.btnRegenerate : t.btnGenerate}
        </button>
      </div>

      {revealedWebhookSecret && (
        <IntegrationField
          label={t.latestSecret}
          value={revealedWebhookSecret}
          copyKey="secret"
          copied={copied}
          onCopy={onCopy}
        />
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.webhookEvents}</p>
        <div className="flex flex-wrap gap-2">
          {STORE_WEBHOOK_EVENTS.map((eventName) => (
            <span
              key={eventName}
              className="inline-flex items-center rounded-full border border-[#343947] bg-[#2a2d39]/40 px-2 py-1 text-xs font-mono text-[#e7edf8]"
            >
              {eventName}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Create Store Modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  onCreate: (store: Store) => void
}

function CreateStoreModal({ onClose, onCreate }: CreateModalProps) {
  const { language } = useLanguage()
  const t = storesCopy[language]

  const formId = useId()
  const [name, setName] = useState("")
  const [platform, setPlatform] = useState("Shopify")
  const [providerType, setProviderType] = useState<ProviderType>("PAYPAL")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [stripePublishableKey, setStripePublishableKey] = useState("")
  const [stripeSecretKey, setStripeSecretKey] = useState("")
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("")
  const [shopifyStoreDomain, setShopifyStoreDomain] = useState("")
  const [shopifyAccessToken, setShopifyAccessToken] = useState("")
  const [shopifyWebhookSecret, setShopifyWebhookSecret] = useState("")
  const [shopifyItemLabel, setShopifyItemLabel] = useState("")
  const [generated, setGenerated] = useState<{ id: string; key: string; secret: string } | null>(null)
  const [copied, setCopied] = useState<CopyField | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const platforms = ["Shopify", "WooCommerce", "BigCommerce", "Squarespace", "Custom API", "Magento"]

  const handleCopy = useCallback((val: string, field: CopyField) => {
    navigator.clipboard.writeText(val)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return
    setSaving(true)
    setError("")

    try {
      const res = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          platform,
          providerType,
          webhookUrl: webhookUrl.trim() || undefined,
          ...(providerType === "STRIPE"
            ? {
                stripePublishableKey: stripePublishableKey.trim() || undefined,
                stripeSecretKey: stripeSecretKey.trim() || undefined,
                stripeWebhookSecret: stripeWebhookSecret.trim() || undefined,
              }
            : {}),
          ...(providerType === "SHOPIFY"
            ? {
                shopifyStoreDomain: shopifyStoreDomain.trim() || undefined,
                shopifyAccessToken: shopifyAccessToken.trim() || undefined,
                shopifyWebhookSecret: shopifyWebhookSecret.trim() || undefined,
                shopifyItemLabel: shopifyItemLabel.trim() || undefined,
              }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create store")

      // Backend returns the plaintext API key ONCE
      const newStore: Store = {
        id: data.store.id,
        name: data.store.name,
        providerType: data.store.providerType ?? providerType,
        platform: data.store.platform ?? platform,
        apiKey: data.apiKey,
        webhookUrl: data.store.webhookUrl ?? "",
        shieldDomain: data.store.shieldDomain ?? "",
        hasWebhookSecret: data.store.hasWebhookSecret ?? true,
        totalProcessed: 0,
        txCount: 0,
        status: data.store.status ?? "Trial",
        enabled: data.store.isActive ?? true,
        createdAt: new Date(data.store.createdAt).toISOString().slice(0, 10),
        lastPing: "Never",
        successRate: 0,
        checkoutFlow: data.store.checkoutFlow ?? "REDIRECT",
        checkoutFlowOverride: data.store.checkoutFlowOverride ?? false,
        successReturnUrl: data.store.successReturnUrl ?? "",
        cancelReturnUrl: data.store.cancelReturnUrl ?? "",
        hasStripeSecret: data.store.hasStripeSecret ?? false,
        hasStripeWebhookSecret: data.store.hasStripeWebhookSecret ?? false,
        stripePublishableKey: data.store.stripePublishableKey ?? null,
        shopifyStoreDomain: data.store.shopifyStoreDomain ?? null,
        hasShopifyAccessToken: data.store.hasShopifyAccessToken ?? false,
        hasShopifyWebhookSecret: data.store.hasShopifyWebhookSecret ?? false,
        shopifyItemLabel: data.store.shopifyItemLabel ?? null,
      }

      // Show the real credentials
      setGenerated({ id: data.store.id, key: data.apiKey, secret: data.webhookSecret })
      onCreate(newStore)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [name, platform, providerType, webhookUrl, stripePublishableKey, stripeSecretKey, stripeWebhookSecret, shopifyStoreDomain, shopifyAccessToken, shopifyWebhookSecret, shopifyItemLabel, onCreate])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-[#151821] border border-[#343947] rounded-lg w-full max-w-[800px] w-[92vw] shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#343947]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-[#FFD600]/10 border border-[#FFD600]/30 rounded-md flex items-center justify-center">
                <StoreIcon className="w-3.5 h-3.5 text-[#FFD600]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold font-mono text-[#e7edf8]">{t.modalCreateTitle}</h2>
                <p className="text-sm font-mono text-[#97a3b6]">{t.modalCreateDesc}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Store Name */}
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-name`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">
                {t.labelStoreName}
              </label>
              <input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tire Shop Pro"
                className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              />
            </div>

            {/* Platform */}
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-platform`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">
                {t.labelPlatform}
              </label>
              <select
                id={`${formId}-platform`}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${formId}-provider`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">
                {t.labelProvider}
              </label>
              <select
                id={`${formId}-provider`}
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as ProviderType)}
                className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {providerOptionLabel(option.value)}
                  </option>
                ))}
              </select>
              <p className="text-xs font-mono text-[#97a3b6]">
                {providerType === "PAYPAL"
                  ? t.providerPaypal
                  : providerType === "STRIPE"
                  ? t.providerStripe
                  : providerType === "SHOPIFY"
                  ? t.providerShopify
                  : t.providerCustomMock}
              </p>
            </div>

            {/* Stripe credentials — only when provider = STRIPE (entered by the merchant) */}
            {providerType === "STRIPE" && (
              <div className="space-y-3 rounded-md border border-[#635bff]/30 bg-[#635bff]/5 p-3">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.stripeSectionTitle}</p>
                  <p className="text-xs font-mono text-[#97a3b6] mt-1">{t.stripeSectionDesc}</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-stripe-pk`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelStripePublishable}
                  </label>
                  <input
                    id={`${formId}-stripe-pk`}
                    value={stripePublishableKey}
                    onChange={(e) => setStripePublishableKey(e.target.value)}
                    placeholder="pk_live_..."
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-stripe-sk`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelStripeSecret}
                  </label>
                  <input
                    id={`${formId}-stripe-sk`}
                    type="password"
                    value={stripeSecretKey}
                    onChange={(e) => setStripeSecretKey(e.target.value)}
                    placeholder="sk_live_..."
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-stripe-whsec`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelStripeWebhookSecret}
                  </label>
                  <input
                    id={`${formId}-stripe-whsec`}
                    type="password"
                    value={stripeWebhookSecret}
                    onChange={(e) => setStripeWebhookSecret(e.target.value)}
                    placeholder="whsec_..."
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                  <p className="text-xs font-mono text-[#97a3b6]">{t.stripeWebhookHint}</p>
                </div>
              </div>
            )}

            {/* Shopify credentials — only when provider = SHOPIFY (entered by the merchant) */}
            {providerType === "SHOPIFY" && (
              <div className="space-y-3 rounded-md border border-[#008060]/40 bg-[#008060]/5 p-3">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.shopifySectionTitle}</p>
                  <p className="text-xs font-mono text-[#97a3b6] mt-1">{t.shopifySectionDesc}</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-shopify-domain`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelShopifyDomain}
                  </label>
                  <input
                    id={`${formId}-shopify-domain`}
                    value={shopifyStoreDomain}
                    onChange={(e) => setShopifyStoreDomain(e.target.value)}
                    placeholder="your-store.myshopify.com"
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-shopify-token`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelShopifyAccessToken}
                  </label>
                  <input
                    id={`${formId}-shopify-token`}
                    type="password"
                    value={shopifyAccessToken}
                    onChange={(e) => setShopifyAccessToken(e.target.value)}
                    placeholder="shpat_..."
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-shopify-whsec`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelShopifyWebhookSecret}
                  </label>
                  <input
                    id={`${formId}-shopify-whsec`}
                    type="password"
                    value={shopifyWebhookSecret}
                    onChange={(e) => setShopifyWebhookSecret(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                  <p className="text-xs font-mono text-[#97a3b6]">{t.shopifyWebhookHint}</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-shopify-label`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">
                    {t.labelShopifyItemLabel}
                  </label>
                  <input
                    id={`${formId}-shopify-label`}
                    value={shopifyItemLabel}
                    onChange={(e) => setShopifyItemLabel(e.target.value)}
                    placeholder="Marine Supplies, Boat Parts, Dock Gear"
                    autoComplete="off"
                    className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                  />
                  <p className="text-xs font-mono text-[#97a3b6]">{t.shopifyItemLabelHint}</p>
                </div>
              </div>
            )}

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-webhook`} className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">
                {t.labelWebhookUrl} <span className="text-[#97a3b6]/50">{t.optional}</span>
              </label>
              <input
                id={`${formId}-webhook`}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://yourstore.com/webhooks/gateway"
                className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              />
            </div>

            {/* Credentials info */}
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.modalCredentials}</p>

              {error && (
                <div className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-md px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              {generated && generated.id !== "(auto-generated)" ? (
                <div className="bg-[#1a1d24] border border-emerald-400/20 rounded-md p-3 space-y-2.5">
                  {/* Store ID */}
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1">{t.thStoreID}</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-[#e7edf8] flex-1 truncate">{generated.id}</code>
                      <button
                        onClick={() => handleCopy(generated.id, "id")}
                        className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors shrink-0"
                      >
                        {copied === "id" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {/* API Key */}
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1">{t.labelApiKey}</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-[#FFD600] flex-1 truncate">{generated.key}</code>
                      <button
                        onClick={() => handleCopy(generated.key, "key")}
                        className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors shrink-0"
                      >
                        {copied === "key" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1">{t.webhookSecret}</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-amber-400 flex-1 truncate">{generated.secret}</code>
                      <button
                        onClick={() => handleCopy(generated.secret, "secret")}
                        className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors shrink-0"
                      >
                        {copied === "secret" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <IntegrationField
                    label={t.endpointCheckout}
                    value={`${getGatewayBaseUrl()}/api/gateway/checkout`}
                    copyKey="checkout"
                    copied={copied}
                    onCopy={handleCopy}
                  />
                  <p className="text-xs font-mono text-amber-400/80">
                    {t.warningCopyNow}
                  </p>
                </div>
              ) : (
                <div className="bg-[#2a2d39]/40 border border-dashed border-[#343947] rounded-md px-4 py-5 text-center">
                  <Key className="w-5 h-5 text-[#97a3b6] mx-auto mb-2" />
                  <p className="text-xs font-mono text-[#97a3b6]">
                    {t.placeholderAutoGenerate}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-[#343947]">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs font-mono text-[#97a3b6] border border-[#343947] rounded-md hover:bg-[#2a2d39] transition-colors"
            >
              {t.btnCancel}
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving || (generated !== null && generated.id !== "(auto-generated)")}
              className="flex-1 px-4 py-2 text-xs font-mono text-background bg-[#FFD600] hover:bg-[#e6c100] rounded-md transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {generated && generated.id !== "(auto-generated)" ? t.btnDoneClose : saving ? t.btnCreating : t.btnCreateStoreAction}
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
  readyShieldDomains: string[]
  onClose: () => void
  onSave: (updated: Store) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRegenerateWebhookSecret: (storeId: string) => Promise<string>
}

function EditSlideOver({ store, readyShieldDomains, onClose, onSave, onDelete, onRegenerateWebhookSecret }: SlideOverProps) {
  const { language } = useLanguage()
  const t = storesCopy[language]

  const [draft, setDraft] = useState<Store | null>(store)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [copied, setCopied] = useState<CopyField | null>(null)
  const [error, setError] = useState("")
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null)

  // Sync when a different store is opened
  if (draft?.id !== store?.id && store !== null) {
    setDraft(store)
    setRevealedWebhookSecret(null)
  }

  if (!store || !draft) return null

  const selectableShieldDomains =
    draft.shieldDomain && !readyShieldDomains.includes(draft.shieldDomain)
      ? [draft.shieldDomain, ...readyShieldDomains]
      : readyShieldDomains

  const update = (patch: Partial<Store>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    setError("")
    try {
      await onSave(draft)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = (value: string, field: CopyField) => {
    navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleRegenerateWebhookSecret = async () => {
    if (!draft) return

    setWebhookBusy(true)
    setError("")

    try {
      const secret = await onRegenerateWebhookSecret(draft.id)
      update({ hasWebhookSecret: true })
      setRevealedWebhookSecret(secret)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWebhookBusy(false)
    }
  }

  const statuses: StoreStatus[] = ["Active", "Trial", "Suspended"]

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[800px] xl:max-w-[900px] bg-[#222530] bg-[#151821] border-l border-[#343947] z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#343947] shrink-0">
          <div className="flex items-center gap-3">
            <ChevronRight className="w-4 h-4 text-[#97a3b6]" />
            <div>
              <p className="text-sm font-mono text-[#97a3b6]">{t.slideEditingStore}</p>
              <h2 className="text-sm font-semibold font-mono text-[#e7edf8]">{draft.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 text-xs font-mono text-red-400 bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t.statVolume, value: `$${(draft.totalProcessed / 1000).toFixed(1)}k` },
              { label: t.statTransactions, value: draft.txCount.toLocaleString() },
              { label: t.statSuccessRate, value: `${draft.successRate}%` },
            ].map((s) => (
              <div key={s.label} className="bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-center">
                <p className="font-mono text-sm font-semibold text-[#e7edf8]">{s.value}</p>
                <p className="font-mono text-xs text-[#97a3b6] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Store Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelStoreName}</label>
            <input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
            />
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelPlatform}</label>
            <select
              value={draft.platform}
              onChange={(e) => update({ platform: e.target.value })}
              className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
            >
              {["Shopify", "WooCommerce", "BigCommerce", "Squarespace", "Custom API", "Magento"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelProvider}</label>
            <select
              value={draft.providerType}
              onChange={(e) => update({ providerType: e.target.value as ProviderType })}
              className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {providerOptionLabel(option.value)}
                </option>
              ))}
            </select>
            <p className="text-xs font-mono text-[#97a3b6]">
              {draft.providerType === "PAYPAL"
                ? t.providerPaypal
                : draft.providerType === "STRIPE"
                ? t.providerStripe
                : draft.providerType === "SHOPIFY"
                ? t.providerShopify
                : t.providerCustomMock}
            </p>
          </div>

          {/* Stripe credentials — only when provider = STRIPE (entered by the merchant) */}
          {draft.providerType === "STRIPE" && (
            <div className="space-y-3 rounded-md border border-[#635bff]/30 bg-[#635bff]/5 p-3">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.stripeSectionTitle}</p>
                <p className="text-xs font-mono text-[#97a3b6] mt-1">{t.stripeSectionDesc}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelStripePublishable}</label>
                <input
                  value={draft.stripePublishableKeyInput ?? ""}
                  onChange={(e) => update({ stripePublishableKeyInput: e.target.value })}
                  placeholder="pk_live_..."
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelStripeSecret}</label>
                <input
                  type="password"
                  value={draft.stripeSecretKeyInput ?? ""}
                  onChange={(e) => update({ stripeSecretKeyInput: e.target.value })}
                  placeholder={`sk_live_...  •  ${t.stripeKeepBlank}`}
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelStripeWebhookSecret}</label>
                <input
                  type="password"
                  value={draft.stripeWebhookSecretInput ?? ""}
                  onChange={(e) => update({ stripeWebhookSecretInput: e.target.value })}
                  placeholder={`whsec_...  •  ${t.stripeKeepBlank}`}
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
                <p className="text-xs font-mono text-[#97a3b6]">{t.stripeWebhookHint}</p>
              </div>
              {/* Per-store Stripe webhook endpoint the merchant must register in Stripe */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.stripeWebhookEndpointLabel}</label>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-[#e7edf8] flex-1 truncate bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2">
                    {`${getGatewayBaseUrl()}/api/webhook/stripe/${draft.id}`}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${getGatewayBaseUrl()}/api/webhook/stripe/${draft.id}`, "webhookUrl")}
                    className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors shrink-0"
                  >
                    {copied === "webhookUrl" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Shopify credentials — only when provider = SHOPIFY (entered by the merchant) */}
          {draft.providerType === "SHOPIFY" && (
            <div className="space-y-3 rounded-md border border-[#008060]/40 bg-[#008060]/5 p-3">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.shopifySectionTitle}</p>
                <p className="text-xs font-mono text-[#97a3b6] mt-1">{t.shopifySectionDesc}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelShopifyDomain}</label>
                <input
                  value={draft.shopifyStoreDomainInput ?? draft.shopifyStoreDomain ?? ""}
                  onChange={(e) => update({ shopifyStoreDomainInput: e.target.value })}
                  placeholder="your-store.myshopify.com"
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelShopifyAccessToken}</label>
                <input
                  type="password"
                  value={draft.shopifyAccessTokenInput ?? ""}
                  onChange={(e) => update({ shopifyAccessTokenInput: e.target.value })}
                  placeholder={`shpat_...  •  ${t.stripeKeepBlank}`}
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelShopifyWebhookSecret}</label>
                <input
                  type="password"
                  value={draft.shopifyWebhookSecretInput ?? ""}
                  onChange={(e) => update({ shopifyWebhookSecretInput: e.target.value })}
                  placeholder={`••••••••  •  ${t.stripeKeepBlank}`}
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
                <p className="text-xs font-mono text-[#97a3b6]">{t.shopifyWebhookHint}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.labelShopifyItemLabel}</label>
                <input
                  value={draft.shopifyItemLabelInput ?? draft.shopifyItemLabel ?? ""}
                  onChange={(e) => update({ shopifyItemLabelInput: e.target.value })}
                  placeholder="Marine Supplies, Boat Parts, Dock Gear"
                  autoComplete="off"
                  className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] placeholder:text-[#97a3b6]/40 focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
                />
                <p className="text-xs font-mono text-[#97a3b6]">{t.shopifyItemLabelHint}</p>
              </div>
              {/* Per-store Shopify webhook endpoint the merchant must register in Shopify */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase">{t.shopifyWebhookEndpointLabel}</label>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-[#e7edf8] flex-1 truncate bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2">
                    {`${getGatewayBaseUrl()}/api/webhook/shopify/${draft.id}`}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${getGatewayBaseUrl()}/api/webhook/shopify/${draft.id}`, "webhookUrl")}
                    className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors shrink-0"
                  >
                    {copied === "webhookUrl" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelWebhookUrl}</label>
            <div className="flex items-center gap-2">
              <input
                value={draft.webhookUrl}
                onChange={(e) => update({ webhookUrl: e.target.value })}
                className="flex-1 bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              />
              {draft.webhookUrl && (
                <a
                  href={draft.webhookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelShieldDomain}</label>
            <select
              value={draft.shieldDomain}
              onChange={(e) => update({ shieldDomain: e.target.value })}
              className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
            >
              <option value="">{t.noShieldDomain}</option>
              {selectableShieldDomains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                  {domain === draft.shieldDomain && !readyShieldDomains.includes(domain) ? t.shieldDomainWarning : ""}
                </option>
              ))}
            </select>
            <p className="text-xs font-mono text-[#97a3b6]">
              {t.shieldDomainDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelSuccessReturn}</label>
              <input
                value={draft.successReturnUrl}
                onChange={(e) => update({ successReturnUrl: e.target.value })}
                placeholder="https://merchant-store.com/checkout/success"
                className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              />
              <p className="text-xs font-mono text-[#97a3b6]">
                {t.successReturnDesc}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelCancelReturn}</label>
              <input
                value={draft.cancelReturnUrl}
                onChange={(e) => update({ cancelReturnUrl: e.target.value })}
                placeholder="https://merchant-store.com/checkout/cancel"
                className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2 text-sm font-mono text-[#e7edf8] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
              />
              <p className="text-xs font-mono text-[#97a3b6]">
                {t.cancelReturnDesc}
              </p>
            </div>
          </div>

          {/* API Key (read-only in panel, managed via table) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelApiKey}</label>
            <div className="flex items-center gap-2 bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2">
              <code className="flex-1 font-mono text-sm text-[#FFD600] truncate">{maskKey(draft.apiKey)}</code>
              <Key className="w-3.5 h-3.5 text-[#97a3b6] shrink-0" />
            </div>
            <p className="text-xs font-mono text-[#97a3b6]">{t.regenApiKeyDesc}</p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelStatus}</label>
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
                        : "bg-[#1a1d24] border-[#343947] text-[#97a3b6] hover:text-[#e7edf8]"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? c.dot : "bg-border"}`} />
                    {s === "Active" ? t.filterActive : s === "Trial" ? t.filterTrial : t.filterSuspended}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Gateway Access toggle */}
          <div className="flex items-center justify-between border border-[#343947] rounded-md px-4 py-3 bg-[#1a1d24]">
            <div>
              <p className="text-xs font-mono font-medium text-[#e7edf8]">{t.labelGatewayAccess}</p>
              <p className="text-sm font-mono text-[#97a3b6] mt-0.5">
                {draft.enabled ? t.gatewayEnabled : t.gatewayDisabled}
              </p>
            </div>
            <ToggleSwitch enabled={draft.enabled} onChange={(v) => update({ enabled: v })} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider">{t.labelCheckoutExp}</label>
            <div className="grid grid-cols-1 gap-2">
              {CHECKOUT_FLOW_OPTIONS.map((option) => {
                const active = draft.checkoutFlow === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => update({ checkoutFlow: option.value, checkoutFlowOverride: true })}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      active
                        ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                        : "border-[#343947] bg-[#1a1d24] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full border-2 flex-shrink-0 ${active ? "border-[#FFD600] bg-[#FFD600]" : "border-[#97a3b6]"}`} />
                      <span className="text-xs font-mono font-semibold">{option.value === "REDIRECT" ? t.classicRedirectLabel : t.popupBridgeLabel}</span>
                    </div>
                    <p className="text-xs font-mono leading-relaxed pl-4">{option.value === "REDIRECT" ? t.classicRedirectDesc : t.popupBridgeDesc}</p>
                  </button>
                )
              })}
            </div>
            <p className="text-xs font-mono text-[#97a3b6]">
              {t.checkoutExpDesc}
            </p>
            {draft.checkoutFlow === "POPUP_BRIDGE" && !draft.successReturnUrl && !draft.cancelReturnUrl && (
              <p className="text-xs font-mono text-amber-400">
                {t.checkoutExpWarning}
              </p>
            )}
          </div>

          <IntegrationSummary
            store={draft}
            copied={copied}
            onCopy={handleCopy}
            onRegenerateWebhookSecret={handleRegenerateWebhookSecret}
            revealedWebhookSecret={revealedWebhookSecret}
            webhookBusy={webhookBusy}
          />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5">
              <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1">{t.labelCreated}</p>
              <p className="text-xs font-mono text-[#e7edf8]">{draft.createdAt}</p>
            </div>
            <div className="bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5">
              <p className="text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1">{t.labelLastPing}</p>
              <p className="text-xs font-mono text-[#e7edf8]">{draft.lastPing}</p>
            </div>
          </div>

          {/* Danger zone */}
          <div className="border border-red-500/20 rounded-lg p-4 space-y-2 bg-red-500/5">
            <p className="text-xs font-mono text-red-400 uppercase tracking-wider font-semibold">{t.dangerZone}</p>
            <p className="text-sm font-mono text-[#97a3b6]">
              {t.dangerDesc}
            </p>
            <button
              onClick={async () => {
                setDeleting(true)
                setError("")
                try {
                  await onDelete(draft.id)
                  onClose()
                } catch (err) {
                  setError(getErrorMessage(err))
                } finally {
                  setDeleting(false)
                }
              }}
              disabled={deleting}
              className="flex items-center gap-2 text-xs font-mono text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-md px-3 py-1.5 transition-colors"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {deleting ? t.btnDeleting : t.btnDeleteStore}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[#343947] shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-xs font-mono text-[#97a3b6] border border-[#343947] rounded-md hover:bg-[#2a2d39] transition-colors"
          >
            {t.btnCancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 text-xs font-mono text-background bg-[#FFD600] hover:bg-[#e6c100] rounded-md transition-colors font-semibold"
          >
            {saving ? t.btnSaving : t.btnSaveChanges}
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
  onToggle: () => void | Promise<void>
  onDelete: () => void | Promise<void>
}) {
  const { language } = useLanguage()
  const t = storesCopy[language]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors data-[state=open]:bg-[#2a2d39]"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 font-mono z-50">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit() }}>
          <ChevronRight className="w-3.5 h-3.5 mr-2" />
          {t.menuEdit}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void onToggle() }}>
          {store.enabled ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 mr-2" />
              {t.menuDisable}
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 mr-2" />
              {t.menuEnable}
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-400 focus:text-red-500 focus:bg-red-500/10"
          onClick={(e) => { e.stopPropagation(); void onDelete() }}
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          {t.menuDelete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const { language } = useLanguage()
  const t = storesCopy[language]

  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<StoreStatus | "All">("All")
  const [readyShieldDomains, setReadyShieldDomains] = useState<string[]>([])

  // Fetch real store data from API
  useEffect(() => {
    fetch("/api/merchant/stores")
      .then(r => r.json())
      .then(data => {
        setStores(
          ((data.stores ?? []) as StoreApiRow[]).map((s) => {
            const transactionCount = s.transactionCount ?? 0
            const completedCount = s.completedCount ?? 0
            const isActive = s.isActive ?? true

            return {
              id: s.id,
              name: s.name,
              providerType: s.providerType ?? "PAYPAL",
              platform: s.platform ?? "Custom API",
              apiKey: "sk_live_••••••••••••••••",
              webhookUrl: s.webhookUrl ?? "",
              shieldDomain: s.shieldDomain ?? "",
              hasWebhookSecret: s.hasWebhookSecret ?? false,
              totalProcessed: s.totalVolume ?? 0,
              txCount: transactionCount,
              status: s.status ?? (!isActive ? "Suspended" : (transactionCount === 0 ? "Trial" : "Active") as StoreStatus),
              enabled: isActive,
              createdAt: new Date(s.createdAt).toISOString().slice(0, 10),
              lastPing: s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—",
              successRate: transactionCount > 0 ? Math.round((completedCount / transactionCount) * 1000) / 10 : 0,
              checkoutFlow: s.checkoutFlow ?? "REDIRECT",
              checkoutFlowOverride: s.checkoutFlowOverride ?? false,
              successReturnUrl: s.successReturnUrl ?? "",
              cancelReturnUrl: s.cancelReturnUrl ?? "",
              hasStripeSecret: s.hasStripeSecret ?? false,
              hasStripeWebhookSecret: s.hasStripeWebhookSecret ?? false,
              stripePublishableKey: s.stripePublishableKey ?? null,
              shopifyStoreDomain: s.shopifyStoreDomain ?? null,
              hasShopifyAccessToken: s.hasShopifyAccessToken ?? false,
              hasShopifyWebhookSecret: s.hasShopifyWebhookSecret ?? false,
              shopifyItemLabel: s.shopifyItemLabel ?? null,
            }
          })
        )
      })
      .catch(() => {})

    fetch("/api/merchant/shield-domains", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ShieldDomainsApiResponse) => {
        const nextDomains = (data.domains ?? [])
          .filter((domain) => domain.isActive && domain.vercel?.bridgeOk)
          .map((domain) => domain.domain)
          .sort((left, right) => left.localeCompare(right))
        setReadyShieldDomains(nextDomains)
      })
      .catch(() => {
        setReadyShieldDomains([])
      })
  }, [])

  const totalVolume = stores.reduce((sum, s) => sum + s.totalProcessed, 0)
  const activeCount = stores.filter((s) => s.status === "Active").length
  const trialCount = stores.filter((s) => s.status === "Trial").length
  const suspendedCount = stores.filter((s) => s.status === "Suspended").length

  const filtered = filter === "All" ? stores : stores.filter((s) => s.status === filter)

  const handleSave = useCallback(async (updated: Store) => {
    const res = await fetch(`/api/merchant/stores/${updated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.name,
        providerType: updated.providerType,
        platform: updated.platform,
        status: updated.status,
        webhookUrl: updated.webhookUrl,
        shieldDomain: updated.shieldDomain || null,
        isActive: updated.enabled,
        checkoutFlow: updated.checkoutFlow,
        successReturnUrl: updated.successReturnUrl,
        cancelReturnUrl: updated.cancelReturnUrl,
        ...(updated.providerType === "STRIPE"
          ? {
              stripePublishableKey: updated.stripePublishableKeyInput?.trim() || undefined,
              stripeSecretKey: updated.stripeSecretKeyInput?.trim() || undefined,
              stripeWebhookSecret: updated.stripeWebhookSecretInput?.trim() || undefined,
            }
          : {}),
        ...(updated.providerType === "SHOPIFY"
          ? {
              shopifyStoreDomain: updated.shopifyStoreDomainInput?.trim() || undefined,
              shopifyAccessToken: updated.shopifyAccessTokenInput?.trim() || undefined,
              shopifyWebhookSecret: updated.shopifyWebhookSecretInput?.trim() || undefined,
              shopifyItemLabel: updated.shopifyItemLabelInput?.trim() || undefined,
            }
          : {}),
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to save store")
    }

    setStores((prev) =>
      prev.map((s) =>
        s.id === updated.id
          ? {
              ...s,
              ...updated,
              name: data.store.name,
              providerType: data.store.providerType ?? updated.providerType,
              platform: data.store.platform ?? updated.platform,
              webhookUrl: data.store.webhookUrl ?? "",
              shieldDomain: data.store.shieldDomain ?? updated.shieldDomain,
              hasWebhookSecret: data.store.hasWebhookSecret ?? updated.hasWebhookSecret,
              enabled: data.store.isActive ?? updated.enabled,
              checkoutFlow: data.store.checkoutFlow ?? updated.checkoutFlow,
              checkoutFlowOverride: data.store.checkoutFlowOverride ?? updated.checkoutFlowOverride,
              successReturnUrl: data.store.successReturnUrl ?? updated.successReturnUrl,
              cancelReturnUrl: data.store.cancelReturnUrl ?? updated.cancelReturnUrl,
              lastPing: data.store.updatedAt ? new Date(data.store.updatedAt).toLocaleString() : updated.lastPing,
              status: data.store.status ?? (!(data.store.isActive ?? updated.enabled)
                ? "Suspended"
                : ((updated.txCount === 0 ? "Trial" : "Active") as StoreStatus)),
              // Reflect newly-entered Stripe keys in the connection status
              hasStripeSecret: updated.stripeSecretKeyInput?.trim() ? true : s.hasStripeSecret,
              hasStripeWebhookSecret: updated.stripeWebhookSecretInput?.trim() ? true : s.hasStripeWebhookSecret,
              stripePublishableKey: updated.stripePublishableKeyInput?.trim() || s.stripePublishableKey,
              // Clear write-only Stripe inputs so they never persist in client state
              stripePublishableKeyInput: undefined,
              stripeSecretKeyInput: undefined,
              stripeWebhookSecretInput: undefined,
              // Reflect newly-entered Shopify creds in the connection status
              shopifyStoreDomain: updated.shopifyStoreDomainInput?.trim() || s.shopifyStoreDomain,
              hasShopifyAccessToken: updated.shopifyAccessTokenInput?.trim() ? true : s.hasShopifyAccessToken,
              hasShopifyWebhookSecret: updated.shopifyWebhookSecretInput?.trim() ? true : s.hasShopifyWebhookSecret,
              shopifyItemLabel: updated.shopifyItemLabelInput?.trim() || s.shopifyItemLabel,
              // Clear write-only Shopify inputs so they never persist in client state
              shopifyStoreDomainInput: undefined,
              shopifyAccessTokenInput: undefined,
              shopifyWebhookSecretInput: undefined,
              shopifyItemLabelInput: undefined,
            }
          : s
      )
    )
  }, [])

  const handleCreate = useCallback((store: Store) => {
    setStores((prev) => [store, ...prev])
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/merchant/stores/${id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to delete store")
    }
    setStores((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handleToggle = useCallback(async (id: string) => {
    const current = stores.find((s) => s.id === id)
    if (!current) return

    const res = await fetch(`/api/merchant/stores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current.enabled }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error ?? "Failed to update store access")
      return
    }

    setStores((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              enabled: data.store.isActive ?? !current.enabled,
              status: data.store.status ?? (data.store.isActive
                ? ((s.txCount === 0 ? "Trial" : "Active") as StoreStatus)
                : ("Suspended" as StoreStatus)),
              lastPing: data.store.updatedAt ? new Date(data.store.updatedAt).toLocaleString() : s.lastPing,
            }
          : s
      )
    )
  }, [stores])

  const handleRegen = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/merchant/stores/regenerate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: id }),
      })
      const data = await readJsonSafely<{ error?: string; apiKey?: string; storeName?: string }>(res)
      if (!res.ok || !data?.apiKey || !data.storeName) { alert(data?.error ?? "Failed to regenerate key"); return }
      const nextApiKey = data.apiKey
      // Once-time display: show the new key in the table
      setStores((prev) =>
        prev.map((s) => (s.id === id ? { ...s, apiKey: nextApiKey } : s))
      )
    } catch (error) {
      alert(getErrorMessage(error))
    }
  }, [])

  const handleRegenerateWebhookSecret = useCallback(async (id: string) => {
    const res = await fetch("/api/merchant/stores/regenerate-webhook-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: id }),
    })

    const data = await readJsonSafely<{ error?: string; webhookSecret?: string }>(res)
    if (!res.ok || !data?.webhookSecret) {
      throw new Error(data?.error ?? "Failed to regenerate webhook secret")
    }

    setStores((prev) =>
      prev.map((store) => (store.id === id ? { ...store, hasWebhookSecret: true } : store))
    )

    return data.webhookSecret
  }, [])

  return (
    <DashboardShell data-ui-version="stores-i18n-vi-phase7">
      <main className="w-full px-6 md:px-8 py-8 space-y-5 w-full">

        {/* Page header */}
        <DashboardPageHeader
  title={t.title}
  description={t.description}
  eyebrow={t.eyebrow}
  action={
    <button
      onClick={() => setShowCreate(true)}
      className="flex items-center gap-2 text-sm font-semibold text-[#151821] bg-[#FFD600] hover:bg-[#e6c100] transition-colors rounded-md px-4 py-2.5"
    >
      <Plus className="w-4 h-4" />
      {t.btnCreateStore}
    </button>
  }
/>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: t.statTotalStores,
              value: stores.length.toString(),
              sub: `${activeCount} ${t.statActive}`,
              accent: "text-[#e7edf8]",
              border: "border-[#343947]",
            },
            {
              label: t.statTotalProcessed,
              value: `$${(totalVolume / 1000).toFixed(1)}k`,
              sub: t.statAcrossStores,
              accent: "text-[#FFD600]",
              border: "border-[#FFD600]/20",
            },
            {
              label: t.statActiveStores,
              value: activeCount.toString(),
              sub: `${trialCount} ${t.statOnTrial}`,
              accent: "text-emerald-400",
              border: "border-emerald-400/20",
            },
            {
              label: t.statSuspended,
              value: suspendedCount.toString(),
              sub: t.statAccessRevoked,
              accent: "text-red-400",
              border: "border-red-500/20",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`bg-[#151821] border ${card.border} rounded-lg px-4 py-3.5 relative overflow-hidden`} data-ui-version="grid-background-v1"
            >
              <GridBackground />
              <p className="relative z-10 text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1.5">{card.label}</p>
              <p className={`relative z-10 text-2xl font-mono font-bold ${card.accent}`}>{card.value}</p>
              <p className="relative z-10 text-sm font-mono text-[#97a3b6] mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-[#151821] border border-[#343947] rounded-lg overflow-hidden relative" data-ui-version="grid-background-v1">
          <GridBackground />

          {/* Table toolbar */}
          <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-[#343947] gap-4 bg-[#1f222c]/80 backdrop-blur-sm">
            <div className="flex items-center gap-1">
              {(["All", "Active", "Trial", "Suspended"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                    filter === f
                      ? "bg-[#2a2d39] text-[#e7edf8]"
                      : "text-[#97a3b6] hover:text-[#e7edf8] hover:bg-[#2a2d39]/50"
                  }`}
                >
                  {f === "All" ? t.filterAll : f === "Active" ? t.filterActive : f === "Trial" ? t.filterTrial : t.filterSuspended}
                  {f !== "All" && (
                    <span className="ml-1.5 text-xs text-[#97a3b6]">
                      {stores.filter((s) => s.status === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs font-mono text-[#97a3b6]">
              {filtered.length} {t.stores}
            </p>
          </div>

          {/* Table */}
          <div className="relative z-10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#343947]">
                  {[
                    t.thStore,
                    t.thStoreID,
                    t.thApiKey,
                    t.thWebhookUrl,
                    t.thVolume,
                    t.thStatus,
                    t.thAccess,
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider whitespace-nowrap"
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
                    className={`border-b border-[#343947]/50 hover:bg-[#2a2d39]/30 cursor-pointer transition-colors ${
                      !store.enabled ? "opacity-60" : ""
                    } ${i % 2 !== 0 ? "bg-[#2a2d39]/10" : ""}`}
                  >
                    {/* Store Name */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-[#2a2d39] border border-[#343947] rounded-md flex items-center justify-center shrink-0">
                          <StoreIcon className="w-3.5 h-3.5 text-[#97a3b6]" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold font-mono text-[#e7edf8]">{store.name}</p>
                          <p className="text-xs font-mono text-[#97a3b6]">{store.platform}</p>
                        </div>
                      </div>
                    </td>

                    {/* Store ID */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-sm text-[#97a3b6] truncate max-w-[160px]" title={store.id}>
                          {store.id.slice(0, 8)}…
                        </code>
                        <CopyButton value={store.id} />
                      </div>
                    </td>

                    {/* API Key */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <ApiKeyCell
                        key={`${store.id}:${store.apiKey}`}
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
                        <p className="font-mono text-xs font-semibold text-[#e7edf8]">
                          ${store.totalProcessed.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="font-mono text-xs text-[#97a3b6]">
                          {store.txCount.toLocaleString()} {t.txns}
                        </p>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge status={store.status} />
                        {store.providerType === "STRIPE" && (
                          store.hasStripeSecret && store.hasStripeWebhookSecret ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-400">
                              <ShieldCheck className="w-3 h-3" />
                              {t.stripeConnected}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              {t.stripeIncomplete}
                            </span>
                          )
                        )}
                        {store.providerType === "SHOPIFY" && (
                          store.shopifyStoreDomain && store.hasShopifyAccessToken && store.hasShopifyWebhookSecret ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-400">
                              <ShieldCheck className="w-3 h-3" />
                              {t.shopifyConnected}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              {t.shopifyIncomplete}
                            </span>
                          )
                        )}
                      </div>
                    </td>

                    {/* Toggle */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch
                          enabled={store.enabled}
                          onChange={() => handleToggle(store.id)}
                        />
                        <span className="text-xs font-mono text-[#97a3b6]">
                          {store.enabled ? t.toggleOn : t.toggleOff}
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
                <StoreIcon className="w-8 h-8 text-[#343947] mx-auto mb-3" />
                <p className="text-sm font-mono text-[#97a3b6]">{t.noStoresMatch}</p>
              </div>
            )}
          </div>

          {/* Table footer */}
          <div className="px-4 py-2.5 border-t border-[#343947] flex items-center justify-between">
            <p className="text-xs font-mono text-[#97a3b6]">
              {t.showing} {filtered.length} {t.of} {stores.length} {t.stores}
            </p>
            <p className="text-xs font-mono text-[#97a3b6]">
              {t.lastUpdated}
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
        readyShieldDomains={readyShieldDomains}
        onClose={() => setSelectedStore(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        onRegenerateWebhookSecret={handleRegenerateWebhookSecret}
      />
    </DashboardShell>
  )
}

// ─── Tiny inline copy button ──────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const { language } = useLanguage()
  const t = storesCopy[language]

  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="p-1 text-[#97a3b6] hover:text-[#e7edf8] transition-colors rounded shrink-0"
      title={t.copyFullId}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}
