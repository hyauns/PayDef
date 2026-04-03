"use client"

import { useState } from "react"
import { BarChart2, Clock, List, CheckCircle2, Info } from "lucide-react"

type RotationMode = "volume" | "time" | "sequential"

interface ModeConfig {
  id: RotationMode
  label: string
  description: string
  detail: string
  icon: typeof BarChart2
  color: string
  bg: string
  border: string
}

const modes: ModeConfig[] = [
  {
    id: "volume",
    label: "Volume Based",
    description: "Route to account with lowest daily spend",
    detail: "Distributes load by comparing each account's current volume vs daily limit, always routing to the account with the most headroom.",
    icon: BarChart2,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/30",
  },
  {
    id: "time",
    label: "Time Based",
    description: "Rotate accounts on a fixed schedule",
    detail: "Switches the active PayPal account at configured time intervals (e.g., every 2 hours) regardless of current volume.",
    icon: Clock,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/30",
  },
  {
    id: "sequential",
    label: "Sequential",
    description: "Round-robin through account list in order",
    detail: "Each new transaction is routed to the next account in the list cyclically, distributing requests evenly over time.",
    icon: List,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
  },
]

const timeIntervals = ["15 min", "30 min", "1 hour", "2 hours", "4 hours", "12 hours"]

export function RotationLogic() {
  const [active, setActive] = useState<RotationMode>("volume")
  const [timeInterval, setTimeInterval] = useState("2 hours")
  const [showInfo, setShowInfo] = useState(false)

  const activeMode = modes.find((m) => m.id === active)!

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Rotation Logic</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Configure how traffic is routed across PayPal accounts</p>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="Mode info"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Mode selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {modes.map((mode) => {
            const Icon = mode.icon
            const isActive = active === mode.id
            return (
              <button
                key={mode.id}
                onClick={() => setActive(mode.id)}
                className={`relative flex flex-col items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                  isActive
                    ? `${mode.border} ${mode.bg}`
                    : "border-border hover:border-border/80 hover:bg-secondary/30"
                }`}
              >
                {isActive && (
                  <CheckCircle2 className={`w-3.5 h-3.5 absolute top-2 right-2 ${mode.color}`} />
                )}
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isActive ? mode.bg : "bg-secondary"}`}>
                  <Icon className={`w-4 h-4 ${isActive ? mode.color : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isActive ? mode.color : "text-foreground"}`}>
                    {mode.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    {mode.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className={`text-xs font-mono text-muted-foreground ${activeMode.bg} border ${activeMode.border} rounded-md p-3 leading-relaxed`}>
            <span className={`font-semibold ${activeMode.color}`}>{activeMode.label}: </span>
            {activeMode.detail}
          </div>
        )}

        {/* Time interval sub-option */}
        {active === "time" && (
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Rotation Interval</p>
            <div className="flex flex-wrap gap-2">
              {timeIntervals.map((interval) => (
                <button
                  key={interval}
                  onClick={() => setTimeInterval(interval)}
                  className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors ${
                    timeInterval === interval
                      ? "border-violet-400/40 bg-violet-400/10 text-violet-400"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  {interval}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">Active strategy:</span>
            <span className={`text-xs font-mono font-semibold ${activeMode.color}`}>
              {activeMode.label}
              {active === "time" ? ` (every ${timeInterval})` : ""}
            </span>
          </div>
          <button className="text-xs font-mono bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/20 transition-colors rounded-md px-3 py-1.5">
            Apply Strategy
          </button>
        </div>
      </div>
    </div>
  )
}
