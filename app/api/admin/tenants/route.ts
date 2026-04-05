/**
 * /api/admin/tenants — Tenant Management API (SUPER_ADMIN only)
 *
 * GET    — List all tenants with aggregate stats
 * POST   — Create a new tenant
 * PATCH  — Update tenant status, plan, or fee rate
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface TenantRow {
  id:                  string
  name:                string
  plan:                string
  status:              string
  owner_email:         string | null
  gateway_fee_percent: string
  created_at:          string
  updated_at:          string
  store_count:         string
  account_count:       string
  total_volume:        string
  monthly_volume:      string
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return null
  }
  return session
}

// ─── GET: List all tenants with aggregate stats ───────────────────────────────

export async function GET() {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  const tenants = await sql`
    SELECT
      t.id, t.name, t.plan, t.status, t.owner_email,
      t.gateway_fee_percent,
      t.created_at, t.updated_at,
      COALESCE(s.cnt, 0)::TEXT  AS store_count,
      COALESCE(ma.cnt, 0)::TEXT AS account_count,
      COALESCE(tx.vol, 0)::TEXT AS total_volume,
      COALESCE(tx_m.vol, 0)::TEXT AS monthly_volume
    FROM tenants t
    LEFT JOIN (
      SELECT tenant_id, COUNT(*) AS cnt FROM stores GROUP BY tenant_id
    ) s ON s.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, COUNT(*) AS cnt FROM merchant_accounts GROUP BY tenant_id
    ) ma ON ma.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, SUM(original_amount) AS vol
      FROM transactions WHERE status = 'COMPLETED'
      GROUP BY tenant_id
    ) tx ON tx.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, SUM(original_amount) AS vol
      FROM transactions
      WHERE status = 'COMPLETED'
        AND created_at >= DATE_TRUNC('month', NOW())
      GROUP BY tenant_id
    ) tx_m ON tx_m.tenant_id = t.id
    ORDER BY t.created_at DESC
  ` as unknown as TenantRow[]

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id:                t.id,
      name:              t.name,
      plan:              t.plan,
      status:            t.status,
      ownerEmail:        t.owner_email,
      gatewayFeePercent: parseFloat(t.gateway_fee_percent),
      createdAt:         t.created_at,
      updatedAt:         t.updated_at,
      storeCount:        parseInt(t.store_count, 10),
      accountCount:      parseInt(t.account_count, 10),
      totalVolume:       parseFloat(t.total_volume),
      monthlyVolume:     parseFloat(t.monthly_volume),
    })),
  })
}

// ─── POST: Create a new tenant + user atomically ──────────────────────────────

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    name: string
    email: string
    password: string
    plan?: string
    gatewayFeePercent?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  // ── Validate inputs ─────────────────────────────────────────────────────────
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 })
  }
  if (!body.email?.trim() || !body.email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 })
  }
  if (!body.password || body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
  }

  const email = body.email.toLowerCase().trim()
  const plan = body.plan ?? "STARTER"
  const feeRate = body.gatewayFeePercent ?? 2.0

  // Check for duplicate email
  const sql = getSql()
  const existing = (await sql`
    SELECT id FROM users WHERE email = ${email} LIMIT 1
  `) as unknown as { id: string }[]

  if (existing.length > 0) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 })
  }

  // ── Atomic transaction: create Tenant + User ────────────────────────────────
  const { getPool } = await import("@/lib/neon")
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // 1. Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, plan, owner_email, gateway_fee_percent, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, name, plan, status, owner_email, gateway_fee_percent, created_at`,
      [body.name.trim(), plan, email, feeRate]
    )
    const tenant = tenantResult.rows[0]

    // 2. Hash password
    const bcrypt = (await import("bcryptjs")).default
    const passwordHash = await bcrypt.hash(body.password, 12)

    // 3. Create user linked to tenant
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, tenant_id)
       VALUES ($1, $2, 'MERCHANT', $3)
       RETURNING id, email`,
      [email, passwordHash, tenant.id]
    )
    const user = userResult.rows[0]

    // 4. Log tenant creation
    await client.query(
      `INSERT INTO system_logs (action, status, level, metadata, tenant_id)
       VALUES ('TENANT_CREATED', 'OK', 'info', $1::jsonb, $2)`,
      [
        JSON.stringify({
          admin: session.user?.email,
          tenantName: body.name.trim(),
          tenantId: tenant.id,
          userId: user.id,
          plan,
        }),
        tenant.id,
      ]
    )

    await client.query("COMMIT")

    // ── Send Welcome Email (async, non-blocking) ──────────────────────────────
    // The temporary password is only in memory (body.password).
    // It was already hashed above — never stored in plain text in DB.
    // Email errors do NOT rollback the DB transaction.
    const planNames: Record<string, string> = {
      STARTER: "Starter", BASIC: "Basic", PRO: "Pro", ENTERPRISE: "Enterprise",
    }

    // Fire-and-forget: don't await in the response path
    ;(async () => {
      try {
        const { sendWelcomeEmail } = await import("@/lib/email")
        const result = await sendWelcomeEmail({
          businessName: body.name.trim(),
          email,
          temporaryPassword: body.password,
          plan: planNames[plan] ?? plan,
        })

        // Log email result to audit trail
        const logSql = getSql()
        await logSql`
          INSERT INTO system_logs (action, status, level, metadata, tenant_id)
          VALUES (
            ${result.success ? "WELCOME_EMAIL_SENT" : "WELCOME_EMAIL_FAILED"},
            ${result.success ? "OK" : "ERROR"},
            ${result.success ? "info" : "warning"},
            ${JSON.stringify({
              admin: session.user?.email,
              recipientEmail: email,
              tenantName: body.name.trim(),
              messageId: result.messageId ?? null,
              error: result.error ?? null,
            })}::jsonb,
            ${tenant.id}
          )
        `
      } catch (emailErr) {
        // Last-resort catch — log failure but never crash the process
        console.error("[tenants] Welcome email failed:", emailErr)
        try {
          const logSql = getSql()
          await logSql`
            INSERT INTO system_logs (action, status, level, metadata, tenant_id)
            VALUES (
              'WELCOME_EMAIL_FAILED',
              'ERROR',
              'warning',
              ${JSON.stringify({
                admin: session.user?.email,
                recipientEmail: email,
                error: String(emailErr),
              })}::jsonb,
              ${tenant.id}
            )
          `
        } catch { /* truly last resort — nothing more we can do */ }
      }
    })()

    return NextResponse.json({
      id:                tenant.id,
      name:              tenant.name,
      plan:              tenant.plan,
      status:            tenant.status,
      ownerEmail:        tenant.owner_email,
      gatewayFeePercent: parseFloat(tenant.gateway_fee_percent),
      createdAt:         tenant.created_at,
      userId:            user.id,
    }, { status: 201 })

  } catch (err) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("[tenants] Atomic creation failed:", err)
    return NextResponse.json(
      { error: "Failed to create tenant. Please try again." },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

// ─── PATCH: Update tenant status, plan, or fee rate ───────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    id: string
    status?: string
    plan?: string
    gatewayFeePercent?: number
    ownerEmail?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 })
  }

  // Build dynamic SET clauses
  const updates: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  if (body.status !== undefined) {
    const valid = ["ACTIVE", "SUSPENDED", "TRIAL"]
    if (!valid.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${valid.join(", ")}` }, { status: 400 })
    }
    updates.push(`status = $${++paramIdx}`)
    values.push(body.status)
  }
  if (body.plan !== undefined) {
    updates.push(`plan = $${++paramIdx}`)
    values.push(body.plan)
  }
  if (body.gatewayFeePercent !== undefined) {
    updates.push(`gateway_fee_percent = $${++paramIdx}`)
    values.push(body.gatewayFeePercent)
  }
  if (body.ownerEmail !== undefined) {
    updates.push(`owner_email = $${++paramIdx}`)
    values.push(body.ownerEmail)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 })
  }

  // Use tagged template for the query — but since we have dynamic columns,
  // we need raw SQL via the pool for this one
  const { getPool } = await import("@/lib/neon")
  const pool = getPool()
  const result = await pool.query(
    `UPDATE tenants SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [body.id, ...values]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 })
  }

  const t = result.rows[0]
  return NextResponse.json({
    id:                t.id,
    name:              t.name,
    plan:              t.plan,
    status:            t.status,
    ownerEmail:        t.owner_email,
    gatewayFeePercent: parseFloat(t.gateway_fee_percent),
    updatedAt:         t.updated_at,
  })
}
