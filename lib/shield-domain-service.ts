import { getPool, getSql } from "@/lib/neon"
import {
  getVercelDomainIntegrationInfo,
  inspectVercelDomain,
  provisionVercelDomain,
  syncVercelDomain,
  type VercelDomainState,
  verifyVercelDomain,
} from "@/lib/vercel-domains"

export type DomainActor = {
  role: "SUPER_ADMIN" | "MERCHANT"
  tenantId?: string
}

type PgErrorLike = {
  code?: string
}

type ShieldDomainRow = {
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

type StoreRow = {
  id: string
  tenant_id: string
  tenant_name: string | null
  name: string
  shield_domain: string | null
  is_active: boolean
}

export type DomainStoreOption = {
  id: string
  name: string
  tenantId: string
  tenantName: string | null
  shieldDomain: string | null
  isActive: boolean
}

export type DomainStoreAssignment = {
  id: string
  name: string
  tenantId: string
  tenantName: string | null
}

export type ShieldDomainResponse = {
  id: string
  domain: string
  isActive: boolean
  tenantId: string | null
  tenantName: string | null
  healthOk: boolean
  lastCheck: string | null
  createdAt: string
  updatedAt: string
  ownership: "shared" | "tenant"
  canManage: boolean
  assignedStores: DomainStoreAssignment[]
  vercel: VercelDomainState
}

type ShieldDomainMutation = {
  id: string
  isActive?: boolean
  tenantId?: string | null
  healthOk?: boolean
  storeId?: string
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase()
}

function validateDomain(domain: string) {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)
}

function requireMerchantTenant(actor: DomainActor) {
  if (actor.role === "MERCHANT" && !actor.tenantId) {
    throw new Error("Merchant account is not attached to a tenant.")
  }
}

function canManageDomain(actor: DomainActor, row: ShieldDomainRow) {
  if (actor.role === "SUPER_ADMIN") return true
  return Boolean(actor.tenantId && row.tenant_id === actor.tenantId)
}

function canManageStore(actor: DomainActor, store: StoreRow) {
  if (actor.role === "SUPER_ADMIN") return true
  return Boolean(actor.tenantId && store.tenant_id === actor.tenantId)
}

async function ensureTenantExists(tenantId: string) {
  const sql = getSql()
  const rows = await sql`
    SELECT id
    FROM tenants
    WHERE id = ${tenantId}
    LIMIT 1
  `

  return rows.length > 0
}

async function getShieldDomainRowById(id: string) {
  const sql = getSql()
  const rows = (await sql`
    SELECT sd.*, t.name AS tenant_name
    FROM shield_domains sd
    LEFT JOIN tenants t ON t.id = sd.tenant_id
    WHERE sd.id = ${id}
    LIMIT 1
  `) as unknown as ShieldDomainRow[]

  return rows[0] ?? null
}

async function listVisibleStores(actor: DomainActor) {
  const sql = getSql()
  const rows =
    actor.role === "SUPER_ADMIN"
      ? ((await sql`
          SELECT s.id, s.tenant_id, s.name, s.shield_domain, s.is_active, t.name AS tenant_name
          FROM stores s
          LEFT JOIN tenants t ON t.id = s.tenant_id
          ORDER BY s.created_at DESC
        `) as unknown as StoreRow[])
      : ((await sql`
          SELECT s.id, s.tenant_id, s.name, s.shield_domain, s.is_active, t.name AS tenant_name
          FROM stores s
          LEFT JOIN tenants t ON t.id = s.tenant_id
          WHERE s.tenant_id = ${actor.tenantId!}
          ORDER BY s.created_at DESC
        `) as unknown as StoreRow[])

  return rows
}

async function getStoreRowById(id: string) {
  const sql = getSql()
  const rows = (await sql`
    SELECT s.id, s.tenant_id, s.name, s.shield_domain, s.is_active, t.name AS tenant_name
    FROM stores s
    LEFT JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = ${id}
    LIMIT 1
  `) as unknown as StoreRow[]

  return rows[0] ?? null
}

