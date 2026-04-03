// Cache invalidation: 2026-04-04
"use client"

import { useState } from "react"
import {
  Settings,
  Shield,
  Bell,
  User,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

const SECTION_CLASSES = "bg-card border border-border rounded-lg divide-y divide-border"
const LABEL = "text-[10px] font-mono text-muted-foreground uppercase tracking-wider"
const INPUT = "w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-colors"
const SECTION_HEADER = "px-5 py-3 flex items-center gap-2.5"
const SECTION_BODY = "px-5 py-5 space-y-5"

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-cyan-500" : "bg-secondary border border-border"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
    </button>
  )
}

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  const [settings, setSettings] = useState({
    defaultDailyLimit: "5000",
    rotationStrategy: "weighted_random",
    telegramToken: "",
    chatId: "",
    alertThreshold: "90",
    priceRevalidation: true,
    ipWhitelist: "203.0.113.10\n198.51.100.42",
    adminEmail: "admin@gateway.io",
    currentPassword: "",
    newPassword: "",
  })

  const update = (patch: Partial<typeof settings>) => setSettings(p => ({ ...p, ...patch }))

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />
      <main className="px-4 md:px-6 py-5 max-w-3xl mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Global gateway configuration and security controls</p>
          </div>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-semibold rounded-md transition-all ${
              saved
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-cyan-400 text-background hover:bg-cyan-300"
            }`}
          >
            {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved" : "Save Changes"}
          </button>
        </div>

        {/* Section 1: Global Rotation Rules */}
        <div className={SECTION_CLASSES}>
          <div className={SECTION_HEADER}>
            <div className="w-6 h-6 rounded bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
              <Settings className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Global Rotation Rules</p>
              <p className="text-[11px] text-muted-foreground">Default limits and strategy applied across all accounts</p>
            </div>
          </div>
          <div className={SECTION_BODY}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className={LABEL}>Default Daily Limit (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={settings.defaultDailyLimit}
                    onChange={e => update({ defaultDailyLimit: e.target.value })}
                    className={`${INPUT} pl-7`}
                    placeholder="5000"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">Applied to any account without an explicit adaptive limit</p>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Alert Threshold (%)</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={settings.alertThreshold}
                  onChange={e => update({ alertThreshold: e.target.value })}
                  className={INPUT}
                  placeholder="90"
                />
                <p className="text-[10px] text-muted-foreground font-mono">Send alert when account reaches this % of its daily limit</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Global Rotation Strategy</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { value: "weighted_random", label: "Weighted Random", desc: "Accounts with higher priority receive proportionally more traffic" },
                  { value: "round_robin", label: "Round Robin", desc: "Each request cycles sequentially through all active accounts" },
                  { value: "lowest_volume", label: "Lowest Volume First", desc: "Always routes to the account with the most remaining daily capacity" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => update({ rotationStrategy: opt.value })}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      settings.rotationStrategy === opt.value
                        ? "border-cyan-400/40 bg-cyan-400/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full border-2 flex-shrink-0 ${settings.rotationStrategy === opt.value ? "border-cyan-400 bg-cyan-400" : "border-muted-foreground"}`} />
                      <span className="text-xs font-mono font-semibold">{opt.label}</span>
                    </div>
                    <p className="text-[10px] font-mono leading-relaxed pl-4">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Notifications */}
        <div className={SECTION_CLASSES}>
          <div className={SECTION_HEADER}>
            <div className="w-6 h-6 rounded bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-[11px] text-muted-foreground">Telegram alerts when accounts approach their daily limit</p>
            </div>
          </div>
          <div className={SECTION_BODY}>
            <div className="flex items-start gap-3 bg-amber-400/5 border border-amber-400/20 rounded-md px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] font-mono text-muted-foreground">
                Create a bot via <span className="text-amber-400">@BotFather</span> on Telegram, add it to your admin group, and paste the credentials below.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className={LABEL}>Telegram Bot Token</label>
                <input
                  type="password"
                  value={settings.telegramToken}
                  onChange={e => update({ telegramToken: e.target.value })}
                  className={INPUT}
                  placeholder="7412345678:AAF..."
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Admin Chat ID</label>
                <input
                  value={settings.chatId}
                  onChange={e => update({ chatId: e.target.value })}
                  className={INPUT}
                  placeholder="-1001234567890"
                />
              </div>
            </div>
            <button className="flex items-center gap-2 text-xs font-mono text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 rounded-md px-3 py-1.5 transition-colors">
              <RefreshCw className="w-3 h-3" />
              Send Test Alert
            </button>
          </div>
        </div>

        {/* Section 3: Security */}
        <div className={SECTION_CLASSES}>
          <div className={SECTION_HEADER}>
            <div className="w-6 h-6 rounded bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Security</p>
              <p className="text-[11px] text-muted-foreground">Server-side validation and access controls</p>
            </div>
          </div>
          <div className={SECTION_BODY}>
            <div className="flex items-center justify-between gap-4 p-3 bg-background border border-border rounded-lg">
              <div className="space-y-0.5">
                <p className="text-sm font-mono font-semibold text-foreground">Server-side Price Re-validation</p>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Re-confirms the exact charge amount server-side before routing to PayPal. Prevents price manipulation attacks.
                </p>
              </div>
              <Toggle enabled={settings.priceRevalidation} onToggle={() => update({ priceRevalidation: !settings.priceRevalidation })} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>IP Whitelist</label>
              <textarea
                value={settings.ipWhitelist}
                onChange={e => update({ ipWhitelist: e.target.value })}
                rows={4}
                className={`${INPUT} resize-none leading-relaxed`}
                placeholder={"203.0.113.10\n198.51.100.42"}
              />
              <p className="text-[10px] font-mono text-muted-foreground">
                One IP address per line. Only these IPs may call the Gateway API. Leave empty to allow all (not recommended).
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Admin Profile */}
        <div className={SECTION_CLASSES}>
          <div className={SECTION_HEADER}>
            <div className="w-6 h-6 rounded bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Admin Profile</p>
              <p className="text-[11px] text-muted-foreground">Update dashboard login credentials</p>
            </div>
          </div>
          <div className={SECTION_BODY}>
            <div className="space-y-1.5">
              <label className={LABEL}>Admin Email</label>
              <input
                type="email"
                value={settings.adminEmail}
                onChange={e => update({ adminEmail: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className={LABEL}>Current Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={settings.currentPassword}
                    onChange={e => update({ currentPassword: e.target.value })}
                    className={`${INPUT} pr-10`}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={settings.newPassword}
                    onChange={e => update({ newPassword: e.target.value })}
                    className={`${INPUT} pr-10`}
                    placeholder="Min 12 characters"
                    autoComplete="new-password"
                  />
                  <button
                    onClick={() => setShowNewPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            {settings.newPassword && settings.newPassword.length < 12 && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-red-400">
                <AlertTriangle className="w-3 h-3" />
                Password must be at least 12 characters
              </div>
            )}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
                <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                Passwords are hashed with bcrypt and never stored in plain text
              </div>
            </div>
          </div>
        </div>

        {/* Bottom save */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-mono font-semibold rounded-md transition-all ${
              saved
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-cyan-400 text-background hover:bg-cyan-300"
            }`}
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved Successfully" : "Save All Changes"}
          </button>
        </div>

      </main>
    </div>
  )
}


