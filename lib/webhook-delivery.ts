import { randomUUID } from "crypto"
import { getPool, getSql } from "@/lib/neon"
import { decrypt } from "@/lib/encryption"
import {
  signStoreWebhook,
  type StoreWebhookEvent,
  type StoreWebhookPayload,
} from "@/lib/store-webhooks"

const RETRY_DELAYS_MS = [
  0,
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
] as const

const RESPONSE_SNIPPET_LIMIT = 1200
const REPLAY_COOLDOWN_MS = 60_000

export type WebhookDeliveryFinalStatus =
  | "pending"
  | "delivered"
  | "retrying"
  | "dead_letter"
  | "canceled"

type WebhookEventRow = {
  id: string
  transaction_id: string
  tenant_id: string
  store_id: string
  account_id: string | null
  event_name: StoreWebhookEvent
  business_key: string
  target_url: string
  raw_payload: string
  payload_version: string
  source: string
  trigger_origin: string
  delivery_status: WebhookDeliveryFinalStatus
  attempt_count: number
  last_delivery_id: string | null
  latest_http_status: number | null
  latest_response_snippet: string | null
  latest_error: string | null
  last_attempt_at: string | null
  next_retry_at: string | null
  delivered_at: string | null
  replayed_at: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

type StoreSecretRow = {
  webhook_secret: string | null
}

export type WebhookDeliveryRow = {
  id: string
  event_id: string
  transaction_id: string
  tenant_id: string
  store_id: string
  target_url: string
  headers_sent: Record<string, string>
  raw_payload: string
  http_status: number | null
  response_body_snippet: string | null
  error_message: string | null
  attempt_number: number
  trigger_origin: string
  final_status: WebhookDeliveryFinalStatus
  next_retry_at: string | null
  delivered_at: string | null
  created_at: string
}

type EventSummaryRow = {
  id: string
  event_name: string
  delivery_status: string
  created_at: string
  delivered_at: string | null
  next_retry_at: string | null
  attempt_count: number
  latest_http_status: number | null
  latest_error: string | null
  last_delivery_id: string | null
  source: string
  trigger_origin: string
}

type DeliverySummaryRow = {
  id: string
  event_id: string
  attempt_number: number
  trigger_origin: string
  final_status: string
  http_status: number | null
  response_body_snippet: string | null
  error_message: string | null
  next_retry_at: string | null
  delivered_at: string | null
  created_at: string
}

export interface EnqueueWebhookEventInput {
  transactionId: string
  tenantId: string
  storeId: string
  accountId?: string | null
  targetUrl: string
  businessKey: string
  event: StoreWebhookEvent
  payload: Omit<StoreWebhookPayload, "event_id">
  source: string
  triggerOrigin?: string
}

export function buildWebhookBusinessKey(
  event: StoreWebhookEvent,
  transactionId: string,
  reference?: string | null
) {
  return [event, transactionId, reference ?? "none"].join(":")
}

function getNextRetryAt(attemptNumber: number): Date | null {
  const nextDelay = RETRY_DELAYS_MS[attemptNumber]
  if (nextDelay === undefined) return null
  return new Date(Date.now() + nextDelay)
}

function toSnippet(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, RESPONSE_SNIPPET_LIMIT)
}

async function writeSystemLog(input: {
  action: string
  status: string
  level: "success" | "error" | "warning" | "info"
  metadata: Record<string, unknown>
  tenantId?: string | null
  storeId?: string | null
  accountId?: string | null
}) {
  const sql = getSql()

  try {
    await sql`
      INSERT INTO system_logs (action, status, level, metadata, tenant_id, store_id, account_id)
      VALUES (
        ${input.action},
        ${input.status},
        ${input.level},
        ${JSON.stringify(input.metadata)}::jsonb,
        ${input.tenantId ?? null},
        ${input.storeId ?? null},
        ${input.accountId ?? null}
      )
    `
  } catch {
    // best-effort only
  }
}

