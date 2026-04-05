import Link from "next/link"
import { ArrowLeft, ExternalLink, MessageCircle, Shield } from "lucide-react"

const TELEGRAM_URL = "https://t.me/mrhoibeo"

export default function RequestAccessPage() {
  return (
    <main className="relative min-h-screen bg-background flex items-center justify-center overflow-hidden px-4 py-10 font-mono">
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

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, oklch(0.11 0 0 / 0.85) 100%)",
        }}
      />

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

      <section className="relative z-10 w-full max-w-[460px] rounded-lg border border-border bg-card shadow-2xl shadow-black/40">
        <div className="border-b border-border px-7 py-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10">
              <Shield className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Access Request</p>
              <h1 className="text-lg font-semibold text-foreground">Connect With Gateway Central</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            To request onboarding, pricing, or merchant access, contact our team directly on Telegram.
          </p>
        </div>

        <div className="space-y-5 px-7 py-6">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400">Official Telegram</p>
            <p className="mt-2 text-xl font-semibold text-foreground">@mrhoibeo</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Introduce your business, estimated monthly volume, current platform, and required timeline so the team can respond faster.
            </p>
          </div>

          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0088cc] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0077bb]"
          >
            <MessageCircle className="h-4 w-4" />
            Open Telegram Chat
            <ExternalLink className="h-4 w-4" />
          </a>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Prefer to return first?</span>
            <Link href="/login" className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan-400">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Login
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
