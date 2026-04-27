/**
 * lib/paypal.ts — PayPal REST API v2 Orders Integration
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  DATA ISOLATION GUARANTEE                                          │
 * │                                                                     │
 * │  Every field sent to PayPal is sanitised through lib/masking.ts.   │
 * │  The following data NEVER appears in any PayPal API request:       │
 * │    • Original product / item names                                  │
 * │    • Merchant store name or domain                                  │
 * │    • Customer PII (email, phone, address)                           │
 * │    • Internal tenant or store identifiers                           │
 * │                                                                     │
 * │  The only internal reference exposed is the `custom_id` field,     │
 * │  which contains an opaque UUID (our transactionId) for webhook     │
 * │  matching — it reveals no business context.                         │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Uses the PayPal Sandbox by default unless PAYPAL_ENV=live is set.
 * Credentials are passed per-call (clientId / clientSecret from the
 * MerchantAccount record) so each account uses its own OAuth token.
 */

import {
  maskBrandName,
  maskDescription,
  sanitizePayPalField,
} from "@/lib/masking"
import { randomizePayload } from "@/lib/behavioral-randomization"
import { HttpsProxyAgent } from "https-proxy-agent"
import { createHash } from "crypto"

const PAYPAL_ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"

const PAYPAL_BASE =
  PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com"

// Log the active PayPal environment once at module load time (visible in Vercel function logs)
console.info(`[paypal] Environment: ${PAYPAL_ENV} → ${PAYPAL_BASE}`)

// ─── Token Cache ──────────────────────────────────────────────────────────
//
// PayPal OAuth tokens are valid for ~9 hours but we cache for 8 hours
// (with a 5-minute safety margin) to avoid using expired tokens.
//
// Key: clientId (unique per merchant account)
// Value: { token, expiresAt }
//
// This is a global in-memory Map — it persists across requests within
// the same serverless invocation (Vercel function warm start) but is
// automatically cleared on cold starts.  No stale data risk.
// ───────────────────────────────────────────────────────────────────────

interface CachedToken {
  token:     string
  expiresAt: number  // Unix timestamp (ms)
}

const TOKEN_CACHE = new Map<string, CachedToken>()

/** Cache TTL: 8 hours minus a 5-minute safety margin */
const TOKEN_TTL_MS = (8 * 60 * 60 - 5 * 60) * 1000  // 7h 55m

// ─── User-Agent Rotation ─────────────────────────────────────────────────
//
// Each merchant account gets a deterministic, realistic User-Agent string.
// These mimic real server-side HTTP clients to avoid UA-based fingerprinting
// and velocity detection by PayPal’s risk engine.
//
// The UA is chosen by hashing the merchant’s clientId — same account always
// gets the same UA, but different accounts appear as different systems.
// ───────────────────────────────────────────────────────────────────────

const USER_AGENTS = [
  // Node.js / server runtimes
  "node-fetch/3.3.2 (+https://github.com/node-fetch/node-fetch)",
  "axios/1.7.4",
  "got/14.4.1 (https://github.com/sindresorhus/got)",
  "undici/6.19.5",
  "node-fetch/2.7.0",
  "axios/1.6.8",
  // Java / JVM
  "Apache-HttpClient/4.5.14 (Java/17.0.8)",
  "Apache-HttpClient/5.3 (Java/21.0.1)",
  "okhttp/4.12.0",
  "Java/11.0.22",
  // Python
  "python-requests/2.31.0",
  "python-requests/2.32.3",
  "aiohttp/3.9.5 (Python/3.12.3)",
  "httpx/0.27.0",
  // PHP
  "GuzzleHttp/7.8.1 curl/8.4.0 PHP/8.3.4",
  "GuzzleHttp/7.7.0 curl/8.2.1 PHP/8.2.15",
  "Symfony HttpClient/Curl (PHP/8.3.6)",
  // Ruby
  "Faraday v2.9.0",
  "rest-client/2.1.0 (linux x86_64) ruby/3.3.0p0",
  // Go
  "Go-http-client/2.0",
  "Go-http-client/1.1",
  // .NET
  "Microsoft.AspNet.WebApi.Client/6.0.0",
  "dotnet/8.0 HttpClient",
  // Generic / enterprise
  "PaymentService/2.4.1",
  "CommerceEngine/3.1.0 (Enterprise)",
] as const

