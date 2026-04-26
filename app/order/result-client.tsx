"use client"

import { CheckCircle2, CircleSlash2, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

type ResultStatus = "success" | "cancel"
type TransactionState =
  | "PENDING"
  | "AUTHORIZED"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "DISPUTED"
  | "CANCELED"
  | "EXPIRED"

type BrowserResultPayload = {
  transaction_id: string
  status: TransactionState
  merchant_success_url: string | null
  merchant_cancel_url: string | null
  paypal_order_id?: string | null
  updated_at?: string | null
}

const SUCCESS_STATES: TransactionState[] = ["AUTHORIZED", "COMPLETED"]
const FAILURE_STATES: TransactionState[] = ["FAILED", "REFUNDED", "DISPUTED", "CANCELED", "EXPIRED"]

function buildReturnUrl(targetUrl: string, payload: BrowserResultPayload) {
  const url = new URL(targetUrl)
  url.searchParams.set("transaction_id", payload.transaction_id)
  url.searchParams.set("status", payload.status)
  if (payload.paypal_order_id) {
    url.searchParams.set("paypal_order_id", payload.paypal_order_id)
  }
  return url.toString()
}

function postResult(status: ResultStatus, ref: string | null) {
  window.opener?.postMessage(
    {
      source: "gateway-popup-bridge",
      status,
      ref,
    },
    "*"
  )
}

export function OrderResultClient({ status }: { status: ResultStatus }) {
  const searchParams = useSearchParams()
  const ref = searchParams.get("ref")
  const et = searchParams.get("et")
  const [phase, setPhase] = useState<"processing" | "ready" | "error">("processing")
  const [message, setMessage] = useState<string>(
    status === "success"
      ? "Waiting for the server-side payment confirmation."
      : "Finalizing the cancellation state."
  )
  const [finalStatus, setFinalStatus] = useState<TransactionState | null>(null)

  const isPopup = typeof window !== "undefined" && !!window.opener

  const statusTone = useMemo(() => {
    if (finalStatus && FAILURE_STATES.includes(finalStatus)) {
      return {
        iconBg: "bg-amber-400/10 border-amber-400/20",
        iconColor: "text-amber-400",
      }
    }

    if (finalStatus && SUCCESS_STATES.includes(finalStatus)) {
      return {
        iconBg: "bg-emerald-400/10 border-emerald-400/20",
        iconColor: "text-emerald-400",
      }
    }

    return {
      iconBg: "bg-cyan-400/10 border-cyan-400/20",
      iconColor: "text-cyan-400",
    }
  }, [finalStatus])

  useEffect(() => {
    if (!ref) {
      return
    }

    let active = true
    let closeTimer: number | null = null

    const finish = (payload: BrowserResultPayload, target: ResultStatus) => {
      if (!active) return

      setFinalStatus(payload.status)
      setPhase("ready")
      setMessage(
        target === "success"
          ? payload.status === "AUTHORIZED"
            ? "Authorization confirmed. The merchant can capture later."
            : "Payment confirmed by the gateway."
          : "Checkout was canceled before capture."
      )

      postResult(target, ref)

      const redirectUrl = target === "success"
        ? payload.merchant_success_url
        : payload.merchant_cancel_url

      if (redirectUrl) {
        window.location.replace(buildReturnUrl(redirectUrl, payload))
        return
      }

      if (isPopup) {
        closeTimer = window.setTimeout(() => {
          window.close()
        }, 1500)
      }
    }

    const handleCancel = async () => {
      const response = await fetch("/api/gateway/browser-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: ref,
          result: "cancel",
        }),
      })

      let payload: BrowserResultPayload & { error?: string }
      try {
        payload = await response.json()
      } catch {
        throw new Error("Server returned an invalid response. Please try again.")
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to finalize cancel result.")
      }

      finish(payload, "cancel")
    }

    const pollSuccess = async () => {
      const maxAttempts = 20

      // ── Step 1: Trigger PayPal execute (authorize or capture) ──────────────
      // This is the CRITICAL step that actually calls PayPal's /capture or
      // /authorize API. Without this, money NEVER moves — PayPal order stays
      // in APPROVED state indefinitely.
      setMessage("Executing payment with PayPal\u2026")

      try {
        const execRes = await fetch("/api/gateway/execute", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ transactionId: ref, executeToken: et ?? undefined }),
          cache:   "no-store",
        })

        if (execRes.ok) {
          const execData = (await execRes.json()) as {
            status: TransactionState
            transaction_id: string
            already_executed?: boolean
          }

          // If execute returned a terminal status, fetch full payload and finish
          if (SUCCESS_STATES.includes(execData.status) || FAILURE_STATES.includes(execData.status)) {
            const statusRes = await fetch(`/api/gateway/browser-status/${ref}`, { cache: "no-store" })
            const statusPayload = (await statusRes.json()) as BrowserResultPayload
            finish(statusPayload, SUCCESS_STATES.includes(execData.status) ? "success" : "cancel")
            return
          }
        } else {
          console.warn("[result-client] /execute returned error:", execRes.status)
        }
      } catch (execErr) {
        console.warn("[result-client] /execute network error:", execErr)
      }

      // ── Step 2: Poll status until terminal (webhook may update it) ─────────
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (!active) return

        const response = await fetch(`/api/gateway/browser-status/${ref}`, {
          cache: "no-store",
        })
        const payload = (await response.json()) as BrowserResultPayload & { error?: string }

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to fetch browser status.")
        }

        setFinalStatus(payload.status)

        if (SUCCESS_STATES.includes(payload.status)) {
          finish(payload, "success")
          return
        }

        if (FAILURE_STATES.includes(payload.status)) {
          finish(payload, "cancel")
          return
        }

        setMessage(`Confirming with PayPal\u2026 (${attempt}/${maxAttempts})`)
        await new Promise((resolve) => {
          window.setTimeout(resolve, 2000)
        })
      }

      setPhase("ready")
      setMessage("Payment is being confirmed. You can safely close this window \u2014 the transaction will update automatically.")
      postResult("success", ref)
    }

    void (status === "cancel" ? handleCancel() : pollSuccess()).catch((error) => {
      if (!active) return
      setPhase("error")
      setMessage(error instanceof Error ? error.message : "Failed to finalize checkout result.")
    })

    return () => {
      active = false
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer)
      }
    }
  }, [isPopup, ref, status])

  const showSuccess = finalStatus ? SUCCESS_STATES.includes(finalStatus) : status === "success"
  const effectivePhase = !ref ? "error" : phase
  const effectiveMessage = !ref ? "Missing transaction reference." : message

  return (
    <main className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
      {/* Prevent executeToken from leaking via Referer header on redirects */}
      <meta name="referrer" content="no-referrer" />
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 text-center space-y-4">
        <div className={`mx-auto w-12 h-12 rounded-full border flex items-center justify-center ${statusTone.iconBg}`}>
          {effectivePhase === "processing" ? (
            <Loader2 className={`w-5 h-5 animate-spin ${statusTone.iconColor}`} />
          ) : showSuccess ? (
            <CheckCircle2 className={`w-5 h-5 ${statusTone.iconColor}`} />
          ) : (
            <CircleSlash2 className={`w-5 h-5 ${statusTone.iconColor}`} />
          )}
        </div>
        <div className="space-y-1.5">
          <h1 className="text-sm font-semibold">
            {effectivePhase === "processing"
              ? status === "success"
                ? "Confirming Payment"
                : "Canceling Checkout"
              : showSuccess
              ? "Checkout Finalized"
              : "Checkout Interrupted"}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">{effectiveMessage}</p>
        </div>
        {ref && (
          <p className="text-[10px] text-muted-foreground">
            Ref: <span className={showSuccess ? "text-emerald-400" : "text-amber-400"}>{ref}</span>
          </p>
        )}
        {finalStatus && (
          <p className="text-[10px] text-muted-foreground">
            Status: <span className={showSuccess ? "text-emerald-400" : "text-amber-400"}>{finalStatus}</span>
          </p>
        )}
      </div>
    </main>
  )
}
