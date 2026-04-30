"use client"

import { Boxes, AlertTriangle } from "lucide-react"
import { GridBackground } from "@/components/ui/grid-background"

const CARD = "bg-[#151821] border border-[#343947] rounded-lg"
const LABEL = "text-xs font-mono text-[#97a3b6] uppercase tracking-wider"

interface SummaryCardsProps {
  total: number
  active: number
  assignedAccounts: number
  assignedDomains: number
  loading: boolean
}

export function IdentityBundleSummaryCards({ total, active, assignedAccounts, assignedDomains, loading }: SummaryCardsProps) {
  const cards = [
    { label: "Total Bundles", value: total, accent: "text-[#e7edf8]" },
    { label: "Active Bundles", value: active, accent: "text-emerald-400" },
    { label: "Assigned Accounts", value: assignedAccounts, accent: "text-sky-400" },
    { label: "Assigned Domains", value: assignedDomains, accent: "text-amber-400" },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`${CARD} p-4 flex flex-col gap-2 relative overflow-hidden`}>
            <GridBackground />
            <div className="relative z-10 flex items-center gap-2 text-[#97a3b6]">
              <Boxes className="w-4 h-4" />
              <span className={LABEL}>{c.label}</span>
            </div>
            <div className="relative z-10 h-8 w-16 bg-[#1f222c] rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className={`${CARD} p-4 flex flex-col gap-2 relative overflow-hidden`} data-ui-version="grid-background-v1">
          <GridBackground />
          <div className="relative z-10 flex items-center gap-2 text-[#97a3b6]">
            <Boxes className="w-4 h-4" />
            <span className={LABEL}>{c.label}</span>
          </div>
          <p className={`relative z-10 text-2xl font-mono font-bold ${c.accent}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}
