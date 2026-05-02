"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import {
  X, Plus, Pencil, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Package, Truck, Eye,
} from "lucide-react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { paymentIdentitiesCopy } from "@/lib/i18n/payment-identities"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemRow {
  id: string
  bundle_id: string
  descriptor_name: string
  product_slug: string | null
  product_title: string
  product_description: string | null
  product_type: string
  shipping_required: boolean
  tracking_expected: boolean
  price_min: number | null
  price_max: number | null
  image_url: string | null
  is_active: boolean
  sort_order: number
}

interface ItemFormData {
  id?: string
  descriptorName: string
  productSlug: string
  productTitle: string
  productDescription: string
  productType: string
  shippingRequired: boolean
  trackingExpected: boolean
  priceMin: string
  priceMax: string
  imageUrl: string
  isActive: boolean
  sortOrder: string
}

interface Props {
  open: boolean
  onClose: () => void
  onItemsChanged: () => void
  bundleId: string
  bundleName: string
  publicBrandName: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_TYPES = ["physical_good", "digital_good", "service", "category"]

const INITIAL_ITEM: ItemFormData = {
  descriptorName: "", productSlug: "", productTitle: "",
  productDescription: "", productType: "physical_good",
  shippingRequired: true, trackingExpected: true,
  priceMin: "", priceMax: "", imageUrl: "",
  isActive: true, sortOrder: "0",
}

const INPUT = "w-full bg-[#0d0f14] border border-[#343947] rounded-lg px-3 py-2.5 text-sm text-[#e7edf8] font-mono placeholder:text-[#4a5568] focus:outline-none focus:border-[#FFD600]/40 focus:ring-1 focus:ring-[#FFD600]/20 transition-colors"
const SELECT = `${INPUT} appearance-none`
const LABEL_CLS = "block text-sm font-medium text-[#97a3b6] mb-1.5"

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentIdentityItemsDialog({
  open, onClose, onItemsChanged, bundleId, bundleName, publicBrandName,
}: Props) {
  const { language } = useLanguage()
  const t = paymentIdentitiesCopy[language]

  const { data, error, isLoading, mutate } = useSWR(
    open ? `/api/merchant/payment-identities/items?bundleId=${bundleId}` : null,
    fetcher
  )
  const items: ItemRow[] = data?.items ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<ItemRow | null>(null)
  const [formData, setFormData] = useState<ItemFormData>(INITIAL_ITEM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState(false)
  const [disablingId, setDisablingId] = useState<string | null>(null)

  const isEdit = Boolean(editItem?.id)

  // Populate form for edit
  useEffect(() => {
    if (editItem) {
      setFormData({
        id: editItem.id,
        descriptorName: editItem.descriptor_name,
        productSlug: editItem.product_slug || "",
        productTitle: editItem.product_title,
        productDescription: editItem.product_description || "",
        productType: editItem.product_type,
        shippingRequired: editItem.shipping_required,
        trackingExpected: editItem.tracking_expected,
        priceMin: editItem.price_min != null ? String(editItem.price_min) : "",
        priceMax: editItem.price_max != null ? String(editItem.price_max) : "",
        imageUrl: editItem.image_url || "",
        isActive: editItem.is_active,
        sortOrder: String(editItem.sort_order ?? 0),
      })
    } else {
      setFormData(INITIAL_ITEM)
    }
    setFormError(null)
    setFormSuccess(false)
  }, [editItem])

  const set = (key: keyof ItemFormData, value: string | boolean) =>
    setFormData(prev => ({ ...prev, [key]: value }))

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(false)

    if (!formData.descriptorName.trim()) { setFormError("Descriptor Name is required"); return }
    if (!formData.productTitle.trim()) { setFormError("Product Title is required"); return }

    const previewDescriptor = getPreviewDescriptor(formData.descriptorName)
    if (previewDescriptor.length > 127) {
      setFormError(`Descriptor exceeds PayPal's 127 char limit (${previewDescriptor.length}/127)`);
      return;
    }

    setSaving(true)
    try {
      const method = isEdit ? "PATCH" : "POST"
      const payload: any = {
        descriptorName: formData.descriptorName.trim(),
        productSlug: formData.productSlug.trim() || null,
        productTitle: formData.productTitle.trim(),
        productDescription: formData.productDescription.trim() || null,
        productType: formData.productType,
        shippingRequired: formData.shippingRequired,
        trackingExpected: formData.trackingExpected,
        priceMin: formData.priceMin ? Number(formData.priceMin) : null,
        priceMax: formData.priceMax ? Number(formData.priceMax) : null,
        imageUrl: formData.imageUrl.trim() || null,
        isActive: formData.isActive,
        sortOrder: parseInt(formData.sortOrder) || 0,
      }

      if (isEdit) {
        payload.id = editItem!.id
      } else {
        payload.bundleId = bundleId
      }

      const res = await fetch("/api/merchant/payment-identities/items", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) { setFormError(result.error || `Failed (${res.status})`); return }

      setFormSuccess(true)
      setTimeout(() => {
        setFormOpen(false)
        setEditItem(null)
        mutate()
        onItemsChanged()
      }, 500)
    } catch (err: any) {
      setFormError(err.message || "Network error")
    } finally {
      setSaving(false)
    }
  }

  // ── Disable ─────────────────────────────────────────────────────────────────

  async function handleDisable(itemId: string) {
    setDisablingId(itemId)
    try {
      const res = await fetch(`/api/merchant/payment-identities/items?id=${itemId}`, { method: "DELETE" })
      if (res.ok) {
        mutate()
        onItemsChanged()
      }
    } finally {
      setDisablingId(null)
    }
  }

  if (!open) return null

  // Descriptor preview
  function getPreviewDescriptor(descriptorName: string) {
    if (!descriptorName) return ""
    
    const prefix = publicBrandName?.trim()
    let baseDescriptor = descriptorName.trim()

    // Prevent duplicate brand prefix
    if (prefix && baseDescriptor.toLowerCase().startsWith(prefix.toLowerCase())) {
      baseDescriptor = baseDescriptor.slice(prefix.length).replace(/^[-\s]+/, "")
    }

    return prefix ? `${prefix} - ${baseDescriptor}` : baseDescriptor
  }

  const previewDescriptor = getPreviewDescriptor(formData.descriptorName)
  const isTooLong = previewDescriptor.length > 127

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-[960px] bg-[#151821] border border-[#343947] rounded-xl shadow-2xl mx-4"
        data-ui-version="merchant-identity-items-manager-v1"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#343947] bg-[#1f222c]/60 rounded-t-xl">
          <div>
            <h2 className="text-base font-mono font-semibold text-[#e7edf8]">
              Identity Products — {bundleName}
            </h2>
            <p className="text-xs text-[#6b7280] mt-0.5 font-mono">
              Manage the products and items associated with this payment identity
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#343947]/40 text-[#6b7280] hover:text-[#e7edf8] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[calc(100vh-160px)] overflow-y-auto">

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-[#97a3b6]">
              {isLoading ? t.loading : `${items.length} product${items.length !== 1 ? "s" : ""}`}
            </span>
            <button
              onClick={() => { setEditItem(null); setFormOpen(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD600]/15 text-[#FFD600] hover:bg-[#FFD600]/25 font-mono text-xs font-medium border border-[#FFD600]/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t.addItem}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 font-mono">
              Failed to load items.
            </div>
          )}

          {/* Items Table */}
          {!isLoading && items.length > 0 && (
            <div className="bg-[#0d0f14] border border-[#343947] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#343947] text-[#97a3b6] text-xs font-mono uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">{t.descriptorName}</th>
                    <th className="text-left px-4 py-2.5">{t.productTitle}</th>
                    <th className="text-left px-4 py-2.5">Type</th>
                    <th className="text-center px-3 py-2.5"><Truck className="w-3 h-3 inline" /></th>
                    <th className="text-center px-3 py-2.5">{t.thStatus}</th>
                    <th className="text-right px-4 py-2.5">{t.thActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#343947]/40">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-[#151821]/60 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-[#e7edf8] text-xs">{item.descriptor_name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#97a3b6] font-mono max-w-[200px] truncate">{item.product_title}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1f222c] text-[#97a3b6] border border-[#343947]">
                          {item.product_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs font-mono">
                        {item.shipping_required ? <span className="text-emerald-400">✓</span> : <span className="text-[#6b7280]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {item.is_active ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="w-2.5 h-2.5" /> Off
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditItem(item); setFormOpen(true) }}
                            className="px-2 py-1 rounded text-[10px] font-mono bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#4a5568] transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {item.is_active && (
                            <button
                              onClick={() => handleDisable(item.id)}
                              disabled={disablingId === item.id}
                              className="px-2 py-1 rounded text-[10px] font-mono bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                            >
                              {disablingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty items */}
          {!isLoading && !error && items.length === 0 && (
            <div className="text-center py-10">
              <Package className="w-10 h-10 text-[#343947] mx-auto mb-3" />
              <p className="text-sm text-[#6b7280] font-mono">{t.noItemsFound}</p>
              <p className="text-xs text-[#4a5568] font-mono mt-1">Add products to build the buyer-facing identity.</p>
            </div>
          )}

          {/* ── Item Form (inline) ─────────────────────────────────────────── */}
          {formOpen && (
            <div className="bg-[#1f222c] border border-[#343947] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-mono font-semibold text-[#e7edf8]">
                  {isEdit ? t.editItem : t.addItem}
                </h4>
                <button onClick={() => { setFormOpen(false); setEditItem(null) }} className="text-[#6b7280] hover:text-[#e7edf8]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLS}>{t.descriptorName} <span className="text-red-400">*</span></label>
                    <input className={INPUT} value={formData.descriptorName} onChange={e => set("descriptorName", e.target.value)} placeholder={t.descriptorNamePlaceholder} />
                    <p className="text-xs text-[#6b7280] mt-1">{t.descriptorHelper}</p>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>{t.productTitle} <span className="text-red-400">*</span></label>
                    <input className={INPUT} value={formData.productTitle} onChange={e => set("productTitle", e.target.value)} placeholder={t.productTitlePlaceholder} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Product Type</label>
                    <select className={SELECT} value={formData.productType} onChange={e => set("productType", e.target.value)}>
                      {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Sort Order</label>
                    <input type="number" className={INPUT} value={formData.sortOrder} onChange={e => set("sortOrder", e.target.value)} placeholder="0" />
                  </div>
                  <div className="flex items-center gap-6 pt-4">
                    <label className="flex items-center gap-2 text-sm text-[#97a3b6] cursor-pointer">
                      <input type="checkbox" checked={formData.shippingRequired} onChange={e => set("shippingRequired", e.target.checked)} className="accent-emerald-400" />
                      Shipping Required
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#97a3b6] cursor-pointer">
                      <input type="checkbox" checked={formData.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-emerald-400" />
                      Active
                    </label>
                  </div>
                </div>

                {/* Descriptor Preview */}
                {previewDescriptor && (
                  <div className={`bg-[#0d0f14] border rounded-lg px-4 py-3 ${isTooLong ? 'border-red-500/50' : 'border-[#343947]'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-mono text-[#6b7280] uppercase tracking-wider">{t.paypalDescriptorPreview}</p>
                      <p className={`text-[10px] font-mono ${isTooLong ? 'text-red-400' : 'text-[#6b7280]'}`}>
                        {previewDescriptor.length} / 127
                      </p>
                    </div>
                    <p className="text-xs text-[#6b7280] mb-2">This preview shows the final item name PayPal will receive when identity enforcement is enabled.</p>
                    <p className={`text-sm font-mono ${isTooLong ? 'text-red-400' : 'text-[#e7edf8]'}`}>{previewDescriptor}</p>
                  </div>
                )}

                {/* Form status */}
                {formError && (
                  <div className="flex items-center gap-2 text-sm text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="flex items-center gap-2 text-sm text-emerald-400 font-mono">
                    <CheckCircle2 className="w-4 h-4" /> {isEdit ? "Product updated" : "Product created"}
                  </div>
                )}

                {/* Form actions */}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button type="button" onClick={() => { setFormOpen(false); setEditItem(null) }}
                    className="px-4 py-2 rounded-lg bg-[#151821] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] text-sm font-mono transition-colors">
                    {t.cancel}
                  </button>
                  <button type="submit" disabled={saving || formSuccess || isTooLong}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#FFD600]/15 text-[#FFD600] hover:bg-[#FFD600]/25 border border-[#FFD600]/30 text-sm font-mono font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? "Saving…" : (isEdit ? t.saveChanges : t.addItem)}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
