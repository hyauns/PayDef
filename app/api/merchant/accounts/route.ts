/**
 * GET  /api/merchant/accounts  — List merchant accounts (tenant-scoped)
 * POST /api/merchant/accounts  — Create a new merchant account
 *
 * Security:
 *  • client_secret is NEVER returned in any response
 *  • client_secret is encrypted (AES-256-GCM) before INSERT
 *  • Every query includes WHERE tenant_id = session.user.tenantId
 *    (SUPER_ADMIN bypasses this for the admin dashboard)
 *  • PayPal email uniqueness is enforced per-tenant
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { encrypt } from "@/lib/encryption"

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface AccountRow {
  id:                   string
  tenant_id:            string
  store_id:             string | null
  name:                 string
  email:                string | null
  client_id:            string
  // client_secret: intentionally NOT selected — never leaves the DB in an API response
  shield_domain:        string | null
  proxy_url:            string | null
  daily_limit:          string
  soft_limit:           string | null
  daily_limit_override: string | null
  current_volume:       string
  priority:             number
  status:               string
  item_masking:         boolean
  fake_product_name:    string
  warmup_started_at:    string | null
  volume_reset_at:      string | null
  created_at:           string
  updated_at:           string
}

interface TxCountRow {
  merchant_id: string
  count:       string
  volume:      string
  completed:   string
  failed:      string
}

// ─── Response mapper ──────────────────────────────────────────────────────────

function mapAccountResponse(
  account: AccountRow,
  txStats: { count: number; volume: number; completed: number; failed: number }
) {
  const dailyLimit    = parseFloat(account.daily_limit)
  const softLimit     = account.soft_limit ? parseFloat(account.soft_limit) : Math.round(dailyLimit * 0.8)
  const currentVolume = parseFloat(account.current_volume)

  // Real-time progress percentage (clamped to 0–100)
  const progressPercentage = dailyLimit > 0
    ? Math.min(100, Math.round((currentVolume / dailyLimit) * 10000) / 100)
    : 0

  // Remaining headroom before the account hits its daily limit
  const remainingCapacity = Math.max(0, dailyLimit - currentVolume)

  // UI-only "Limited" flag: current volume has crossed the soft limit
  const isLimited = currentVolume >= softLimit && account.status === 'ACTIVE'

  // Success rate calculation
  const successRate = txStats.count > 0
    ? Math.round((txStats.completed / txStats.count) * 1000) / 10
    : 0

  return {
    id:                 account.id,
    tenantId:           account.tenant_id,
    storeId:            account.store_id,
    name:               account.name,
    email:              account.email,
    clientId:           account.client_id,
    // client_secret is intentionally omitted — never exposed via API
    shieldDomain:       account.shield_domain,
    proxyUrl:           account.proxy_url,
    dailyLimit,
    softLimit,
    dailyLimitOverride: account.daily_limit_override ? parseFloat(account.daily_limit_override) : null,
    currentVolume,
    remainingCapacity,
    progressPercentage,
    isLimited,
    priority:           account.priority,
    status:             account.status,
    itemMasking:        account.item_masking ?? false,
    fakeProductName:    account.fake_product_name ?? "Digital Service Upgrade",
    warmupStartedAt:    account.warmup_started_at,
    volumeResetAt:      account.volume_reset_at,
    transactionCount:   txStats.count,
    totalVolume:        txStats.volume,
    completedCount:     txStats.completed,
    failedCount:        txStats.failed,
    successRate,
    createdAt:          account.created_at,
    updatedAt:          account.updated_at,
  }
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

  // ── Fetch accounts (tenant-scoped) ──────────────────────────────────────────
  // CRITICAL: client_secret is NOT in the SELECT list — it never leaves the DB.
  const accounts = role === "SUPER_ADMIN"
    ? (await sql`
        SELECT
          id, tenant_id, store_id, name, email, client_id,
          shield_domain, proxy_url,
          daily_limit, soft_limit, daily_limit_override, current_volume,
          priority, status, item_masking, fake_product_name,
          warmup_started_at, volume_reset_at,
          created_at, updated_at
        FROM merchant_accounts
        ORDER BY created_at DESC
      `) as unknown as AccountRow[]
    : (await sql`
        SELECT
          id, tenant_id, store_id, name, email, client_id,
          shield_domain, proxy_url,
          daily_limit, soft_limit, daily_limit_override, current_volume,
          priority, status, item_masking, fake_product_name,
          warmup_started_at, volume_reset_at,
          created_at, updated_at
        FROM merchant_accounts
        WHERE tenant_id = ${tenantId}
        ORDER BY priority DESC, created_at DESC
      `) as unknown as AccountRow[]

  // ── Aggregate transaction stats per account ─────────────────────────────────
  const txStats: Record<string, { count: number; volume: number; completed: number; failed: number }> = {}

  if (accounts.length > 0) {
    const countQuery = role === "SUPER_ADMIN"
      ? (await sql`
          SELECT
            merchant_id,
            COUNT(*)                                          AS count,
            COALESCE(SUM(original_amount), 0)                 AS volume,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')      AS completed,
            COUNT(*) FILTER (WHERE status = 'FAILED')         AS failed
          FROM transactions
          GROUP BY merchant_id
        `) as unknown as TxCountRow[]
      : (await sql`
          SELECT
            merchant_id,
            COUNT(*)                                          AS count,
            COALESCE(SUM(original_amount), 0)                 AS volume,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')      AS completed,
            COUNT(*) FILTER (WHERE status = 'FAILED')         AS failed
          FROM transactions
          WHERE tenant_id = ${tenantId}
          GROUP BY merchant_id
        `) as unknown as TxCountRow[]

    for (const row of countQuery) {
      txStats[row.merchant_id] = {
        count:     parseInt(row.count, 10),
        volume:    parseFloat(row.volume),
        completed: parseInt(row.completed, 10),
        failed:    parseInt(row.failed, 10),
      }
    }
  }

  // ── Build response ──────────────────────────────────────────────────────────
  const defaultStats = { count: 0, volume: 0, completed: 0, failed: 0 }

  return NextResponse.json({
    accounts: accounts.map((account) =>
      mapAccountResponse(account, txStats[account.id] ?? defaultStats)
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
    return NextResponse.json({ error: "Only merchants can create accounts" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const {
    name,
    email,
    clientId,
    clientSecret,
    proxyUrl,
    shieldDomain,
    status: initialStatus,
    softLimit,
    hardLimit,
    priority,
    itemMasking,
    fakeProductName,
  } = body as {
    name?: string
    email?: string
    clientId?: string
    clientSecret?: string
    proxyUrl?: string
    shieldDomain?: string
    status?: string
    softLimit?: number
    hardLimit?: number
    priority?: number
    itemMasking?: boolean
    fakeProductName?: string
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Account name is required (min 2 chars)" }, { status: 400 })
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid PayPal email is required" }, { status: 400 })
  }

  if (!clientId || typeof clientId !== "string" || clientId.trim().length < 10) {
    return NextResponse.json({ error: "PayPal Client ID is required (min 10 chars)" }, { status: 400 })
  }

  if (!clientSecret || typeof clientSecret !== "string" || clientSecret.trim().length < 10) {
    return NextResponse.json({ error: "PayPal Client Secret is required (min 10 chars)" }, { status: 400 })
  }

  // Validate proxy URL format if provided
  if (proxyUrl && typeof proxyUrl === "string" && proxyUrl.trim()) {
    const proxyTrimmed = proxyUrl.trim()
    if (
      !proxyTrimmed.startsWith("http://") &&
      !proxyTrimmed.startsWith("https://") &&
      !proxyTrimmed.startsWith("socks5://") &&
      !proxyTrimmed.startsWith("socks4://")
    ) {
      return NextResponse.json(
        { error: "Proxy URL must start with http://, https://, socks4://, or socks5://" },
        { status: 400 }
      )
    }
  }

  // Validate status
  const validStatuses = ["ACTIVE", "WARMING_UP"]
  const safeStatus = (initialStatus ?? "WARMING_UP").toUpperCase()
  if (!validStatuses.includes(safeStatus)) {
    return NextResponse.json(
      { error: "Initial status must be Active or Warm-up" },
      { status: 400 }
    )
  }

  const sql = getSql()

  // ── Check email uniqueness within tenant ────────────────────────────────────
  const existingEmail = await sql`
    SELECT id FROM merchant_accounts
    WHERE tenant_id = ${tenantId} AND LOWER(email) = LOWER(${email.trim()})
    LIMIT 1
  `

  if (existingEmail.length > 0) {
    return NextResponse.json(
      { error: "A merchant account with this PayPal email already exists" },
      { status: 409 }
    )
  }

  // ── Encrypt client secret ───────────────────────────────────────────────────
  // SECURITY: The plaintext client_secret exists only in memory during this request.
  // It is encrypted with AES-256-GCM before being persisted to the database.
  const encryptedSecret = encrypt(clientSecret.trim())

  const safeName        = name.trim()
  const safeEmail       = email.trim()
  const safeClientId    = clientId.trim()
  const safeProxy       = typeof proxyUrl === "string" ? proxyUrl.trim() || null : null
  const safeDomain      = typeof shieldDomain === "string" ? shieldDomain.trim() || null : null
  const safeSoftLimit   = typeof softLimit === "number" && softLimit > 0 ? softLimit : 4000
  const safeHardLimit   = typeof hardLimit === "number" && hardLimit > 0 ? hardLimit : 5000
  const safePriority    = typeof priority === "number" && priority >= 1 && priority <= 5 ? priority : 1
  const safeMasking     = typeof itemMasking === "boolean" ? itemMasking : false
  const safeFakeName    = typeof fakeProductName === "string" ? fakeProductName.trim() || "Digital Service Upgrade" : "Digital Service Upgrade"

  const result = await sql`
    INSERT INTO merchant_accounts (
      tenant_id, name, email, client_id, client_secret,
      shield_domain, proxy_url, status, priority,
      daily_limit, soft_limit, item_masking, fake_product_name,
      warmup_started_at
    ) VALUES (
      ${tenantId}, ${safeName}, ${safeEmail}, ${safeClientId}, ${encryptedSecret},
      ${safeDomain}, ${safeProxy}, ${safeStatus}::account_status, ${safePriority},
      ${safeHardLimit}, ${safeSoftLimit}, ${safeMasking}, ${safeFakeName},
      ${safeStatus === "WARMING_UP" ? new Date().toISOString() : null}
    )
    RETURNING id, name, email, client_id, shield_domain, proxy_url,
              status, priority, daily_limit, soft_limit,
              item_masking, fake_product_name, current_volume,
              created_at
  `

  const account = result[0] as Record<string, unknown>

  return NextResponse.json({
    account: {
      id:              account.id,
      name:            account.name,
      email:           account.email,
      clientId:        account.client_id,
      // client_secret is NEVER returned
      shieldDomain:    account.shield_domain,
      proxyUrl:        account.proxy_url,
      status:          account.status,
      priority:        account.priority,
      dailyLimit:      parseFloat(account.daily_limit as string),
      softLimit:       parseFloat(account.soft_limit as string),
      itemMasking:     account.item_masking,
      fakeProductName: account.fake_product_name,
      currentVolume:   0,
      createdAt:       account.created_at,
    },
    message: "Merchant account created. Client secret has been encrypted and stored securely.",
  }, { status: 201 })
}
