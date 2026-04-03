"use client"

import { useState } from "react"
import {
  ShieldAlert,
  Users,
  Store,
  Globe,
  Database,
  Terminal,
  Lock,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Server,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CARD = "bg-card border border-border rounded-lg"
const LABEL = "text-[10px] font-mono text-muted-foreground uppercase tracking-wider"

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accent = "text-foreground",
}: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`${CARD} p-4 flex flex-col gap-2`}>
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className={LABEL}>{label}</span></div>
      <p className={`text-2xl font-mono font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] font-mono text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Quick-action row ─────────────────────────────────────────────────────────

function ActionRow({
  icon, label, desc, danger, onClick,
}: { icon: React.ReactNode; label: string; desc: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors rounded-lg hover:bg-secondary/50
        ${danger ? "border border-red-500/20 hover:border-red-500/40" : ""}`}
    >
      <span className={`shrink-0 ${danger ? "text-red-400" : "text-muted-foreground"}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-mono font-semibold ${danger ? "text-red-400" : "text-foreground"}`}>{label}</p>
        <p className="text-[10px] font-mono text-muted-foreground truncate">{desc}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </button>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, onConfirm, onCancel,
}: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold font-mono text-foreground">{title}</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-mono bg-secondary border border-border rounded-md text-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-mono bg-red-500/10 border border-red-500/30 rounded-md text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Audit log entry ──────────────────────────────────────────────────────────

const AUDIT: { ts: string; op: string; user: string; ip: string }[] = [
  { ts: "2026-04-03 14:28:11", op: "Rotation strategy changed → Weighted Random", user: "admin@gateway.io", ip: "203.0.113.10" },
  { ts: "2026-04-03 13:55:02", op: "Merchant account PP-Overflow-06 priority updated",user: "admin@gateway.io", ip: "203.0.113.10" },
  { ts: "2026-04-03 12:41:37", op: "Shield domain rotated → shield-7.io",            user: "system",           ip: "127.0.0.1"     },
  { ts: "2026-04-03 11:09:50", op: "New merchant account added — PP-Warmup-07",       user: "admin@gateway.io", ip: "203.0.113.10" },
  { ts: "2026-04-03 09:32:14", op: "Admin login",                                     user: "admin@gateway.io", ip: "203.0.113.10" },
  { ts: "2026-04-02 22:17:44", op: "Daily limit threshold updated → 90%",             user: "admin@gateway.io", ip: "203.0.113.10" },
  { ts: "2026-04-02 19:48:22", op: "Fraud flag cleared — transaction txn_a3f2e1b8",   user: "admin@gateway.io", ip: "203.0.113.10" },
  { ts: "2026-04-02 15:05:31", op: "Admin login",                                     user: "admin@gateway.io", ip: "198.51.100.42" },
]

// ─── Session row ──────────────────────────────────────────────────────────────