async function loadEventRow(eventId: string) {
  const sql = getSql()
  const rows = (await sql`
    SELECT *
    FROM webhook_events
    WHERE id = ${eventId}
    LIMIT 1
  `) as unknown as WebhookEventRow[]

  return rows[0] ?? null
}

async function loadStoreSecret(storeId: string) {
  const sql = getSql()
  const rows = (await sql`
    SELECT webhook_secret
    FROM stores
    WHERE id = ${storeId}
    LIMIT 1
  `) as unknown as StoreSecretRow[]

  return rows[0]?.webhook_secret ? decrypt(rows[0].webhook_secret) : null
}

async function finalizeDeliveryAttempt(input: {
  event: WebhookEventRow
  deliveryId: string
  attemptNumber: number
  triggerOrigin: string
  httpStatus?: number | null
  responseBodySnippet?: string | null
  errorMessage?: string | null
  delivered: boolean
}) {
  const sql = getSql()
  const nextRetryAt = input.delivered ? null : getNextRetryAt(input.attemptNumber)
  const finalStatus: WebhookDeliveryFinalStatus = input.delivered
    ? "delivered"
    : nextRetryAt
    ? "retrying"
    : "dead_letter"
  const deliveredAt = input.delivered ? new Date().toISOString() : null

  await sql`
    UPDATE webhook_deliveries
    SET http_status = ${input.httpStatus ?? null},
        response_body_snippet = ${input.responseBodySnippet ?? null},
        error_message = ${input.errorMessage ?? null},
        final_status = ${finalStatus},
        next_retry_at = ${nextRetryAt?.toISOString() ?? null},
        delivered_at = ${deliveredAt}
    WHERE id = ${input.deliveryId}
  `

  await sql`
    UPDATE webhook_events
    SET attempt_count = ${input.attemptNumber},
        last_delivery_id = ${input.deliveryId},
        latest_http_status = ${input.httpStatus ?? null},
        latest_response_snippet = ${input.responseBodySnippet ?? null},
        latest_error = ${input.errorMessage ?? null},
        last_attempt_at = NOW(),
        next_retry_at = ${nextRetryAt?.toISOString() ?? null},
        delivered_at = ${deliveredAt},
        replayed_at = CASE
          WHEN ${input.triggerOrigin} = 'replay' THEN NOW()
          ELSE replayed_at
        END,
        delivery_status = ${finalStatus},
        updated_at = NOW()
    WHERE id = ${input.event.id}
  `

  await writeSystemLog({
    action: "WEBHOOK_DELIVERY",
    status: input.delivered ? "OK" : finalStatus === "dead_letter" ? "ERROR" : "PARTIAL",
    level: input.delivered ? "success" : finalStatus === "dead_letter" ? "error" : "warning",
    tenantId: input.event.tenant_id,
    storeId: input.event.store_id,
    accountId: input.event.account_id,
    metadata: {
      eventId: input.event.id,
      deliveryId: input.deliveryId,
      event: input.event.event_name,
      transactionId: input.event.transaction_id,
      attempt: input.attemptNumber,
      httpStatus: input.httpStatus ?? null,
      finalStatus,
      nextRetryAt: nextRetryAt?.toISOString() ?? null,
      triggerOrigin: input.triggerOrigin,
      error: input.errorMessage ?? null,
      responseSnippet: input.responseBodySnippet ?? null,
    },
  })

  return {
    deliveryId: input.deliveryId,
    finalStatus,
    nextRetryAt: nextRetryAt?.toISOString() ?? null,
    deliveredAt,
  }
}

