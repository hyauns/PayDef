"use client"

import { useState, useEffect } from "react"
import { X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { paymentIdentitiesCopy } from "@/lib/i18n/payment-identities"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShieldDomain { id: string; domain: string; is_active: boolean; health_ok: boolean }

export interface IdentityFormData {
  id?: string
  bundleName: string
  publicBrandName: string
  industryVertical: string
  primaryShieldDomain: string
  supportEmail: string
  supportPhone: string
  orderLookupUrl: string
  trackingUrl: string
  shippingPolicyUrl: string
  refundPolicyUrl: string
  privacyPolicyUrl: string
  termsUrl: string
  isDefault: boolean
  isActive: boolean
}

interface PaymentIdentityFormDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editIdentity?: any | null
  shieldDomains: ShieldDomain[]
}

const VERTICALS = [
  "automotive_tires", "electronics", "home_goods", "toys",
  "beauty", "apparel", "generic_ecommerce",
]

const INITIAL: IdentityFormData = {
  bundleName: "", publicBrandName: "", industryVertical: "generic_ecommerce",
  primaryShieldDomain: "", supportEmail: "", supportPhone: "",
  orderLookupUrl: "", trackingUrl: "", shippingPolicyUrl: "",
  refundPolicyUrl: "", privacyPolicyUrl: "", termsUrl: "",
  isDefault: false, isActive: true,
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INPUT = "w-full bg-[#0d0f14] border border-[#343947] rounded-lg px-3 py-2.5 text-sm text-[#e7edf8] font-mono placeholder:text-[#4a5568] focus:outline-none focus:border-[#FFD600]/40 focus:ring-1 focus:ring-[#FFD600]/20 transition-colors"
const SELECT = `${INPUT} appearance-none`
const LABEL_CLS = "block text-sm font-medium text-[#97a3b6] mb-1.5"
const SECTION_TITLE = "text-sm font-mono font-semibold text-[#e7edf8] uppercase tracking-wider mb-3 pb-2 border-b border-dashed border-[#343947]"

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentIdentityFormDialog({
  open, onClose, onSaved, editIdentity, shieldDomains
}: PaymentIdentityFormDialogProps) {
  const { language } = useLanguage()
  const t = paymentIdentitiesCopy[language]

  const isEdit = Boolean(editIdentity?.id)
  const [form, setForm] = useState<IdentityFormData>(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Populate form when editing
  useEffect(() => {
    if (editIdentity) {
      setForm({
        id: editIdentity.id,
        bundleName: editIdentity.bundle_name || "",
        publicBrandName: editIdentity.public_brand_name || "",
        industryVertical: editIdentity.industry_vertical || "generic_ecommerce",
        primaryShieldDomain: editIdentity.primary_shield_domain || "",
        supportEmail: editIdentity.support_email || "",
        supportPhone: editIdentity.support_phone || "",
        orderLookupUrl: editIdentity.order_lookup_url || "",
        trackingUrl: editIdentity.tracking_url || "",
        shippingPolicyUrl: editIdentity.shipping_policy_url || "",
        refundPolicyUrl: editIdentity.refund_policy_url || "",
        privacyPolicyUrl: editIdentity.privacy_policy_url || "",
        termsUrl: editIdentity.terms_url || "",
        isDefault: editIdentity.is_default || false,
        isActive: editIdentity.is_active !== false,
      })
    } else {
      setForm({ ...INITIAL })
    }
    setError(null)
    setSuccess(false)
  }, [editIdentity])

  if (!open) return null

  const set = (key: keyof IdentityFormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Client-side required checks
    if (!form.bundleName.trim()) { setError("Identity Name is required"); return }
    if (!form.industryVertical) { setError("Industry Vertical is required"); return }
    if (form.isActive && !form.publicBrandName.trim()) { setError("Public Brand Name is required for active identities"); return }

    setSaving(true)
    try {
      const method = isEdit ? "PATCH" : "POST"
      const payload: any = {
        bundleName: form.bundleName.trim(),
        publicBrandName: form.publicBrandName.trim() || null,
        industryVertical: form.industryVertical,
        primaryShieldDomain: form.primaryShieldDomain.trim() || null,
        supportEmail: form.supportEmail.trim() || null,
        supportPhone: form.supportPhone.trim() || null,
        orderLookupUrl: form.orderLookupUrl.trim() || null,
        trackingUrl: form.trackingUrl.trim() || null,
        shippingPolicyUrl: form.shippingPolicyUrl.trim() || null,
        refundPolicyUrl: form.refundPolicyUrl.trim() || null,
        privacyPolicyUrl: form.privacyPolicyUrl.trim() || null,
        termsUrl: form.termsUrl.trim() || null,
        isDefault: form.isDefault,
        isActive: form.isActive,
      }

      if (isEdit) {
        payload.id = editIdentity.id
      }

      const res = await fetch("/api/merchant/payment-identities", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        onSaved()
        onClose()
      }, 600)
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setSaving(false)
    }
  }

  // Check if current domain is not in the list (e.g. they typed it manually or it was assigned by admin)
  const customDomainSelected = form.primaryShieldDomain && !shieldDomains.find(sd => sd.domain === form.primaryShieldDomain)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div
        className="relative w-full max-w-[820px] bg-[#151821] border border-[#343947] rounded-xl shadow-2xl mx-4"
        data-ui-version="merchant-identity-form-v1"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#343947] bg-[#1f222c]/60 rounded-t-xl">
          <h2 className="text-base font-mono font-semibold text-[#e7edf8]">
            {isEdit ? t.editIdentity : t.createIdentity}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#343947]/40 text-[#6b7280] hover:text-[#e7edf8] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">

          {/* ── Section A: Basic Identity ─────────────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Basic Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>{t.bundleName} <span className="text-red-400">*</span></label>
                <input className={INPUT} value={form.bundleName} onChange={e => set("bundleName", e.target.value)} placeholder={t.bundleNamePlaceholder} />
                <p className="text-xs text-[#6b7280] mt-1">Internal name for this identity</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Industry Vertical <span className="text-red-400">*</span></label>
                <select className={SELECT} value={form.industryVertical} onChange={e => set("industryVertical", e.target.value)}>
                  {VERTICALS.map(v => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 text-sm text-[#97a3b6] cursor-pointer">
                  <input type="checkbox" checked={form.isDefault} onChange={e => set("isDefault", e.target.checked)} className="accent-[#FFD600]" />
                  Default Identity
                </label>
                <label className="flex items-center gap-2 text-sm text-[#97a3b6] cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-emerald-400" />
                  Active
                </label>
              </div>
            </div>
          </div>

          {/* ── Section B: Shield Domain ──────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Shield Domain</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className={LABEL_CLS}>{t.primaryShieldDomain}</label>
                <select 
                  className={SELECT} 
                  value={customDomainSelected ? "CUSTOM" : form.primaryShieldDomain} 
                  onChange={e => {
                    if (e.target.value !== "CUSTOM") {
                      set("primaryShieldDomain", e.target.value)
                    }
                  }}
                >
                  <option value="">None selected</option>
                  {shieldDomains.map(sd => (
                    <option key={sd.id} value={sd.domain}>
                      {sd.domain} {(!sd.is_active || !sd.health_ok) ? "(Needs attention)" : ""}
                    </option>
                  ))}
                  {customDomainSelected && <option value="CUSTOM">Custom: {form.primaryShieldDomain}</option>}
                </select>
                <p className="text-xs text-[#6b7280] mt-1">Buyers pass through this domain before PayPal and return to it after approval.</p>
              </div>
              {customDomainSelected && (
                <div className="col-span-2 md:col-span-1">
                  <label className={LABEL_CLS}>Custom Domain Value</label>
                  <input className={INPUT} value={form.primaryShieldDomain} onChange={e => set("primaryShieldDomain", e.target.value)} />
                  <p className="text-xs text-amber-400 mt-1">Warning: Domain is not registered in your account</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Section C: Buyer-Facing ──────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Buyer-Facing Brand</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>{t.publicBrandName} {form.isActive && <span className="text-red-400">*</span>}</label>
                <input className={INPUT} value={form.publicBrandName} onChange={e => set("publicBrandName", e.target.value)} placeholder={t.publicBrandNamePlaceholder} />
                <p className="text-xs text-[#6b7280] mt-1">This brand name is used to build the PayPal item display.</p>
              </div>
            </div>
          </div>

          {/* ── Section D: Support Identity ───────────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Support Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>{t.supportEmail}</label>
                <input type="email" className={INPUT} value={form.supportEmail} onChange={e => set("supportEmail", e.target.value)} placeholder={t.supportEmailPlaceholder} />
                <p className="text-xs text-[#6b7280] mt-1">Use an email that matches this brand/domain when possible.</p>
              </div>
              <div>
                <label className={LABEL_CLS}>{t.supportPhone}</label>
                <input className={INPUT} value={form.supportPhone} onChange={e => set("supportPhone", e.target.value)} placeholder={t.supportPhonePlaceholder} />
              </div>
              <div>
                <label className={LABEL_CLS}>Order Lookup URL</label>
                <input className={INPUT} value={form.orderLookupUrl} onChange={e => set("orderLookupUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>Tracking URL</label>
                <input className={INPUT} value={form.trackingUrl} onChange={e => set("trackingUrl", e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>

          {/* ── Section E: Policy URLs ────────────────────────────── */}
          <div>
            <div className="mb-3">
              <h3 className={SECTION_TITLE}>Operational Policy</h3>
              <p className="text-xs text-[#6b7280] mb-3">These pages help customers and support teams understand shipping, refunds, privacy, and terms.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>{t.shippingPolicyUrl}</label>
                <input className={INPUT} value={form.shippingPolicyUrl} onChange={e => set("shippingPolicyUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>{t.refundPolicyUrl}</label>
                <input className={INPUT} value={form.refundPolicyUrl} onChange={e => set("refundPolicyUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>{t.privacyPolicyUrl}</label>
                <input className={INPUT} value={form.privacyPolicyUrl} onChange={e => set("privacyPolicyUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>{t.termsOfServiceUrl}</label>
                <input className={INPUT} value={form.termsUrl} onChange={e => set("termsUrl", e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#343947] bg-[#1f222c]/40 rounded-b-xl flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {error && (
               <div className="flex items-center gap-2 text-sm text-red-400 font-mono">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="truncate">{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 font-mono">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{isEdit ? "Identity updated" : "Identity created"}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 ml-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] text-sm font-mono transition-colors">
              {t.cancel}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || success}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FFD600]/15 text-[#FFD600] hover:bg-[#FFD600]/25 border border-[#FFD600]/30 text-sm font-mono font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? t.saveChanges : t.createIdentity)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