async function touchHealthSnapshot(id: string, healthOk: boolean) {
  const pool = getPool()
  await pool.query(
    `UPDATE shield_domains
     SET health_ok = $2,
         last_check = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [id, healthOk]
  )
}

/**
 * Direct bridge health check — used when Vercel integration is disabled (Coolify).
 * Fetches https://{domain}/api/health/shield-popup with a 5-second timeout.
 * Returns { healthy, statusCode, detail } without touching Vercel APIs.
 */
async function checkDomainBridgeHealth(domain: string): Promise<{
  healthy: boolean
  statusCode: number | null
  detail: string
}> {
  const url = `https://${domain}/api/health/shield-popup`
  console.info(`[shield-domain] Health check started: domain=${domain} url=${url}`)
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "PayDef-ShieldHealthCheck/1.0" },
    })
    const healthy = res.status === 200
    // Consume body to properly close connection
    if (healthy) await res.text().catch(() => {})
    const detail = healthy
      ? `Bridge OK (${res.status})`
      : `Bridge returned ${res.status}`
    console.info(`[shield-domain] Health check result: domain=${domain} healthy=${healthy} status=${res.status}`)
    return { healthy, statusCode: res.status, detail }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[shield-domain] Health check failed: domain=${domain} error=${msg}`)
    return { healthy: false, statusCode: null, detail: `Fetch failed: ${msg}` }
  }
}

/**
 * Resolves bridge health using the appropriate method for the current platform.
 * On Vercel: uses Vercel domain provisioning state.
 * On Coolify/Docker: directly fetches the domain's health endpoint.
 */
async function resolveBridgeHealth(domain: string): Promise<boolean> {
  const integration = getVercelDomainIntegrationInfo()
  if (integration.enabled) {
    // Vercel path: let the existing provisioning flow handle bridgeOk
    return false // caller should use vercel.bridgeOk instead
  }
  // Coolify/non-Vercel path: direct health check
  const result = await checkDomainBridgeHealth(domain)
  return result.healthy
}

async function mapShieldDomainRow(
  row: ShieldDomainRow,
  actor: DomainActor,
  storesByDomain?: Map<string, DomainStoreAssignment[]>
) {
  const vercel = await inspectVercelDomain(row.domain)

  return {
    id: row.id,
    domain: row.domain,
    isActive: row.is_active,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    healthOk: row.health_ok,
    lastCheck: row.last_check,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownership: row.tenant_id ? "tenant" : "shared",
    canManage: canManageDomain(actor, row),
    assignedStores: storesByDomain?.get(row.domain) ?? [],
    vercel,
  } satisfies ShieldDomainResponse
}

export async function listShieldDomains(actor: DomainActor) {
  requireMerchantTenant(actor)

  const sql = getSql()
  const rows =
    actor.role === "SUPER_ADMIN"
      ? ((await sql`
          SELECT sd.*, t.name AS tenant_name
          FROM shield_domains sd
          LEFT JOIN tenants t ON t.id = sd.tenant_id
          ORDER BY sd.is_active DESC, sd.created_at DESC
        `) as unknown as ShieldDomainRow[])
      : ((await sql`
          SELECT sd.*, t.name AS tenant_name
          FROM shield_domains sd
          LEFT JOIN tenants t ON t.id = sd.tenant_id
          WHERE sd.tenant_id = ${actor.tenantId!}
             OR sd.tenant_id IS NULL
          ORDER BY sd.is_active DESC, sd.created_at DESC
        `) as unknown as ShieldDomainRow[])

  const visibleStores = await listVisibleStores(actor)
  const storesByDomain = new Map<string, DomainStoreAssignment[]>()
  for (const store of visibleStores) {
    if (!store.shield_domain) continue
    const current = storesByDomain.get(store.shield_domain) ?? []
    current.push({
      id: store.id,
      name: store.name,
      tenantId: store.tenant_id,
      tenantName: store.tenant_name,
    })
    storesByDomain.set(store.shield_domain, current)
  }

  const domains = await Promise.all(rows.map((row) => mapShieldDomainRow(row, actor, storesByDomain)))
  const stores = visibleStores.map((store) => ({
    id: store.id,
    name: store.name,
    tenantId: store.tenant_id,
    tenantName: store.tenant_name,
    shieldDomain: store.shield_domain,
    isActive: store.is_active,
  })) satisfies DomainStoreOption[]

  return {
    domains,
    stores,
    integration: getVercelDomainIntegrationInfo(),
  }
}

export async function createShieldDomain(
  actor: DomainActor,
  input: { domain: string; tenantId?: string | null; isActive?: boolean }
) {
  requireMerchantTenant(actor)

  const domain = normalizeDomain(input.domain)
  if (!domain) {
    throw new Error("domain is required.")
  }
  if (!validateDomain(domain)) {
    throw new Error("Invalid domain format.")
  }

  const tenantId =
    actor.role === "SUPER_ADMIN"
      ? input.tenantId ?? null
      : actor.tenantId ?? null

  if (actor.role === "MERCHANT" && input.tenantId && input.tenantId !== actor.tenantId) {
    throw new Error("Merchants can only add domains to their own tenant.")
  }

  if (tenantId && !(await ensureTenantExists(tenantId))) {
    throw new Error("Tenant not found.")
  }

  const sql = getSql()
  let inserted: { id: string }[]
  try {
    inserted = (await sql`
      INSERT INTO shield_domains (domain, tenant_id, is_active)
      VALUES (${domain}, ${tenantId}, ${input.isActive ?? true})
      RETURNING id
    `) as unknown as { id: string }[]
  } catch (error) {
    const pgError = error as PgErrorLike
    if (pgError.code === "23505") {
      throw new Error("Domain already exists in the pool.")
    }
    throw error
  }

  const id = inserted[0].id
  const vercel = await provisionVercelDomain(domain)
  // On Coolify (Vercel disabled), use direct bridge health check
  const integration = getVercelDomainIntegrationInfo()
  const healthOk = integration.enabled
    ? vercel.bridgeOk
    : await resolveBridgeHealth(domain)
  await touchHealthSnapshot(id, healthOk)

  const row = await getShieldDomainRowById(id)
  if (!row) {
    throw new Error("Failed to load created domain.")
  }

  return {
    domain: {
      ...(await mapShieldDomainRow(row, actor)),
      vercel,
    } satisfies ShieldDomainResponse,
    integration: getVercelDomainIntegrationInfo(),
  }
}

export async function updateShieldDomain(
  actor: DomainActor,
  input: ShieldDomainMutation & {
    action?: "syncVercel" | "verifyDns" | "assignStore" | "unassignStore" | "checkHealth"
  }
) {
  requireMerchantTenant(actor)

  const row = await getShieldDomainRowById(input.id)
  if (!row) {
    throw new Error("Domain not found.")
  }
  if (!canManageDomain(actor, row)) {
    throw new Error("Forbidden")
  }

  // Direct health check action — works on both Vercel and Coolify
  if (input.action === "checkHealth") {
    const bridgeResult = await checkDomainBridgeHealth(row.domain)
    await touchHealthSnapshot(row.id, bridgeResult.healthy)
    const freshRow = await getShieldDomainRowById(row.id)
    if (!freshRow) {
      throw new Error("Domain not found.")
    }
    return {
      domain: await mapShieldDomainRow(freshRow, actor),
      integration: getVercelDomainIntegrationInfo(),
    }
  }

  if (input.action === "syncVercel" || input.action === "verifyDns") {
    const vercel =
      input.action === "verifyDns"
        ? await verifyVercelDomain(row.domain)
        : await syncVercelDomain(row.domain)

    // On Coolify (Vercel disabled), use direct bridge health check
    const integration = getVercelDomainIntegrationInfo()
    const healthOk = integration.enabled
      ? vercel.bridgeOk
      : await resolveBridgeHealth(row.domain)
    await touchHealthSnapshot(row.id, healthOk)
    const freshRow = await getShieldDomainRowById(row.id)
    if (!freshRow) {
      throw new Error("Domain not found.")
    }

    return {
      domain: {
        ...(await mapShieldDomainRow(freshRow, actor)),
        vercel,
      } satisfies ShieldDomainResponse,
      integration: getVercelDomainIntegrationInfo(),
    }
  }

  if (input.action === "assignStore" || input.action === "unassignStore") {
    if (!input.storeId) {
      throw new Error("storeId is required.")
    }

    const store = await getStoreRowById(input.storeId)
    if (!store) {
      throw new Error("Store not found.")
    }
    if (!canManageStore(actor, store)) {
      throw new Error("Forbidden")
    }
    if (row.tenant_id && store.tenant_id !== row.tenant_id) {
      throw new Error("Store does not belong to the same tenant as this domain.")
    }

    const pool = getPool()
    await pool.query(
      `UPDATE stores
       SET shield_domain = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.storeId, input.action === "assignStore" ? row.domain : null]
    )

    const refreshed = await getShieldDomainRowById(row.id)
    if (!refreshed) {
      throw new Error("Domain not found.")
    }

    const visibleStores = await listVisibleStores(actor)
    const storesByDomain = new Map<string, DomainStoreAssignment[]>()
    for (const visibleStore of visibleStores) {
      if (!visibleStore.shield_domain) continue
      const current = storesByDomain.get(visibleStore.shield_domain) ?? []
      current.push({
        id: visibleStore.id,
        name: visibleStore.name,
        tenantId: visibleStore.tenant_id,
        tenantName: visibleStore.tenant_name,
      })
      storesByDomain.set(visibleStore.shield_domain, current)
    }

    return {
      domain: await mapShieldDomainRow(refreshed, actor, storesByDomain),
      stores: visibleStores.map((visibleStore) => ({
        id: visibleStore.id,
        name: visibleStore.name,
        tenantId: visibleStore.tenant_id,
        tenantName: visibleStore.tenant_name,
        shieldDomain: visibleStore.shield_domain,
        isActive: visibleStore.is_active,
      })) satisfies DomainStoreOption[],
      integration: getVercelDomainIntegrationInfo(),
    }
  }

  if (actor.role === "MERCHANT" && input.tenantId !== undefined) {
    throw new Error("Merchants cannot reassign domains.")
  }

  if (input.tenantId !== undefined && input.tenantId && !(await ensureTenantExists(input.tenantId))) {
    throw new Error("Tenant not found.")
  }

  const sets: string[] = []
  const values: unknown[] = []
  let index = 2

  if (input.isActive !== undefined) {
    sets.push(`is_active = $${index++}`)
    values.push(input.isActive)
  }
  if (input.tenantId !== undefined) {
    sets.push(`tenant_id = $${index++}`)
    values.push(input.tenantId)
  }
  if (input.healthOk !== undefined) {
    sets.push(`health_ok = $${index++}`)
    values.push(input.healthOk)
  }

  if (sets.length === 0) {
    throw new Error("No fields to update.")
  }

  const pool = getPool()
  const result = await pool.query(
    `UPDATE shield_domains
     SET ${sets.join(", ")},
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [input.id, ...values]
  )

  if (result.rowCount === 0) {
    throw new Error("Domain not found.")
  }

  const freshRow = await getShieldDomainRowById(input.id)
  if (!freshRow) {
    throw new Error("Domain not found.")
  }

  return {
    domain: await mapShieldDomainRow(freshRow, actor),
    integration: getVercelDomainIntegrationInfo(),
  }
}

export async function deleteShieldDomain(actor: DomainActor, id: string) {
  requireMerchantTenant(actor)

  const row = await getShieldDomainRowById(id)
  if (!row) {
    throw new Error("Domain not found.")
  }
  if (!canManageDomain(actor, row)) {
    throw new Error("Forbidden")
  }

  const sql = getSql()
  const result = await sql`
    DELETE FROM shield_domains
    WHERE id = ${id}
    RETURNING id, domain
  `

  if (result.length === 0) {
    throw new Error("Domain not found.")
  }

  return {
    deleted: true,
    id: (result[0] as { id: string }).id,
    domain: (result[0] as { domain: string }).domain,
  }
}