export async function enqueueStoreWebhookEvent(input: EnqueueWebhookEventInput) {
  const pool = getPool()
  const client = await pool.connect()

  let eventId: string
  let existing: WebhookEventRow | null = null

  try {
    await client.query("BEGIN")

    const existingResult = await client.query<WebhookEventRow>(
      `SELECT *
       FROM webhook_events
       WHERE business_key = $1
       LIMIT 1
       FOR UPDATE`,
      [input.businessKey]
    )
    existing = existingResult.rows[0] ?? null

    if (!existing) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO webhook_events (
           transaction_id, tenant_id, store_id, account_id,
           event_name, business_key, target_url, raw_payload,
           payload_version, source, trigger_origin, delivery_status, next_retry_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, '{}',
           '2026-04-08', $8, $9, 'pending', NOW()
         )
         RETURNING id`,
        [
          input.transactionId,
          input.tenantId,
          input.storeId,
          input.accountId ?? null,
          input.event,
          input.businessKey,
          input.targetUrl,
          input.source,
          input.triggerOrigin ?? "automatic",
        ]
      )
      eventId = inserted.rows[0].id
    } else {
      eventId = existing.id
    }

    const payload = {
      ...input.payload,
      event: input.event,
      event_id: eventId,
    } satisfies StoreWebhookPayload

    await client.query(
      `UPDATE webhook_events
       SET target_url = $2,
           raw_payload = $3,
           source = $4,
           trigger_origin = $5,
           canceled_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [
        eventId,
        input.targetUrl,
        JSON.stringify(payload),
        input.source,
        input.triggerOrigin ?? "automatic",
      ]
    )

    await client.query("COMMIT")

    if (!existing) {
      await writeSystemLog({
        action: "WEBHOOK_EVENT_CREATED",
        status: "OK",
        level: "info",
        tenantId: input.tenantId,
        storeId: input.storeId,
        accountId: input.accountId ?? null,
        metadata: {
          eventId,
          event: input.event,
          transactionId: input.transactionId,
          businessKey: input.businessKey,
          targetUrl: input.targetUrl,
          source: input.source,
        },
      })
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null)
    throw error
  } finally {
    client.release()
  }

  const fresh = await loadEventRow(eventId)
  if (!fresh) {
    throw new Error("Failed to load webhook event after enqueue.")
  }

  if (existing) {
    return { event: fresh, delivery: null, duplicate: true }
  }

  const delivery = await deliverWebhookEvent(eventId, input.triggerOrigin ?? "initial")
  return { event: await loadEventRow(eventId), delivery, duplicate: false }
}

export async function deliverWebhookEvent(eventId: string, triggerOrigin = "retry") {
  const event = await loadEventRow(eventId)
  if (!event) {
    throw new Error("Webhook event not found.")
  }

  if (event.delivery_status === "canceled") {
    return { deliveryId: null, finalStatus: "canceled" as const, nextRetryAt: null, deliveredAt: null }
  }

  const attemptNumber = event.attempt_count + 1
  const timestamp = new Date().toISOString()
  const deliveryId = randomUUID()
  const secret = await loadStoreSecret(event.store_id)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Source": "payment-gateway",
    "X-Webhook-Event": event.event_name,
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Event-ID": event.id,
    "X-Webhook-Delivery-ID": deliveryId,
    "X-Webhook-Attempt": String(attemptNumber),
  }

  if (secret) {
    headers["X-Webhook-Signature"] = signStoreWebhook(event.raw_payload, timestamp, secret)
  }

  const sql = getSql()
  await sql`
    INSERT INTO webhook_deliveries (
      id, event_id, transaction_id, tenant_id, store_id, target_url,
      headers_sent, raw_payload, attempt_number, trigger_origin, final_status
    ) VALUES (
      ${deliveryId},
      ${event.id},
      ${event.transaction_id},
      ${event.tenant_id},
      ${event.store_id},
      ${event.target_url},
      ${JSON.stringify(headers)}::jsonb,
      ${event.raw_payload},
      ${attemptNumber},
      ${triggerOrigin},
      'pending'
    )
  `

  try {
    const response = await fetch(event.target_url, {
      method: "POST",
      headers,
      body: event.raw_payload,
      signal: AbortSignal.timeout(10_000),
    })
    const responseText = toSnippet(await response.text().catch(() => null))
    const finalized = await finalizeDeliveryAttempt({
      event,
      deliveryId,
      attemptNumber,
      triggerOrigin,
      httpStatus: response.status,
      responseBodySnippet: responseText,
      delivered: response.ok,
    })

    return finalized
  } catch (error) {
    return finalizeDeliveryAttempt({
      event,
      deliveryId,
      attemptNumber,
      triggerOrigin,
      errorMessage: error instanceof Error ? error.message : "Unknown delivery error",
      delivered: false,
    })
  }
}

