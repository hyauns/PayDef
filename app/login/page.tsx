"use client"

import { Suspense, useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react"

// Inner component — allowed to call useSearchParams() because it is
// rendered inside a <Suspense> boundary in the default export below.
function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/dashboard"
  const revokedError = searchParams.get("error") === "SessionRevoked"
  const router = useRouter()
  const { data: session, status } = useSession()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    revokedError ? "Your session has been revoked by an administrator. Please sign in again." : ""
  )
  const [success, setSuccess] = useState(false)

  // Auto-redirect if already logged in (but not if session was just revoked)
  useEffect(() => {
    if (status === "authenticated" && session && !revokedError) {
      router.replace("/dashboard")
    }
  }, [status, session, router, revokedError])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError("Please enter your email and password.")
      return
    }
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      email:    email.trim().toLowerCase(),
      password,
      redirect: false,
    })

    if (result?.error) {
      setError("Invalid email or password. Please try again.")
      setLoading(false)
      return
    }

    // Show success toast, then redirect to dashboard
    setSuccess(true)
    setLoading(false)
    setTimeout(() => {
      window.location.href = callbackUrl
    }, 1200)
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
                <h1 className="text-sm font-semibold text-foreground">Sign in to your account</h1>
                <p className="text-xs text-muted-foreground mt-1">Authorized personnel only</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-md shrink-0">
                <ShieldCheck className="w-3 h-3" />
                TLS 1.3
              </div>
            </div>
          </div>

          {/* Form body */}
          <div className="px-7 py-6">

            {/* Success banner */}
            {success && (
              <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2.5 mb-5 animate-in fade-in slide-in-from-top-1 duration-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-400 font-mono">Welcome back! Redirecting to your dashboard...</p>
              </div>
            )}

            {/* Error banner */}
            {error && !success && (
              <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2.5 mb-5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
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
                    required
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
                    required
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
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed text-background font-semibold text-sm py-2.5 rounded-md transition-colors mt-2 group"
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
            </form>
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

// Default export — wraps LoginForm in Suspense so Next.js can statically
// prerender the /login shell without blocking on useSearchParams().
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
