import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/neon"
import { encrypt } from "@/lib/encryption"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"
import { type StoreWebhookPayload } from "@/lib/store-webhooks"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import {
  buildWebhookBusinessKey,
  deliverWebhookEvent,
  persistWebhookEventSafe,
} from "@/lib/webhook-delivery"
import { sendTransactionAlert } from "@/lib/telegram"

const GATEWAY_FEE_PERCENT = 0.02

type BillingAddress = Record<string, unknown> | string | null

interface MockChargeBody {
  store_id?: string
  cardNumber?: string
  cvv?: string
  expMonth?: string | number
  expYear?: string | number
  buyerName?: string
  billingAddress?: BillingAddress
  amount?: number | string
  currency?: string
}

interface InsertedTransactionRow {
  id: string
  merchant_id: string | null
}

interface InternalStoreRow {
  id: string
  tenant_id: string
  webhook_url: string | null
  is_active: boolean
  provider_type: string
}

type ResolvedStore = {
  id: string
  tenantId: string
  webhookUrl: string | null
  providerType: "PAYPAL" | "CUSTOM_MOCK" | "STRIPE"
}

function normalizeProviderType(value: unknown): ResolvedStore["providerType"] {
  return value === "CUSTOM_MOCK" || value === "STRIPE" ? value : "PAYPAL"
}

function normalizeAmount(value: number | string | undefined) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100) / 100
}

function normalizeExpPart(value: string | number | undefined, maxLength: number) {
  const normalized = String(value ?? "").trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

function normalizeCardNumber(value: string | undefined) {
  const digits = (value ?? "").replace(/\D/g, "")
  if (digits.length < 12 || digits.length > 19) return null
  return digits
}

function detectCardBrand(cardNumber: string) {
  if (/^4/.test(cardNumber)) return "VISA"
  if (/^5[1-5]/.test(cardNumber) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(cardNumber)) return "MASTERCARD"
  if (/^3[47]/.test(cardNumber)) return "AMEX"
  if (/^6(?:011|5)/.test(cardNumber)) return "DISCOVER"
  return "UNKNOWN"
}

function normalizeBillingAddress(value: BillingAddress) {
  if (value == null) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value
  }
  return null
}

async function resolveDashboardStore(storeId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    throw new Error("Unauthorized")
  }

  const sql = getSql()
  const rows = (await sql`
    SELECT id, tenant_id, webhook_url, is_active, provider_type
    FROM stores
    WHERE id = ${storeId}
    LIMIT 1
  `) as unknown as InternalStoreRow[]

  const store = rows[0] ?? null
  if (!store || !store.is_active) {
    throw new Error("Store not found or inactive.")
  }

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  if (!isSuperAdmin && session.user.tenantId !== store.tenant_id) {
    throw new Error("Store not found or inactive.")
  }

  return {
    id: store.id,
    tenantId: store.tenant_id,
    webhookUrl: store.webhook_url,
    providerType: normalizeProviderType(store.provider_type),
  } satisfies ResolvedStore
}

