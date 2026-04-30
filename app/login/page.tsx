"use client"

import { Suspense, useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
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
        <div className="flex flex-col items-center gap-4 mb-8">
          <Image 
            src="/redesign/brand/dr.png" 
            alt="PayDef Logo" 
            width={160} 
            height={48} 
            className="h-[48px] w-auto object-contain" 
            priority
          />
        </div>

        {/* Login card */}
        <div className="bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#2D2D2D] rounded-none shadow-[0_0_40px_rgba(255,214,0,0.05)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--landing-yellow)]" />

          {/* Card header */}
          <div className="px-7 pt-8 pb-6 border-b border-[#1A1A1A]">
            <div className="flex flex-col gap-2">
              <h1 className="font-grotesk text-[18px] md:text-[22px] font-bold text-[#F5F5F0] uppercase tracking-[1px]">Welcome back</h1>
              <p className="font-ibm-mono text-[10px] md:text-[11px] text-[#888888] tracking-[1px] uppercase leading-relaxed">
                Sign in to manage your payment operations dashboard.
              </p>
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

            <form onSubmit={handleSignIn} className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <label className="font-ibm-mono text-[10px] font-bold text-[#888888] uppercase tracking-[1px]">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555] pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@paydef.io"
                    autoComplete="email"
                    required
                    className="w-full bg-[#111111] border border-[#2D2D2D] rounded-none pl-10 pr-3 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="font-ibm-mono text-[10px] font-bold text-[#888888] uppercase tracking-[1px]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555] pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full bg-[#111111] border border-[#2D2D2D] rounded-none pl-10 pr-10 py-3 font-ibm-mono text-[12px] text-[#F5F5F0] placeholder:text-[#444444] focus:outline-none focus:border-[var(--landing-yellow)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555555] hover:text-[#F5F5F0] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[var(--landing-yellow)] hover:bg-[#F5F5F0] disabled:opacity-60 disabled:cursor-not-allowed text-[#0A0A0A] font-grotesk font-bold text-[12px] tracking-[2px] uppercase py-3.5 rounded-none transition-colors mt-6 group"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AUTHENTICATING...
                  </>
                ) : (
                  <>
                    SIGN IN
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Card footer */}
          <div className="px-7 py-5 border-t border-[#1A1A1A] flex items-center justify-between">
            <Link
              href="/"
              className="font-ibm-mono text-[10px] text-[#555555] hover:text-[#F5F5F0] tracking-[1px] transition-colors uppercase"
            >
              &lt; Back to Home
            </Link>
            <Link
              href="/request-access"
              className="font-ibm-mono text-[10px] text-[#555555] hover:text-[var(--landing-yellow)] tracking-[1px] transition-colors uppercase"
            >
              Request Access
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center font-ibm-mono text-[9px] text-[#555555] mt-6 tracking-[1px] uppercase">
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
