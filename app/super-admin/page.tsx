"use client"

import { useState } from "react"
import useSWR from "swr"
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
  Copy,
  Loader2,
  XCircle,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CARD = "bg-card border border-border rounded-lg"
const LABEL = "text-[10px] font-mono text-muted-foreground uppercase tracking-wider"

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

function fmtTs(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

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
  icon, label, desc, danger, onClick, loading,
}: { icon: React.ReactNode; label: string; desc: string; danger?: boolean; onClick?: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors rounded-lg hover:bg-secondary/50
        ${danger ? "border border-red-500/20 hover:border-red-500/40" : ""} ${loading ? "opacity-50 cursor-wait" : ""}`}
    >
      <span className={`shrink-0 ${danger ? "text-red-400" : "text-muted-foreground"}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-mono font-semibold ${danger ? "text-red-400" : "text-foreground"}`}>{label}</p>
        <p className="text-[10px] font-mono text-muted-foreground truncate">{desc}</p>
      </div>
      {loading ? <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
    </button>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, onConfirm, onCancel, loading,
}: { title: string; message: string; onConfirm: () => void; onCancel: () => void; loading?: boolean }) {
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
            disabled={loading}
            className="px-4 py-1.5 text-xs font-mono bg-secondary border border-border rounded-md text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-mono bg-red-500/10 border border-red-500/30 rounded-md text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Audit entry icon ─────────────────────────────────────────────────────────

function AuditIcon({ action }: { action: string }) {
  if (action.includes("LOGIN")) return <Users className="w-3 h-3 text-cyan-400 shrink-0" />
  if (action.includes("KEY"))   return <Lock className="w-3 h-3 text-amber-400 shrink-0" />
  if (action.includes("REVOK")) return <XCircle className="w-3 h-3 text-red-400 shrink-0" />
  if (action.includes("TENANT"))return <Store className="w-3 h-3 text-emerald-400 shrink-0" />
  return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry { id: string; action: string; admin: string; detail: string; createdAt: string }
interface SessionEntry { id: string; jti: string | null; email: string; role: string; device: string; ip: string; since: string; isCurrent: boolean }
interface Toast { message: string; type: "success" | "error" }
interface DomainSummaryEntry { isActive: boolean }

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Action failed"
}

// ─── Toast notification ───────────────────────────────────────────────────────

function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl backdrop-blur-sm font-mono text-xs transition-all animate-in slide-in-from-bottom-4 ${
        toast.type === "success"
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-red-500/10 border-red-500/30 text-red-400"
      }`}
    >
      {toast.type === "success" ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 shrink-0" />
      )}
      <span className="max-w-[320px]">{toast.message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">✕</button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [confirm, setConfirm] = useState<null | { title: string; message: string; onConfirm: () => void }>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  // ── Real data: Stats ────────────────────────────────────────────────────────
  const { data: statsData } = useSWR("/api/admin/stats", fetcher, { revalidateOnFocus: true })
  const { data: domainData } = useSWR<{ domains: DomainSummaryEntry[] }>("/api/admin/shield-domains", fetcher, { revalidateOnFocus: true })
  const stats = statsData ?? null
  const domains = domainData?.domains ?? []
  const domainCount = { total: domains.length, active: domains.filter((d) => d.isActive).length }

  // ── Real data: Gateway Controls ─────────────────────────────────────────────
  const { data: ctrlData, mutate: mutateControls } = useSWR("/api/admin/gateway-controls", fetcher, { revalidateOnFocus: true })
  const controls = ctrlData?.controls ?? { rotationEnabled: true, maintenanceMode: false }

  // ── Real data: API Key ──────────────────────────────────────────────────────
  const { data: keyData, mutate: mutateKey } = useSWR("/api/admin/gateway-key", fetcher, { revalidateOnFocus: false })
  const maskedKey = newKeyRevealed ?? keyData?.maskedKey ?? "••••••••"

  // ── Real data: Active Sessions ──────────────────────────────────────────────
  const { data: sessionData, mutate: mutateSessions } = useSWR<{ sessions: SessionEntry[] }>(
    "/api/admin/sessions", fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true }
  )
  const sessions = sessionData?.sessions ?? []

  // ── Real data: Audit Log ────────────────────────────────────────────────────
  const { data: auditData, mutate: mutateAudit } = useSWR<{ entries: AuditEntry[] }>(
    "/api/admin/audit?limit=10", fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true }
  )
  const auditEntries = auditData?.entries ?? []

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleControl = async (key: "rotationEnabled" | "maintenanceMode") => {
    const newValue = !controls[key]

    // Maintenance mode needs confirmation dialog
    if (key === "maintenanceMode") {
      setConfirm({
        title: newValue ? "Enable Maintenance Mode" : "Disable Maintenance Mode",
        message: newValue
          ? "This will block ALL incoming checkout traffic until maintenance mode is disabled."
          : "This will resume checkout traffic immediately.",
        onConfirm: async () => {
          // Optimistic UI
          mutateControls({ controls: { ...controls, [key]: newValue } }, false)
          setConfirm(null)
          await fetch("/api/admin/gateway-controls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [key]: newValue }),
          })
          mutateControls()
          mutateAudit()
        },
      })
      return
    }

    // Optimistic UI for rotation toggle
    mutateControls({ controls: { ...controls, [key]: newValue } }, false)
    await fetch("/api/admin/gateway-controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: newValue }),
    })
    mutateControls()
    mutateAudit()
  }

  const handleRotateKey = () => {
    setConfirm({
      title: "Rotate API Key",
      message: "The current API key will be invalidated immediately. All integrations using it will stop working until updated.",
      onConfirm: async () => {
        setActionLoading("rotateKey")
        setConfirm(null)
        const res = await fetch("/api/admin/gateway-key", { method: "POST" })
        const data = await res.json()
        if (data.newKey) {
          setNewKeyRevealed(data.newKey)
          setShowApiKey(true)
        }
        mutateKey()
        mutateAudit()
        setActionLoading(null)
      },
    })
  }

  const handleRevokeSession = (session: SessionEntry) => {
    if (!session.jti) return
    setConfirm({
      title: "Revoke Session",
      message: `This will immediately sign out the session for ${session.email} from ${session.ip}.`,
      onConfirm: async () => {
        setActionLoading(`revoke-${session.id}`)
        setConfirm(null)
        await fetch("/api/admin/sessions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jti: session.jti }),
        })
        mutateSessions()
        mutateAudit()
        setActionLoading(null)
      },
    })
  }

  const handleCopyKey = () => {
    if (newKeyRevealed) {
      navigator.clipboard.writeText(newKeyRevealed)
      showToast("API key copied to clipboard", "success")
    }
  }

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const controlAction = (
    actionKey: string,
    title: string,
    message: string,
    apiUrl: string,
  ) => {
    setConfirm({
      title,
      message,
      onConfirm: async () => {
        setActionLoading(actionKey)
        setConfirm(null)
        try {
          const res = await fetch(apiUrl, { method: "POST" })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? "Action failed")
          showToast(data.message ?? "Action completed successfully", "success")
          mutateAudit()
        } catch (err) {
          showToast(getErrorMessage(err), "error")
        } finally {
          setActionLoading(null)
        }
      },
    })
  }

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onConfirm={() => { confirm.onConfirm(); }}
          onCancel={() => setConfirm(null)}
          loading={!!actionLoading}
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
          <div className="ml-auto flex items-center gap-2">
            {controls.maintenanceMode && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Maintenance Active
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-red-400 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Restricted Access
            </div>
          </div>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-3.5 h-3.5" />}    label="Total Merchants"  value={stats ? String(stats.totalAccounts) : "—"}  sub={stats ? `${stats.totalTenants} tenant${stats.totalTenants !== 1 ? "s" : ""}` : "Loading..."}     accent="text-cyan-400"    />
          <StatCard icon={<Store className="w-3.5 h-3.5" />}    label="Client Stores"    value={stats ? String(stats.totalStores) : "—"}    sub="All operational"         accent="text-emerald-400" />
          <StatCard icon={<Globe className="w-3.5 h-3.5" />}    label="Shield Domains"   value={domainCount ? String(domainCount.total) : "—"} sub={domainCount ? `${domainCount.active} active in rotation` : "Loading..."}    accent="text-foreground"  />
          <StatCard icon={<Database className="w-3.5 h-3.5" />} label="Total Volume"     value={stats ? `$${stats.totalVolume.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"} sub={stats ? `${stats.totalTransactions} transactions` : "Loading..."}        accent="text-foreground"  />
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
                  key: "rotationEnabled" as const,
                  label: "Global Rotation",
                  desc:  "Enable or disable automatic account rotation globally",
                  danger: false,
                },
                {
                  key: "maintenanceMode" as const,
                  label: "Maintenance Mode",
                  desc:  "Block all incoming checkout traffic while you make changes",
                  danger: true,
                },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-mono font-semibold ${item.danger ? "text-amber-400" : "text-foreground"}`}>{item.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleControl(item.key)}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${controls[item.key] ? (item.danger ? "bg-amber-500" : "bg-cyan-500") : "bg-secondary border border-border"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${controls[item.key] ? "left-[22px]" : "left-0.5"}`} />
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
                loading={actionLoading === "rotateDomains"}
                onClick={() => controlAction(
                  "rotateDomains",
                  "Force Domain Rotation",
                  "This will immediately cycle to the next active shield domain. The previous domain remains in the pool.",
                  "/api/admin/control/rotate-domains",
                )}
              />
              <ActionRow
                icon={<Terminal className="w-3.5 h-3.5" />}
                label="Flush IPN Queue"
                desc="Reprocess all pending PayPal IPN callbacks"
                loading={actionLoading === "flushIpn"}
                onClick={() => controlAction(
                  "flushIpn",
                  "Flush IPN Queue",
                  "This will requeue all failed PayPal IPN/webhook events from the last 24 hours for reprocessing.",
                  "/api/admin/control/flush-ipn",
                )}
              />
              <ActionRow
                icon={<Trash2 className="w-3.5 h-3.5" />}
                label="Clear Fraud Blocklist"
                desc="Remove all blocked IPs from the fraud prevention list"
                danger
                loading={actionLoading === "clearFraud"}
                onClick={() => controlAction(
                  "clearFraud",
                  "Clear Fraud Blocklist",
                  "This will remove all blocked IP addresses. New fraud checks will start fresh.",
                  "/api/admin/control/clear-fraud",
                )}
              />
              <ActionRow
                icon={<Database className="w-3.5 h-3.5" />}
                label="Reset Daily Counters"
                desc="Manually zero all merchant account daily volume counters"
                danger
                loading={actionLoading === "resetCounters"}
                onClick={() => controlAction(
                  "resetCounters",
                  "Reset Daily Counters",
                  "All per-account daily volume counters will be reset to zero. This cannot be undone.",
                  "/api/admin/control/reset-counters",
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
                    value={maskedKey}
                    className="w-full bg-background border border-border rounded-md pl-3 pr-20 py-2 text-xs font-mono text-foreground focus:outline-none cursor-default"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {newKeyRevealed && (
                      <button
                        onClick={handleCopyKey}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setShowApiKey(p => !p)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                {newKeyRevealed && (
                  <div className="flex items-start gap-2 text-[11px] font-mono text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-md px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>New key generated. Copy it now — it will not be shown again after you leave this page.</span>
                  </div>
                )}
                <button
                  onClick={handleRotateKey}
                  disabled={actionLoading === "rotateKey"}
                  className="flex items-center gap-2 text-xs font-mono text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  {actionLoading === "rotateKey" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Rotate Key
                </button>
              </div>
            </div>

            {/* Active Sessions */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Active Sessions</p>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{sessions.length} active</span>
              </div>
              <div className="divide-y divide-border">
                {sessions.length === 0 ? (
                  <div className="px-5 py-6 text-center text-xs font-mono text-muted-foreground">
                    No active sessions in the last 8 hours
                  </div>
                ) : (
                  sessions.map(s => (
                    <div key={s.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-mono text-foreground">{s.email}</p>
                          {s.isCurrent && (
                            <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
                              Current
                            </span>
                          )}
                          <span className={`text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                            s.role === "SUPER_ADMIN"
                              ? "text-red-400 bg-red-400/10 border-red-400/20"
                              : "text-cyan-400 bg-cyan-400/10 border-cyan-400/20"
                          }`}>
                            {s.role}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground">IP {s.ip} &bull; Since {fmtTs(s.since)}</p>
                      </div>
                      {!s.isCurrent && s.jti && (
                        <button
                          onClick={() => handleRevokeSession(s)}
                          disabled={actionLoading === `revoke-${s.id}`}
                          className="text-[10px] font-mono text-red-400 border border-red-400/20 hover:bg-red-400/10 rounded-md px-2 py-1 transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1"
                        >
                          {actionLoading === `revoke-${s.id}` && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          Revoke
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Audit Log */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Audit Log</p>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">Last {auditEntries.length} entries &bull; auto-refresh</span>
          </div>
          <div className="divide-y divide-border">
            {auditEntries.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs font-mono text-muted-foreground">
                No admin activity recorded yet
              </div>
            ) : (
              auditEntries.map(entry => (
                <div key={entry.id} className="grid grid-cols-[1fr_160px_120px] gap-3 px-5 py-2.5 items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <AuditIcon action={entry.action} />
                    <span className="text-xs font-mono text-foreground truncate">{entry.detail}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">{entry.admin}</span>
                  <span className="text-[10px] font-mono text-muted-foreground text-right">{fmtTs(entry.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </main>

      {/* Toast notification */}
      {toast && <ToastNotification toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
