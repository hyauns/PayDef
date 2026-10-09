/**
 * lib/gateway-rate-limit.ts — Upstash Redis Rate Limiter for Gateway API
 *
 * Sliding window: 100 requests per 60 seconds, keyed by storeId.
 * Smart Buttons sessions ("button-session" bucket) are requested on page views,
 * not purchases, so they get their own 300/60 s window: a busy shop, or someone
 * calling the shop's public session AJAX, cannot use up the limit that
 * checkout, capture and refund share.
 * Fail-open: if Redis is unreachable, request proceeds (availability > strictness).
 * Fully disabled when UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set.
 */

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export type RateLimitBucket = "default" | "button-session"

const BUCKETS: Record<RateLimitBucket, { limit: number; prefix: string }> = {
  "default":        { limit: 100, prefix: "gw" },
  "button-session": { limit: 300, prefix: "gw-bs" },
}

const _limiters: Partial<Record<RateLimitBucket, Ratelimit>> = {}
let _disabledLogged = false

function getRateLimiter(bucket: RateLimitBucket): Ratelimit | null {
  const existing = _limiters[bucket]
  if (existing) return existing

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

  const { limit, prefix } = BUCKETS[bucket]
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, "60 s"),
    prefix,
  })
  _limiters[bucket] = limiter
  return limiter
}

export async function checkRateLimit(
  storeId: string,
  bucket: RateLimitBucket = "default"
): Promise<{ allowed: boolean; headers: Record<string, string> }> {
  const limiter = getRateLimiter(bucket)
  if (!limiter) return { allowed: true, headers: {} }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(storeId)
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(reset),
    }
    if (!success) {
      console.warn(`[rate-limit] Store ${storeId} exceeded ${limit} req/min (${bucket})`)
    }
    return { allowed: success, headers }
  } catch (err) {
    // Fail-open: Redis down → allow request through
    console.error("[rate-limit] Upstash error (fail-open):", err)
    return { allowed: true, headers: {} }
  }
}
