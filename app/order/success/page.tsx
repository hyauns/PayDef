import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { OrderResultClient } from "@/app/order/result-client"

function ResultFallback() {
  return (
    <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
        </div>
        <p className="text-xs text-muted-foreground">Finalizing popup result…</p>
      </div>
    </main>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<ResultFallback />}>
      <OrderResultClient status="success" />
    </Suspense>
  )
}