/**
 * Returns a deterministic User-Agent string for a given merchant account.
 * The same clientId always resolves to the same UA — no per-request variance.
 * Exported so the webhook verification route can reuse the same UA pool.
 */
export function getUserAgent(clientId: string): string {
  const hash = createHash("md5").update(clientId).digest()
  const index = hash.readUInt16BE(0) % USER_AGENTS.length
  return USER_AGENTS[index]
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayPalOrderItem {
  name:      string   // MUST be pre-masked via maskItemName()
  quantity:  string   // always "1"
  unitAmount: {
    currencyCode: string
    value:        string  // 2-decimal string, e.g. "49.99"
  }
}

export interface CreateOrderParams {
  clientId:      string
  clientSecret:  string
  amount:        string        // total as 2-decimal string
  currencyCode:  string        // e.g. "USD"
  items:         PayPalOrderItem[]
  returnUrl:     string        // shield domain success URL
  cancelUrl:     string        // shield domain cancel URL
  customId:      string        // opaque UUID — our internal transactionId
  merchantAccId?: string       // optional — used to seed brand name selection
  proxyUrl?:     string        // optional — HTTP/HTTPS/SOCKS5 proxy for this account
  intent?:       "CAPTURE" | "AUTHORIZE"  // default: CAPTURE
  skipRandomization?: boolean  // Phase 3: skip behavioral randomization for profile-driven items
}

export class PayPalApiError extends Error {
  public readonly statusCode: number
  public readonly body: string
  public readonly operation: string

  constructor(operation: string, statusCode: number, body: string) {
    super(`PayPal ${operation} error [${statusCode}]: ${body}`)
    this.name = "PayPalApiError"
    this.operation = operation
    this.statusCode = statusCode
    this.body = body
  }
}

export interface PayPalOrderResponse {
  id:     string
  status: string
  links:  { href: string; rel: string; method: string }[]
}

// ─── Proxy-aware fetch helper ─────────────────────────────────────────────────

/**
 * Creates a fetch wrapper that routes through an HTTPS proxy when provided.
 *
 * When proxyUrl is set, creates an HttpsProxyAgent and passes it as the
 * `agent` option to Node's fetch (undici). When proxyUrl is empty/null,
 * falls back to the standard global fetch.
 *
 * Security: proxy URL is validated but never logged in full — credentials
 * could be embedded in the URL (e.g. http://user:pass@proxy.example.com:8080).
 */
function createFetchOptions(proxyUrl?: string | null): { agent?: HttpsProxyAgent<string> } {
  const normalizedProxyUrl = proxyUrl?.trim()
  if (!normalizedProxyUrl) return {}
  try {
    const agent = new HttpsProxyAgent(normalizedProxyUrl)
    return { agent }
  } catch {
    console.error("[paypal] Invalid proxy URL — falling back to direct connection")
    return {}
  }
}

function normalizeCredential(value: string): string {
  return value.trim()
}

function getClientIdHint(clientId: string): string {
  return `${clientId.slice(0, 8)}...${clientId.slice(-4)}`
}

export function clearPayPalTokenCache(clientId: string): void {
  TOKEN_CACHE.delete(normalizeCredential(clientId))
}

export function isInvalidClientError(error: unknown): boolean {
  return error instanceof PayPalApiError &&
    error.statusCode === 401 &&
    /invalid_client/i.test(error.body)
}

/**
 * Fatal 403 — account restriction or credential-level denial.
 * These indicate the account should be quarantined (SUSPENDED).
 */
const FATAL_403_PATTERNS = [
  /PERMISSION_DENIED/i,
  /ACCOUNT_RESTRICTED/i,
  /AUTHORIZATION_ERROR/i,
  /NOT_AUTHORIZED/i,
  /PAYEE_ACCOUNT_RESTRICTED/i,
]

export function isFatalForbiddenError(error: unknown): boolean {
  if (!(error instanceof PayPalApiError) || error.statusCode !== 403) return false
  return FATAL_403_PATTERNS.some((pattern) => pattern.test(error.body))
}

/**
 * Ambiguous/temporary 403 — does not match any known fatal pattern.
 * These should go into circuit breaker cooldown, NOT permanent SUSPENDED.
 */
export function isTemporaryForbiddenError(error: unknown): boolean {
  if (!(error instanceof PayPalApiError) || error.statusCode !== 403) return false
  // If it's not a known fatal pattern, treat as temporary
  return !FATAL_403_PATTERNS.some((pattern) => pattern.test(error.body))
}

/**
 * HTTP 429 — PayPal rate limit. Must NEVER suspend the account.
 * Should only feed into circuit breaker cooldown.
 */
export function isRateLimitError(error: unknown): boolean {
  return error instanceof PayPalApiError && error.statusCode === 429
}

// ─── OAuth token (per-account, cached for 8h) ───────────────────────────────

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  proxyUrl?: string | null
): Promise<string> {
  const normalizedClientId = normalizeCredential(clientId)
  const normalizedClientSecret = normalizeCredential(clientSecret)
  const normalizedProxyUrl = proxyUrl?.trim() ?? null

  // ── Check cache first ────────────────────────────────────────────────
  const cached = TOKEN_CACHE.get(normalizedClientId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  // ── Cache miss or expired — fetch new token ──────────────────────────
  const proxyOpts = createFetchOptions(normalizedProxyUrl)
  const ua = getUserAgent(normalizedClientId)

  // Log the token request so it's visible in Vercel function logs
  const clientIdHint = getClientIdHint(normalizedClientId)
  console.info(
    `[paypal] Fetching OAuth token for clientId=${clientIdHint} env=${PAYPAL_ENV} proxy=${normalizedProxyUrl ? "yes" : "no"} via ${PAYPAL_BASE}`
  )

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${normalizedClientId}:${normalizedClientSecret}`).toString("base64")}`,
      "User-Agent":    ua,
    },
    body: "grant_type=client_credentials",
    ...proxyOpts,
  })

  if (!res.ok) {
    const text = await res.text()
    clearPayPalTokenCache(normalizedClientId)
    console.error(
      `[paypal] OAuth token FAILED for clientId=${clientIdHint} env=${PAYPAL_ENV} proxy=${normalizedProxyUrl ? "yes" : "no"}: [${res.status}] ${text}`
    )
    throw new PayPalApiError("token", res.status, text)
  }

  const data = await res.json() as { access_token: string; expires_in?: number }
  console.info(`[paypal] OAuth token OK for clientId=${clientIdHint} (expires_in=${data.expires_in}s)`)

  // PayPal returns expires_in in seconds (typically 32400 = 9h).
  // Fall back to our conservative 8h TTL if the field is missing.
  const ttlMs = data.expires_in
    ? Math.min((data.expires_in - 300) * 1000, TOKEN_TTL_MS)  // 5min early, capped at 8h
    : TOKEN_TTL_MS

  TOKEN_CACHE.set(normalizedClientId, {
    token:     data.access_token,
    expiresAt: Date.now() + ttlMs,
  })

  return data.access_token
}

