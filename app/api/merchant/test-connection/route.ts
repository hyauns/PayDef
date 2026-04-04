/**
 * POST /api/merchant/test-connection
 *
 * Tests connectivity to a URL/domain by performing a real server-side fetch.
 * Returns latency, SSL status, HTTP status code, and health classification.
 *
 * Health rules:
 *   - < 200ms → Healthy
 *   - 200–500ms → Degraded
 *   - Timeout / error → Down
 *
 * Auth: Any authenticated user.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { url: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  // Normalize the URL — prepend https:// if no protocol
  let targetUrl = body.url.trim()
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`
  }

  try {
    new URL(targetUrl) // validate URL format
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
  }

  const startTime = performance.now()
  let latencyMs: number | null = null
  let httpStatus: number | null = null
  let sslValid = false
  let health: "Healthy" | "Degraded" | "Down" = "Down"
  let errorMessage: string | null = null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000) // 8s timeout

    const response = await fetch(targetUrl, {
      method: "HEAD",             // lightweight — don't download body
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Gateway-HealthCheck/1.0",
      },
    })

    clearTimeout(timeout)
    latencyMs = Math.round(performance.now() - startTime)
    httpStatus = response.status

    // SSL is valid if we successfully connected via HTTPS
    sslValid = targetUrl.startsWith("https://")

    // Health classification
    if (httpStatus >= 200 && httpStatus < 500) {
      health = latencyMs <= 200 ? "Healthy" : "Degraded"
    } else {
      health = "Degraded"
    }
  } catch (err: any) {
    latencyMs = Math.round(performance.now() - startTime)

    if (err.name === "AbortError") {
      errorMessage = "Connection timed out (8s)"
      health = "Down"
    } else if (err.cause?.code === "ENOTFOUND") {
      errorMessage = "DNS resolution failed"
      health = "Down"
    } else if (err.cause?.code === "ECONNREFUSED") {
      errorMessage = "Connection refused"
      health = "Down"
    } else if (err.message?.includes("certificate")) {
      errorMessage = "SSL certificate error"
      sslValid = false
      health = "Degraded"
    } else {
      errorMessage = err.message ?? "Connection failed"
      health = "Down"
    }
  }

  return NextResponse.json({
    url:       targetUrl,
    latencyMs,
    httpStatus,
    sslValid,
    health,
    error:     errorMessage,
    checkedAt: new Date().toISOString(),
  })
}