const SESSIONS: { id: string; device: string; ip: string; since: string; current: boolean }[] = [
  { id: "s1", device: "Chrome 123 / macOS",        ip: "203.0.113.10",  since: "2026-04-03 09:32",  current: true  },
  { id: "s2", device: "Firefox 125 / Windows 11",  ip: "198.51.100.42", since: "2026-04-02 15:05",  current: false },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [confirm, setConfirm] = useState<null | { title: string; message: string; onConfirm: () => void }>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [sessions, setSessions] = useState(SESSIONS)
  const [rotationEnabled, setRotationEnabled] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  const dangerAction = (title: string, message: string, onConfirm: () => void) =>
    setConfirm({ title, message, onConfirm })

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onConfirm={() => { confirm.onConfirm(); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <main className="px-4 md:px-6 py-5 max-w-[1200px] mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Root-level gateway controls — all actions are logged</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-red-400 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Restricted Access
          </div>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-3.5 h-3.5" />}    label="Total Merchants"  value="7"          sub="5 active • 2 paused"     accent="text-cyan-400"    />
          <StatCard icon={<Store className="w-3.5 h-3.5" />}    label="Client Stores"    value="7"          sub="All operational"         accent="text-emerald-400" />
          <StatCard icon={<Globe className="w-3.5 h-3.5" />}    label="Shield Domains"   value="12"         sub="4 active in rotation"    accent="text-foreground"  />
          <StatCard icon={<Database className="w-3.5 h-3.5" />} label="Today Volume"     value="$42,180"    sub="286 transactions"        accent="text-foreground"  />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Gateway controls */}
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Gateway Controls</p>
            </div>

            {/* Toggles */}
            <div className="px-5 py-4 space-y-3 border-b border-border">
              {[
                {
                  label: "Global Rotation",
                  desc:  "Enable or disable automatic account rotation globally",
                  enabled: rotationEnabled,
                  toggle:  () => setRotationEnabled(p => !p),
                  danger:  false,
                },
                {
                  label: "Maintenance Mode",
                  desc:  "Block all incoming checkout traffic while you make changes",
                  enabled: maintenanceMode,
                  toggle:  () => dangerAction(
                    maintenanceMode ? "Disable Maintenance Mode" : "Enable Maintenance Mode",
                    maintenanceMode
                      ? "This will resume checkout traffic immediately."
                      : "This will block all incoming transactions until maintenance mode is disabled.",
                    () => setMaintenanceMode(p => !p),
                  ),
                  danger: true,
                },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-mono font-semibold ${item.danger ? "text-amber-400" : "text-foreground"}`}>{item.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{item.desc}</p>
                  </div>
                  <button
                    onClick={item.toggle}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${item.enabled ? (item.danger ? "bg-amber-500" : "bg-cyan-500") : "bg-secondary border border-border"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${item.enabled ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="px-2 py-2 space-y-0.5">
              <ActionRow
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                label="Force Domain Rotation"
                desc="Immediately rotate all shield domains ahead of schedule"
              />
              <ActionRow
                icon={<Terminal className="w-3.5 h-3.5" />}
                label="Flush IPN Queue"
                desc="Reprocess all pending PayPal IPN callbacks"
              />
              <ActionRow
                icon={<Trash2 className="w-3.5 h-3.5" />}
                label="Clear Fraud Blocklist"
                desc="Remove all blocked IPs from the fraud prevention list"
                danger
                onClick={() => dangerAction(
                  "Clear Fraud Blocklist",
                  "This will remove all blocked IP addresses. New fraud checks will start fresh.",
                  () => {},
                )}
              />
              <ActionRow
                icon={<Database className="w-3.5 h-3.5" />}
                label="Reset Daily Counters"
                desc="Manually zero all merchant account daily volume counters"
                danger
                onClick={() => dangerAction(
                  "Reset Daily Counters",
                  "All per-account daily volume counters will be reset to zero. This cannot be undone.",
                  () => {},
                )}
              />
            </div>
          </div>

          {/* Right column: API key + active sessions */}
          <div className="space-y-5">
            {/* API Key */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Gateway API Key</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    readOnly
                    value="gw_live_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
                    className="w-full bg-background border border-border rounded-md pl-3 pr-10 py-2 text-xs font-mono text-foreground focus:outline-none cursor-default"
                  />
                  <button
                    onClick={() => setShowApiKey(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={() => dangerAction(
                    "Rotate API Key",
                    "The current API key will be invalidated immediately. All integrations using it will stop working until updated.",
                    () => {},
                  )}
                  className="flex items-center gap-2 text-xs font-mono text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 rounded-md px-3 py-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Rotate Key
                </button>
              </div>
            </div>

            {/* Active Sessions */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Active Sessions</p>
              </div>
              <div className="divide-y divide-border">
                {sessions.map(s => (
                  <div key={s.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-foreground">{s.device}</p>
                        {s.current && (
                          <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground">IP {s.ip} &bull; Since {s.since}</p>
                    </div>
                    {!s.current && (
                      <button
                        onClick={() => dangerAction(
                          "Revoke Session",
                          `This will immediately sign out the session from ${s.ip}.`,
                          () => setSessions(prev => prev.filter(x => x.id !== s.id)),
                        )}
                        className="text-[10px] font-mono text-red-400 border border-red-400/20 hover:bg-red-400/10 rounded-md px-2 py-1 transition-colors shrink-0"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Audit Log */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Audit Log</p>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">Last 8 entries</span>
          </div>
          <div className="divide-y divide-border">
            {AUDIT.map((entry, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_120px] gap-3 px-5 py-2.5 items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-xs font-mono text-foreground truncate">{entry.op}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground truncate">{entry.user}</span>
                <span className="text-[10px] font-mono text-muted-foreground text-right">{entry.ts.slice(11)}</span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
