"use client"

import { Loader2, Shield } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"

export function PopupClient() {
  const searchParams = useSearchParams()
  const approvalUrl = searchParams.get("approval")
  const health = searchParams.get("health") === "1"
  const ref = searchParams.get("ref")

  const decodedApprovalUrl = useMemo(() => {
    if (!approvalUrl) return null
    try {
      const parsed = new URL(approvalUrl)
      return parsed.toString()
    } catch {
      return null
    }
  }, [approvalUrl])

  useEffect(() => {
    if (health || !decodedApprovalUrl) return
    window.location.replace(decodedApprovalUrl)
  }, [decodedApprovalUrl, health])

  if (health) {
    return (
      <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
        <pre className="text-xs text-cyan-400">shield-popup-ok</pre>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
          {decodedApprovalUrl ? (
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
          ) : (
            <Shield className="w-5 h-5 text-red-400" />
          )}
        </div>
        <div className="space-y-1.5">
          <h1 className="text-sm font-semibold">
            {decodedApprovalUrl ? "Opening PayPal Checkout" : "Invalid Popup Session"}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {decodedApprovalUrl
              ? "This secure window is preparing your checkout session."
              : "The popup session link is missing or malformed. Please close this window and try again."}
          </p>
        </div>
        {ref && (
          <p className="text-[10px] text-muted-foreground">
            Ref: <span className="text-cyan-400">{ref}</span>
          </p>
        )}
        {decodedApprovalUrl && (
          <a
            href={decodedApprovalUrl}
            className="inline-flex items-center justify-center w-full px-3 py-2 text-xs font-semibold rounded-md bg-cyan-400 text-background hover:bg-cyan-300 transition-colors"
          >
            Continue manually
          </a>
        )}
      </div>
    </main>
  )
}
