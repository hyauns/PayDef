"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { BarChart2, Clock, List, CheckCircle2, Info, Loader2 } from "lucide-react"
import { SectionCard } from "./SectionCard"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { dashboardCopy } from "@/lib/i18n/dashboard"

type RotationMode = "volume" | "time" | "sequential"

interface ModeConfig {
  id: RotationMode
  dbValue: string
  label: string
  description: string
  detail: string
  icon: typeof BarChart2
  color: string
  bg: string
  border: string
}

// Moved modes into component
const timeIntervals = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "12 hours", minutes: 720 },
]

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to apply strategy"
}

// ─── Map DB value → UI mode ───────────────────────────────────────────────────

function dbToUiMode(dbValue: string): RotationMode {
  switch (dbValue) {
    case "VOLUME": return "volume"
    case "TIME": return "time"
    default: return "sequential"
  }
}

function minutesToLabel(mins: number): string {
  const found = timeIntervals.find(t => t.minutes === mins)
  return found?.label ?? `${mins} min`
}

function labelToMinutes(label: string): number {
  const found = timeIntervals.find(t => t.label === label)
  return found?.minutes ?? 120
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RotationLogic() {
  const { language } = useLanguage()
  const t = dashboardCopy[language]

  const modes: ModeConfig[] = [
    {
      id: "volume",
      dbValue: "VOLUME",
      label: t.volumeBased,
      description: t.volumeBasedDesc,
      detail: t.volumeBasedDetail,
      icon: BarChart2,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
      border: "border-cyan-400/30",
    },
    {
      id: "time",
      dbValue: "TIME",
      label: t.timeBased,
      description: t.timeBasedDesc,
      detail: t.timeBasedDetail,
      icon: Clock,
      color: "text-violet-400",
      bg: "bg-violet-400/10",
      border: "border-violet-400/30",
    },
    {
      id: "sequential",
      dbValue: "SEQUENTIAL",
      label: t.sequential,
      description: t.sequentialDesc,
      detail: t.sequentialDetail,
      icon: List,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
      border: "border-emerald-400/30",
    },
  ]

  const [active, setActive] = useState<RotationMode>("sequential")
  const [timeInterval, setTimeInterval] = useState("2 hours")
  const [showInfo, setShowInfo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  // Fetch current settings from DB
  const { data, isLoading } = useSWR<{ strategy: string; interval: number }>(
    "/api/merchant/rotation-settings",
    fetcher,
    { revalidateOnFocus: false }
  )

  // Hydrate state from API response
  useEffect(() => {
    if (!data) return
    setActive(dbToUiMode(data.strategy))
    setTimeInterval(minutesToLabel(data.interval))
  }, [data])

  const activeMode = modes.find((m) => m.id === active)!

  // ── Apply strategy handler ─────────────────────────────────────────────────
  const handleApply = async () => {
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      const dbStrategy = modes.find(m => m.id === active)!.dbValue
      const interval = labelToMinutes(timeInterval)

      const res = await fetch("/api/merchant/rotation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: dbStrategy, interval }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to save")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title={t.rotationLogic}
      description={t.configureTraffic}
      action={
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-[#97a3b6] hover:text-[#e7edf8] transition-colors p-1"
          title={t.modeInfo}
        >
          <Info className="w-5 h-5" />
        </button>
      }
    >
      <div className="space-y-4">
        {/* Loading skeleton */}
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-[#2a2d39] rounded-lg" />
              ))}
            </div>
            <div className="h-8 w-48 bg-[#2a2d39] rounded" />
          </div>
        ) : (
          <>
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
                        : "border-[#343947] hover:border-[#404656] hover:bg-[#2a2d39]"
                    }`}
                  >
                    {isActive && (
                      <CheckCircle2 className={`w-3.5 h-3.5 absolute top-2 right-2 ${mode.color}`} />
                    )}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? mode.bg : "bg-[#2a2d39]"}`}>
                      <Icon className={`w-4 h-4 ${isActive ? mode.color : "text-[#6b7280]"}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isActive ? mode.color : "text-[#e7edf8]"}`}>
                        {mode.label}
                      </p>
                      <p className="text-xs font-semibold text-[#97a3b6] leading-relaxed mt-0.5">
                        {mode.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Info panel */}
            {showInfo && (
              <div className={`text-sm font-medium text-[#e7edf8] ${activeMode.bg} border ${activeMode.border} rounded-md p-3 leading-relaxed`}>
                <span className={`font-bold ${activeMode.color}`}>{activeMode.label}: </span>
                {activeMode.detail}
              </div>
            )}

            {/* Time interval sub-option */}
            {active === "time" && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#97a3b6] uppercase tracking-wider">{t.rotationInterval}</p>
                <div className="flex flex-wrap gap-2">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.label}
                      onClick={() => setTimeInterval(interval.label)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                        timeInterval === interval.label
                          ? "border-violet-400/40 bg-violet-400/10 text-violet-400"
                          : "border-[#343947] bg-[#2a2d39] text-[#97a3b6] hover:text-[#e7edf8] hover:border-[#404656]"
                      }`}
                    >
                      {interval.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-xs font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between pt-1 border-t border-[#343947]">
              <div className="flex items-center gap-2 mt-3">
                <span className="text-sm font-medium text-[#97a3b6]">{t.activeStrategy}</span>
                <span className={`text-sm font-bold ${activeMode.color}`}>
                  {activeMode.label}
                  {active === "time" ? ` (${t.every} ${timeInterval})` : ""}
                </span>
              </div>
              <button
                onClick={handleApply}
                disabled={saving}
                className={`mt-3 text-sm font-semibold rounded-md px-3 py-1.5 transition-all flex items-center gap-1.5 ${
                  saved
                    ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                    : saving
                    ? "bg-[#FFD600]/50 text-[#1f222c] border border-transparent cursor-wait"
                    : "bg-[#FFD600] text-[#1f222c] border border-transparent hover:bg-[#FFD600]/90 shadow-sm"
                }`}
              >
                {saved ? (
                  <><CheckCircle2 className="w-3 h-3" /> {t.saved}</>
                ) : saving ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> {t.applying}</>
                ) : (
                  t.applyStrategy
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