export async function processDueWebhookEvents(limit = 50) {
  const sql = getSql()
  const rows = (await sql`
    SELECT id
    FROM webhook_events
    WHERE delivery_status IN ('pending', 'retrying')
      AND (
        next_retry_at IS NULL
        OR next_retry_at <= NOW()
      )
    ORDER BY created_at ASC
    LIMIT ${limit}
  `) as unknown as Array<{ id: string }>

  const results = []
  for (const row of rows) {
    results.push({
      eventId: row.id,
      ...(await deliverWebhookEvent(row.id, "retry")),
    })
  }

  return results
}

export async function replayWebhookEvent(eventId: string, source: "merchant" | "admin" | "support" = "merchant") {
  const event = await loadEventRow(eventId)
  if (!event) {
    throw new Error("Webhook event not found.")
  }

  const lastReplayAt = event.replayed_at ? new Date(event.replayed_at).getTime() : 0
  if (lastReplayAt && Date.now() - lastReplayAt < REPLAY_COOLDOWN_MS) {
    throw new Error("Replay cooling down. Try again in a minute.")
  }

  await writeSystemLog({
    action: "WEBHOOK_REPLAY_REQUESTED",
    status: "OK",
    level: "warning",
    tenantId: event.tenant_id,
    storeId: event.store_id,
    accountId: event.account_id,
    metadata: {
      eventId,
      transactionId: event.transaction_id,
      source,
    },
  })

  return deliverWebhookEvent(eventId, "replay")
}

export async function cancelWebhookEvent(eventId: string, reason: string) {
  const sql = getSql()
  await sql`
    UPDATE webhook_events
    SET delivery_status = 'canceled',
        canceled_at = NOW(),
        next_retry_at = NULL,
        latest_error = ${reason},
        updated_at = NOW()
    WHERE id = ${eventId}
  `
}

export async function listWebhookEventsForTransaction(transactionId: string) {
  const sql = getSql()
  const eventRows = (await sql`
    SELECT
      id,
      event_name,
      delivery_status,
      created_at,
      delivered_at,
      next_retry_at,
      attempt_count,
      latest_http_status,
      latest_error,
      last_delivery_id,
      source,
      trigger_origin
    FROM webhook_events
    WHERE transaction_id = ${transactionId}
    ORDER BY created_at DESC
  `) as unknown as EventSummaryRow[]

  const deliveryRows = (await sql`
    SELECT
      id,
      event_id,
      attempt_number,
      trigger_origin,
      final_status,
      http_status,
      response_body_snippet,
      error_message,
      next_retry_at,
      delivered_at,
      created_at
    FROM webhook_deliveries
    WHERE transaction_id = ${transactionId}
    ORDER BY created_at DESC
  `) as unknown as DeliverySummaryRow[]

  return eventRows.map((event) => ({
    eventId: event.id,
    event: event.event_name,
    deliveryStatus: event.delivery_status,
    createdAt: event.created_at,
    deliveredAt: event.delivered_at,
    nextRetryAt: event.next_retry_at,
    attemptCount: event.attempt_count,
    latestHttpStatus: event.latest_http_status,
    latestError: event.latest_error,
    lastDeliveryId: event.last_delivery_id,
    source: event.source,
    triggerOrigin: event.trigger_origin,
    deliveries: deliveryRows
      .filter((delivery) => delivery.event_id === event.id)
      .map((delivery) => ({
        deliveryId: delivery.id,
        attemptNumber: delivery.attempt_number,
        triggerOrigin: delivery.trigger_origin,
        finalStatus: delivery.final_status,
        httpStatus: delivery.http_status,
        responseSnippet: delivery.response_body_snippet,
        errorMessage: delivery.error_message,
        nextRetryAt: delivery.next_retry_at,
        deliveredAt: delivery.delivered_at,
        createdAt: delivery.created_at,
      })),
  }))
}
