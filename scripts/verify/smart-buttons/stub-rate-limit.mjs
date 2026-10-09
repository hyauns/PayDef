// Records each call so route tests can check which bucket was used.
export async function checkRateLimit(...args) {
  ;(globalThis.__rateLimitCalls = globalThis.__rateLimitCalls || []).push(args)
  return { allowed: true, headers: {} }
}
