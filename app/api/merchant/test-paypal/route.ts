/**
 * POST /api/merchant/test-paypal
 *
 * Validates a PayPal Client ID + Secret by attempting to fetch an OAuth token.
 * Returns success/failure so the UI can show a clear indicator before saving.
 *
 * Auth: Any authenticated MERCHANT.
 * The credentials are used only in-memory for the test — never persisted.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"

const PAYPAL_ENV   = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
const PAYPAL_TOKEN_URL = PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com/v1/oauth2/token"
  : "https://api-m.sandbox.paypal.com/v1/oauth2/token"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { clientId?: string; clientSecret?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const clientId     = body.clientId?.trim()
  const clientSecret = body.clientSecret?.trim()

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "clientId and clientSecret are required." },
      { status: 400 }
    )
  }

  const startMs = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000) // 10s timeout

    const res = await fetch(PAYPAL_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "User-Agent":    "GatewayCentral-ConnectionTest/1.0",
      },
      body:   "grant_type=client_credentials",
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const latencyMs = Date.now() - startMs

    if (res.ok) {
      const data = await res.json() as { token_type?: string; expires_in?: number }
      return NextResponse.json({
        ok:       true,
        env:      PAYPAL_ENV,
        endpoint: PAYPAL_TOKEN_URL,
        latencyMs,
        tokenType:  data.token_type ?? "Bearer",
        expiresIn:  data.expires_in ?? null,
        message: `Connected to PayPal ${PAYPAL_ENV} in ${latencyMs}ms`,
      })
    }

    // PayPal returned an error (e.g. 401 invalid_client)
    const errText = await res.text()
    let errMessage = `PayPal rejected the credentials (HTTP ${res.status})`
    try {
      const errJson = JSON.parse(errText) as { error_description?: string; message?: string }
      errMessage = errJson.error_description ?? errJson.message ?? errMessage
    } catch { /* raw text */ }

    return NextResponse.json(
      {
        ok:       false,
        env:      PAYPAL_ENV,
        endpoint: PAYPAL_TOKEN_URL,
        latencyMs,
        httpStatus: res.status,
        error: errMessage,
      },
      { status: 400 }
    )
  } catch (err) {
    const latencyMs = Date.now() - startMs
    const isTimeout = err instanceof Error && err.name === "AbortError"
    return NextResponse.json(
      {
        ok:       false,
        env:      PAYPAL_ENV,
        endpoint: PAYPAL_TOKEN_URL,
        latencyMs,
        error: isTimeout
          ? "Request timed out after 10 seconds. Check your network or proxy configuration."
          : err instanceof Error ? err.message : "Connection failed",
      },
      { status: 502 }
    )
  }
}