// ─── Payload Builder (sanitised) ─────────────────────────────────────────────

/**
 * Constructs the PayPal order JSON body with full masking applied.
 *
 * Every string field is passed through sanitizePayPalField() as a final
 * safety net, even though callers should already provide masked values.
 * This defence-in-depth approach ensures that even a coding mistake
 * upstream cannot leak sensitive data to PayPal.
 */
export function buildOrderPayload(p: CreateOrderParams) {
  // Final-pass sanitisation on all string fields going to PayPal
  const safeBrand       = sanitizePayPalField(maskBrandName(p.merchantAccId))
  const safeDescription = sanitizePayPalField(maskDescription(p.customId))

  // ── Behavioral Randomization ────────────────────────────────────────────
  // Phase 3: when skipRandomization is true (profile-driven SINGLE_SEMANTIC_ITEM
  // or REAL_CART_ITEMS), items are passed through without splitting/jitter.
  // LEGACY_RANDOM_SPLIT still uses the old randomizePayload path.
  let finalItems: { name: string; quantity: string; unitAmount: { currencyCode: string; value: string }; category?: string }[]
  let itemTotal: string
  let timeJitterMs = 0

  if (p.skipRandomization) {
    // Profile-driven: pass items through as-is (already built by buildPayPalLineItemsForProfile)
    finalItems = p.items.map(item => ({
      name:       item.name,
      quantity:   item.quantity,
      unitAmount: item.unitAmount,
      category:   "PHYSICAL_GOODS" as const,
    }))
    // item_total = sum of all items
    const totalCents = finalItems.reduce(
      (s, it) => s + Math.round(parseFloat(it.unitAmount.value) * 100) * parseInt(it.quantity, 10),
      0
    )
    itemTotal = (totalCents / 100).toFixed(2)
    timeJitterMs = 0 // No time jitter for clean profile-driven orders
  } else {
    // Legacy: applies amount jitter, category rotation, and item splitting.
    // The returned items sum EXACTLY to p.amount — the total never changes.
    const randomized = randomizePayload(
      p.amount,
      p.currencyCode,
      p.items,
      p.customId // transaction ID seeds the randomization
    )
    finalItems = randomized.items
    itemTotal = randomized.itemTotal
    timeJitterMs = randomized.timeJitterMs
  }

  return {
    intent: p.intent ?? "CAPTURE",
    purchase_units: [
      {
        custom_id:   p.customId,   // opaque UUID — only internal reference
        description: safeDescription,
        amount: {
          currency_code: p.currencyCode,
          value:         p.amount,  // INVARIANT: original total, never modified
          breakdown: {
            item_total: {
              currency_code: p.currencyCode,
              value:         itemTotal,
            },
          },
        },
        items: finalItems.map((item) => ({
          name:     sanitizePayPalField(item.name),
          quantity: item.quantity,
          unit_amount: {
            currency_code: item.unitAmount.currencyCode,
            value:         item.unitAmount.value,
          },
          category: item.category || "PHYSICAL_GOODS",
        })),
      },
    ],
    application_context: {
      return_url:          p.returnUrl,
      cancel_url:          p.cancelUrl,
      brand_name:          safeBrand,
      shipping_preference: "NO_SHIPPING",
      user_action:         "PAY_NOW",
      landing_page:        "LOGIN",
    },
    // Expose time jitter to the caller for pre-API delay
    __timeJitterMs: timeJitterMs,
  }
}

