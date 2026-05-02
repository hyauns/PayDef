// Cache invalidation: 2026-04-04-v3
"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import {
  Settings,
  Shield,
  Bell,
  Save,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Store,
  Key,
  Loader2,
  XCircle,
  Mail,
  Send,
  Package,
  Tag
} from "lucide-react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { settingsCopy } from "@/lib/i18n/settings"
import { validateProfileField } from "@/lib/profile-validation"
import { SuperAdminDisplayProfiles } from "@/components/dashboard/SuperAdminDisplayProfiles"
import { SuperAdminDescriptorTemplates } from "@/components/dashboard/SuperAdminDescriptorTemplates"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_CLASSES = "bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden relative flex flex-col mb-8"
const LABEL = "text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3] mb-1 block"
const INPUT = "w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
const SECTION_HEADER = "px-6 py-5 border-b border-[#343947] bg-[#1f222c] flex items-center gap-3 relative"
const SECTION_BODY = "p-6 space-y-6 bg-[#222530]"
const CHECKOUT_FLOW_OPTIONS = [
  {
    value: "REDIRECT",
    label: "Classic Redirect",
    desc: "Buyer leaves the store page and completes approval on PayPal in the same tab.",
  },
  {
    value: "POPUP_BRIDGE",
    label: "Popup + Shield Bridge",
    desc: "Buyer approves inside a popup while the shield domain handles return and cancel.",
  },
] as const

// ─── SWR Fetcher ──────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${enabled ? "bg-[#FFD600]" : "bg-[#1a1d24] border border-[#343947]"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
    </button>
  )
}

// ─── Store row for Merchant view ──────────────────────────────────────────────

interface MerchantStore {
  id: string
  name: string
  webhookUrl: string | null
  apiKeyHash: string
  isActive: boolean
  captureMode: string   // 'INSTANT' | 'MANUAL'
  checkoutFlow: string
  checkoutFlowOverride: boolean
}

interface MerchantStoreApiRow {
  id: string
  name: string
  webhookUrl?: string | null
  webhook_url?: string | null
  apiKeyHash?: string | null
  api_key_hash?: string | null
  isActive?: boolean | null
  is_active?: boolean | null
  captureMode?: string | null
  capture_mode?: string | null
  checkoutFlow?: string | null
  checkout_flow?: string | null
  checkoutFlowOverride?: boolean | null
  checkout_flow_override?: boolean | null
}

interface MerchantStoresResponse {
  stores: MerchantStoreApiRow[]
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed"
}

// ─── Inline toast ─────────────────────────────────────────────────────────────

