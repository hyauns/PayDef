import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import {
  getCheckoutPreferences,
  normalizeCheckoutFlow,
  resolveCheckoutFlow,
} from "@/lib/checkout-flow"

interface RouteContext {
  params: Promise<{ id: string }>
}

interface StoreRow {
  id: string
  tenant_id: string
  name: string
  webhook_url: string | null
  shield_domain: string | null
  is_active: boolean
  capture_mode: string
  checkout_flow: string | null
  created_at: string
  updated_at: string
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const tenantId = session.user.tenantId

  if (!isSuperAdmin && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  let body: {
    name?: string
    webhookUrl?: string | null
    isActive?: boolean
    checkoutFlow?: string | null
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sql = getSql()
  const existingRows = isSuperAdmin
    ? (await sql`
        SELECT id, tenant_id, name, webhook_url, shield_domain, is_active,
               COALESCE(capture_mode, 'INSTANT') AS capture_mode,
               checkout_flow, created_at, updated_at
        FROM stores
        WHERE id = ${id}
        LIMIT 1
      `)
    : (await sql`
        SELECT id, tenant_id, name, webhook_url, shield_domain, is_active,
               COALESCE(capture_mode, 'INSTANT') AS capture_mode,
               checkout_flow, created_at, updated_at
        FROM stores
        WHERE id = ${id} AND tenant_id = ${tenantId}
        LIMIT 1
      `)

  const store = (existingRows as unknown as StoreRow[])[0]
  if (!store) {
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }

  const nextName = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : store.name
  const nextWebhookUrl = typeof body.webhookUrl === "string"
    ? body.webhookUrl.trim() || null
    : body.webhookUrl === null
    ? null
    : store.webhook_url
  const nextIsActive = typeof body.isActive === "boolean" ? body.isActive : store.is_active
  const nextCheckoutFlow = body.checkoutFlow === null
    ? null
    : body.checkoutFlow === undefined
    ? store.checkout_flow
    : normalizeCheckoutFlow(body.checkoutFlow)

  const updatedRows = isSuperAdmin
    ? (await sql`
        UPDATE stores
        SET name = ${nextName},
            webhook_url = ${nextWebhookUrl},
            is_active = ${nextIsActive},
            checkout_flow = ${nextCheckoutFlow},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, tenant_id, name, webhook_url, shield_domain, is_active,
                  COALESCE(capture_mode, 'INSTANT') AS capture_mode,
                  checkout_flow, created_at, updated_at
      `)
    : (await sql`
        UPDATE stores
        SET name = ${nextName},
            webhook_url = ${nextWebhookUrl},
            is_active = ${nextIsActive},
            checkout_flow = ${nextCheckoutFlow},
            updated_at = NOW()
        WHERE id = ${id} AND tenant_id = ${tenantId}
        RETURNING id, tenant_id, name, webhook_url, shield_domain, is_active,
                  COALESCE(capture_mode, 'INSTANT') AS capture_mode,
                  checkout_flow, created_at, updated_at
      `)

  const updated = (updatedRows as unknown as StoreRow[])[0]
  const preferences = await getCheckoutPreferences(sql)

  return NextResponse.json({
    store: {
      id: updated.id,
      tenantId: updated.tenant_id,
      name: updated.name,
      webhookUrl: updated.webhook_url,
      shieldDomain: updated.shield_domain,
      isActive: updated.is_active,
      captureMode: updated.capture_mode,
      checkoutFlow: resolveCheckoutFlow(updated.checkout_flow, preferences),
      checkoutFlowOverride: !!updated.checkout_flow,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  })
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const tenantId = session.user.tenantId

  if (!isSuperAdmin && !tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 })
  }

  const sql = getSql()
  const deleted = isSuperAdmin
    ? await sql`DELETE FROM stores WHERE id = ${id} RETURNING id`
    : await sql`DELETE FROM stores WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING id`

  if ((deleted as unknown as { id: string }[]).length === 0) {
    return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