// ─── Create Order ─────────────────────────────────────────────────────────────

export async function createPayPalOrder(p: CreateOrderParams): Promise<PayPalOrderResponse> {
  const token   = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const payload = buildOrderPayload(p)

  // ── Time Jitter ──────────────────────────────────────────────────────────
  // Random 500ms–2500ms delay breaks rhythmic request patterns that could
  // trigger velocity-based fraud detection. The delay happens AFTER OAuth
  // token acquisition (which is time-sensitive) but BEFORE the order call.
  const { __timeJitterMs, ...cleanPayload } = payload
  if (__timeJitterMs > 0) {
    const { sleep } = await import("@/lib/behavioral-randomization")
    await sleep(__timeJitterMs)
  }

  const proxyOpts = createFetchOptions(p.proxyUrl)
  const ua = getUserAgent(p.clientId)

  // ── Phase 3: Preflight diagnostic — final payload state before PayPal ────
  const payloadItems = cleanPayload.purchase_units?.[0]?.items ?? []
  const LEGACY_NAMES = new Set([
    "Technical Support", "Service Extension", "Business Consultation",
    "Professional Services", "Support Package", "Account Maintenance",
    "Platform Services", "Service Subscription", "Enterprise Solution",
    "Managed Services", "IT Consultation", "System Integration",
    "Cloud Services", "Infrastructure Support", "Compliance Review",
    "Advisory Services",
  ])
  const containsLegacy = payloadItems.some((it: any) => LEGACY_NAMES.has(it.name))
  const containsProfile = payloadItems.some((it: any) => !LEGACY_NAMES.has(it.name) && it.name?.length > 0)
  console.info(JSON.stringify({
    event: "paypal.create_order_payload_preflight",
    transactionId: p.customId,
    skipRandomization: !!p.skipRandomization,
    itemCount: payloadItems.length,
    amountTotal: cleanPayload.purchase_units?.[0]?.amount?.value,
    itemTotal: cleanPayload.purchase_units?.[0]?.amount?.breakdown?.item_total?.value,
    containsLegacyDescriptor: containsLegacy,
    containsProfileDescriptor: containsProfile,
    timeJitterMs: __timeJitterMs,
  }))

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "Authorization":     `Bearer ${token}`,
      "PayPal-Request-Id": p.customId, // idempotency key (opaque UUID)
      "User-Agent":        ua,
    },
    body: JSON.stringify(cleanPayload),
    ...proxyOpts,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new PayPalApiError("create order", res.status, text)
  }

  return res.json() as Promise<PayPalOrderResponse>
}

// ─── Extract Approval URL ─────────────────────────────────────────────────────

