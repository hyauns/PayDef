"use client"

import { Boxes, Plus } from "lucide-react"

export function IdentityBundleEmptyState() {
  return (
    <div className="bg-[#151821] border border-[#343947] rounded-lg p-12 text-center">
      <div className="flex justify-center mb-4">
        <div className="w-16 h-16 rounded-xl bg-[#1f222c] border border-[#343947] flex items-center justify-center">
          <Boxes className="w-8 h-8 text-[#6b7280]" />
        </div>
      </div>
      <h3 className="text-lg font-mono font-semibold text-[#e7edf8] mb-2">No Identity Bundles</h3>
      <p className="text-sm text-[#97a3b6] max-w-md mx-auto mb-6">
        Identity Bundles connect payment display profiles, merchant accounts, shield domains,
        and product descriptors into a single compliance-first operational unit.
      </p>
      <button
        disabled
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#FFD600]/10 text-[#FFD600] font-mono text-sm font-medium border border-[#FFD600]/20 opacity-60 cursor-not-allowed"
      >
        <Plus className="w-4 h-4" />
        Create Bundle (Coming Soon)
      </button>
    </div>
  )
}
