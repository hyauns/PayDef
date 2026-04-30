"use client"

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Globe,
  Package,
  Pencil,
  Link2,
} from "lucide-react"

const CARD = "bg-[#151821] border border-[#343947] rounded-lg"

export interface BundleRow {
  id: string
  tenant_id: string
  store_id: string | null
  display_profile_id: string | null
  bundle_name: string
  tenant_name: string | null
  store_name: string | null
  industry_vertical: string
  display_profile_name: string | null
  public_brand_name: string | null
  primary_shield_domain: string | null
  is_active: boolean
  is_default: boolean
  active_item_count: number
  assigned_accounts: number
  assigned_domains: number
  created_at: string
  [key: string]: any
}

interface IdentityBundlesTableProps {
  bundles: BundleRow[]
  onEdit?: (bundle: BundleRow) => void
  onManageItems?: (bundle: BundleRow) => void
  onManageAssignments?: (bundle: BundleRow) => void
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/20">
      <XCircle className="w-3 h-3" /> Inactive
    </span>
  )
}

function WarningsList({ bundle }: { bundle: BundleRow }) {
  const warnings: string[] = []
  if (bundle.active_item_count === 0) warnings.push("No active items")
  if (bundle.assigned_accounts === 0 && bundle.is_active) warnings.push("No assigned accounts")
  if (bundle.assigned_domains === 0 && bundle.is_active) warnings.push("No assigned domains")
  if (!warnings.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map((w) => (
        <span key={w} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-2.5 h-2.5" /> {w}
        </span>
      ))}
    </div>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function IdentityBundlesTable({ bundles, onEdit, onManageItems, onManageAssignments }: IdentityBundlesTableProps) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-[#343947] bg-[#1f222c]/60">
        <h3 className="text-sm font-mono font-semibold text-[#e7edf8] uppercase tracking-wider">
          All Bundles
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#343947] text-[#97a3b6] text-xs font-mono uppercase tracking-wider">
              <th className="text-left px-4 py-3">Bundle</th>
              <th className="text-left px-4 py-3">Tenant / Store</th>
              <th className="text-left px-4 py-3">Vertical</th>
              <th className="text-left px-4 py-3">Brand</th>
              <th className="text-center px-4 py-3"><Package className="w-3.5 h-3.5 inline" /> Items</th>
              <th className="text-center px-4 py-3"><Users className="w-3.5 h-3.5 inline" /> Accts</th>
              <th className="text-center px-4 py-3"><Globe className="w-3.5 h-3.5 inline" /> Domains</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Warnings</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#343947]/50">
            {bundles.map((b) => (
              <tr key={b.id} className="hover:bg-[#1f222c]/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono font-medium text-[#e7edf8]">{b.bundle_name}</div>
                  {b.display_profile_name && (
                    <div className="text-xs text-[#6b7280] mt-0.5">Profile: {b.display_profile_name}</div>
                  )}
                  {b.is_default && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">DEFAULT</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#97a3b6] font-mono text-xs">
                  <div>{b.tenant_name || "—"}</div>
                  {b.store_name && <div className="text-[#6b7280]">{b.store_name}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-[#1f222c] text-[#97a3b6] border border-[#343947]">
                    {b.industry_vertical}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#e7edf8] font-mono text-xs">
                  {b.public_brand_name || <span className="text-[#6b7280]">—</span>}
                </td>
                <td className="px-4 py-3 text-center font-mono text-[#e7edf8]">{b.active_item_count}</td>
                <td className="px-4 py-3 text-center font-mono text-[#e7edf8]">{b.assigned_accounts}</td>
                <td className="px-4 py-3 text-center font-mono text-[#e7edf8]">{b.assigned_domains}</td>
                <td className="px-4 py-3 text-center"><StatusBadge active={b.is_active} /></td>
                <td className="px-4 py-3"><WarningsList bundle={b} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(b)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#4a5568] text-xs font-mono transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    {onManageItems && (
                      <button
                        onClick={() => onManageItems(b)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#4a5568] text-xs font-mono transition-colors"
                      >
                        <Package className="w-3 h-3" /> Items
                      </button>
                    )}
                    {onManageAssignments && (
                      <button
                        onClick={() => onManageAssignments(b)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#4a5568] text-xs font-mono transition-colors"
                      >
                        <Link2 className="w-3 h-3" /> Assign
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