export function getApprovalUrl(order: PayPalOrderResponse): string {
  const link = order.links.find((l) => l.rel === "approve")
  if (!link) throw new Error("PayPal did not return an approval URL.")
  return link.href
}

// ─── Capture Authorization ────────────────────────────────────────────────

export interface CaptureAuthorizationParams {
  clientId:         string
  clientSecret:     string
  authorizationId:  string
  proxyUrl?:        string
}

export interface CaptureResponse {
  id:     string     // captureId
  status: string     // "COMPLETED" | "DECLINED" | ...
  amount: {
    currency_code: string
    value:         string
  }
}

/**
 * Captures funds for a previously authorized PayPal payment.
 *
 * This is used in the AUTHORIZE → CAPTURE (manual capture) flow.
 * The merchant's store calls POST /api/gateway/capture with the
 * authorization_id obtained from the AUTHORIZATION.CREATED webhook.
 *
 * The capture inherits all proxy, UA, and time-jitter settings from
 * the original merchant account credentials.
 */
export async function captureAuthorization(
  p: CaptureAuthorizationParams
): Promise<CaptureResponse> {
  const token    = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const proxyOpts = createFetchOptions(p.proxyUrl)
  const ua       = getUserAgent(p.clientId)

  // Time jitter before capture (500–1500ms — shorter than order creation
  // because captures are typically time-sensitive after buyer approval)
  const jitterMs = 500 + Math.floor(Math.random() * 1000)
  await new Promise((r) => setTimeout(r, jitterMs))

  const res = await fetch(
    `${PAYPAL_BASE}/v2/payments/authorizations/${p.authorizationId}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent":    ua,
      },
      body: JSON.stringify({}),  // Empty body — captures the full authorized amount
      ...proxyOpts,
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new PayPalApiError("capture authorization", res.status, text)
  }

  return res.json() as Promise<CaptureResponse>
}

// ─── Execute Approved Order: Capture ─────────────────────────────────────────
//
// Called after buyer returns from PayPal with an APPROVED order.
// For CAPTURE intent: calls POST /v2/checkout/orders/{id}/capture
// This is the final step that actually moves money.

export interface OrderExecuteParams {
  clientId:     string
  clientSecret: string
  orderId:      string   // paypal_order_id from DB
  proxyUrl?:    string
}

export interface OrderCaptureResult {
  id:     string    // paypal capture ID
  status: string    // "COMPLETED" | "DECLINED" | ...
  amount?: { currency_code: string; value: string }
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string; amount: { currency_code: string; value: string } }>
    }
  }>
}

export interface OrderAuthorizeResult {
  id:     string    // paypal authorization ID
  status: string    // "CREATED" | "VOIDED" | ...
  amount?: { currency_code: string; value: string }
  purchase_units?: Array<{
    payments?: {
      authorizations?: Array<{ id: string; status: string; amount: { currency_code: string; value: string } }>
    }
  }>
}

/**
 * Captures funds for an already-APPROVED PayPal order (CAPTURE intent flow).
 * This is called by /api/gateway/execute after the buyer returns from PayPal.
 */
export async function captureApprovedOrder(p: OrderExecuteParams): Promise<OrderCaptureResult> {
  const token     = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const proxyOpts = createFetchOptions(p.proxyUrl)
  const ua        = getUserAgent(p.clientId)

  const jitterMs = 200 + Math.floor(Math.random() * 500)
  await new Promise((r) => setTimeout(r, jitterMs))

  console.info(`[paypal] Capturing order ${p.orderId} (clientId=${p.clientId.slice(0, 8)}...)`)

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${p.orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      "User-Agent":    ua,
    },
    body: JSON.stringify({}),
    ...proxyOpts,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[paypal] captureApprovedOrder FAILED [${res.status}]: ${text}`)
    throw new PayPalApiError("capture order", res.status, text)
  }

  const data = await res.json() as OrderCaptureResult
  console.info(`[paypal] captureApprovedOrder OK: orderId=${p.orderId} status=${data.status}`)
  return data
}

/**
 * Authorizes funds for an already-APPROVED PayPal order (AUTHORIZE intent flow).
 * This is called by /api/gateway/execute after the buyer returns from PayPal.
 * The authorization_id is saved for later capture by the merchant.
 */
