"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { CheckCircle2, Loader2, XCircle, Tag, Plus } from "lucide-react"
import { validateProfileField } from "@/lib/profile-validation"

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function SuperAdminDescriptorTemplates() {
  const [industryFilter, setIndustryFilter] = useState("")
  const { data, isLoading, mutate } = useSWR(`/api/admin/descriptor-templates${industryFilter ? `?industry=${industryFilter}` : ""}`, fetcher)

  const [form, setForm] = useState({
    industryVertical: "generic_ecommerce",
    descriptorText: "",
  })

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  const templates = data?.templates || []

  const handleCreate = async () => {
    setSaving(true)
    setError("")
    setSuccess("")
    
    const textValid = validateProfileField("Descriptor Text", form.descriptorText, true)
    if (!textValid.valid) {
      setError(textValid.error!)
      setSaving(false)
      return
    }

    try {
      const res = await fetch("/api/admin/descriptor-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
      const resData = await res.json()
      if (res.ok) {
        setSuccess("Template added")
        setForm(p => ({ ...p, descriptorText: "" }))
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
    await fetch("/api/admin/descriptor-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive })
    })
    mutate()
  }

  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 text-[#FFD600] animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="bg-[#151821] border border-[#343947] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold font-mono text-[#e7edf8] flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#FFD600]" />
          Add Descriptor Template
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2.5">
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Industry Vertical</label>
            <select value={form.industryVertical} onChange={e => setForm(p => ({ ...p, industryVertical: e.target.value }))} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]">
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
            <label className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Descriptor Text</label>
            <input value={form.descriptorText} onChange={e => setForm(p => ({ ...p, descriptorText: e.target.value }))} className="w-full bg-[#1a1d24] border border-[#343947] rounded-md px-3 py-2.5 text-base text-[#e7edf8]" placeholder="e.g. Winter Tire Service" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleCreate} disabled={saving || !form.descriptorText} className="bg-[#FFD600] text-[#151821] px-4 py-2 rounded-md text-base font-semibold text-[#e7edf8] disabled:opacity-50">
            {saving ? "Adding..." : "Add Template"}
          </button>
          {success && <span className="text-sm font-medium text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {success}</span>}
          {error && <span className="text-sm font-medium text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {error}</span>}
        </div>
      </div>

      <div className="bg-[#151821] border border-[#343947] rounded-lg p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h3 className="text-sm font-semibold font-mono text-[#e7edf8] flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#FFD600]" />
            Active Templates
          </h3>
          <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} className="bg-[#222530] border border-[#343947] rounded-md px-3 py-1.5 text-xs font-mono text-[#e7edf8]">
            <option value="">All Industries</option>
            <option value="automotive_tires">Automotive / Tires</option>
            <option value="electronics">Electronics</option>
            <option value="home_goods">Home Goods</option>
            <option value="toys">Toys & Gifts</option>
            <option value="beauty">Beauty / Fragrance</option>
            <option value="apparel">Apparel</option>
            <option value="generic_ecommerce">Generic Ecommerce</option>
          </select>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t: any) => (
            <div key={t.id} className={`border ${t.is_active ? 'border-[#343947]' : 'border-red-500/30 opacity-60'} rounded-md p-3 bg-[#222530] flex justify-between items-center gap-2`}>
              <div className="space-y-1 overflow-hidden">
                <p className="text-sm font-semibold font-mono text-[#e7edf8] truncate" title={t.descriptor_text}>{t.descriptor_text}</p>
                <p className="text-sm leading-6 text-[#aab4c5]">{t.industry_vertical}</p>
              </div>
              <button onClick={() => toggleStatus(t.id, !t.is_active)} className="text-sm leading-6 text-[#aab4c5] hover:text-[#e7edf8] underline shrink-0">
                {t.is_active ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
          {templates.length === 0 && <p className="text-xs font-mono text-[#97a3b6] py-2 col-span-2 text-center">No templates found</p>}
        </div>
      </div>
    </div>
  )
}
