/**
 * PATCH  /api/merchant/accounts/[id] — Update a merchant account
 * DELETE /api/merchant/accounts/[id] — Delete a merchant account
 *
 * Security:
 *  • Tenant ownership verified on every request
 *  • client_secret re-encrypted if changed
 *  • client_secret never returned in response
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { encrypt } from "@/lib/encryption"

// ─── PATCH Handler ────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user
  if (role !== "MERCHANT" || !tenantId) {
    return NextResponse.json({ error: "Only merchants can update accounts" }, { status: 403 })
  }

  const accountId = params.id
  if (!accountId) {
    return NextResponse.json({ error: "Account ID is required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const sql = getSql()

  // Verify ownership
  const existing = await sql`
    SELECT id, status FROM merchant_accounts
    WHERE id = ${accountId} AND tenant_id = ${tenantId}
    LIMIT 1
  `

  if (existing.length === 0) {
    return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 })
  }

  // Build SET clauses dynamically
  const updates: Record<string, unknown> = {}

  if (typeof body.name === "string" && body.name.trim().length >= 2) {
    updates.name = body.name.trim()
  }
  if (typeof body.email === "string" && body.email.includes("@")) {
    // Check email uniqueness within tenant (excluding current account)
    const emailCheck = await sql`
      SELECT id FROM merchant_accounts
      WHERE tenant_id = ${tenantId}
        AND LOWER(email) = LOWER(${(body.email as string).trim()})
        AND id != ${accountId}
      LIMIT 1
    `
    if (emailCheck.length > 0) {
      return NextResponse.json(
        { error: "Another account already uses this PayPal email" },
        { status: 409 }
      )
    }
    updates.email = (body.email as string).trim()
  }
  if (typeof body.clientId === "string" && body.clientId.trim().length >= 10) {
    updates.client_id = body.clientId.trim()
  }
  if (typeof body.clientSecret === "string" && body.clientSecret.trim().length >= 10) {
    // Re-encrypt the new client secret
    updates.client_secret = encrypt(body.clientSecret.trim())
  }
  if (typeof body.shieldDomain === "string") {
    updates.shield_domain = body.shieldDomain.trim() || null
  }
  if (typeof body.proxyUrl === "string") {
    const proxy = body.proxyUrl.trim()
    if (proxy && !proxy.startsWith("http://") && !proxy.startsWith("https://") && !proxy.startsWith("socks")) {
      return NextResponse.json({ error: "Invalid proxy URL format" }, { status: 400 })
    }
    updates.proxy_url = proxy || null
  }
  if (typeof body.status === "string") {
    const validStatuses = ["ACTIVE", "PAUSED", "WARMING_UP", "SUSPENDED"]
    const normalized = body.status.toUpperCase()
    if (validStatuses.includes(normalized)) {
      updates.status = normalized
      // If transitioning to WARMING_UP, set warmup_started_at
      if (normalized === "WARMING_UP" && existing[0].status !== "WARMING_UP") {
        updates.warmup_started_at = new Date().toISOString()
      }
    }
  }
  if (typeof body.priority === "number" && body.priority >= 1 && body.priority <= 5) {
    updates.priority = body.priority
  }
  if (typeof body.softLimit === "number" && body.softLimit > 0) {
    updates.soft_limit = body.softLimit
  }
  if (typeof body.hardLimit === "number" && body.hardLimit > 0) {
    updates.daily_limit = body.hardLimit
  }
  if (typeof body.itemMasking === "boolean") {
    updates.item_masking = body.itemMasking
  }
  if (typeof body.fakeProductName === "string") {
    updates.fake_product_name = body.fakeProductName.trim() || "Digital Service Upgrade"
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  // Build dynamic UPDATE query
  const setClauses: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  for (const [col, val] of Object.entries(updates)) {
    if (col === "status") {
      setClauses.push(`${col} = $${paramIdx}::account_status`)
    } else {
      setClauses.push(`${col} = $${paramIdx}`)
    }
    values.push(val)
    paramIdx++
  }
  setClauses.push(`updated_at = NOW()`)

  const query = `UPDATE merchant_accounts SET ${setClauses.join(", ")} WHERE id = $${paramIdx} AND tenant_id = $${paramIdx + 1} RETURNING id, name, status, updated_at`
  values.push(accountId, tenantId)

  const { getPool } = await import("@/lib/neon")
  const pool = getPool()
  const result = await pool.query(query, values)

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }

  return NextResponse.json({
    account: result.rows[0],
    message: "Account updated successfully",
  })
}

// ─── DELETE Handler ───────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { tenantId, role } = session.user
  if (role !== "MERCHANT" || !tenantId) {
    return NextResponse.json({ error: "Only merchants can delete accounts" }, { status: 403 })
  }

  const accountId = params.id
  if (!accountId) {
    return NextResponse.json({ error: "Account ID is required" }, { status: 400 })
  }

  const sql = getSql()

  // Verify ownership + delete
  const result = await sql`
    DELETE FROM merchant_accounts
    WHERE id = ${accountId} AND tenant_id = ${tenantId}
    RETURNING id, name
  `

  if (result.length === 0) {
    return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 })
  }

  return NextResponse.json({
    deleted: result[0],
    message: "Account removed from rotation pool",
  })
}
