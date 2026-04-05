/**
 * /api/admin/shield-domains — Shield Domain Management API (SUPER_ADMIN only)
 *
 * GET    — List all shield domains (optional ?tenant_id filter)
 * POST   — Add a new domain to the rotation pool
 * PATCH  — Update domain status (activate/deactivate) or reassign tenant
 * DELETE — Remove a domain from the pool
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface ShieldDomainRow {
  id: string
  domain: string
  is_active: boolean
  tenant_id: string | null
  tenant_name: string | null
  health_ok: boolean
  last_check: string | null
  created_at: string
  updated_at: string
}

interface InsertedShieldDomainRow {
  id: string
  domain: string
  is_active: boolean
  tenant_id: string | null
  health_ok: boolean
  created_at: string
}

interface PgErrorLike {
  code?: string
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return null
  }
  return session
}

// ─── GET: List all shield domains ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const tenantFilter = req.nextUrl.searchParams.get("tenant_id")
  const sql = getSql()

  let domains: ShieldDomainRow[]
  if (tenantFilter) {
    domains = (await sql`
      SELECT sd.*, t.name AS tenant_name
      FROM shield_domains sd
      LEFT JOIN tenants t ON t.id = sd.tenant_id
      WHERE sd.tenant_id = ${tenantFilter}
      ORDER BY sd.created_at DESC
    `) as unknown as ShieldDomainRow[]
  } else {
    domains = (await sql`
      SELECT sd.*, t.name AS tenant_name
      FROM shield_domains sd
      LEFT JOIN tenants t ON t.id = sd.tenant_id
      ORDER BY sd.is_active DESC, sd.created_at DESC
    `) as unknown as ShieldDomainRow[]
  }

  return NextResponse.json({
    domains: domains.map((d) => ({
      id:         d.id,
      domain:     d.domain,
      isActive:   d.is_active,
      tenantId:   d.tenant_id,
      tenantName: d.tenant_name,
      healthOk:   d.health_ok,
      lastCheck:  d.last_check,
      createdAt:  d.created_at,
      updatedAt:  d.updated_at,
    })),
  })
}

// ─── POST: Add a new domain ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { domain: string; tenantId?: string; isActive?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!body.domain?.trim()) {
    return NextResponse.json({ error: "domain is required." }, { status: 400 })
  }

  // Basic domain validation
  const domain = body.domain.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format." }, { status: 400 })
  }

  const sql = getSql()

  try {
    const result = (await sql`
      INSERT INTO shield_domains (domain, tenant_id, is_active)
      VALUES (${domain}, ${body.tenantId ?? null}, ${body.isActive ?? true})
      RETURNING *
    `) as unknown as InsertedShieldDomainRow[]

    const d = result[0]
    return NextResponse.json({
      id:       d.id,
      domain:   d.domain,
      isActive: d.is_active,
      tenantId: d.tenant_id,
      healthOk: d.health_ok,
      createdAt: d.created_at,
    }, { status: 201 })
  } catch (err) {
    const maybePgError = err as PgErrorLike
    if (maybePgError.code === "23505") {
      return NextResponse.json({ error: "Domain already exists in the pool." }, { status: 409 })
    }
    throw err
  }
}

// ─── PATCH: Update domain status or assignment ────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { id: string; isActive?: boolean; tenantId?: string | null; healthOk?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 })
  }

  // Build SET dynamically
  const sets: string[] = []
  const vals: unknown[] = []
  let idx = 1

  if (body.isActive !== undefined) {
    sets.push(`is_active = $${++idx}`)
    vals.push(body.isActive)
  }
  if (body.tenantId !== undefined) {
    sets.push(`tenant_id = $${++idx}`)
    vals.push(body.tenantId)
  }
  if (body.healthOk !== undefined) {
    sets.push(`health_ok = $${++idx}`)
    vals.push(body.healthOk)
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 })
  }

  const { getPool } = await import("@/lib/neon")
  const pool = getPool()
  const result = await pool.query(
    `UPDATE shield_domains SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [body.id, ...vals]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Domain not found." }, { status: 404 })
  }

  const d = result.rows[0]
  return NextResponse.json({
    id:       d.id,
    domain:   d.domain,
    isActive: d.is_active,
    tenantId: d.tenant_id,
    healthOk: d.health_ok,
    updatedAt: d.updated_at,
  })
}

// ─── DELETE: Remove a domain ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const domainId = req.nextUrl.searchParams.get("id")
  if (!domainId) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 })
  }

  const sql = getSql()

  const result = await sql`
    DELETE FROM shield_domains WHERE id = ${domainId} RETURNING id, domain
  `

  if (result.length === 0) {
    return NextResponse.json({ error: "Domain not found." }, { status: 404 })
  }

  return NextResponse.json({
    deleted: true,
    id:     result[0].id,
    domain: result[0].domain,
  })
}
