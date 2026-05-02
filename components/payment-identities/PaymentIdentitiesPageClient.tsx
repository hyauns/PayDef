"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, RefreshCw, Loader2, Layers } from "lucide-react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { paymentIdentitiesCopy } from "@/lib/i18n/payment-identities"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"
import { PaymentIdentitiesSummaryCards } from "./PaymentIdentitiesSummaryCards"
import { PaymentIdentitiesTable, type IdentityRow } from "./PaymentIdentitiesTable"
import { PaymentIdentityFormDialog } from "./PaymentIdentityFormDialog"
import { PaymentIdentityItemsDialog } from "./PaymentIdentityItemsDialog"
import { PaymentIdentitySetupGuide } from "./PaymentIdentitySetupGuide"

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

export function PaymentIdentitiesPageClient() {
  const { language } = useLanguage()
  const t = paymentIdentitiesCopy[language]

  const { data, error, isLoading, mutate } = useSWR("/api/merchant/payment-identities", fetcher)

  const [formOpen, setFormOpen] = useState(false)
  const [editIdentity, setEditIdentity] = useState<IdentityRow | null>(null)
  const [itemsIdentity, setItemsIdentity] = useState<IdentityRow | null>(null)

  const identities = data?.bundles ?? []
  const shieldDomains = data?.shieldDomains ?? []

  const activeIdentities = identities.filter((b: any) => b.is_active)
  const readyIdentities = identities.filter((b: any) => {
    const domainObj = shieldDomains?.find((d: any) => d.domain === b.primary_shield_domain)
    const isDomainHealthy = domainObj ? (domainObj.is_active && domainObj.health_ok !== false) : false
    const hasBrand = !!b.public_brand_name
    const hasItems = b.active_item_count > 0
    const hasEmail = !!b.support_email
    const hasPolicies = !!(b.shipping_policy_url && b.refund_policy_url && b.privacy_policy_url && b.terms_url)
    const hasLongDescriptor = !!b.has_long_descriptor
    const hasDomain = !!b.primary_shield_domain

    return b.is_active && hasBrand && hasDomain && isDomainHealthy && hasItems && !hasLongDescriptor && hasEmail && hasPolicies
  })
  const needsAttentionCount = activeIdentities.length - readyIdentities.length

  function handleCreate() {
    setEditIdentity(null)
    setFormOpen(true)
  }

  function handleEdit(identity: IdentityRow) {
    setEditIdentity(identity)
    setFormOpen(true)
  }

  function handleFormClose() {
    setFormOpen(false)
    setEditIdentity(null)
  }

  function handleFormSaved() {
    mutate()
  }

  function handleManageItems(identity: IdentityRow) {
    setItemsIdentity(identity)
  }

  function handleItemsClose() {
    setItemsIdentity(null)
  }

  function handleItemsChanged() {
    mutate()
  }

  return (
    <main className="w-full px-6 md:px-8 py-8 space-y-6" data-ui-version="payment-identities-layout-i18n-v1">
      <DashboardPageHeader
        title={t.pageTitle}
        description={t.pageDescription}
      />

      <PaymentIdentitySetupGuide />

      {/* Summary Cards */}
      <PaymentIdentitiesSummaryCards
        total={identities.length}
        active={activeIdentities.length}
        ready={readyIdentities.length}
        needsAttention={needsAttentionCount}
        loading={isLoading}
      />

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-mono text-[#97a3b6]">
          {isLoading ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t.loading}</span>
          ) : error ? (
            <span className="text-red-400">Failed to load identities</span>
          ) : (
            <span>{identities.length} {t.thIdentity.toLowerCase()}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1f222c] text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#4a5568] text-xs font-mono transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFD600]/15 text-[#FFD600] hover:bg-[#FFD600]/25 font-mono text-xs font-medium border border-[#FFD600]/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t.createIdentity}
          </button>
        </div>
      </div>

      {/* Content */}
      {!isLoading && !error && identities.length === 0 && (
        <div className="text-center py-16 bg-[#151821] border border-[#343947] rounded-lg">
          <Layers className="w-12 h-12 text-[#343947] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[#e7edf8] mb-2">No Payment Identities</h3>
          <p className="text-sm text-[#97a3b6] mb-6 max-w-md mx-auto">
            A Payment Identity controls what domain, brand, support info, and item name are used during checkout.
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#FFD600] text-[#151821] hover:bg-[#e6c100] font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Your First Identity
          </button>
        </div>
      )}
      
      {!isLoading && !error && identities.length > 0 && (
        <PaymentIdentitiesTable identities={identities} shieldDomains={shieldDomains} onEdit={handleEdit} onManageItems={handleManageItems} />
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400 font-mono">
          Failed to load payment identities. Please check your connection and try again.
        </div>
      )}

      {/* Create/Edit Form Dialog */}
      <PaymentIdentityFormDialog
        open={formOpen}
        onClose={handleFormClose}
        onSaved={handleFormSaved}
        editIdentity={editIdentity}
        shieldDomains={shieldDomains}
      />

      {/* Items Manager Dialog */}
      {itemsIdentity && (
        <PaymentIdentityItemsDialog
          open={true}
          onClose={handleItemsClose}
          onItemsChanged={handleItemsChanged}
          bundleId={itemsIdentity.id}
          bundleName={itemsIdentity.bundle_name}
          publicBrandName={itemsIdentity.public_brand_name}
        />
      )}
    </main>
  )
}
