/**
 * lib/execute-token.ts — HMAC-SHA256 Token for /api/gateway/execute
 *
 * Shadow/Enforce mode controlled by EXECUTE_TOKEN_MODE env var.
 * - shadow (default): generate token, verify if present, log result, NEVER block
 * - enforce: reject missing/invalid tokens with 403
 *
 * Fully disabled when EXECUTE_HMAC_SECRET is not set — zero behavior change.
 * Secret must be a 64-character hex string (32 bytes). If malformed, feature
 * is treated as disabled with a high-severity warning log.
 *
 * SECURITY: Never log the secret or token values.
 */

import { createHmac, timingSafeEqual } from "crypto"

let _secretValidated = false
let _secretValid = false

function getSecret(): string | null {
  const raw = process.env.EXECUTE_HMAC_SECRET?.trim()
  if (!raw) return null

  // Validate format: must be 64 hex characters (32 bytes)
  if (!_secretValidated) {
    _secretValidated = true
    if (raw.length !== 64 || !/^[0-9a-fA-F]+$/.test(raw)) {
      console.error(
        "[execute-token] CRITICAL: EXECUTE_HMAC_SECRET is not a valid 64-char hex string. " +
        "Execute token feature is DISABLED. Generate a valid key with: openssl rand -hex 32"
      )
      _secretValid = false
    } else {
      _secretValid = true
    }
  }

  return _secretValid ? raw : null
}

export function getMode(): "shadow" | "enforce" {
  const mode = process.env.EXECUTE_TOKEN_MODE?.trim().toLowerCase()
  return mode === "enforce" ? "enforce" : "shadow"
}

export function generateExecuteToken(transactionId: string): string | null {
  const secret = getSecret()
  if (!secret) return null
  return createHmac("sha256", secret).update(transactionId).digest("hex")
}

export function verifyExecuteToken(
  transactionId: string,
  token: string | undefined | null
): { valid: boolean; reason: string; shouldBlock: boolean } {
  const secret = getSecret()
  const mode = getMode()

  // Feature disabled — always pass, never block
  if (!secret) {
    return { valid: true, reason: "disabled", shouldBlock: false }
  }

  // Token missing
  if (!token) {
    const shouldBlock = mode === "enforce"
    return { valid: false, reason: "missing_token", shouldBlock }
  }

  // Token verification
  try {
    const expected = createHmac("sha256", secret)
      .update(transactionId)
      .digest("hex")
    const a = Buffer.from(token, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length !== b.length) {
      return { valid: false, reason: "length_mismatch", shouldBlock: mode === "enforce" }
    }
    const match = timingSafeEqual(a, b)
    return {
      valid: match,
      reason: match ? "valid" : "hmac_mismatch",
      shouldBlock: !match && mode === "enforce",
    }
  } catch {
    // Malformed token hex — treat as invalid
    return { valid: false, reason: "verification_error", shouldBlock: mode === "enforce" }
  }
}
