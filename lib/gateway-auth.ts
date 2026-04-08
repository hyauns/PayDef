import bcrypt from "bcryptjs"
import type { NextRequest } from "next/server"
import { getSql } from "@/lib/neon"

export interface AuthenticatedStore {
  id: string
  tenantId: string
  webhookUrl: string | null
  shieldDomain: string | null
  isActive: boolean
  captureMode: string
  checkoutFlow: string | null
  successReturnUrl: string | null
  cancelReturnUrl: string | null
}

type StoreAuthRow = {
  id: string
  tenant_id: string
  api_key_hash: string
  webhook_url: string | null
  shield_domain: string | null
  is_active: boolean
  capture_mode: string
  checkout_flow: string | null
  success_return_url: string | null
  cancel_return_url: string | null
}

export async function authenticateStoreHeaders(req: NextRequest) {
  const storeId = req.headers.get("X-Store-ID")
  const apiKey = req.headers.get("X-API-Key")

  if (!storeId || !apiKey) {
    throw new Error("Missing X-Store-ID or X-API-Key header.")
  }

  const sql = getSql()
  const rows = (await sql`
    SELECT
      id,
      tenant_id,
      api_key_hash,
      webhook_url,
      shield_domain,
      is_active,
      COALESCE(capture_mode, 'INSTANT') AS capture_mode,
      checkout_flow,
      success_return_url,
      cancel_return_url
    FROM stores
    WHERE id = ${storeId}
    LIMIT 1
  `) as unknown as StoreAuthRow[]

  const store = rows[0] ?? null
  if (!store || !store.is_active) {
    throw new Error("Store not found or inactive.")
  }

  const keyValid = await bcrypt.compare(apiKey, store.api_key_hash)
  if (!keyValid) {
    throw new Error("Invalid API key.")
  }

  return {
    id: store.id,
    tenantId: store.tenant_id,
    webhookUrl: store.webhook_url,
    shieldDomain: store.shield_domain,
    isActive: store.is_active,
    captureMode: store.capture_mode,
    checkoutFlow: store.checkout_flow,
    successReturnUrl: store.success_return_url,
    cancelReturnUrl: store.cancel_return_url,
  } satisfies AuthenticatedStore
}
