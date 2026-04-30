"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, RefreshCw, Loader2 } from "lucide-react"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { IdentityBundleSummaryCards } from "./IdentityBundleSummaryCards"
import { IdentityBundlesTable, type BundleRow } from "./IdentityBundlesTable"
import { IdentityBundleEmptyState } from "./IdentityBundleEmptyState"
import { IdentityBundleFormDialog } from "./IdentityBundleFormDialog"
import { IdentityBundleItemsDialog } from "./IdentityBundleItemsDialog"
import { IdentityBundleAssignmentsDialog } from "./IdentityBundleAssignmentsDialog"

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

export function IdentityBundlesPageClient() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/identity-bundles", fetcher)

  const [formOpen, setFormOpen] = useState(false)
  const [editBundle, setEditBundle] = useState<BundleRow | null>(null)
  const [itemsBundle, setItemsBundle] = useState<BundleRow | null>(null)
  const [assignBundle, setAssignBundle] = useState<BundleRow | null>(null)

  const bundles = data?.bundles ?? []
  const tenants = data?.tenants ?? []
  const stores = data?.stores ?? []
  const profiles = data?.profiles ?? []

  const activeBundles = bundles.filter((b: any) => b.is_active)
  const totalAssignedAccounts = bundles.reduce((s: number, b: any) => s + (b.assigned_accounts || 0), 0)
  const totalAssignedDomains = bundles.reduce((s: number, b: any) => s + (b.assigned_domains || 0), 0)

  function handleCreate() {
    setEditBundle(null)
    setFormOpen(true)
  }

  function handleEdit(bundle: BundleRow) {
    setEditBundle(bundle)
    setFormOpen(true)
  }

  function handleFormClose() {
    setFormOpen(false)
    setEditBundle(null)
  }

  function handleFormSaved() {
    mutate()
  }

  function handleManageItems(bundle: BundleRow) {
    setItemsBundle(bundle)
  }

  function handleItemsClose() {
    setItemsBundle(null)
  }

  function handleItemsChanged() {
    mutate()
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Payment Identity Bundles"
        description="Manage payment display profiles, merchant accounts, shield domains, descriptors, and support identity as one operational bundle."
      />

      {/* Summary Cards */}
      <IdentityBundleSummaryCards
        total={bundles.length}
        active={activeBundles.length}
        assignedAccounts={totalAssignedAccounts}
        assignedDomains={totalAssignedDomains}
        loading={isLoading}
      />

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-mono text-[#97a3b6]">
          {isLoading ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading bundles…</span>
          ) : error ? (
            <span className="text-red-400">Failed to load bundles</span>
          ) : (
            <span>{bundles.length} bundle{bundles.length !== 1 ? "s" : ""} found</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#4a5568] text-xs font-mono transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD600]/15 text-[#FFD600] hover:bg-[#FFD600]/25 font-mono text-xs font-medium border border-[#FFD600]/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Create Bundle
          </button>
        </div>
      </div>

      {/* Content */}
      {!isLoading && !error && bundles.length === 0 && <IdentityBundleEmptyState />}
      {!isLoading && !error && bundles.length > 0 && (
        <IdentityBundlesTable bundles={bundles} onEdit={handleEdit} onManageItems={handleManageItems} onManageAssignments={(b) => setAssignBundle(b)} />
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400 font-mono">
          Failed to load identity bundles. Please check your connection and try again.
        </div>
      )}

      {/* Create/Edit Form Dialog */}
      <IdentityBundleFormDialog
        open={formOpen}
        onClose={handleFormClose}
        onSaved={handleFormSaved}
        editBundle={editBundle}
        tenants={tenants}
        stores={stores}
        profiles={profiles}
      />

      {/* Items Manager Dialog */}
      {itemsBundle && (
        <IdentityBundleItemsDialog
          open={true}
          onClose={handleItemsClose}
          onItemsChanged={handleItemsChanged}
          bundleId={itemsBundle.id}
          bundleName={itemsBundle.bundle_name}
          publicBrandName={itemsBundle.public_brand_name}
        />
      )}

      {/* Assignments Manager Dialog */}
      {assignBundle && (
        <IdentityBundleAssignmentsDialog
          open={true}
          onClose={() => setAssignBundle(null)}
          onAssignmentsChanged={() => mutate()}
          bundleId={assignBundle.id}
          bundleName={assignBundle.bundle_name}
          publicBrandName={assignBundle.public_brand_name}
          industryVertical={assignBundle.industry_vertical}
        />
      )}
    </div>
  )
}
