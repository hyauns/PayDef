import { ReactNode } from "react"
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { GridBackground } from "@/components/ui/grid-background"

interface StatCardProps {
  label: string
  value: string | number
  helper?: string
  icon?: LucideIcon
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  active?: boolean
}

export function StatCard({ label, value, helper, icon: Icon, trend, trendValue, active }: StatCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-[#97a3b6]"

  return (
    <div className={`relative bg-[#222530] border rounded-xl p-6 flex flex-col gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-all overflow-hidden ${active ? "border-[#FFD600]/50 border-b-[3px] border-b-[#FFD600]/70" : "border-[#343947] border-b-[3px] border-b-[#2a2e3b] hover:border-[#3a4050] hover:border-b-[#343947]"}`} data-ui-version="grid-background-v1">
      <GridBackground />
      <div className="absolute -bottom-1 -right-1 w-16 h-16 bg-gradient-to-tl from-[#343947]/30 to-transparent rounded-tl-full pointer-events-none z-10" />
      {active && (
        <span className="absolute left-0 top-0 w-full h-1 bg-[#FFD600] z-10" />
      )}
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-xs font-bold text-[#97a3b6] uppercase tracking-wider">{label}</p>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${active ? "bg-[#FFD600]/10 text-[#FFD600]" : "bg-[#1f222c] text-[#e7edf8] shadow-inner"}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="relative z-10 mt-1">
        <p className="text-3xl font-bold text-[#e7edf8] leading-none mb-2">{value}</p>
        {(helper || trendValue) && (
          <div className="flex items-center gap-2">
            {trendValue && (
              <div className={`flex items-center gap-1 text-xs font-bold ${trendColor}`}>
                <TrendIcon className="w-3.5 h-3.5" />
                <span>{trendValue}</span>
              </div>
            )}
            {helper && (
              <p className="text-xs font-medium text-[#97a3b6] truncate">{helper}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
