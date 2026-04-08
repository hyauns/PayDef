/**
 * GET  /api/merchant/stores  — List stores (tenant-scoped)
 * POST /api/merchant/stores  — Create a new store
 *
 * Security:
 *  • api_key_hash is NEVER returned in any response
 *  • Every query includes WHERE tenant_id = session.user.tenantId
 *    (SUPER_ADMIN bypasses this for the admin dashboard)
 *  • Plaintext API key is returned ONLY ONCE on POST creation
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import {
  getCheckoutPreferences,
  normalizeCheckoutFlow,
  resolveCheckoutFlow,
  type CheckoutFlow,
} from "@/lib/checkout-flow"
import { encrypt } from "@/lib/encryption"
import { generateWebhookSecret } from "@/lib/store-webhooks"
import { randomBytes, randomUUID } from "crypto"
import bcrypt from "bcryptjs"

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface StoreRow {
  id:            string
  tenant_id:     string
  tenant_name?:  string  // only populated for SUPER_ADMIN via JOIN
  name:          string
  platform:      string | null
  status_label:  string | null
  // api_key_hash: intentionally NOT selected — never leaves the DB
  webhook_url:   string | null
  webhook_secret: string | null
  shield_domain: string | null
  success_return_url: string | null
  cancel_return_url: string | null
  is_active:     boolean
  capture_mode:  string
  checkout_flow: string | null
  created_at:    string
  updated_at:    string
}

type StoreStatusLabel = "Active" | "Trial" | "Suspended"

function resolveStoreStatus(store: StoreRow, txCount: number): StoreStatusLabel {
  if (!store.is_active) return "Suspended"
  if (store.status_label === "Active" || store.status_label === "Trial") {
    return store.status_label
  }
  return txCount === 0 ? "Trial" : "Active"
}

interface StoreTxRow {
  store_id:  string
  count:     string
  volume:    string
  completed: string
  failed:    string
  pending:   string
}

// ─── Response mapper ──────────────────────────────────────────────────────────

function mapStoreResponse(
  store: StoreRow,
  txStats: { count: number; volume: number; completed: number; failed: number; pending: number },
  defaultFlow: CheckoutFlow
) {
  const checkoutFlow = resolveCheckoutFlow(store.checkout_flow, { defaultFlow })

  return {
    id:               store.id,
    tenantId:         store.tenant_id,
    tenantName:       store.tenant_name ?? null,
    name:             store.name,
    platform:         store.platform ?? "Custom API",
    status:           resolveStoreStatus(store, txStats.count),
    // api_key_hash is intentionally omitted — never exposed via API
    webhookUrl:       store.webhook_url,
    shieldDomain:     store.shield_domain,
    hasWebhookSecret: !!store.webhook_secret,
    successReturnUrl: store.success_return_url,
    cancelReturnUrl:  store.cancel_return_url,
    isActive:         store.is_active,
    captureMode:      store.capture_mode ?? "INSTANT",
    checkoutFlow,
    checkoutFlowOverride: !!store.checkout_flow,
    transactionCount: txStats.count,
    totalVolume:      txStats.volume,
    completedCount:   txStats.completed,
    failedCount:      txStats.failed,
    pendingCount:     txStats.pending,
    createdAt:        store.created_at,
    updatedAt:        store.updated_at,
  }
}

// ─── API Key Generator ────────────────────────────────────────────────────────

/** Generates a secure API key: sk_live_ + 32 random base64url characters */
function generateApiKey(): string {
  const prefix = "sk_live_"
  const random = randomBytes(24).toString("base64url") // 32 chars
  return `${prefix}${random}`
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role === "MERCHANT" && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const sql = getSql()
  const { defaultFlow } = await getCheckoutPreferences(sql)

  // ── Fetch stores (tenant-scoped) ────────────────────────────────────────────
  // CRITICAL: api_key_hash is NOT in the SELECT list — it never leaves the DB.
  const stores = role === "SUPER_ADMIN"
    ? (await sql`
        SELECT
          s.id, s.tenant_id, s.name, s.platform, s.status_label, s.webhook_url, s.shield_domain,
          s.success_return_url, s.cancel_return_url,
          s.webhook_secret, s.is_active, COALESCE(s.capture_mode, 'INSTANT') AS capture_mode,
          s.checkout_flow,
          s.created_at, s.updated_at,
          t.name AS tenant_name
        FROM stores s
        LEFT JOIN tenants t ON s.tenant_id = t.id
        ORDER BY s.created_at DESC
      `) as unknown as StoreRow[]
    : (await sql`
        SELECT
          id, tenant_id, name, platform, status_label, webhook_url, webhook_secret, shield_domain,
          success_return_url, cancel_return_url,
          is_active, COALESCE(capture_mode, 'INSTANT') AS capture_mode,
          checkout_flow,
          created_at, updated_at
        FROM stores
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `) as unknown as StoreRow[]

  // ── Aggregate transaction stats per store ───────────────────────────────────
  const txStats: Record<string, { count: number; volume: number; completed: number; failed: number; pending: number }> = {}

  if (stores.length > 0) {
    const countQuery = role === "SUPER_ADMIN"
      ? (await sql`
          SELECT
            store_id,
            COUNT(*)                                        AS count,
            COALESCE(SUM(original_amount), 0)               AS volume,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')    AS completed,
            COUNT(*) FILTER (WHERE status = 'FAILED')       AS failed,
            COUNT(*) FILTER (WHERE status = 'PENDING')      AS pending
          FROM transactions
          GROUP BY store_id
        `) as unknown as StoreTxRow[]
      : (await sql`
          SELECT
            store_id,
            COUNT(*)                                        AS count,
            COALESCE(SUM(original_amount), 0)               AS volume,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')    AS completed,
            COUNT(*) FILTER (WHERE status = 'FAILED')       AS failed,
            COUNT(*) FILTER (WHERE status = 'PENDING')      AS pending
          FROM transactions
          WHERE tenant_id = ${tenantId}
          GROUP BY store_id
        `) as unknown as StoreTxRow[]

    for (const row of countQuery) {
      txStats[row.store_id] = {
        count:     parseInt(row.count, 10),
        volume:    parseFloat(row.volume),
        completed: parseInt(row.completed, 10),
        failed:    parseInt(row.failed, 10),
        pending:   parseInt(row.pending, 10),
      }
    }
  }

  // ── Build response ──────────────────────────────────────────────────────────
  const defaultStats = { count: 0, volume: 0, completed: 0, failed: 0, pending: 0 }

  return NextResponse.json({
    stores: stores.map((store) =>
      mapStoreResponse(store, txStats[store.id] ?? defaultStats, defaultFlow)
    ),
  })
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user

  if (role !== "MERCHANT" || !tenantId) {
    return NextResponse.json({ error: "Only merchants can create stores" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const { name, platform, webhookUrl, shieldDomain, successReturnUrl, cancelReturnUrl } = body as {
    name?: string
    platform?: string
    webhookUrl?: string
    shieldDomain?: string
    successReturnUrl?: string
    cancelReturnUrl?: string
    checkoutFlow?: string
  }

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Store name is required (min 2 chars)" }, { status: 400 })
  }

  const storeName = name.trim()
  const sql = getSql()

  // Check for duplicate store name within the same tenant
  const existing = await sql`
    SELECT id FROM stores
    WHERE tenant_id = ${tenantId} AND LOWER(name) = LOWER(${storeName})
    LIMIT 1
  `

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A store with this name already exists" },
      { status: 409 }
    )
  }

  // Generate unique store ID and secure API key
  const storeId    = randomUUID()
  const apiKey     = generateApiKey()
  const apiKeyHash = await bcrypt.hash(apiKey, 12)
  const webhookSecret = generateWebhookSecret()
  const encryptedWebhookSecret = encrypt(webhookSecret)

  const safeWebhook = typeof webhookUrl === "string" ? webhookUrl.trim() || null : null
  const safeDomain  = typeof shieldDomain === "string" ? shieldDomain.trim() || null : null
  const safePlatform = typeof platform === "string" && platform.trim() ? platform.trim() : "Custom API"
  const safeSuccessReturnUrl = typeof successReturnUrl === "string" ? successReturnUrl.trim() || null : null
  const safeCancelReturnUrl = typeof cancelReturnUrl === "string" ? cancelReturnUrl.trim() || null : null
  const rawCheckoutFlow = (body as { checkoutFlow?: string | null }).checkoutFlow
  const safeCheckoutFlow = rawCheckoutFlow === undefined || rawCheckoutFlow === null
    ? null
    : normalizeCheckoutFlow(rawCheckoutFlow)
  const { defaultFlow } = await getCheckoutPreferences(sql)

  const result = await sql`
    INSERT INTO stores (
      id, tenant_id, name, platform, status_label, api_key_hash, webhook_url, webhook_secret, shield_domain,
      checkout_flow, success_return_url, cancel_return_url
    )
    VALUES (
      ${storeId}, ${tenantId}, ${storeName}, ${safePlatform}, ${"Trial"}, ${apiKeyHash}, ${safeWebhook},
      ${encryptedWebhookSecret}, ${safeDomain}, ${safeCheckoutFlow},
      ${safeSuccessReturnUrl}, ${safeCancelReturnUrl}
    )
    RETURNING id, name, platform, status_label, webhook_url, webhook_secret, shield_domain, checkout_flow,
              success_return_url, cancel_return_url, is_active, created_at
  `

  const store = result[0] as {
    id: string; name: string; platform: string | null; status_label: string | null
    webhook_url: string | null; webhook_secret: string | null
    shield_domain: string | null; checkout_flow: string | null
    success_return_url: string | null; cancel_return_url: string | null
    is_active: boolean; created_at: string
  }

  return NextResponse.json({
    store: {
      id:           store.id,
      name:         store.name,
      platform:     store.platform ?? safePlatform,
      status:       (store.status_label ?? "Trial") as StoreStatusLabel,
      webhookUrl:   store.webhook_url,
      shieldDomain: store.shield_domain,
      hasWebhookSecret: !!store.webhook_secret,
      successReturnUrl: store.success_return_url,
      cancelReturnUrl: store.cancel_return_url,
      checkoutFlow: resolveCheckoutFlow(store.checkout_flow, { defaultFlow }),
      checkoutFlowOverride: !!store.checkout_flow,
      isActive:     store.is_active,
      createdAt:    store.created_at,
    },
    // Return the plaintext API key ONLY ONCE on creation — never stored or retrievable again
    apiKey,
    webhookSecret,
    message: "Store created successfully. Save the API key and webhook secret now — they cannot be retrieved later.",
  }, { status: 201 })
}