export async function authorizeApprovedOrder(p: OrderExecuteParams): Promise<OrderAuthorizeResult> {
  const token     = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const proxyOpts = createFetchOptions(p.proxyUrl)
  const ua        = getUserAgent(p.clientId)

  const jitterMs = 200 + Math.floor(Math.random() * 500)
  await new Promise((r) => setTimeout(r, jitterMs))

  console.info(`[paypal] Authorizing order ${p.orderId} (clientId=${p.clientId.slice(0, 8)}...)`)

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${p.orderId}/authorize`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      "User-Agent":    ua,
    },
    body: JSON.stringify({}),
    ...proxyOpts,
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[paypal] authorizeApprovedOrder FAILED [${res.status}]: ${text}`)
    throw new PayPalApiError("authorize order", res.status, text)
  }

  const data = await res.json() as OrderAuthorizeResult
  console.info(`[paypal] authorizeApprovedOrder OK: orderId=${p.orderId} status=${data.status}`)
  return data
}

// ─── Void Authorization ──────────────────────────────────────────────────────
//
// Releases a previously authorized payment. PayPal returns 204 No Content.
// This is used when the merchant/store cancels an order before capture.

export interface VoidAuthorizationParams {
  clientId:         string
  clientSecret:     string
  authorizationId:  string
  proxyUrl?:        string
}

/**
 * Voids (releases) a PayPal authorization. After voiding, the funds
 * are released back to the buyer and the authorization can no longer
 * be captured.
 *
 * PayPal returns HTTP 204 with no body on success.
 */
export async function voidAuthorization(
  p: VoidAuthorizationParams
): Promise<void> {
  const token     = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const proxyOpts = createFetchOptions(p.proxyUrl)
  const ua        = getUserAgent(p.clientId)

  const jitterMs = 200 + Math.floor(Math.random() * 500)
  await new Promise((r) => setTimeout(r, jitterMs))

  console.info(`[paypal] Voiding authorization ${p.authorizationId} (clientId=${p.clientId.slice(0, 8)}...)`)

  const res = await fetch(
    `${PAYPAL_BASE}/v2/payments/authorizations/${p.authorizationId}/void`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent":    ua,
      },
      body: JSON.stringify({}),
      ...proxyOpts,
    }
  )

  // PayPal returns 204 on success, 422 if already voided/captured
  if (!res.ok) {
    const text = await res.text()
    console.error(`[paypal] voidAuthorization FAILED [${res.status}]: ${text}`)
    throw new PayPalApiError("void authorization", res.status, text)
  }

  console.info(`[paypal] voidAuthorization OK: authorizationId=${p.authorizationId}`)
}

// ─── Refund Capture ──────────────────────────────────────────────────────────
//
// Issues a full refund for a previously captured payment.
// Empty body = full refund (PayPal default behavior).

export interface RefundCaptureParams {
  clientId:     string
  clientSecret: string
  captureId:    string
  proxyUrl?:    string
}

export interface RefundResponse {
  id:     string     // PayPal refund ID
  status: string     // "COMPLETED" | "PENDING" | ...
  amount?: {
    currency_code: string
    value:         string
  }
}

/**
 * Issues a full refund for a previously captured PayPal payment.
 * Empty body = full refund of the entire captured amount.
 *
 * Returns the PayPal refund ID and status.
 */
export async function refundCapture(
  p: RefundCaptureParams
): Promise<RefundResponse> {
  const token     = await getAccessToken(p.clientId, p.clientSecret, p.proxyUrl)
  const proxyOpts = createFetchOptions(p.proxyUrl)
  const ua        = getUserAgent(p.clientId)

  const jitterMs = 200 + Math.floor(Math.random() * 500)
  await new Promise((r) => setTimeout(r, jitterMs))

  console.info(`[paypal] Refunding capture ${p.captureId} (clientId=${p.clientId.slice(0, 8)}...)`)

  const res = await fetch(
    `${PAYPAL_BASE}/v2/payments/captures/${p.captureId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent":    ua,
      },
      body: JSON.stringify({}),  // Empty body = full refund
      ...proxyOpts,
    }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error(`[paypal] refundCapture FAILED [${res.status}]: ${text}`)
    throw new PayPalApiError("refund capture", res.status, text)
  }

  const data = await res.json() as RefundResponse
  console.info(`[paypal] refundCapture OK: captureId=${p.captureId} refundId=${data.id} status=${data.status}`)
  return data
}
