"use client"

import { useState } from "react"
import { Shield, Wifi, WifiOff, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react"

type DomainStatus = "Healthy" | "Degraded" | "Down"

interface Domain {
  id: string
  domain: string
  ip: string
  ssl: boolean
  latency: number | null
  status: DomainStatus
  linkedAccounts: string[]
  lastChecked: string
}

const initialDomains: Domain[] = [
  { id: "d-001", domain: "chococlose.com", ip: "104.21.44.12", ssl: true, latency: 42, status: "Healthy", linkedAccounts: ["pp-001"], lastChecked: "12s ago" },
  { id: "d-002", domain: "safepay-hub.io", ip: "172.67.210.88", ssl: true, latency: 87, status: "Healthy", linkedAccounts: ["pp-002"], lastChecked: "8s ago" },
  { id: "d-003", domain: "payshield-cdn.com", ip: "104.22.19.55", ssl: true, latency: 213, status: "Degraded", linkedAccounts: ["pp-003"], lastChecked: "15s ago" },
  { id: "d-004", domain: "trustedcheck.net", ip: "198.41.214.77", ssl: true, latency: null, status: "Down", linkedAccounts: ["pp-004"], lastChecked: "2m ago" },
  { id: "d-005", domain: "relay-secure.org", ip: "172.64.145.19", ssl: true, latency: 55, status: "Healthy", linkedAccounts: ["pp-005"], lastChecked: "5s ago" },
  { id: "d-006", domain: "checkout-proxy.com", ip: "104.21.88.32", ssl: false, latency: 311, status: "Degraded", linkedAccounts: ["pp-006"], lastChecked: "30s ago" },
  { id: "d-007", domain: "gatewaynode-a.net", ip: "104.22.33.11", ssl: true, latency: 38, status: "Healthy", linkedAccounts: [], lastChecked: "3s ago" },
  { id: "d-008", domain: "px-relay-us.io", ip: "172.67.180.44", ssl: true, latency: 61, status: "Healthy", linkedAccounts: [], lastChecked: "9s ago" },
  { id: "d-009", domain: "shieldnode-eu.com", ip: "104.21.56.77", ssl: true, latency: null, status: "Down", linkedAccounts: [], lastChecked: "5m ago" },
]

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

export function ShieldDomains() {
  const [domains, setDomains] = useState<Domain[]>(initialDomains)
  const [testing, setTesting] = useState<string | null>(null)

  const testConnectivity = (id: string) => {
    setTesting(id)
    setTimeout(() => {
      setDomains((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                lastChecked: "just now",
                latency: d.status === "Down" ? null : Math.floor(Math.random() * 150 + 30),
              }
            : d
        )
      )
      setTesting(null)
    }, 1800)
  }

  const healthySummary = domains.filter(d => d.status === "Healthy").length

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Shield Domain Health</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{healthySummary} of {domains.length} domains operational</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{domains.filter(d => d.status === "Healthy").length} Healthy</span>
            <span className="flex items-center gap-1.5 text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{domains.filter(d => d.status === "Degraded").length} Degraded</span>
            <span className="flex items-center gap-1.5 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{domains.filter(d => d.status === "Down").length} Down</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {domains.map((d) => {
          const cfg = statusConfig[d.status]
          const Icon = cfg.icon
          const isTest = testing === d.id
          return (
            <div
              key={d.id}
              className={`border ${cfg.border} ${cfg.bg} rounded-lg p-3 flex flex-col gap-2`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${cfg.iconColor}`} />
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground truncate font-medium">{d.domain}</p>
                    <p className="font-mono text-xs text-muted-foreground">{d.ip}</p>
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded ${cfg.labelBg} ${cfg.labelColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${d.status === "Healthy" ? "animate-pulse" : ""}`} />
                  {cfg.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Latency</p>
                  <p className={`font-semibold ${d.latency ? (d.latency > 200 ? "text-amber-400" : "text-emerald-400") : "text-red-400"}`}>
                    {d.latency ? `${d.latency}ms` : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider text-[10px]">SSL</p>
                  <p className={d.ssl ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{d.ssl ? "Valid" : "Invalid"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Checked</p>
                  <p className="text-foreground">{d.lastChecked}</p>
                </div>
              </div>
              {d.linkedAccounts.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Linked:</span>
                  {d.linkedAccounts.map((acc) => (
                    <span key={acc} className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">{acc}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                  onClick={() => testConnectivity(d.id)}
                  disabled={isTest}
                  className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 rounded px-2 py-1 transition-colors disabled:opacity-50 flex-1 justify-center"
                >
                  <RefreshCw className={`w-3 h-3 ${isTest ? "animate-spin" : ""}`} />
                  {isTest ? "Testing..." : "Test Connectivity"}
                </button>
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1 border border-border rounded">
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
