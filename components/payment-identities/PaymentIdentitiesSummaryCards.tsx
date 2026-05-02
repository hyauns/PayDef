"use client"

import { Layers } from "lucide-react"
import { GridBackground } from "@/components/ui/grid-background"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { paymentIdentitiesCopy } from "@/lib/i18n/payment-identities"

const CARD = "bg-[#151821] border border-[#343947] rounded-lg"
const LABEL = "text-xs font-mono text-[#97a3b6] uppercase tracking-wider"

interface SummaryCardsProps {
  total: number
  active: number
  ready: number
  needsAttention: number
  loading: boolean
}

export function PaymentIdentitiesSummaryCards({ total, active, ready, needsAttention, loading }: SummaryCardsProps) {
  const { language } = useLanguage()
  const t = paymentIdentitiesCopy[language]

  const cards = [
    { id: "total", label: t.totalIdentities, value: total, accent: "text-[#e7edf8]", tooltip: "" },
    { id: "active", label: t.activeIdentities, value: active, accent: "text-emerald-400", tooltip: "" },
    { id: "ready", label: t.ready, value: ready, accent: "text-sky-400", tooltip: t.readyTooltip },
    { id: "needs", label: t.needsAttention, value: needsAttention, accent: needsAttention > 0 ? "text-amber-400" : "text-[#97a3b6]", tooltip: t.needsAttentionTooltip },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.id} className={`${CARD} p-4 flex flex-col gap-2 relative overflow-hidden`}>
            <GridBackground />
            <div className="relative z-10 flex items-center gap-2 text-[#97a3b6]">
              <Layers className="w-4 h-4" />
              <span className={LABEL}>{c.label}</span>
            </div>
            <div className="relative z-10 h-8 w-16 bg-[#1f222c] rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-ui-version="payment-identities-cleanup-v1">
      {cards.map((c) => (
        <div key={c.id} className={`${CARD} p-4 flex flex-col gap-2 relative overflow-hidden`} title={c.tooltip || undefined}>
          <GridBackground />
          <div className="relative z-10 flex items-center gap-2 text-[#97a3b6]">
            <Layers className="w-4 h-4" />
            <span className={LABEL}>{c.label}</span>
          </div>
          <p className={`relative z-10 text-2xl font-mono font-bold ${c.accent}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}
