"use client"

import { useState, useEffect } from "react"
import { Shield, Wifi, WifiOff, AlertTriangle, RefreshCw, ExternalLink, Loader2 } from "lucide-react"
import { SectionCard } from "./SectionCard"

// ─── Types ────────────────────────────────────────────────────────────────────

type DomainStatus = "Healthy" | "Degraded" | "Down"

interface Domain {
  id: string
  domain: string
  isActive: boolean
  tenantName?: string
  healthOk: boolean
  // Live health-check data
  latency: number | null
  ssl: boolean
  status: DomainStatus
  lastChecked: string
}

interface DomainApiRow {
  id: string
  domain: string
  isActive: boolean
  tenantName?: string | null
  healthOk?: boolean | null
  vercel?: {
    bridgeOk?: boolean
  }
}

// ─── Status config ────────────────────────────────────────────────────────────

const statusConfig: Record<DomainStatus, {
  icon: typeof Shield
  iconColor: string
  border: string
  bg: string
  label: string
  labelColor: string
  labelBg: string
  dot: string
}> = {
  Healthy: {
    icon: Wifi,
    iconColor: "text-emerald-400",
    border: "border-emerald-400/20",
    bg: "bg-emerald-400/5",
    label: "Healthy",
    labelColor: "text-emerald-400",
    labelBg: "bg-emerald-400/10",
    dot: "bg-emerald-400",
  },
  Degraded: {
    icon: AlertTriangle,
    iconColor: "text-amber-400",
    border: "border-amber-400/20",
    bg: "bg-amber-400/5",
    label: "Degraded",
    labelColor: "text-amber-400",
    labelBg: "bg-amber-400/10",
    dot: "bg-amber-400",
  },
  Down: {
    icon: WifiOff,
    iconColor: "text-red-400",
    border: "border-red-400/20",
    bg: "bg-red-400/5",
    label: "Down",
    labelColor: "text-red-400",
    labelBg: "bg-red-400/10",
    dot: "bg-red-400",
  },
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ShieldDomains() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)

  // Fetch tenant-visible domains from the merchant API
  useEffect(() => {
    fetch("/api/merchant/shield-domains")
      .then(r => r.json())
      .then(data => {
        setDomains(
          ((data.domains ?? []) as DomainApiRow[]).map((d) => ({
            id: d.id,
            domain: d.domain,
            isActive: d.isActive,
            tenantName: d.tenantName ?? undefined,
            healthOk: d.healthOk ?? true,
            latency: null,     // Will be filled by Test Connectivity
            ssl: true,         // Default until tested
            status: d.vercel?.bridgeOk ? "Healthy" : (d.healthOk === false ? "Down" : (d.isActive ? "Degraded" : "Down")),
            lastChecked: "—",
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Real connectivity test via backend
  const testConnectivity = async (id: string) => {
    const domain = domains.find(d => d.id === id)
    if (!domain) return

    setTesting(id)

    try {
      const res = await fetch("/api/merchant/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: domain.domain }),
      })
      const data = await res.json()

      setDomains(prev =>
        prev.map(d =>
          d.id === id
            ? {
                ...d,
                latency: data.latencyMs ?? null,
                ssl: data.sslValid ?? false,
                status: (data.health as DomainStatus) ?? "Down",
                lastChecked: "just now",
                healthOk: data.health === "Healthy",
              }
            : d
        )
      )
    } catch {
      setDomains(prev =>
        prev.map(d =>
          d.id === id
            ? { ...d, status: "Down", latency: null, lastChecked: "just now" }
            : d
        )
      )
    } finally {
      setTesting(null)
    }
  }

  const healthyCnt  = domains.filter(d => d.status === "Healthy").length
  const degradedCnt = domains.filter(d => d.status === "Degraded").length
  const downCnt     = domains.filter(d => d.status === "Down").length

  return (
    <SectionCard
      title="Shield Domain Health"
      description={loading ? "Loading…" : `${healthyCnt} of ${domains.length} domains operational`}
      noPadding
      action={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs font-bold text-[#97a3b6]">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{healthyCnt} Healthy
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{degradedCnt} Degraded
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{downCnt} Down
            </span>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#6b7280] animate-spin" />
        </div>
      ) : domains.length === 0 ? (
        <div className="py-12 text-center text-sm font-semibold text-[#97a3b6]">
          No shield domains configured
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-5">
          {domains.map((d) => {
            const cfg = statusConfig[d.status]
            const Icon = cfg.icon
            const isTest = testing === d.id
            return (
              <div
                key={d.id}
                className={`bg-[#2a2d39] border ${cfg.border} rounded-lg p-5 flex flex-col gap-3 transition-colors hover:bg-[#343947] shadow-sm`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-2 rounded-lg ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 shrink-0 ${cfg.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-[#e7edf8] truncate font-bold">{d.domain}</p>
                      {d.tenantName && (
                        <p className="font-mono text-xs font-semibold text-[#97a3b6]">{d.tenantName}</p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-mono px-2 py-0.5 rounded-full ${cfg.labelBg} ${cfg.labelColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${d.status === "Healthy" ? "animate-pulse" : ""}`} />
                    {cfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-1">
                  <div>
                    <p className="text-[#97a3b6] uppercase tracking-wider text-[10px] mb-0.5">Latency</p>
                    <p className={`font-semibold ${d.latency ? (d.latency > 200 ? "text-amber-400" : "text-emerald-400") : "text-[#97a3b6]"}`}>
                      {d.latency ? `${d.latency}ms` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#97a3b6] uppercase tracking-wider text-[10px] mb-0.5">SSL</p>
                    <p className={d.ssl ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {d.latency !== null ? (d.ssl ? "Valid" : "Invalid") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#97a3b6] uppercase tracking-wider text-[10px] mb-0.5">Checked</p>
                    <p className="text-[#e7edf8]">{d.lastChecked}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[#343947]">
                  <button
                    onClick={() => testConnectivity(d.id)}
                    disabled={isTest}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] hover:border-[#404656] bg-[#222530] hover:bg-[#3a4050] rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 flex-1 justify-center"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTest ? "animate-spin" : ""}`} />
                    {isTest ? "Testing..." : "Test Connectivity"}
                  </button>
                  <a
                    href={`https://${d.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#97a3b6] hover:text-[#e7edf8] hover:bg-[#3a4050] bg-[#222530] transition-colors p-2 border border-[#343947] rounded-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
