/**
 * lib/gateway-rate-limit.ts — Upstash Redis Rate Limiter for Gateway API
 *
 * Sliding window: 100 requests per 60 seconds, keyed by storeId.
 * Fail-open: if Redis is unreachable, request proceeds (availability > strictness).
 * Fully disabled when UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set.
 */

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

let _ratelimit: Ratelimit | null = null
let _disabledLogged = false

function getRateLimiter(): Ratelimit | null {
  if (_ratelimit) return _ratelimit

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    // Log once per runtime, not on every request
    if (!_disabledLogged) {
      console.warn("[rate-limit] UPSTASH env vars missing — rate limiting disabled")
      _disabledLogged = true
    }
    return null
  }

  _ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(100, "60 s"),
    prefix: "gw",
  })
  return _ratelimit
}

export async function checkRateLimit(
  storeId: string
): Promise<{ allowed: boolean; headers: Record<string, string> }> {
  const limiter = getRateLimiter()
  if (!limiter) return { allowed: true, headers: {} }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(storeId)
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(reset),
    }
    if (!success) {
      console.warn(`[rate-limit] Store ${storeId} exceeded 100 req/min`)
    }
    return { allowed: success, headers }
  } catch (err) {
    // Fail-open: Redis down → allow request through
    console.error("[rate-limit] Upstash error (fail-open):", err)
    return { allowed: true, headers: {} }
  }
}
