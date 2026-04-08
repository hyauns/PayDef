"use client"

import { CheckCircle2, CircleSlash2 } from "lucide-react"
import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

type ResultStatus = "success" | "cancel"

export function OrderResultClient({ status }: { status: ResultStatus }) {
  const searchParams = useSearchParams()
  const ref = searchParams.get("ref")

  useEffect(() => {
    window.opener?.postMessage(
      {
        source: "gateway-popup-bridge",
        status,
        ref,
      },
      "*"
    )

    const timeout = window.setTimeout(() => {
      window.close()
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [ref, status])

  const isSuccess = status === "success"

  return (
    <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 text-center space-y-4">
        <div className={`mx-auto w-12 h-12 rounded-full border flex items-center justify-center ${
          isSuccess
            ? "bg-emerald-400/10 border-emerald-400/20"
            : "bg-amber-400/10 border-amber-400/20"
        }`}>
          {isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <CircleSlash2 className="w-5 h-5 text-amber-400" />
          )}
        </div>
        <div className="space-y-1.5">
          <h1 className="text-sm font-semibold">
            {isSuccess ? "Payment Approved" : "Payment Cancelled"}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isSuccess
              ? "This checkout window can be closed. Your storefront should receive the result from the popup bridge."
              : "The checkout window can be closed. No payment was captured."}
          </p>
        </div>
        {ref && (
          <p className="text-[10px] text-muted-foreground">
            Ref: <span className={isSuccess ? "text-emerald-400" : "text-amber-400"}>{ref}</span>
          </p>
        )}
      </div>
    </main>
  )
}
