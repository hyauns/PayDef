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
  provider_type: string
  platform: string | null
  status_label: string | null
  webhook_url: string | null
  webhook_secret: string | null
  shield_domain: string | null
  success_return_url: string | null
  cancel_return_url: string | null
  is_active: boolean
  capture_mode: string
  checkout_flow: string | null
  created_at: string
  updated_at: string
}

type StoreStatusLabel = "Active" | "Trial" | "Suspended"
type ProviderType = "PAYPAL" | "CUSTOM_MOCK" | "STRIPE"

function normalizeStatusLabel(value: unknown): StoreStatusLabel | null {
  return value === "Active" || value === "Trial" || value === "Suspended" ? value : null
}

function normalizeProviderType(value: unknown): ProviderType {
  return value === "CUSTOM_MOCK" || value === "STRIPE" ? value : "PAYPAL"
}

/** Live-probe the bridge health endpoint for a given shield domain.
 *  Returns true when the bridge responds with the expected marker within 5 s. */
async function probeBridgeLive(domain: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(`https://${domain}/api/health/shield-popup`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "Gateway-BridgeCheck/1.0" },
    })
    const body = await res.text()
    if (res.ok && (body.includes("shield-popup-ok") || res.headers.get("x-shield-popup-health") === "ok")) {
      return true
    }
    // Fallback: popup page with ?health=1 query param
    const res2 = await fetch(`https://${domain}/checkout/popup?health=1`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "Gateway-BridgeCheck/1.0" },
    })
    const body2 = await res2.text()
    return res2.ok && body2.includes("shield-popup-ok")
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function validateShieldDomainForStore(store: StoreRow, shieldDomain: string | null) {
  if (!shieldDomain) return null

  const sql = getSql()
  const rows = (await sql`
    SELECT domain, tenant_id, is_active, health_ok
    FROM shield_domains
    WHERE domain = ${shieldDomain}
    LIMIT 1
  `) as unknown as Array<{
    domain: string
    tenant_id: string | null
    is_active: boolean
    health_ok: boolean
  }>

  const domain = rows[0]
  if (!domain) {
    throw new Error("Shield domain not found.")
  }
  if (domain.tenant_id && domain.tenant_id !== store.tenant_id) {
    throw new Error("Shield domain does not belong to this store tenant.")
  }
  if (!domain.is_active) {
    throw new Error("Shield domain is not active.")
  }

  // If the DB snapshot already says healthy, trust it — no probe needed.
  // If the snapshot says unhealthy (possibly stale after a bridge fix),
  // do a live probe so the merchant doesn't need to manually Sync first.
  const bridgeHealthy = domain.health_ok || (await probeBridgeLive(shieldDomain))

  if (!bridgeHealthy) {
    throw new Error("Shield domain must be active and healthy before assignment.")
  }

  // Snapshot was stale — update it so future saves skip the live probe.
  if (!domain.health_ok && bridgeHealthy) {
    try {
      await sql`
        UPDATE shield_domains
        SET health_ok = true, last_check = NOW(), updated_at = NOW()
        WHERE domain = ${shieldDomain}
      `
    } catch {
      // Non-fatal — assignment still proceeds
    }
  }

  return domain.domain
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
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
      platform?: string | null
      providerType?: string | null
      status?: StoreStatusLabel
      webhookUrl?: string | null
      shieldDomain?: string | null
      isActive?: boolean
      checkoutFlow?: string | null
      successReturnUrl?: string | null
      cancelReturnUrl?: string | null
    }

    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const sql = getSql()
    const existingRows = isSuperAdmin
      ? (await sql`
          SELECT id, tenant_id, name, webhook_url, webhook_secret, shield_domain,
                 provider_type, platform, status_label,
                 success_return_url, cancel_return_url, is_active,
                 COALESCE(capture_mode, 'INSTANT') AS capture_mode,
                 checkout_flow, created_at, updated_at
          FROM stores
          WHERE id = ${id}
          LIMIT 1
        `)
      : (await sql`
          SELECT id, tenant_id, name, webhook_url, webhook_secret, shield_domain,
                 provider_type, platform, status_label,
                 success_return_url, cancel_return_url, is_active,
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
    const nextPlatform = typeof body.platform === "string" && body.platform.trim()
      ? body.platform.trim()
      : body.platform === null
      ? "Custom API"
      : (store.platform ?? "Custom API")
    const nextProviderType = body.providerType === undefined
      ? normalizeProviderType(store.provider_type)
      : normalizeProviderType(body.providerType)
    const nextWebhookUrl = typeof body.webhookUrl === "string"
      ? body.webhookUrl.trim() || null
      : body.webhookUrl === null
      ? null
      : store.webhook_url
    const requestedShieldDomain = typeof body.shieldDomain === "string"
      ? body.shieldDomain.trim() || null
      : body.shieldDomain === null
      ? null
      : store.shield_domain
    const nextShieldDomain = await validateShieldDomainForStore(store, requestedShieldDomain)
    const nextSuccessReturnUrl = typeof body.successReturnUrl === "string"
      ? body.successReturnUrl.trim() || null
      : body.successReturnUrl === null
      ? null
      : store.success_return_url
    const nextCancelReturnUrl = typeof body.cancelReturnUrl === "string"
      ? body.cancelReturnUrl.trim() || null
      : body.cancelReturnUrl === null
      ? null
      : store.cancel_return_url
    const requestedStatus = normalizeStatusLabel(body.status)
    let nextIsActive = typeof body.isActive === "boolean" ? body.isActive : store.is_active
    let nextStatusLabel: StoreStatusLabel =
      requestedStatus ??
      normalizeStatusLabel(store.status_label) ??
      (store.is_active ? "Active" : "Suspended")

    if (requestedStatus === "Suspended") {
      nextIsActive = false
    } else if (requestedStatus) {
      nextIsActive = true
    }

    if (!nextIsActive) {
      nextStatusLabel = "Suspended"
    } else if (nextStatusLabel === "Suspended") {
      nextStatusLabel = "Active"
    }

    const nextCheckoutFlow = body.checkoutFlow === null
      ? null
      : body.checkoutFlow === undefined
      ? store.checkout_flow
      : normalizeCheckoutFlow(body.checkoutFlow)

    const updatedRows = isSuperAdmin
      ? (await sql`
          UPDATE stores
          SET name = ${nextName},
              platform = ${nextPlatform},
              provider_type = ${nextProviderType},
              status_label = ${nextStatusLabel},
              webhook_url = ${nextWebhookUrl},
              shield_domain = ${nextShieldDomain},
              success_return_url = ${nextSuccessReturnUrl},
              cancel_return_url = ${nextCancelReturnUrl},
              is_active = ${nextIsActive},
              checkout_flow = ${nextCheckoutFlow},
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING id, tenant_id, name, provider_type, platform, status_label, webhook_url, webhook_secret, shield_domain,
                    success_return_url, cancel_return_url, is_active,
                    COALESCE(capture_mode, 'INSTANT') AS capture_mode,
                    checkout_flow, created_at, updated_at
        `)
      : (await sql`
          UPDATE stores
          SET name = ${nextName},
              platform = ${nextPlatform},
              provider_type = ${nextProviderType},
              status_label = ${nextStatusLabel},
              webhook_url = ${nextWebhookUrl},
              shield_domain = ${nextShieldDomain},
              success_return_url = ${nextSuccessReturnUrl},
              cancel_return_url = ${nextCancelReturnUrl},
              is_active = ${nextIsActive},
              checkout_flow = ${nextCheckoutFlow},
              updated_at = NOW()
          WHERE id = ${id} AND tenant_id = ${tenantId}
          RETURNING id, tenant_id, name, provider_type, platform, status_label, webhook_url, webhook_secret, shield_domain,
                    success_return_url, cancel_return_url, is_active,
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
        providerType: normalizeProviderType(updated.provider_type),
        platform: updated.platform ?? "Custom API",
        status: nextIsActive ? nextStatusLabel : "Suspended",
        webhookUrl: updated.webhook_url,
        shieldDomain: updated.shield_domain,
        hasWebhookSecret: !!updated.webhook_secret,
        successReturnUrl: updated.success_return_url,
        cancelReturnUrl: updated.cancel_return_url,
        isActive: updated.is_active,
        captureMode: updated.capture_mode,
        checkoutFlow: resolveCheckoutFlow(updated.checkout_flow, preferences),
        checkoutFlowOverride: !!updated.checkout_flow,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update store."
    const status =
      message === "Shield domain not found." ? 404 :
      message === "Shield domain does not belong to this store tenant." || message === "Shield domain must be active and healthy before assignment." ? 400 :
      500

    return NextResponse.json({ error: message }, { status })
  }
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
