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

  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 text-cyan-400 animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="bg-background border border-border rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold font-mono text-foreground flex items-center gap-2">
          <Plus className="w-4 h-4 text-cyan-400" />
          Add Descriptor Template
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Industry Vertical</label>
            <select value={form.industryVertical} onChange={e => setForm(p => ({ ...p, industryVertical: e.target.value }))} className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground">
              <option value="automotive_tires">Automotive / Tires</option>
              <option value="electronics">Electronics</option>
              <option value="home_goods">Home Goods</option>
              <option value="toys">Toys & Gifts</option>
              <option value="beauty">Beauty / Fragrance</option>
              <option value="apparel">Apparel</option>
              <option value="generic_ecommerce">Generic Ecommerce</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Descriptor Text</label>
            <input value={form.descriptorText} onChange={e => setForm(p => ({ ...p, descriptorText: e.target.value }))} className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground" placeholder="e.g. Winter Tire Service" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleCreate} disabled={saving || !form.descriptorText} className="bg-cyan-400 text-background px-4 py-2 rounded-md text-xs font-mono font-semibold disabled:opacity-50">
            {saving ? "Adding..." : "Add Template"}
          </button>
          {success && <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {success}</span>}
          {error && <span className="text-[11px] font-mono text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {error}</span>}
        </div>
      </div>

      <div className="bg-background border border-border rounded-lg p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h3 className="text-sm font-semibold font-mono text-foreground flex items-center gap-2">
            <Tag className="w-4 h-4 text-cyan-400" />
            Active Templates
          </h3>
          <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} className="bg-card border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground">
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
            <div key={t.id} className={`border ${t.is_active ? 'border-border' : 'border-red-500/30 opacity-60'} rounded-md p-3 bg-card flex justify-between items-center gap-2`}>
              <div className="space-y-1 overflow-hidden">
                <p className="text-sm font-semibold font-mono text-foreground truncate" title={t.descriptor_text}>{t.descriptor_text}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{t.industry_vertical}</p>
              </div>
              <button onClick={() => toggleStatus(t.id, !t.is_active)} className="text-[10px] font-mono text-muted-foreground hover:text-foreground underline shrink-0">
                {t.is_active ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
          {templates.length === 0 && <p className="text-xs font-mono text-muted-foreground py-2 col-span-2 text-center">No templates found</p>}
        </div>
      </div>
    </div>
  )
}
