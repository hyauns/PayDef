import { getPool } from "@/lib/neon"
import { listWebhookEventsForTransaction } from "@/lib/webhook-delivery"

type TransactionDetailRow = {
  id: string
  tenant_id: string
  store_id: string
  merchant_id: string
  original_amount: string
  original_currency: string
  original_item_name: string | null
  masked_item_name: string | null
  gateway_fee: string
  status: string
  paypal_order_id: string | null
  paypal_capture_id: string | null
  authorization_id: string | null
  latest_authorization_id: string | null
  customer_email: string | null
  card_last_4: string | null
  card_brand: string | null
  buyer_name: string | null
  billing_address: Record<string, unknown> | string | null
  buyer_ip: string | null
  buyer_country: string | null
  ip_address: string | null
  created_at: string
  updated_at: string
  authorized_at: string | null
  completed_at: string | null
  failed_at: string | null
  refunded_at: string | null
  disputed_at: string | null
  canceled_at: string | null
  checkout_expires_at: string | null
  authorization_expires_at: string | null
  status_reason: string | null
  merchant_success_url: string | null
  merchant_cancel_url: string | null
  store_name: string | null
  account_name: string | null
  shield_domain: string | null
}

export async function getTransactionDetail(transactionId: string, scope?: {
  storeId?: string
  tenantId?: string
}) {
  const pool = getPool()
  const conditions = ["t.id = $1"]
  const values: string[] = [transactionId]

  if (scope?.storeId) {
    values.push(scope.storeId)
    conditions.push(`t.store_id = $${values.length}`)
  }

  if (scope?.tenantId) {
    values.push(scope.tenantId)
    conditions.push(`t.tenant_id = $${values.length}`)
  }

  const primaryQuery = `SELECT
     t.id,
     t.tenant_id,
     t.store_id,
     t.merchant_id,
     t.original_amount,
     t.original_currency,
     t.original_item_name,
     t.masked_item_name,
     t.gateway_fee,
     t.status,
     t.paypal_order_id,
     t.paypal_capture_id,
     t.authorization_id,
     t.latest_authorization_id,
     t.customer_email,
     t.card_last_4,
     t.card_brand,
     t.buyer_name,
     t.billing_address,
     t.buyer_ip,
     t.buyer_country,
     t.ip_address,
     t.created_at,
     t.updated_at,
     t.authorized_at,
     t.completed_at,
     t.failed_at,
     t.refunded_at,
     t.disputed_at,
     t.canceled_at,
     t.checkout_expires_at,
     t.authorization_expires_at,
     t.status_reason,
     t.merchant_success_url,
     t.merchant_cancel_url,
     s.name AS store_name,
     ma.name AS account_name,
     ma.shield_domain
   FROM transactions t
   LEFT JOIN stores s ON s.id = t.store_id
   LEFT JOIN merchant_accounts ma ON ma.id = t.merchant_id
   WHERE ${conditions.join(" AND ")}
   LIMIT 1`

  const legacyQuery = `SELECT
     t.id,
     t.tenant_id,
     t.store_id,
     t.merchant_id,
     t.original_amount,
     t.original_currency,
     t.original_item_name,
     t.masked_item_name,
     t.gateway_fee,
     t.status,
     t.paypal_order_id,
     t.paypal_capture_id,
     t.authorization_id,
     t.latest_authorization_id,
     t.customer_email,
     NULL::text AS card_last_4,
     NULL::text AS card_brand,
     NULL::text AS buyer_name,
     NULL::jsonb AS billing_address,
     t.buyer_ip,
     t.buyer_country,
     t.ip_address,
     t.created_at,
     t.updated_at,
     t.authorized_at,
     t.completed_at,
     t.failed_at,
     t.refunded_at,
     t.disputed_at,
     t.canceled_at,
     t.checkout_expires_at,
     t.authorization_expires_at,
     t.status_reason,
     t.merchant_success_url,
     t.merchant_cancel_url,
     s.name AS store_name,
     ma.name AS account_name,
     ma.shield_domain
   FROM transactions t
   LEFT JOIN stores s ON s.id = t.store_id
   LEFT JOIN merchant_accounts ma ON ma.id = t.merchant_id
   WHERE ${conditions.join(" AND ")}
   LIMIT 1`

  let rows
  try {
    rows = (await pool.query<TransactionDetailRow>(primaryQuery, values)).rows
  } catch (error) {
    const isMissingCardColumn =
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "42703" &&
      error.message.includes("card_last_4")

    if (!isMissingCardColumn) {
      throw error
    }

    rows = (await pool.query<TransactionDetailRow>(legacyQuery, values)).rows
  }

  const row = rows[0] ?? null
  if (!row) return null

  const webhookHistory = await listWebhookEventsForTransaction(row.id)

  return {
    transactionId: row.id,
    tenantId: row.tenant_id,
    storeId: row.store_id,
    merchantId: row.merchant_id,
    storeName: row.store_name,
    accountName: row.account_name,
    shieldDomain: row.shield_domain,
    amount: row.original_amount,
    currency: row.original_currency,
    originalItemName: row.original_item_name,
    maskedItemName: row.masked_item_name,
    gatewayFee: row.gateway_fee,
    status: row.status,
    paypalOrderId: row.paypal_order_id,
    paypalCaptureId: row.paypal_capture_id,
    authorizationId: row.authorization_id,
    latestAuthorizationId: row.latest_authorization_id,
    customerEmail: row.customer_email,
    cardLast4: row.card_last_4,
    cardBrand: row.card_brand,
    buyerName: row.buyer_name,
    billingAddress: row.billing_address,
    buyerIp: row.buyer_ip,
    buyerCountry: row.buyer_country,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorizedAt: row.authorized_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    refundedAt: row.refunded_at,
    disputedAt: row.disputed_at,
    canceledAt: row.canceled_at,
    checkoutExpiresAt: row.checkout_expires_at,
    authorizationExpiresAt: row.authorization_expires_at,
    statusReason: row.status_reason,
    merchantSuccessUrl: row.merchant_success_url,
    merchantCancelUrl: row.merchant_cancel_url,
    eventHistory: webhookHistory,
  }
}
