import Link from "next/link"
import { ArrowLeft, FileText, Rocket } from "lucide-react"

export default function ApiDocsPlaceholderPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 font-mono">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-lg border border-border bg-card shadow-2xl shadow-black/40">
          <div className="border-b border-border px-7 py-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10">
                <FileText className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">API Documentation</p>
                <h1 className="text-lg font-semibold text-foreground">Documentation Is Being Prepared</h1>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              This section is reserved for the public API reference, authentication flow, webhook payloads, and sample integration guides.
            </p>
          </div>

          <div className="space-y-5 px-7 py-6">
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Rocket className="h-4 w-4" />
                <span className="text-xs uppercase tracking-[0.22em]">Coming Soon</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The route is live now so merchants no longer hit a 404, but the full documentation content will be published in a later release.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Need the operational dashboard instead?</span>
              <Link href="/dashboard" className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan-400">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Dashboard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
