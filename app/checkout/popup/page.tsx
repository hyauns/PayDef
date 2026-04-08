import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { PopupClient } from "@/app/checkout/popup/popup-client"

type CheckoutPopupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function PopupFallback() {
  return (
    <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-sm font-semibold">Preparing Checkout</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Loading your shield checkout session.
          </p>
        </div>
      </div>
    </main>
  )
}

export default async function CheckoutPopupPage({ searchParams }: CheckoutPopupPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const health = resolvedSearchParams.health === "1"

  if (health) {
    return (
      <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
        <pre className="text-xs text-cyan-400">shield-popup-ok</pre>
      </main>
    )
  }

  return (
    <Suspense fallback={<PopupFallback />}>
      <PopupClient />
    </Suspense>
  )
}
