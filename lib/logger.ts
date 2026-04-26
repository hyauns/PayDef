/**
 * lib/logger.ts — Structured JSON Logger for Payment Gateway
 *
 * Phase A: Utility only. No existing files import this yet.
 *
 * Design principles:
 *   • Synchronous — no async, no network calls, no DB writes
 *   • Never throws — all serialization wrapped in try/catch
 *   • JSON output via console.info/warn/error/debug
 *   • Duck-typed error serialization (no PayPalApiError import)
 *   • Redaction of secrets by convention
 *   • LOG_LEVEL support (default: "info")
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
  route?: string
  requestId?: string
  traceId?: string
  transactionId?: string
  storeId?: string
  tenantId?: string
  merchantAccountId?: string
  paypalOrderId?: string
  intent?: string
  status?: string
  durationMs?: number
  eventId?: string
  error?: unknown
  meta?: Record<string, unknown>
  [key: string]: unknown
}

interface LogEntry {
  ts: string
  level: LogLevel
  service: string
  env: string
  event: string
  msg: string
  [key: string]: unknown
}

interface Logger {
  debug: (event: string, msg: string, ctx?: LogContext) => void
  info: (event: string, msg: string, ctx?: LogContext) => void
  warn: (event: string, msg: string, ctx?: LogContext) => void
  error: (event: string, msg: string, ctx?: LogContext) => void
  child: (extraContext: LogContext) => Logger
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_NAME = "payment-gateway"

const ENV =
  process.env.PAYPAL_ENV === "live"
    ? "production"
    : process.env.NODE_ENV === "production"
      ? "production"
      : "development"

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// ─── Redaction ────────────────────────────────────────────────────────────────

/**
 * Keys whose values must never appear in logs.
 * Matched case-insensitively against context keys.
 */
const REDACTED_KEYS = new Set([
  "client_secret",
  "clientsecret",
  "access_token",
  "accesstoken",
  "execute_hmac_secret",
  "executehmac",
  "webhook_secret",
  "webhooksecret",
  "apikey",
  "api_key",
  "api_key_hash",
  "apkeyhash",
  "executetoken",
  "execute_token",
  "proxy_url",
  "proxyurl",
  "authorization",   // HTTP Authorization header value
])

const REDACTED_VALUE = "[REDACTED]"

/**
 * Mask a string showing only prefix and suffix.
 * Example: "ABCDEFGHIJKLMNOP" → "ABCD...MNOP"
 */
export function maskPrefixSuffix(value: string, prefixLen = 4, suffixLen = 4): string {
  if (value.length <= prefixLen + suffixLen + 3) return REDACTED_VALUE
  return `${value.slice(0, prefixLen)}...${value.slice(-suffixLen)}`
}

/**
 * Returns true if a key name should be redacted.
 */
function isRedactedKey(key: string): boolean {
  return REDACTED_KEYS.has(key.toLowerCase().replace(/[-_]/g, ""))
}

/**
 * Sanitize a context object by redacting known sensitive keys.
 * Returns a shallow copy — does not mutate the original.
 */
export function sanitizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(ctx)) {
    if (key === "error") {
      // Error objects handled separately by safeSerializeError
      clean[key] = safeSerializeError(value)
    } else if (isRedactedKey(key)) {
      clean[key] = REDACTED_VALUE
    } else {
      clean[key] = value
    }
  }
  return clean
}

// ─── Error Serialization ──────────────────────────────────────────────────────

/**
 * Safely serialize an error for structured logging.
 *
 * Uses duck typing to avoid importing PayPalApiError (no circular deps).
 * Extracts: name, message, statusCode, debugId, bodyPreview.
 * Never includes stack traces in production.
 */
export function safeSerializeError(err: unknown): Record<string, unknown> | undefined {
  if (err == null) return undefined

  try {
    if (err instanceof Error) {
      const serialized: Record<string, unknown> = {
        name: err.name,
        message: err.message,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const duck = err as any
      if (typeof duck.statusCode === "number") {
        serialized.statusCode = duck.statusCode
      }
      if (typeof duck.body === "string") {
        serialized.bodyPreview = duck.body.slice(0, 200)
      }
      // PayPal debug_id if present in the error body
      if (typeof duck.debugId === "string") {
        serialized.debugId = duck.debugId
      }

      // Stack traces only in development
      if (ENV !== "production" && err.stack) {
        serialized.stack = err.stack
      }

      return serialized
    }

    // Non-Error thrown value
    return { message: String(err).slice(0, 200) }
  } catch {
    return { message: "[error serialization failed]" }
  }
}

// ─── LOG_LEVEL Resolution ─────────────────────────────────────────────────────

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()
  if (envLevel && envLevel in LEVEL_PRIORITY) {
    return envLevel as LogLevel
  }
  return "info"
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()]
}

// ─── Core Emit ────────────────────────────────────────────────────────────────

const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

function emit(
  level: LogLevel,
  event: string,
  msg: string,
  baseContext: LogContext,
  callContext?: LogContext,
): void {
  // Never throw — entire function wrapped
  try {
    if (!shouldEmit(level)) return

    const merged = { ...baseContext, ...callContext }

    // Extract and remove the error field for special handling
    const { error: rawError, meta, ...contextFields } = merged

    // Build the log entry
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      service: SERVICE_NAME,
      env: ENV,
      event,
      msg,
    }

    // Add sanitized context fields
    const sanitized = sanitizeContext(contextFields as Record<string, unknown>)
    for (const [key, value] of Object.entries(sanitized)) {
      if (value !== undefined && value !== null && value !== "") {
        entry[key] = value
      }
    }

    // Add error if present
    if (rawError !== undefined) {
      entry.error = safeSerializeError(rawError)
    }

    // Add meta if present
    if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
      entry.meta = sanitizeContext(meta as Record<string, unknown>)
    }

    // Serialize with circular reference protection
    const json = safeStringify(entry)
    CONSOLE_FN[level](json)
  } catch {
    // Absolute last resort — logger must never crash the API
    try {
      console.error(`[logger] emit failed: level=${level} event=${event}`)
    } catch {
      // Truly nothing we can do
    }
  }
}

// ─── Safe JSON.stringify ──────────────────────────────────────────────────────

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj)
  } catch {
    // Circular reference or other serialization error
    try {
      const seen = new WeakSet()
      return JSON.stringify(obj, (_key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]"
          seen.add(value)
        }
        return value
      })
    } catch {
      return '{"ts":"' + new Date().toISOString() + '","level":"error","event":"logger.serialization_failed","msg":"Failed to serialize log entry"}'
    }
  }
}

// ─── Logger Factory ───────────────────────────────────────────────────────────

/**
 * Create a structured logger with base context.
 *
 * Usage:
 *   const log = createLogger({ route: "/api/gateway/checkout" })
 *   log.info("checkout.started", "Checkout request received", { storeId })
 *
 *   const txLog = log.child({ transactionId, traceId: transactionId })
 *   txLog.info("checkout.order_created", "PayPal order created", { paypalOrderId })
 */
export function createLogger(baseContext: LogContext = {}): Logger {
  return {
    debug: (event, msg, ctx?) => emit("debug", event, msg, baseContext, ctx),
    info: (event, msg, ctx?) => emit("info", event, msg, baseContext, ctx),
    warn: (event, msg, ctx?) => emit("warn", event, msg, baseContext, ctx),
    error: (event, msg, ctx?) => emit("error", event, msg, baseContext, ctx),
    child: (extraContext) => createLogger({ ...baseContext, ...extraContext }),
  }
}
