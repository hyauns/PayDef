/**
 * lib/api-key-cache.ts — In-Memory bcrypt Result Cache
 *
 * Caches POSITIVE bcrypt.compare results only to avoid ~100ms CPU cost
 * on every API request. Negative results are never cached — a rotated
 * or corrected key takes effect immediately.
 *
 * Cache key: SHA-256(apiKey + storedHash) — no plaintext stored.
 * TTL: 5 minutes. Max entries: 500 (LRU eviction on overflow).
 * If cache mechanism fails for any reason, falls back to raw bcrypt.
 */

import { createHash } from "crypto"
import bcrypt from "bcryptjs"

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ENTRIES = 500

interface CacheEntry {
  expiresAt: number
}

// Only stores positive (valid) results
const _cache = new Map<string, CacheEntry>()

function cacheKey(apiKey: string, storedHash: string): string {
  return createHash("sha256").update(apiKey + storedHash).digest("hex")
}

function evictIfNeeded(): void {
  if (_cache.size <= MAX_ENTRIES) return
  // Evict oldest entry (Map preserves insertion order)
  const firstKey = _cache.keys().next().value
  if (firstKey) _cache.delete(firstKey)
}

export async function compareApiKeyCached(
  apiKey: string,
  storedHash: string
): Promise<boolean> {
  try {
    const key = cacheKey(apiKey, storedHash)
    const now = Date.now()

    const cached = _cache.get(key)
    if (cached && cached.expiresAt > now) {
      return true // Cached positive result
    }

    // Cache miss or expired — run bcrypt
    const valid = await bcrypt.compare(apiKey, storedHash)

    if (valid) {
      // Only cache positive results
      evictIfNeeded()
      _cache.set(key, { expiresAt: now + CACHE_TTL_MS })
    }

    return valid
  } catch {
    // Cache mechanism failed — fallback to raw bcrypt
    return bcrypt.compare(apiKey, storedHash)
  }
}
