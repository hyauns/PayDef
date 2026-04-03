"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Shield,
  Mail,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [accessCode, setAccessCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<"credentials" | "code">("credentials")

  function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError("Please enter your email and password.")
      return
    }
    setError("")
    setStep("code")
  }

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!accessCode) {
      setError("Secret access code is required.")
      return
    }
    setError("")
    setLoading(true)
    // Simulate async sign-in
    setTimeout(() => setLoading(false), 2200)
  }

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center overflow-hidden font-mono">

      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, oklch(0.22 0 0 / 0.55) 1px, transparent 1px),
            linear-gradient(to bottom, oklch(0.22 0 0 / 0.55) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial vignette over grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, oklch(0.11 0 0 / 0.85) 100%)",
        }}
      />

      {/* Cyan glow behind card */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, oklch(0.72 0.17 195 / 0.06) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4">

        {/* Brand header above card */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-cyan-400/10 border border-cyan-400/25 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-400/5">
            <Shield className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-lg font-semibold text-foreground tracking-tight">Gateway</span>
              <span className="text-lg font-semibold text-cyan-400 tracking-tight">Central</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 tracking-widest uppercase">
              Enterprise Grade
            </p>
          </div>
        </div>

        {/* Login card */}
        <div className="bg-card border border-border rounded-lg shadow-2xl shadow-black/40">

          {/* Card header */}
          <div className="px-7 pt-7 pb-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-sm font-semibold text-foreground">
                  {step === "credentials" ? "Sign in to your account" : "Verify your identity"}
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {step === "credentials"
                    ? "Authorized personnel only"
                    : "Enter the secret access code for this session"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-md shrink-0">
                <ShieldCheck className="w-3 h-3" />
                TLS 1.3
              </div>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-5">
              {["credentials", "code"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold border transition-colors ${
                    step === s
                      ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-400"
                      : i === 0 && step === "code"
                      ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-400"
                      : "bg-secondary border-border text-muted-foreground"
                  }`}>
                    {i === 0 && step === "code" ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs ${step === s ? "text-foreground" : "text-muted-foreground"}`}>
                    {s === "credentials" ? "Credentials" : "Access Code"}
                  </span>
                  {i === 0 && (
                    <div className={`h-px w-8 transition-colors ${step === "code" ? "bg-emerald-400/30" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Form body */}
          <div className="px-7 py-6">

            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2.5 mb-5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {step === "credentials" ? (
              <form onSubmit={handleCredentials} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@gateway.internal"
                      autoComplete="email"
                      className="w-full bg-input border border-border rounded-md pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/40 transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      className="w-full bg-input border border-border rounded-md pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/40 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-background font-semibold text-sm py-2.5 rounded-md transition-colors mt-2 group"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-4">
                {/* Access code */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Secret Access Code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type={showCode ? "text" : "password"}
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      placeholder="Enter your 6-digit code"
                      autoComplete="one-time-code"
                      maxLength={8}
                      className="w-full bg-input border border-border rounded-md pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/40 transition-colors tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCode((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Provided by your system administrator. Do not share this code.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed text-background font-semibold text-sm py-2.5 rounded-md transition-colors group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setError("") }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Back to credentials
                </button>
              </form>
            )}
          </div>

          {/* Card footer */}
          <div className="px-7 py-4 border-t border-border flex items-center justify-between">
            <Link
              href="/request-access"
              className="text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
            >
              Request Access
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Secure connection
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          Unauthorized access is prohibited and monitored.
          <br />
          All sessions are logged and audited.
        </p>
      </div>
    </div>
  )
}
