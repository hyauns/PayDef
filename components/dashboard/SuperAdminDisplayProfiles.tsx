"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { CheckCircle2, Loader2, Package, XCircle, AlertTriangle, Plus, Tag } from "lucide-react"
import { validateProfileField } from "@/lib/profile-validation"

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function SuperAdminDisplayProfiles() {
  const { data, isLoading, mutate } = useSWR("/api/admin/display-profiles", fetcher)
  
  const [form, setForm] = useState({
    storeId: "",
    profileName: "New Profile",
    industryVertical: "generic_ecommerce",
    displayMode: "BRAND_SEMANTIC",
    lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
    publicBrandName: "",
    descriptorPrefix: "",
    isDefault: true,
    isActive: true,
  })

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewName, setPreviewName] = useState("")

  const profiles = data?.profiles || []
  const stores = data?.stores || []

  const update = (patch: Partial<typeof form>) => setForm(p => ({ ...p, ...patch }))

  const loadPreview = useCallback(async (currentForm: typeof form) => {
    const brandValid = validateProfileField("Public Brand Name", currentForm.publicBrandName)
    const prefixValid = validateProfileField("Descriptor Prefix", currentForm.descriptorPrefix)
    const nameValid = validateProfileField("Profile Name", currentForm.profileName, true)
    
    if (!brandValid.valid || !prefixValid.valid || !nameValid.valid) {
      setPreviewName("Invalid input detected")
      return
    }

    setPreviewLoading(true)
    try {
      const res = await fetch("/api/merchant/stores/display-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentForm, realItemName: "Sample Product Order" }),
      })
      const { previewName } = await res.json()
      setPreviewName(previewName)
    } catch {
      setPreviewName("Error loading preview")
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => loadPreview(form), 500)
    return () => clearTimeout(t)
  }, [form, loadPreview])

  const handleCreate = async () => {
    setSaving(true)
    setError("")
    setSuccess("")
    
    const brandValid = validateProfileField("Public Brand Name", form.publicBrandName)
    const prefixValid = validateProfileField("Descriptor Prefix", form.descriptorPrefix)
    const nameValid = validateProfileField("Profile Name", form.profileName, true)
    
    if (!nameValid.valid) { setError(nameValid.error!); setSaving(false); return; }
    if (!brandValid.valid) { setError(brandValid.error!); setSaving(false); return; }
    if (!prefixValid.valid) { setError(prefixValid.error!); setSaving(false); return; }

    try {
      const res = await fetch("/api/admin/display-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
      const resData = await res.json()
      if (res.ok) {
        setSuccess("Profile created successfully")
        mutate()
      } else {
        setError(resData.error || "Failed to create")
      }
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (id: string, isActive: boolean) => {
    await fetch("/api/admin/display-profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive })
    })
    mutate()
  }

  const setAsDefault = async (id: string, storeId: string) => {
    await fetch("/api/admin/display-profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDefault: true })
    })
    mutate()
  }

  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 text-[#FFD600] animate-spin" /></div>

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <div className="bg-[#151821] border border-[#343947] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold font-mono text-[#e7edf8] flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#FFD600]" />
          Create Payment Display Profile
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Target Store</label>
            <select 
              value={form.storeId} 
              onChange={e => update({ storeId: e.target.value })}
              className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]"
            >
              <option value="" disabled>Select Store...</option>
              {stores.map((s: any) => (
                <option key={s.id} value={s.id}>{s.tenant_name} / {s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Profile Name</label>
            <input value={form.profileName} onChange={e => update({ profileName: e.target.value })} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]" />
          </div>
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Industry Vertical</label>
            <select value={form.industryVertical} onChange={e => update({ industryVertical: e.target.value })} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]">
              <option value="automotive_tires">Automotive / Tires</option>
              <option value="electronics">Electronics</option>
              <option value="home_goods">Home Goods</option>
              <option value="toys">Toys & Gifts</option>
              <option value="beauty">Beauty / Fragrance</option>
              <option value="apparel">Apparel</option>
              <option value="generic_ecommerce">Generic Ecommerce</option>
            </select>
          </div>
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Display Mode</label>
            <select value={form.displayMode} onChange={e => update({ displayMode: e.target.value })} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]">
              <option value="BRAND_SEMANTIC">Brand + Semantic Order (BRAND_SEMANTIC)</option>
              <option value="SEMANTIC_ORDER">Semantic Order Only (SEMANTIC_ORDER)</option>
              <option value="REAL_SANITIZED">Sanitized Real Product Name (REAL_SANITIZED)</option>
              <option value="LEGACY_GENERIC">Deprecated: Legacy Generic (LEGACY_GENERIC)</option>
            </select>
          </div>
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Public Brand Name</label>
            <input value={form.publicBrandName} onChange={e => update({ publicBrandName: e.target.value })} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]" placeholder="e.g. TireVix" />
          </div>
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Descriptor Prefix</label>
            <input value={form.descriptorPrefix} onChange={e => update({ descriptorPrefix: e.target.value })} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]" placeholder="e.g. TireVix Auto" />
          </div>
          <div className="space-y-2.5 sm:col-span-2">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Line Item Policy</label>
            <select value={form.lineItemPolicy} onChange={e => update({ lineItemPolicy: e.target.value })} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]">
              <option value="SINGLE_SEMANTIC_ITEM">Single Order Summary (SINGLE_SEMANTIC_ITEM)</option>
              <option value="REAL_CART_ITEMS">Real Cart Items (REAL_CART_ITEMS)</option>
              <option value="LEGACY_RANDOM_SPLIT">Legacy Random Split (LEGACY_RANDOM_SPLIT)</option>
            </select>
          </div>
        </div>

        {/* Admin Warnings */}
        {form.displayMode === "LEGACY_GENERIC" && form.industryVertical !== "generic_ecommerce" && (
          <div className="bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-mono px-3 py-2 rounded-md">
            Generic service descriptors may confuse buyers. Recommended: Brand + Semantic Order.
          </div>
        )}
        {form.lineItemPolicy === "LEGACY_RANDOM_SPLIT" && (
          <div className="bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-mono px-3 py-2 rounded-md">
            This may create multiple PayPal line items that do not match the buyer&apos;s cart. Recommended: Single Order Summary.
          </div>
        )}
        {form.displayMode === "BRAND_SEMANTIC" && !form.publicBrandName && !form.descriptorPrefix && (
          <div className="bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-mono px-3 py-2 rounded-md">
            Brand + Semantic mode works best with a recognizable public brand or descriptor prefix.
          </div>
        )}

        <div className="bg-[#2a2d39]/30 border border-[#343947] rounded-md p-3 space-y-2 mt-2">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Live Preview</p>
          <div className="flex flex-col gap-1 text-[11px] font-mono text-[#e7edf8]">
            <p>Buyer may see: <span className="text-[#FFD600] font-semibold">{previewLoading ? "Loading..." : previewName}</span></p>
            <p className="text-[#97a3b6] mt-1">Line item policy: {form.lineItemPolicy}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleCreate} disabled={saving || !form.storeId} className="bg-[#FFD600] text-[#151821] px-4 py-2 rounded-md text-base font-semibold text-[#e7edf8] disabled:opacity-50">
            {saving ? "Creating..." : "Create Profile"}
          </button>
          {success && <span className="text-sm font-medium text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {success}</span>}
          {error && <span className="text-sm font-medium text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {error}</span>}
        </div>
      </div>

      {/* Profiles List */}
      <div className="bg-[#151821] border border-[#343947] rounded-lg p-5">
        <h3 className="text-sm font-semibold font-mono text-[#e7edf8] mb-4">Existing Profiles</h3>
        <div className="space-y-3">
          {profiles.map((p: any) => (
            <div key={p.id} className={`border ${p.is_active ? 'border-[#343947]' : 'border-red-500/30'} rounded-md p-4 bg-[#222530] flex flex-col sm:flex-row justify-between gap-4`}>
              <div className="space-y-1 text-sm font-mono text-[#97a3b6]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#e7edf8] text-sm">{p.profile_name}</span>
                  {p.is_default && <span className="bg-[#FFD600]/10 text-[#FFD600] px-2.5 py-0.5 rounded-full text-xs font-semibold">Default</span>}
                  {!p.is_active && <span className="bg-red-500/10 text-red-400 px-2.5 py-0.5 rounded-full text-xs font-semibold">Disabled</span>}
                </div>
                <p>Store: <span className="text-[#e7edf8]">{p.tenant_name} / {p.store_name}</span></p>
                <p>Mode: <span className="text-[#e7edf8]">{p.display_mode}</span></p>
                <p>Vertical: <span className="text-[#e7edf8]">{p.industry_vertical}</span></p>
                <p>Prefix: <span className="text-[#e7edf8]">{p.descriptor_prefix || "none"}</span> | Brand: <span className="text-[#e7edf8]">{p.public_brand_name || "none"}</span></p>
              </div>
              <div className="flex flex-col gap-2 min-w-[140px]">
                {!p.is_default && p.is_active && (
                  <button onClick={() => setAsDefault(p.id, p.store_id)} className="text-xs font-semibold font-mono border border-[#FFD600]/30 text-[#FFD600] hover:bg-[#FFD600]/10 px-3 py-1.5 rounded-md">
                    Set as Default
                  </button>
                )}
                <button onClick={() => toggleStatus(p.id, !p.is_active)} className={`text-xs font-semibold font-mono border px-3 py-1.5 rounded-md ${p.is_active ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10'}`}>
                  {p.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {profiles.length === 0 && <p className="text-sm font-mono text-[#97a3b6] text-center py-4">No profiles found</p>}
        </div>
      </div>
    </div>
  )
}