function Toast({ type, message, onDismiss }: { type: "success" | "error"; message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border ${
      type === "success"
        ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"
        : "bg-red-400/10 text-red-400 border-red-400/30"
    }`}>
      {type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {message}
    </div>
  )
}

// ─── Payment Display Profile Component ────────────────────────────────────────

function StorePaymentDisplayProfile({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { language } = useLanguage()
  const t = settingsCopy[language]

  const { data, isLoading, mutate } = useSWR(`/api/merchant/stores/display-profile?storeId=${storeId}`, fetcher)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  
  // Local form state
  const [form, setForm] = useState({
    industryVertical: "generic_ecommerce",
    publicBrandName: "",
    descriptorPrefix: "",
    displayMode: "BRAND_SEMANTIC",
    lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
  })

  const [previewName, setPreviewName] = useState("")
  const [previewLoading, setPreviewLoading] = useState(false)

  // Initialize form from DB
  useEffect(() => {
    if (data?.rawProfile) {
      setForm({
        industryVertical: data.rawProfile.industry_vertical,
        publicBrandName: data.rawProfile.public_brand_name || "",
        descriptorPrefix: data.rawProfile.descriptor_prefix || "",
        displayMode: data.rawProfile.display_mode,
        lineItemPolicy: data.rawProfile.line_item_policy,
      })
    } else if (data?.profile) {
      setForm(prev => ({
        ...prev,
        industryVertical: data.profile.industryVertical,
        displayMode: data.profile.displayMode,
        lineItemPolicy: data.profile.lineItemPolicy,
        publicBrandName: data.profile.publicBrandName || "",
        descriptorPrefix: data.profile.descriptorPrefix || "",
      }))
    }
  }, [data])

  const loadPreview = useCallback(async (currentForm: typeof form) => {
    const brandValid = validateProfileField("Public Brand Name", currentForm.publicBrandName)
    const prefixValid = validateProfileField("Descriptor Prefix", currentForm.descriptorPrefix)
    
    if (!brandValid.valid || !prefixValid.valid) {
      setPreviewName("Invalid input detected")
      return
    }

    setPreviewLoading(true)
    try {
      const res = await fetch("/api/merchant/stores/display-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...currentForm, realItemName: "Sample Product Order" }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setPreviewName(errData.error || "Preview unavailable")
        return
      }
      const data = await res.json()
      setPreviewName(data.previewName || t.networkError)
    } catch {
      setPreviewName(t.networkError)
    } finally {
      setPreviewLoading(false)
    }
  }, [storeId])

  // Debounced preview load
  useEffect(() => {
    const t = setTimeout(() => loadPreview(form), 500)
    return () => clearTimeout(t)
  }, [form, loadPreview])

  const update = (patch: Partial<typeof form>) => setForm(p => ({ ...p, ...patch }))

  const handleSave = async () => {
    setSaving(true)
    setError("")
    setSuccess("")
    
    const brandValid = validateProfileField("Public Brand Name", form.publicBrandName)
    const prefixValid = validateProfileField("Descriptor Prefix", form.descriptorPrefix)
    
    if (!brandValid.valid) { setError(brandValid.error!); setSaving(false); return; }
    if (!prefixValid.valid) { setError(prefixValid.error!); setSaving(false); return; }

    try {
      const res = await fetch("/api/merchant/stores/display-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...form }),
      })
      const resData = await res.json()
      if (res.ok) {
        setSuccess(resData.message || t.saved)
        mutate()
      } else {
        setError(resData.error || t.networkError)
      }
    } catch {
      setError(t.networkError)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="py-5 flex justify-center"><Loader2 className="w-4 h-4 text-[#FFD600] animate-spin" /></div>
  }

  return (
    <div className="space-y-4 pt-6 mt-6 border-t border-[#343947]">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.paymentDisplayProfile}</label>
        {saving && <Loader2 className="w-3 h-3 text-[#FFD600] animate-spin" />}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Industry Vertical */}
        <div className="space-y-2.5">
          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.industryVertical}</label>
          <select 
            value={form.industryVertical} 
            onChange={(e) => update({ industryVertical: e.target.value })}
            className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
          >
            <option value="automotive_tires">{t.indAuto}</option>
            <option value="electronics">{t.indElectronics}</option>
            <option value="home_goods">{t.indHome}</option>
            <option value="toys">{t.indToys}</option>
            <option value="beauty">{t.indBeauty}</option>
            <option value="apparel">{t.indApparel}</option>
            <option value="generic_ecommerce">{t.indGeneric}</option>
          </select>
        </div>

        {/* Display Mode */}
        <div className="space-y-2.5">
          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.displayMode}</label>
          <select 
            value={form.displayMode} 
            onChange={(e) => update({ displayMode: e.target.value })}
            className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
          >
            <option value="BRAND_SEMANTIC">{t.modeBrandSemantic}</option>
            <option value="SEMANTIC_ORDER">{t.modeSemantic}</option>
            <option value="REAL_SANITIZED">{t.modeSanitized}</option>
            <option value="LEGACY_GENERIC">{t.modeLegacy}</option>
          </select>
        </div>

        {/* Public Brand Name */}
        <div className="space-y-2.5">
          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.publicBrandName}</label>
          <input 
            value={form.publicBrandName} 
            onChange={(e) => update({ publicBrandName: e.target.value })}
            placeholder="e.g. TireVix"
            className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
          />
        </div>

        {/* Descriptor Prefix */}
        <div className="space-y-2.5">
          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.descriptorPrefix}</label>
          <input 
            value={form.descriptorPrefix} 
            onChange={(e) => update({ descriptorPrefix: e.target.value })}
            placeholder="e.g. TireVix Auto"
            className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
          />
        </div>

        {/* Line Item Policy */}
        <div className="space-y-2.5 sm:col-span-2">
          <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.lineItemPolicy}</label>
          <select 
            value={form.lineItemPolicy} 
            onChange={(e) => update({ lineItemPolicy: e.target.value })}
            className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8] placeholder:text-[#7f8aa0] focus:outline-none focus:ring-1 focus:ring-[#FFD600]/50 focus:border-[#FFD600]/50 transition-colors"
          >
            <option value="SINGLE_SEMANTIC_ITEM">{t.policySingle}</option>
            <option value="REAL_CART_ITEMS">{t.policyReal}</option>
            <option value="LEGACY_RANDOM_SPLIT">{t.policyLegacy}</option>
          </select>
        </div>
      </div>

      {/* Warnings */}
      {form.displayMode === "LEGACY_GENERIC" && form.industryVertical !== "generic_ecommerce" && (
        <div className="bg-[#4a3908]/50 border border-[#ca8a04]/50 text-[#facc15] text-[11px] font-mono px-4 py-3 rounded-md border-l-[3px] border-l-[#ca8a04]">
          {t.legacyModeWarning}
        </div>
      )}
      {form.lineItemPolicy === "LEGACY_RANDOM_SPLIT" && (
        <div className="bg-[#4a3908]/50 border border-[#ca8a04]/50 text-[#facc15] text-[11px] font-mono px-4 py-3 rounded-md border-l-[3px] border-l-[#ca8a04]">
          {t.legacyPolicyWarning}
        </div>
      )}

      {/* Live Preview Box */}
      <div className="bg-[#1f222c] border border-[#343947] rounded-md p-5 space-y-3 mt-4 shadow-inner">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">{t.livePreview}</p>
        <div className="flex flex-col gap-1.5 text-[12px] font-mono text-[#e7edf8]">
          <p>{t.buyerMaySee}<span className="text-[#FFD600] font-bold text-sm bg-[#151821] px-2 py-1 rounded">{previewLoading ? t.loading : previewName}</span></p>
          <p className="text-[#6b7280] mt-2 text-[10px]">{t.previewFooter}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`text-sm font-semibold px-6 py-2.5 rounded-md transition-colors ${
            saving ? "bg-[#FFD600]/50 text-black cursor-not-allowed" : "bg-[#FFD600] text-black hover:bg-[#e6c100]"
          }`}
        >
          {saving ? t.saving : t.saveProfile}
        </button>
        {success && <span className="text-sm font-medium text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {success}</span>}
        {error && <span className="text-sm font-medium text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {error}</span>}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { language } = useLanguage()
  const t = settingsCopy[language]

  const { data: session } = useSession()
  const role = (session?.user?.role as "SUPER_ADMIN" | "MERCHANT") ?? "MERCHANT"
  const isSuperAdmin = role === "SUPER_ADMIN"

  // ── Admin settings state ───────────────────────────────────────────────────
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Telegram test
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramToast, setTelegramToast] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Password change
  const [pwChanging, setPwChanging] = useState(false)
  const [pwToast, setPwToast] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Email change
  const [emailStep, setEmailStep] = useState<"idle" | "requesting" | "verify">("idle")
  const [emailChanging, setEmailChanging] = useState(false)
  const [emailCode, setEmailCode] = useState("")
  const [newEmailInput, setNewEmailInput] = useState("")
  const [emailToast, setEmailToast] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const [settings, setSettings] = useState({
    defaultDailyLimit: "5000",
    rotationStrategy: "weighted_random",
    alertThreshold: "90",
    telegramToken: "",
    chatId: "",
    priceRevalidation: true,
    ipWhitelist: "203.0.113.10\n198.51.100.42",
    checkoutDefaultFlow: "REDIRECT",
    adminEmail: session?.user?.email ?? "admin@gateway.io",
    currentPassword: "",
    newPassword: "",
  })

  // Load settings from API (admin only)
  const { data: settingsData, isLoading: settingsLoading } = useSWR(
    isSuperAdmin ? "/api/admin/settings" : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Hydrate state from API response
  useEffect(() => {
    if (!settingsData?.settings) return
    const s = settingsData.settings
    const rotation = s.rotation_rules ?? {}
    const telegram = s.telegram ?? {}
    const security = s.security ?? {}
    const checkout = s.checkout_preferences ?? {}
    setSettings(prev => ({
      ...prev,
      defaultDailyLimit: String(rotation.defaultDailyLimit ?? "5000"),
      rotationStrategy: rotation.rotationStrategy ?? "weighted_random",
      alertThreshold: String(rotation.alertThreshold ?? "90"),
      telegramToken: telegram.botToken ?? "",
      chatId: telegram.chatId ?? "",
      priceRevalidation: security.priceRevalidation !== false,
      ipWhitelist: security.ipWhitelist ?? "",
      checkoutDefaultFlow: checkout.defaultFlow === "POPUP_BRIDGE" ? "POPUP_BRIDGE" : "REDIRECT",
    }))
  }, [settingsData])

  const update = (patch: Partial<typeof settings>) => setSettings(p => ({ ...p, ...patch }))

  // ── Save handler (Admin only) ──────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setSaveError("")
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rotation_rules: {
            defaultDailyLimit: parseInt(settings.defaultDailyLimit) || 5000,
            alertThreshold: parseInt(settings.alertThreshold) || 90,
            rotationStrategy: settings.rotationStrategy,
          },
          telegram: {
            botToken: settings.telegramToken,
            chatId: settings.chatId,
          },
          security: {
            priceRevalidation: settings.priceRevalidation,
            ipWhitelist: settings.ipWhitelist,
          },
          checkout_preferences: {
            defaultFlow: settings.checkoutDefaultFlow,
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to save")
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // ── Telegram test ──────────────────────────────────────────────────────────
  const handleTelegramTest = async () => {
    setTelegramTesting(true)
    setTelegramToast(null)
    try {
      const res = await fetch("/api/admin/settings/test-telegram", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setTelegramToast({ type: "success", message: data.message ?? "Test alert sent!" })
      } else {
        setTelegramToast({ type: "error", message: data.error ?? "Failed to send test alert" })
      }
    } catch {
      setTelegramToast({ type: "error", message: "Network error" })
    } finally {
      setTelegramTesting(false)
    }
  }

  // ── Password change ────────────────────────────────────────────────────────
  const handlePasswordChange = async () => {
    if (!settings.currentPassword || !settings.newPassword) {
      setPwToast({ type: "error", message: t.bothFieldsRequired })
      return
    }
    if (settings.newPassword.length < 12) {
      setPwToast({ type: "error", message: t.passwordLengthWarning })
      return
    }
    setPwChanging(true)
    setPwToast(null)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: settings.currentPassword,
          newPassword: settings.newPassword,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setPwToast({ type: "success", message: data.message ?? "Password updated!" })
        update({ currentPassword: "", newPassword: "" })
      } else {
        setPwToast({ type: "error", message: data.error ?? "Failed to change password" })
      }
    } catch {
      setPwToast({ type: "error", message: t.networkError })
    } finally {
      setPwChanging(false)
    }
  }

  // ── Email change (request) ─────────────────────────────────────────────────
  const handleEmailRequest = async () => {
    if (!newEmailInput || !newEmailInput.includes("@")) {
      setEmailToast({ type: "error", message: t.invalidEmail })
      return
    }
    setEmailChanging(true)
    setEmailToast(null)
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", newEmail: newEmailInput }),
      })
      const data = await res.json()
      if (res.ok) {
        setEmailStep("verify")
        setEmailToast({ type: "success", message: data.message ?? "Code sent" })
      } else {
        setEmailToast({ type: "error", message: data.error ?? "Failed to send code" })
      }
    } catch {
      setEmailToast({ type: "error", message: "Network error" })
    } finally {
      setEmailChanging(false)
    }
  }

  // ── Email change (verify) ─────────────────────────────────────────────────
  const handleEmailVerify = async () => {
    if (emailCode.length !== 6) {
      setEmailToast({ type: "error", message: t.enter6Digit })
      return
    }
    setEmailChanging(true)
    setEmailToast(null)
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: emailCode }),
      })
      const data = await res.json()
      if (res.ok) {
        setEmailToast({ type: "success", message: data.message ?? "Email updated!" })
        setEmailStep("idle")
        setEmailCode("")
        setNewEmailInput("")
        update({ adminEmail: data.newEmail ?? newEmailInput })
      } else {
        setEmailToast({ type: "error", message: data.error ?? "Invalid code" })
      }
    } catch {
      setEmailToast({ type: "error", message: "Network error" })
    } finally {
      setEmailChanging(false)
    }
  }

  // ── Merchant stores (for Merchant view) ────────────────────────────────────
  const { data: storesData, isLoading: storesLoading, mutate: mutateStores } = useSWR<MerchantStoresResponse>(
    !isSuperAdmin ? "/api/merchant/stores" : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const stores: MerchantStore[] = (storesData?.stores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    webhookUrl: s.webhookUrl ?? s.webhook_url ?? null,
    apiKeyHash: s.apiKeyHash ?? s.api_key_hash ?? "••••••••",
    isActive: s.isActive ?? s.is_active ?? true,
    captureMode: s.captureMode ?? s.capture_mode ?? "INSTANT",
    checkoutFlow: s.checkoutFlow ?? s.checkout_flow ?? "REDIRECT",
    checkoutFlowOverride: s.checkoutFlowOverride ?? s.checkout_flow_override ?? false,
  }))

  // Capture mode toggle handler
  const [captureSaving, setCaptureSaving] = useState<string | null>(null)
  const [checkoutFlowSaving, setCheckoutFlowSaving] = useState<string | null>(null)
  const handleCaptureToggle = async (store: MerchantStore) => {
    const newMode = store.captureMode === "MANUAL" ? "INSTANT" : "MANUAL"
    setCaptureSaving(store.id)
    try {
      const res = await fetch("/api/merchant/stores/capture-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, captureMode: newMode }),
      })
      if (res.ok) {
        await mutateStores((current) => {
          if (!current) return current
          return {
            ...current,
            stores: current.stores.map((s) =>
              s.id === store.id ? { ...s, captureMode: newMode, capture_mode: newMode } : s
            ),
          }
        }, false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const data = await res.json()
        setSaveError(data.error ?? "Failed to update capture mode")
      }
    } catch {
      setSaveError(t.networkError)
    } finally {
      setCaptureSaving(null)
    }
  }

  const handleCheckoutFlowChange = async (store: MerchantStore, checkoutFlow: string | null) => {
    setCheckoutFlowSaving(store.id)
    setSaveError("")
    try {
      const res = await fetch("/api/merchant/stores/checkout-flow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, checkoutFlow }),
      })

      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to update checkout flow")
        return
      }

      await mutateStores((current) => {
        if (!current) return current
        return {
          ...current,
          stores: current.stores.map((s) =>
            s.id === store.id
              ? {
                  ...s,
                  checkoutFlow: data.checkoutFlow,
                  checkout_flow: data.checkoutFlow,
                  checkoutFlowOverride: data.checkoutFlowOverride,
                  checkout_flow_override: data.checkoutFlowOverride,
                }
              : s
          ),
        }
      }, false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError(t.networkError)
    } finally {
      setCheckoutFlowSaving(null)
    }
  }

  // ── Merchant Telegram config ────────────────────────────────────────────────
  const { data: merchantTgData, isLoading: merchantTgLoading } = useSWR(
    !isSuperAdmin ? "/api/merchant/telegram" : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Hydrate merchant telegram state
  useEffect(() => {
    if (!merchantTgData?.telegram) return
    const tg = merchantTgData.telegram
    setSettings(prev => ({
      ...prev,
      telegramToken: tg.botToken ?? "",
      chatId: tg.chatId ?? "",
    }))
  }, [merchantTgData])

  // ── Merchant Telegram save ─────────────────────────────────────────────────
  const handleMerchantTelegramSave = async () => {
    setSaving(true)
    setSaveError("")
    try {
      const res = await fetch("/api/merchant/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: settings.telegramToken,
          chatId: settings.chatId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to save")
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // ── Merchant Telegram test ─────────────────────────────────────────────────
  const handleMerchantTelegramTest = async () => {
    setTelegramTesting(true)
    setTelegramToast(null)
    try {
      const res = await fetch("/api/merchant/telegram/test", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setTelegramToast({ type: "success", message: data.message ?? "Test alert sent!" })
      } else {
        setTelegramToast({ type: "error", message: data.error ?? "Failed to send test alert" })
      }
    } catch {
      setTelegramToast({ type: "error", message: "Network error" })
    } finally {
      setTelegramTesting(false)
    }
  }

  // ─── MERCHANT VIEW ──────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <DashboardShell data-ui-version="settings-i18n-vi-phase8">
        <main className="px-4 md:px-8 py-8 w-full max-w-7xl mx-auto space-y-8">

          <DashboardPageHeader 
            eyebrow={t.eyebrow}
            title={t.title}
            description={t.description}
          />

          {/* Personalized badge */}
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-md px-3 py-2">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            {t.personalizedSecurity}
          </div>

          {/* Save error */}
          {saveError && (
            <div className="flex items-start gap-3 bg-red-400/5 border border-red-400/20 rounded-lg px-4 py-3">
              <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs font-mono">
                <span className="text-red-400 font-semibold">{t.saveFailed}</span>
                <span className="text-[#97a3b6]">{saveError}</span>
              </div>
            </div>
          )}

          {/* ── Section: Store API Keys ────────────────────────────────────────── */}
          {storesLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-[#222530] border border-[#343947] rounded-lg p-5 animate-pulse space-y-4">
                  <div className="h-5 w-40 bg-[#2a2d39] rounded" />
                  <div className="h-4 w-64 bg-[#2a2d39] rounded" />
                  <div className="h-4 w-48 bg-[#2a2d39] rounded" />
                </div>
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className={SECTION_CLASSES}>
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#97a3b6]">
                <Store className="w-8 h-8 opacity-30" />
                <p className="text-sm font-mono">{t.noStoresConfigured}</p>
                <p className="text-xs font-mono">{t.createStorePrompt}</p>
              </div>
            </div>
          ) : (
            stores.map(store => (
              <div key={store.id} className={SECTION_CLASSES}>
                <div className={SECTION_HEADER}>
                  <div className="w-6 h-6 rounded bg-[#FFD600]/10 border border-[#FFD600]/20 flex items-center justify-center">
                    <Store className="w-3.5 h-3.5 text-[#FFD600]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#e7edf8]">{store.name}</p>
                    <p className="text-sm leading-6 text-[#aab4c5]">
                      {store.isActive ? (
                        <span className="text-emerald-400">● {t.active}</span>
                      ) : (
                        <span className="text-red-400">● {t.inactive}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className={SECTION_BODY}>
                  <div className="space-y-2.5">
                    <label className={LABEL}>{t.apiKeyHash}</label>
                    <div className="flex items-center gap-2 bg-[#151821] border border-[#343947] rounded-md px-3 py-2">
                      <Key className="w-3.5 h-3.5 text-[#97a3b6] shrink-0" />
                      <code className="text-xs font-mono text-[#97a3b6] break-all">{store.apiKeyHash.substring(0, 32)}...</code>
                    </div>
                    <p className="text-sm leading-6 text-[#aab4c5]">
                      {t.apiKeyDesc}
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <label className={LABEL}>{t.webhookUrl}</label>
                    <input
                      type="url"
                      value={store.webhookUrl ?? ""}
                      readOnly
                      className={`${INPUT} cursor-default`}
                      placeholder={t.notConfigured}
                    />
                    <p className="text-sm leading-6 text-[#aab4c5]">
                      {t.webhookDesc}
                    </p>
                  </div>

                  {/* Capture Mode Toggle */}
                  <div className="flex items-start justify-between gap-4 pt-2 border-t border-[#343947]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <label className={LABEL}>{t.manualCapture}</label>
                        {captureSaving === store.id && (
                          <Loader2 className="w-3 h-3 text-[#FFD600] animate-spin" />
                        )}
                      </div>
                      <p className="text-sm leading-6 text-[#aab4c5] max-w-md">
                        {t.manualCaptureDesc}
                      </p>
                    </div>
                    <Toggle
                      enabled={store.captureMode === "MANUAL"}
                      onToggle={() => handleCaptureToggle(store)}
                      disabled={captureSaving === store.id}
                    />
                  </div>

                  <div className="space-y-3 pt-2 border-t border-[#343947]">
                    <div className="flex items-center gap-2">
                      <label className={LABEL}>{t.checkoutExperience}</label>
                      {checkoutFlowSaving === store.id && (
                        <Loader2 className="w-3 h-3 text-[#FFD600] animate-spin" />
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        onClick={() => handleCheckoutFlowChange(store, null)}
                        disabled={checkoutFlowSaving === store.id}
                        className={`text-left p-3 rounded-lg border transition-all disabled:opacity-60 ${
                          !store.checkoutFlowOverride
                            ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                            : "border-[#343947] bg-[#151821] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${!store.checkoutFlowOverride ? "border-[#FFD600] bg-[#FFD600]" : "border-[#343947]"}`} />
                          <span className="text-base font-semibold text-[#e7edf8]">{t.usePlatformDefault}</span>
                        </div>
                        <p className="text-sm text-[#aab4c5] leading-6 pl-4">
                          {t.currentlyUsing} {store.checkoutFlow === "POPUP_BRIDGE" ? t.popupBridge : t.classicRedirect}.
                        </p>
                      </button>
                      {CHECKOUT_FLOW_OPTIONS.map((option) => {
                        const label = option.value === "POPUP_BRIDGE" ? t.popupBridge : t.classicRedirect
                        const desc = option.value === "POPUP_BRIDGE" ? t.popupBridgeDesc : t.classicRedirectDesc
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleCheckoutFlowChange(store, option.value)}
                            disabled={checkoutFlowSaving === store.id}
                            className={`text-left p-3 rounded-lg border transition-all disabled:opacity-60 ${
                              store.checkoutFlowOverride && store.checkoutFlow === option.value
                                ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                                : "border-[#343947] bg-[#151821] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${store.checkoutFlowOverride && store.checkoutFlow === option.value ? "border-[#FFD600] bg-[#FFD600]" : "border-[#343947]"}`} />
                              <span className="text-base font-semibold text-[#e7edf8]">{label}</span>
                            </div>
                            <p className="text-sm text-[#aab4c5] leading-6 pl-4">{desc}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  
                  <StorePaymentDisplayProfile storeId={store.id} storeName={store.name} />
                </div>
              </div>
            ))
          )}

          {/* ── Section: Telegram Notifications ────────────────────────────────── */}
          <div className={SECTION_CLASSES}>
            <div className={SECTION_HEADER}>
              <div className="w-6 h-6 rounded bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                <Bell className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e7edf8]">{t.notifications}</p>
                <p className="text-sm leading-6 text-[#aab4c5]">{t.telegramDesc}</p>
              </div>
            </div>
            <div className={SECTION_BODY}>
              <div className="flex items-start gap-3 bg-amber-400/5 border border-amber-400/20 rounded-md px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm leading-6 text-[#aab4c5]">
                  {t.botFatherInstructions}
                </p>
              </div>
              {merchantTgLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 w-48 bg-[#2a2d39] rounded" />
                  <div className="h-9 w-full bg-[#2a2d39] rounded" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2.5">
                      <label className={LABEL}>{t.telegramBotToken}</label>
                      <input
                        type="password"
                        value={settings.telegramToken}
                        onChange={e => update({ telegramToken: e.target.value })}
                        className={INPUT}
                        placeholder="7412345678:AAF..."
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2.5">
                      <label className={LABEL}>{t.chatId}</label>
                      <input
                        value={settings.chatId}
                        onChange={e => update({ chatId: e.target.value })}
                        className={INPUT}
                        placeholder="-1001234567890"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleMerchantTelegramSave}
                      disabled={saving}
                      className={`flex items-center gap-2 text-xs font-mono rounded-md px-3 py-1.5 transition-colors ${
                        saved
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : saving
                          ? "bg-[#FFD600]/50 text-[#151821] cursor-wait"
                          : "bg-[#FFD600] text-[#151821] hover:bg-[#e6c100]"
                      }`}
                    >
                      {saved ? <CheckCircle2 className="w-3 h-3" /> : saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {saved ? t.saved : saving ? t.saving : t.saveTelegramConfig}
                    </button>
                    <button
                      onClick={handleMerchantTelegramTest}
                      disabled={telegramTesting}
                      className="flex items-center gap-2 text-xs font-mono text-[#FFD600] border border-[#FFD600]/30 hover:bg-[#FFD600]/10 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      {telegramTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      {telegramTesting ? t.sending : t.sendTestAlert}
                    </button>
                    {telegramToast && (
                      <Toast type={telegramToast.type} message={telegramToast.message} onDismiss={() => setTelegramToast(null)} />
                    )}
                  </div>
                </>
              )}
              <div className="flex items-center gap-2 text-sm leading-6 text-[#aab4c5] bg-[#2a2d39]/50 rounded-md px-3 py-2">
                <Bell className="w-3 h-3 text-amber-400 shrink-0" />
                {t.telegramExample}
              </div>
            </div>
          </div>

          {/* ── Section: Change Password ────────────────────────────────────────── */}
          <div className={SECTION_CLASSES}>
            <div className={SECTION_HEADER}>
              <div className="w-6 h-6 rounded bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e7edf8]">{t.changePassword}</p>
                <p className="text-sm leading-6 text-[#aab4c5]">{t.changePasswordDesc}</p>
              </div>
            </div>
            <div className={SECTION_BODY}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2.5">
                  <label className={LABEL}>{t.currentPassword}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={settings.currentPassword}
                      onChange={e => update({ currentPassword: e.target.value })}
                      className={`${INPUT} pr-10`}
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                    />
                    <button
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <label className={LABEL}>{t.newPassword}</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={settings.newPassword}
                      onChange={e => update({ newPassword: e.target.value })}
                      className={`${INPUT} pr-10`}
                      placeholder={t.min12Chars}
                      autoComplete="new-password"
                    />
                    <button
                      onClick={() => setShowNewPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              {settings.newPassword && settings.newPassword.length < 12 && (
                <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  {t.passwordLengthWarning}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePasswordChange}
                  disabled={pwChanging || !settings.currentPassword || !settings.newPassword || settings.newPassword.length < 12}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-violet-400/30 text-violet-400 hover:bg-violet-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pwChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                  {pwChanging ? t.updating : t.updatePassword}
                </button>
                {pwToast && (
                  <Toast type={pwToast.type} message={pwToast.message} onDismiss={() => setPwToast(null)} />
                )}
              </div>
              <div className="flex items-center gap-2 text-sm leading-6 text-[#aab4c5] bg-[#2a2d39]/50 rounded-md px-3 py-2">
                <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                {t.bcryptDesc}
              </div>
            </div>
          </div>

          {/* ── Section: Change Email ─────────────────────────────────────────── */}
          <div className={SECTION_CLASSES}>
            <div className={SECTION_HEADER}>
              <div className="w-6 h-6 rounded bg-sky-400/10 border border-sky-400/20 flex items-center justify-center">
                <Mail className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e7edf8]">{t.changeEmail}</p>
                <p className="text-sm leading-6 text-[#aab4c5]">{t.changeEmailDesc}</p>
              </div>
            </div>
            <div className={SECTION_BODY}>
              {emailStep === "idle" && (
                <>
                  <div className="space-y-2.5">
                    <label className={LABEL}>{t.currentEmail}</label>
                    <input
                      type="email"
                      value={session?.user?.email ?? ""}
                      readOnly
                      className={`${INPUT} cursor-default text-[#97a3b6]`}
                    />
                  </div>
                  <div className="space-y-2.5">
                    <label className={LABEL}>{t.newEmailAddress}</label>
                    <input
                      type="email"
                      value={newEmailInput}
                      onChange={e => setNewEmailInput(e.target.value)}
                      className={INPUT}
                      placeholder="new-email@example.com"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleEmailRequest}
                      disabled={emailChanging || !newEmailInput}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-sky-400/30 text-sky-400 hover:bg-sky-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {emailChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                      {emailChanging ? t.sending : t.sendVerificationCode}
                    </button>
                    {emailToast && (
                      <Toast type={emailToast.type} message={emailToast.message} onDismiss={() => setEmailToast(null)} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm leading-6 text-[#aab4c5] bg-[#2a2d39]/50 rounded-md px-3 py-2">
                    <Shield className="w-3 h-3 text-sky-400 shrink-0" />
                    {t.otpInstructions}
                  </div>
                </>
              )}

              {emailStep === "verify" && (
                <>
                  <div className="bg-sky-400/5 border border-sky-400/20 rounded-md px-4 py-3 space-y-2">
                    <p className="text-xs font-mono text-sky-400 font-semibold">{t.enterVerificationCode}</p>
                    <p className="text-sm leading-6 text-[#aab4c5]">
                      {t.otpSentMsg}
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <label className={LABEL}>{t.sixDigitCode}</label>
                    <input
                      type="text"
                      value={emailCode}
                      onChange={e => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`${INPUT} text-center text-lg tracking-[0.5em] max-w-[200px]`}
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleEmailVerify}
                      disabled={emailChanging || emailCode.length !== 6}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md bg-sky-400 text-[#151821] hover:bg-sky-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {emailChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      {emailChanging ? t.verifying : t.verifyUpdateEmail}
                    </button>
                    <button
                      onClick={() => { setEmailStep("idle"); setEmailCode(""); setEmailToast(null) }}
                      className="px-3 py-1.5 text-xs font-mono text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors"
                    >
                      {t.cancel}
                    </button>
                    {emailToast && (
                      <Toast type={emailToast.type} message={emailToast.message} onDismiss={() => setEmailToast(null)} />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

        </main>
      </DashboardShell>
    )
  }

  // ─── SUPER ADMIN VIEW ───────────────────────────────────────────────────────
  return (
    <DashboardShell>
      <main className="px-4 md:px-8 py-8 w-full max-w-7xl mx-auto space-y-8">

        <DashboardPageHeader 
          eyebrow="CONFIGURATION"
          title="Settings"
          description="Global gateway configuration and security controls"
          action={
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-6 py-2.5 text-xs font-mono font-bold rounded-md transition-all ${
                saved
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : saving
                  ? "bg-[#FFD600]/50 text-[#151821] cursor-wait"
                  : "bg-[#FFD600] text-[#151821] hover:bg-[#e6c100]"
              }`}
            >
              {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? "Saved" : saving ? "Saving..." : "Save Changes"}
            </button>
          }
        />

        {/* Save error */}
        {saveError && (
          <div className="flex items-start gap-3 bg-red-400/5 border border-red-400/20 rounded-lg px-4 py-3">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono">
              <span className="text-red-400 font-semibold">Save failed: </span>
              <span className="text-[#97a3b6]">{saveError}</span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {settingsLoading && (
          <div className="space-y-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#222530] border border-[#343947] rounded-lg p-8 animate-pulse space-y-4">
                <div className="h-5 w-48 bg-[#2a2d39] rounded" />
                <div className="h-4 w-full bg-[#2a2d39] rounded" />
                <div className="h-4 w-3/4 bg-[#2a2d39] rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Super Admin Payment Display Profiles */}
        {!settingsLoading && (
          <div className={SECTION_CLASSES}>
            <div className={SECTION_HEADER}>
              <div className="w-6 h-6 rounded bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
                <Package className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e7edf8]">Payment Display Profiles</p>
                <p className="text-sm leading-6 text-[#aab4c5]">Manage descriptor policies across all tenants and stores</p>
              </div>
            </div>
            <div className={SECTION_BODY}>
              <SuperAdminDisplayProfiles />
            </div>
          </div>
        )}

        {/* Super Admin Descriptor Templates */}
        {!settingsLoading && (
          <div className={SECTION_CLASSES}>
            <div className={SECTION_HEADER}>
              <div className="w-6 h-6 rounded bg-[#FFD600]/10 border border-[#FFD600]/20 flex items-center justify-center">
                <Tag className="w-3.5 h-3.5 text-[#FFD600]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e7edf8]">Descriptor Templates</p>
                <p className="text-sm leading-6 text-[#aab4c5]">Manage global descriptor text pools by industry</p>
              </div>
            </div>
            <div className={SECTION_BODY}>
              <SuperAdminDescriptorTemplates />
            </div>
          </div>
        )}

        {/* Section 1: Global Rotation Rules */}
        {!settingsLoading && (
          <>
            <div className={SECTION_CLASSES}>
              <div className={SECTION_HEADER}>
                <div className="w-6 h-6 rounded bg-[#FFD600]/10 border border-[#FFD600]/20 flex items-center justify-center">
                  <Settings className="w-3.5 h-3.5 text-[#FFD600]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#e7edf8]">Global Rotation Rules</p>
                  <p className="text-sm leading-6 text-[#aab4c5]">Default limits and strategy applied across all accounts</p>
                </div>
              </div>
              <div className={SECTION_BODY}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2.5">
                    <label className={LABEL}>Default Daily Limit (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-[#97a3b6]">$</span>
                      <input
                        type="number"
                        value={settings.defaultDailyLimit}
                        onChange={e => update({ defaultDailyLimit: e.target.value })}
                        className={`${INPUT} pl-7`}
                        placeholder="5000"
                      />
                    </div>
                    <p className="text-sm leading-6 text-[#aab4c5]">Applied to any account without an explicit adaptive limit</p>
                  </div>
                  <div className="space-y-2.5">
                    <label className={LABEL}>Alert Threshold (%)</label>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={settings.alertThreshold}
                      onChange={e => update({ alertThreshold: e.target.value })}
                      className={INPUT}
                      placeholder="90"
                    />
                    <p className="text-sm leading-6 text-[#aab4c5]">Send alert when account reaches this % of its daily limit</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <label className={LABEL}>Global Rotation Strategy</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { value: "weighted_random", label: "Weighted Random", desc: "Accounts with higher priority receive proportionally more traffic" },
                      { value: "round_robin", label: "Round Robin", desc: "Each request cycles sequentially through all active accounts" },
                      { value: "lowest_volume", label: "Lowest Volume First", desc: "Always routes to the account with the most remaining daily capacity" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => update({ rotationStrategy: opt.value })}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          settings.rotationStrategy === opt.value
                            ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                            : "border-[#343947] bg-[#151821] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${settings.rotationStrategy === opt.value ? "border-[#FFD600] bg-[#FFD600]" : "border-[#343947]"}`} />
                          <span className="text-base font-semibold text-[#e7edf8]">{opt.label}</span>
                        </div>
                        <p className="text-sm text-[#aab4c5] leading-6 pl-4">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5 pt-1">
                  <label className={LABEL}>Default Checkout Experience</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CHECKOUT_FLOW_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => update({ checkoutDefaultFlow: opt.value })}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          settings.checkoutDefaultFlow === opt.value
                            ? "border-[#FFD600]/40 bg-[#FFD600]/5 text-[#e7edf8]"
                            : "border-[#343947] bg-[#151821] text-[#97a3b6] hover:border-[#343947]/80 hover:text-[#e7edf8]"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${settings.checkoutDefaultFlow === opt.value ? "border-[#FFD600] bg-[#FFD600]" : "border-[#343947]"}`} />
                          <span className="text-base font-semibold text-[#e7edf8]">{opt.label}</span>
                        </div>
                        <p className="text-sm text-[#aab4c5] leading-6 pl-4">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  <p className="text-sm leading-6 text-[#aab4c5]">
                    New stores inherit this mode until a merchant overrides it at the store level.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Notifications */}
            <div className={SECTION_CLASSES}>
              <div className={SECTION_HEADER}>
                <div className="w-6 h-6 rounded bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#e7edf8]">Notifications</p>
                  <p className="text-sm leading-6 text-[#aab4c5]">Telegram alerts for completed transactions and daily limit warnings</p>
                </div>
              </div>
              <div className={SECTION_BODY}>
                <div className="flex items-start gap-3 bg-amber-400/5 border border-amber-400/20 rounded-md px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm leading-6 text-[#aab4c5]">
                    Create a bot via <span className="text-amber-400">@BotFather</span> on Telegram, add it to your admin group, and paste the credentials below.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2.5">
                    <label className={LABEL}>Telegram Bot Token</label>
                    <input
                      type="password"
                      value={settings.telegramToken}
                      onChange={e => update({ telegramToken: e.target.value })}
                      className={INPUT}
                      placeholder="7412345678:AAF..."
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2.5">
                    <label className={LABEL}>Admin Chat ID</label>
                    <input
                      value={settings.chatId}
                      onChange={e => update({ chatId: e.target.value })}
                      className={INPUT}
                      placeholder="-1001234567890"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTelegramTest}
                    disabled={telegramTesting}
                    className="flex items-center gap-2 text-xs font-mono text-[#FFD600] border border-[#FFD600]/30 hover:bg-[#FFD600]/10 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {telegramTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    {telegramTesting ? "Sending..." : "Send Test Alert"}
                  </button>
                  {telegramToast && (
                    <Toast type={telegramToast.type} message={telegramToast.message} onDismiss={() => setTelegramToast(null)} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm leading-6 text-[#aab4c5] bg-[#2a2d39]/50 rounded-md px-3 py-2">
                  <Bell className="w-3 h-3 text-amber-400 shrink-0" />
                  Telegram notifications fire on every successful payment capture: 💰 Success! Received $X from [Store]. Account: [PP-ID].
                </div>
              </div>
            </div>

            {/* Section 3: Security */}
            <div className={SECTION_CLASSES}>
              <div className={SECTION_HEADER}>
                <div className="w-6 h-6 rounded bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#e7edf8]">Security</p>
                  <p className="text-sm leading-6 text-[#aab4c5]">Server-side validation and access controls</p>
                </div>
              </div>
              <div className={SECTION_BODY}>
                <div className="flex items-center justify-between gap-4 p-3 bg-[#151821] border border-[#343947] rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-sm font-mono font-semibold text-[#e7edf8]">Server-side Price Re-validation</p>
                    <p className="text-sm leading-6 text-[#aab4c5]">
                      Re-confirms the exact charge amount server-side before routing to PayPal. Prevents price manipulation attacks.
                    </p>
                  </div>
                  <Toggle enabled={settings.priceRevalidation} onToggle={() => update({ priceRevalidation: !settings.priceRevalidation })} />
                </div>
                <div className="space-y-2.5">
                  <label className={LABEL}>IP Whitelist</label>
                  <textarea
                    value={settings.ipWhitelist}
                    onChange={e => update({ ipWhitelist: e.target.value })}
                    rows={4}
                    className={`${INPUT} resize-none leading-relaxed`}
                    placeholder={"203.0.113.10\n198.51.100.42"}
                  />
                  <p className="text-sm leading-6 text-[#aab4c5]">
                    One IP address per line. Only these IPs may call the Gateway API. Leave empty to allow all (not recommended).
                  </p>
                </div>
              </div>
            </div>

            {/* Section 4: Admin Profile — Password Change */}
            <div className={SECTION_CLASSES}>
              <div className={SECTION_HEADER}>
                <div className="w-6 h-6 rounded bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
                  <Lock className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#e7edf8]">Change Password</p>
                  <p className="text-sm leading-6 text-[#aab4c5]">Update your dashboard login password</p>
                </div>
              </div>
              <div className={SECTION_BODY}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2.5">
                    <label className={LABEL}>Current Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={settings.currentPassword}
                        onChange={e => update({ currentPassword: e.target.value })}
                        className={`${INPUT} pr-10`}
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                      />
                      <button
                        onClick={() => setShowPassword(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <label className={LABEL}>New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={settings.newPassword}
                        onChange={e => update({ newPassword: e.target.value })}
                        className={`${INPUT} pr-10`}
                        placeholder="Min 12 characters"
                        autoComplete="new-password"
                      />
                      <button
                        onClick={() => setShowNewPassword(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#97a3b6] hover:text-[#e7edf8] transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                {settings.newPassword && settings.newPassword.length < 12 && (
                  <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    Password must be at least 12 characters
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePasswordChange}
                    disabled={pwChanging || !settings.currentPassword || !settings.newPassword || settings.newPassword.length < 12}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-violet-400/30 text-violet-400 hover:bg-violet-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pwChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                    {pwChanging ? "Updating..." : "Update Password"}
                  </button>
                  {pwToast && (
                    <Toast type={pwToast.type} message={pwToast.message} onDismiss={() => setPwToast(null)} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm leading-6 text-[#aab4c5] bg-[#2a2d39]/50 rounded-md px-3 py-2">
                  <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                  Passwords are hashed with bcrypt (12 rounds) and never stored in plain text
                </div>
              </div>
            </div>

            {/* Section 5: Change Email */}
            <div className={SECTION_CLASSES}>
              <div className={SECTION_HEADER}>
                <div className="w-6 h-6 rounded bg-sky-400/10 border border-sky-400/20 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#e7edf8]">Change Email</p>
                  <p className="text-sm leading-6 text-[#aab4c5]">Update your login email — requires OTP verification</p>
                </div>
              </div>
              <div className={SECTION_BODY}>
                {emailStep === "idle" && (
                  <>
                    <div className="space-y-2.5">
                      <label className={LABEL}>Current Email</label>
                      <input
                        type="email"
                        value={settings.adminEmail}
                        readOnly
                        className={`${INPUT} cursor-default text-[#97a3b6]`}
                      />
                    </div>
                    <div className="space-y-2.5">
                      <label className={LABEL}>New Email Address</label>
                      <input
                        type="email"
                        value={newEmailInput}
                        onChange={e => setNewEmailInput(e.target.value)}
                        className={INPUT}
                        placeholder="new-admin@example.com"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleEmailRequest}
                        disabled={emailChanging || !newEmailInput}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md border border-sky-400/30 text-sky-400 hover:bg-sky-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {emailChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                        {emailChanging ? "Sending..." : "Send Verification Code"}
                      </button>
                      {emailToast && (
                        <Toast type={emailToast.type} message={emailToast.message} onDismiss={() => setEmailToast(null)} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm leading-6 text-[#aab4c5] bg-[#2a2d39]/50 rounded-md px-3 py-2">
                      <Shield className="w-3 h-3 text-sky-400 shrink-0" />
                      A 6-digit code will be sent to your <strong>current</strong> email for verification. Code expires in 10 minutes.
                    </div>
                  </>
                )}

                {emailStep === "verify" && (
                  <>
                    <div className="bg-sky-400/5 border border-sky-400/20 rounded-md px-4 py-3 space-y-2">
                      <p className="text-xs font-mono text-sky-400 font-semibold">Enter Verification Code</p>
                      <p className="text-sm leading-6 text-[#aab4c5]">
                        A 6-digit code has been sent to your current email. Enter it below to confirm the change.
                      </p>
                    </div>
                    <div className="space-y-2.5">
                      <label className={LABEL}>6-Digit Code</label>
                      <input
                        type="text"
                        value={emailCode}
                        onChange={e => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className={`${INPUT} text-center text-lg tracking-[0.5em] max-w-[200px]`}
                        placeholder="000000"
                        maxLength={6}
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleEmailVerify}
                        disabled={emailChanging || emailCode.length !== 6}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md bg-sky-400 text-[#151821] hover:bg-sky-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {emailChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        {emailChanging ? "Verifying..." : "Verify & Update Email"}
                      </button>
                      <button
                        onClick={() => { setEmailStep("idle"); setEmailCode(""); setEmailToast(null) }}
                        className="px-3 py-1.5 text-xs font-mono text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md transition-colors"
                      >
                        Cancel
                      </button>
                      {emailToast && (
                        <Toast type={emailToast.type} message={emailToast.message} onDismiss={() => setEmailToast(null)} />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bottom save */}
            <div className="flex justify-end pb-8">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-mono font-semibold rounded-md transition-all ${
                  saved
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : saving
                    ? "bg-[#FFD600]/50 text-[#151821] cursor-wait"
                    : "bg-[#FFD600] text-[#151821] hover:bg-[#e6c100]"
                }`}
              >
                {saved ? <CheckCircle2 className="w-4 h-4" /> : saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? "Saved Successfully" : saving ? "Saving..." : "Save All Changes"}
              </button>
            </div>
          </>
        )}

      </main>
    </DashboardShell>
  )
}
