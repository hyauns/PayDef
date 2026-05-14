"use client"

import { Layers, CheckCircle2, AlertTriangle, Eye, Package, Trash2, Loader2 } from "lucide-react"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { paymentIdentitiesCopy } from "@/lib/i18n/payment-identities"

export interface IdentityRow {
  id: string
  bundle_name: string
  public_brand_name: string | null
  primary_shield_domain: string | null
  is_active: boolean
  active_item_count: number
  assigned_accounts: number
  assigned_domains: number
  [key: string]: any
}

interface TableProps {
  identities: IdentityRow[]
  shieldDomains: { id: string, domain: string, is_active: boolean, health_ok: boolean }[]
  onEdit: (identity: IdentityRow) => void
  onManageItems: (identity: IdentityRow) => void
  onDelete?: (id: string) => void
  deletingId?: string | null
}

export function PaymentIdentitiesTable({ identities, shieldDomains, onEdit, onManageItems, onDelete, deletingId }: TableProps) {
  const { language } = useLanguage()
  const t = paymentIdentitiesCopy[language]

  return (
    <div className="bg-[#151821] border border-[#343947] rounded-lg overflow-hidden" data-ui-version="merchant-payment-identities-v1">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1f222c] border-b border-[#343947]">
              <th className="py-3 px-4 text-xs font-mono text-[#97a3b6] uppercase tracking-wider font-semibold">{t.thIdentity}</th>
              <th className="py-3 px-4 text-xs font-mono text-[#97a3b6] uppercase tracking-wider font-semibold">{t.thBrandDomain}</th>
              <th className="py-3 px-4 text-xs font-mono text-[#97a3b6] uppercase tracking-wider font-semibold">{t.thDescriptorItems}</th>
              <th className="py-3 px-4 text-xs font-mono text-[#97a3b6] uppercase tracking-wider font-semibold">{t.thPolicies}</th>
              <th className="py-3 px-4 text-xs font-mono text-[#97a3b6] uppercase tracking-wider font-semibold text-right">{t.thActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#343947]/50">
            {identities.map((identity) => {
              const domainObj = shieldDomains?.find(d => d.domain === identity.primary_shield_domain)
              const isDomainHealthy = domainObj ? (domainObj.is_active && domainObj.health_ok !== false) : false
              const hasBrand = !!identity.public_brand_name
              const hasItems = identity.active_item_count > 0
              const hasEmail = !!identity.support_email
              const hasPolicies = !!(identity.shipping_policy_url && identity.refund_policy_url && identity.privacy_policy_url && identity.terms_url)
              const hasLongDescriptor = !!identity.has_long_descriptor
              const hasDomain = !!identity.primary_shield_domain

              const isReady = identity.is_active && hasBrand && hasDomain && isDomainHealthy && hasItems && !hasLongDescriptor && hasEmail && hasPolicies

              return (
                <tr key={identity.id} className="hover:bg-[#1a1d24] transition-colors group">
                  <td className="py-3 px-4 align-top">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-[#e7edf8]">{identity.bundle_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                          identity.is_active 
                            ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" 
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${identity.is_active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                          {identity.is_active ? t.active.toUpperCase() : t.inactive.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <span className="text-sm text-[#c8cfd8]">{identity.public_brand_name || <span className="text-[#6b7280] italic">Not set</span>}</span>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <span className="text-sm font-mono text-[#97a3b6]">{identity.primary_shield_domain || <span className="text-[#6b7280] italic">Not set</span>}</span>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <div className="flex flex-col gap-1.5">
                      {isReady ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.ready}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{t.needsAttention}</span>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-0.5 mt-1">
                        {!identity.is_active && (
                          <span className="text-[11px] text-[#97a3b6]">- Currently disabled</span>
                        )}
                        {identity.is_active && !hasBrand && (
                          <span className="text-[11px] text-amber-400">- {t.publicBrandNamePlaceholder.replace('e.g. ', 'Missing ')}</span>
                        )}
                        {identity.is_active && !hasDomain && (
                          <span className="text-[11px] text-amber-400">- {t.missingShieldDomain}</span>
                        )}
                        {identity.is_active && hasDomain && !isDomainHealthy && (
                          <span className="text-[11px] text-red-400">
                            - {t.domainNotHealthyHint}{" "}
                            <a href="/domains" className="underline hover:text-red-300 transition-colors">→ Domains</a>
                          </span>
                        )}
                        {identity.is_active && !hasItems && (
                          <span className="text-[11px] text-red-400">- {t.missingActiveItem}</span>
                        )}
                        {identity.is_active && hasLongDescriptor && (
                          <span className="text-[11px] text-red-400">- {t.descriptorTooLong}</span>
                        )}
                        {identity.is_active && !hasEmail && (
                          <span className="text-[11px] text-amber-400">- Missing support email</span>
                        )}
                        {identity.is_active && !hasPolicies && (
                          <span className="text-[11px] text-amber-400">- {t.missingPolicyUrls}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onManageItems(identity)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FFD600] border border-[#FFD600]/30 rounded-md hover:bg-[#FFD600]/10 transition-colors"
                      >
                        <Package className="w-3.5 h-3.5" />
                        {t.manageItems} ({identity.active_item_count})
                      </button>
                      <button
                        onClick={() => onEdit(identity)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#e7edf8] border border-[#343947] rounded-md hover:bg-[#2a2d39] transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#97a3b6]" />
                        {t.editIdentity}
                      </button>
                      {onDelete && (
                        <button
                          onClick={() => onDelete(identity.id)}
                          disabled={deletingId === identity.id}
                          className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          title="Delete Identity"
                        >
                          {deletingId === identity.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