export async function POST(req: NextRequest) {
  try {
    let body: MockChargeBody
    try {
      body = (await req.json()) as MockChargeBody
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    }

    let store: ResolvedStore
    const storeHeader = req.headers.get("X-Store-ID")
    const apiKeyHeader = req.headers.get("X-API-Key")

    if (storeHeader && apiKeyHeader) {
      const authenticatedStore = await authenticateStoreHeaders(req)
      const sql = getSql()
      const rows = (await sql`
        SELECT id, tenant_id, webhook_url, is_active, provider_type
        FROM stores
        WHERE id = ${authenticatedStore.id}
        LIMIT 1
      `) as unknown as InternalStoreRow[]
      const activeStore = rows[0] ?? null
      if (!activeStore || !activeStore.is_active) {
        return NextResponse.json({ error: "Store not found or inactive." }, { status: 401 })
      }

      store = {
        id: activeStore.id,
        tenantId: activeStore.tenant_id,
        webhookUrl: activeStore.webhook_url,
        providerType: normalizeProviderType(activeStore.provider_type),
      }

      if (body.store_id && body.store_id !== store.id) {
        return NextResponse.json({ error: "Payload store_id does not match X-Store-ID." }, { status: 400 })
      }
    } else {
      const requestedStoreId = String(body.store_id ?? "").trim()
      if (!requestedStoreId) {
        return NextResponse.json({ error: "store_id is required." }, { status: 400 })
      }
      store = await resolveDashboardStore(requestedStoreId)
    }

    const amount = normalizeAmount(body.amount)
    const currency = (body.currency ?? "USD").trim().toUpperCase()
    const cardNumber = normalizeCardNumber(body.cardNumber)
    const cvv = String(body.cvv ?? "").trim()
    const expMonth = normalizeExpPart(body.expMonth, 2)
    const expYear = normalizeExpPart(body.expYear, 4)
    const buyerName = String(body.buyerName ?? "").trim()
    const billingAddress = normalizeBillingAddress(body.billingAddress ?? null)

    if (amount === null) {
      return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 })
    }
    if (!currency) {
      return NextResponse.json({ error: "currency is required." }, { status: 400 })
    }
    if (!cardNumber) {
      return NextResponse.json({ error: "cardNumber must contain 12-19 digits." }, { status: 400 })
    }
    if (!cvv) {
      return NextResponse.json({ error: "cvv is required." }, { status: 400 })
    }
    if (!expMonth || !expYear) {
      return NextResponse.json({ error: "expMonth and expYear are required." }, { status: 400 })
    }
    if (!buyerName) {
      return NextResponse.json({ error: "buyerName is required." }, { status: 400 })
    }
    if (store.providerType === "PAYPAL") {
      return NextResponse.json(
        { error: "Mock charge is disabled for PAYPAL stores." },
        { status: 409 }
      )
    }
    if (store.providerType === "STRIPE") {
      return NextResponse.json(
        { error: "Mock charge is not implemented for STRIPE stores." },
        { status: 409 }
      )
    }

    const pool = getPool()
    const client = await pool.connect()

    let transaction: InsertedTransactionRow | null = null
    const cardLast4 = cardNumber.slice(-4)
    const cardBrand = detectCardBrand(cardNumber)
    const gatewayFee = Math.round(amount * GATEWAY_FEE_PERCENT * 100) / 100
    const netAmount = Math.round((amount - gatewayFee) * 100) / 100

    try {
      await client.query("BEGIN")

      const inserted = await client.query<InsertedTransactionRow>(
        `INSERT INTO transactions (
           tenant_id,
           store_id,
           merchant_id,
           original_amount,
           original_currency,
           original_item_name,
           masked_item_name,
           gateway_fee,
           status,
           intent,
           encrypted_card_number,
           encrypted_cvv,
           exp_month,
           exp_year,
           card_last_4,
           card_brand,
           buyer_name,
           billing_address,
           status_reason,
           completed_at,
           created_at,
           updated_at
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           'COMPLETED'::transaction_status,
           'CAPTURE',
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15,
           $16::jsonb,
           'mock_charge_completed',
           NOW(),
           NOW(),
           NOW()
         )
         RETURNING id, merchant_id`,
        [
          store.tenantId,
          store.id,
          null,
          amount.toFixed(2),
          currency,
          "Mock Direct Card Charge",
          "Mock Direct Card Charge",
          gatewayFee.toFixed(2),
          encrypt(cardNumber),
          encrypt(cvv),
          expMonth,
          expYear,
          cardLast4,
          cardBrand,
          buyerName,
          billingAddress === null ? null : JSON.stringify(billingAddress),
        ]
      )

      transaction = inserted.rows[0] ?? null
      if (!transaction) {
        throw new Error("Failed to create mock transaction.")
      }

      await client.query(
        `INSERT INTO billing_records (
           tenant_id,
           transaction_id,
           gross_amount,
           fee_amount,
           net_amount,
           currency,
           created_at
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           NOW()
         )`,
        [
          store.tenantId,
          transaction.id,
          amount.toFixed(2),
          gatewayFee.toFixed(2),
          netAmount.toFixed(2),
          currency,
        ]
      )

      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => null)
      throw error
    } finally {
      client.release()
    }

    if (transaction && store.webhookUrl) {
      const payload: Omit<StoreWebhookPayload, "event_id"> = {
        event: "payment.capture.completed",
        transaction_id: transaction.id,
        paypal_order_id: null,
        amount: amount.toFixed(2),
        currency,
        status: "COMPLETED",
        timestamp: new Date().toISOString(),
        status_reason: "mock_charge_completed",
        gateway_fee: gatewayFee.toFixed(2),
        net_amount: netAmount.toFixed(2),
        payment_method: "mock_card",
        card_last_4: cardLast4,
        card_brand: cardBrand,
        exp_month: expMonth,
        exp_year: expYear,
        buyer_name: buyerName,
        billing_address: billingAddress,
      }

      try {
        const { eventId, shouldDeliver } = await persistWebhookEventSafe({
          transactionId: transaction.id,
          tenantId: store.tenantId,
          storeId: store.id,
          accountId: transaction.merchant_id,
          targetUrl: store.webhookUrl,
          businessKey: buildWebhookBusinessKey("payment.capture.completed", transaction.id, "mock_charge"),
          event: "payment.capture.completed",
          payload,
          source: "mock_charge_api",
          triggerOrigin: "mock_charge_api",
        })

        if (shouldDeliver) {
          void deliverWebhookEvent(eventId, "mock_charge_api").catch((error) => {
            console.error(
              `[mock-charge] Webhook delivery failed (event persisted, cron will retry): tx=${transaction?.id} eventId=${eventId}`,
              error
            )
          })
        }
      } catch (error) {
        console.error(
          `[mock-charge] Webhook event persistence failed after transaction completion: tx=${transaction.id}`,
          error
        )
      }
    }

    sendTransactionAlert({
      tenantId: store.tenantId,
      amount,
      storeName: "Unknown Store",
      accountName: "Custom Mock",
      transactionId: transaction?.id ?? null,
    })

    return NextResponse.json(
      {
        status: "COMPLETED",
        transaction_id: transaction?.id ?? null,
        amount: amount.toFixed(2),
        currency,
        gateway_fee: gatewayFee.toFixed(2),
        net_amount: netAmount.toFixed(2),
        payment_method: "mock_card",
        card_last_4: cardLast4,
        card_brand: cardBrand,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[mock-charge] Unexpected error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
