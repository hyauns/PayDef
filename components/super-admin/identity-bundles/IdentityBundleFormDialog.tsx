"use client"

import { useState, useEffect } from "react"
import { X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LookupTenant { id: string; name: string }
interface LookupStore { id: string; name: string; tenant_id: string }
interface LookupProfile { id: string; profile_name: string; tenant_id: string; store_id: string | null }

export interface BundleFormData {
  id?: string
  tenantId: string
  storeId: string
  displayProfileId: string
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

interface IdentityBundleFormDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editBundle?: any | null
  tenants: LookupTenant[]
  stores: LookupStore[]
  profiles: LookupProfile[]
}

const VERTICALS = [
  "automotive_tires", "electronics", "home_goods", "toys",
  "beauty", "apparel", "generic_ecommerce",
]

const INITIAL: BundleFormData = {
  tenantId: "", storeId: "", displayProfileId: "",
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

export function IdentityBundleFormDialog({
  open, onClose, onSaved, editBundle, tenants, stores, profiles,
}: IdentityBundleFormDialogProps) {
  const isEdit = Boolean(editBundle?.id)
  const [form, setForm] = useState<BundleFormData>(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Populate form when editing
  useEffect(() => {
    if (editBundle) {
      setForm({
        id: editBundle.id,
        tenantId: editBundle.tenant_id || "",
        storeId: editBundle.store_id || "",
        displayProfileId: editBundle.display_profile_id || "",
        bundleName: editBundle.bundle_name || "",
        publicBrandName: editBundle.public_brand_name || "",
        industryVertical: editBundle.industry_vertical || "generic_ecommerce",
        primaryShieldDomain: editBundle.primary_shield_domain || "",
        supportEmail: editBundle.support_email || "",
        supportPhone: editBundle.support_phone || "",
        orderLookupUrl: editBundle.order_lookup_url || "",
        trackingUrl: editBundle.tracking_url || "",
        shippingPolicyUrl: editBundle.shipping_policy_url || "",
        refundPolicyUrl: editBundle.refund_policy_url || "",
        privacyPolicyUrl: editBundle.privacy_policy_url || "",
        termsUrl: editBundle.terms_url || "",
        isDefault: editBundle.is_default || false,
        isActive: editBundle.is_active !== false,
      })
    } else {
      setForm({ ...INITIAL, tenantId: tenants[0]?.id || "" })
    }
    setError(null)
    setSuccess(false)
  }, [editBundle, tenants])

  if (!open) return null

  const set = (key: keyof BundleFormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // Filter stores/profiles by selected tenant
  const filteredStores = stores.filter(s => s.tenant_id === form.tenantId)
  const filteredProfiles = profiles.filter(p => p.tenant_id === form.tenantId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Client-side required checks
    if (!form.tenantId) { setError("Tenant is required"); return }
    if (!form.bundleName.trim()) { setError("Bundle Name is required"); return }
    if (!form.industryVertical) { setError("Industry Vertical is required"); return }

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
        payload.id = editBundle.id
        payload.storeId = form.storeId || null
        payload.displayProfileId = form.displayProfileId || null
      } else {
        payload.tenantId = form.tenantId
        payload.storeId = form.storeId || null
        payload.displayProfileId = form.displayProfileId || null
      }

      const res = await fetch("/api/admin/identity-bundles", {
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div
        className="relative w-full max-w-[820px] bg-[#151821] border border-[#343947] rounded-xl shadow-2xl mx-4"
        data-ui-version="identity-bundle-form-v1"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#343947] bg-[#1f222c]/60 rounded-t-xl">
          <h2 className="text-base font-mono font-semibold text-[#e7edf8]">
            {isEdit ? "Edit Identity Bundle" : "Create Identity Bundle"}
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
                <label className={LABEL_CLS}>Bundle Name <span className="text-red-400">*</span></label>
                <input className={INPUT} value={form.bundleName} onChange={e => set("bundleName", e.target.value)} placeholder="e.g. TireVix Auto Bundle" />
              </div>
              <div>
                <label className={LABEL_CLS}>Industry Vertical <span className="text-red-400">*</span></label>
                <select className={SELECT} value={form.industryVertical} onChange={e => set("industryVertical", e.target.value)}>
                  {VERTICALS.map(v => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Tenant <span className="text-red-400">*</span></label>
                <select className={SELECT} value={form.tenantId} onChange={e => { set("tenantId", e.target.value); set("storeId", ""); set("displayProfileId", "") }} disabled={isEdit}>
                  <option value="">Select tenant…</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Store (optional)</label>
                <select className={SELECT} value={form.storeId} onChange={e => set("storeId", e.target.value)}>
                  <option value="">Tenant-wide (no store)</option>
                  {filteredStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Display Profile (optional)</label>
                <select className={SELECT} value={form.displayProfileId} onChange={e => set("displayProfileId", e.target.value)}>
                  <option value="">None</option>
                  {filteredProfiles.map(p => <option key={p.id} value={p.id}>{p.profile_name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 text-sm text-[#97a3b6] cursor-pointer">
                  <input type="checkbox" checked={form.isDefault} onChange={e => set("isDefault", e.target.checked)} className="accent-[#FFD600]" />
                  Default Bundle
                </label>
                <label className="flex items-center gap-2 text-sm text-[#97a3b6] cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-emerald-400" />
                  Active
                </label>
              </div>
            </div>
          </div>

          {/* ── Section B: Buyer-Facing Identity ──────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Buyer-Facing Payment Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Public Brand Name</label>
                <input className={INPUT} value={form.publicBrandName} onChange={e => set("publicBrandName", e.target.value)} placeholder="e.g. TireVix Auto" />
                <p className="text-xs text-[#6b7280] mt-1">Shown on PayPal buyer view as brand prefix</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Primary Shield Domain</label>
                <input className={INPUT} value={form.primaryShieldDomain} onChange={e => set("primaryShieldDomain", e.target.value)} placeholder="e.g. tirevix-auto.com" />
                <p className="text-xs text-[#6b7280] mt-1">Shield domain tied to this bundle</p>
              </div>
            </div>
          </div>

          {/* ── Section C: Support Identity ───────────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Support Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Support Email</label>
                <input type="email" className={INPUT} value={form.supportEmail} onChange={e => set("supportEmail", e.target.value)} placeholder="support@example.com" />
              </div>
              <div>
                <label className={LABEL_CLS}>Support Phone</label>
                <input className={INPUT} value={form.supportPhone} onChange={e => set("supportPhone", e.target.value)} placeholder="+1 (555) 000-0000" />
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

          {/* ── Section D: Policy URLs ────────────────────────────── */}
          <div>
            <h3 className={SECTION_TITLE}>Operational Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Shipping Policy URL</label>
                <input className={INPUT} value={form.shippingPolicyUrl} onChange={e => set("shippingPolicyUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>Refund Policy URL</label>
                <input className={INPUT} value={form.refundPolicyUrl} onChange={e => set("refundPolicyUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>Privacy Policy URL</label>
                <input className={INPUT} value={form.privacyPolicyUrl} onChange={e => set("privacyPolicyUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={LABEL_CLS}>Terms of Service URL</label>
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
                <span>{isEdit ? "Bundle updated" : "Bundle created"}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 ml-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] text-sm font-mono transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || success}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FFD600]/15 text-[#FFD600] hover:bg-[#FFD600]/25 border border-[#FFD600]/30 text-sm font-mono font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Bundle")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
