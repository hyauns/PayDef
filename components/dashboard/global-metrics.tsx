"use client"

import { DollarSign, Shield, Activity } from "lucide-react"

const metrics = [
  {
    label: "Total Volume Today",
    value: "$48,291.50",
    sub: "+12.4% from yesterday",
    subColor: "text-emerald-400",
    icon: DollarSign,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-400/10",
    border: "border-cyan-400/20",
  },
  {
    label: "Active Shield Domains",
    value: "7 / 9",
    sub: "2 domains degraded",
    subColor: "text-amber-400",
    icon: Shield,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
  },
  {
    label: "System Health Status",
    value: "Operational",
    sub: "All core services running",
    subColor: "text-emerald-400",
    icon: Activity,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
  },
]

export function GlobalMetrics() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <div
            key={m.label}
            className={`bg-card border ${m.border} rounded-lg p-4 flex items-start gap-4`}
          >
            <div className={`${m.iconBg} rounded-md p-2.5 mt-0.5 shrink-0`}>
              <Icon className={`w-4 h-4 ${m.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-1">
                {m.label}
              </p>
              <p className="text-2xl font-mono font-semibold text-foreground leading-none mb-1">
                {m.value}
              </p>
              <p className={`text-xs font-mono ${m.subColor}`}>{m.sub}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
