import { getSql } from "@/lib/neon"

/**
 * Records that a merchant webhook event could not be persisted.
 *
 * Why this exists: the gateway routes persist a `webhook_events` row first and
 * let the per-minute recovery cron retry delivery. That design survives a failed
 * *delivery* — but not a failed *persist*. If `persistWebhookEventSafe` throws,
 * no row exists, the sweep has nothing to find, and the route still answers 200
 * because the payment itself genuinely succeeded. The notification is then lost
 * with no trace anywhere.
 *
 * Measured on the Sansuj store on 2026-09-15: 1 of 305 `payment.authorization.created`
 * events hit exactly this path, and the WooCommerce order behind it was cancelled
 * an hour later as "unpaid" while PayPal was holding $767.96.
 *
 * This writes a durable `system_logs` row so the loss is at least visible and
 * queryable:
 *
 *   SELECT * FROM system_logs
 *   WHERE action = 'WEBHOOK_PERSIST_FAILED' ORDER BY created_at DESC;
 *
 * It never throws and never rejects: it is called from inside a catch block on a
 * request whose payment already succeeded, so it must not be able to turn a
 * notification problem into a payment problem.
 */
export interface WebhookPersistFailureInput {
  transactionId: string
  tenantId: string | null
  storeId: string | null
  accountId: string | null
  eventName: string
  targetUrl: string | null
  error: unknown
}

export const WEBHOOK_PERSIST_FAILED_ACTION = "WEBHOOK_PERSIST_FAILED"

export async function recordWebhookPersistFailure(
  input: WebhookPersistFailureInput
): Promise<void> {
  try {
    const message =
      input.error instanceof Error ? input.error.message : String(input.error)

    const sql = getSql()
    await sql`
      INSERT INTO system_logs (action, status, level, tenant_id, store_id, account_id, metadata)
      VALUES (
        ${WEBHOOK_PERSIST_FAILED_ACTION},
        'ERROR',
        'error',
        ${input.tenantId},
        ${input.storeId},
        ${input.accountId},
        ${JSON.stringify({
          transaction_id: input.transactionId,
          event_name: input.eventName,
          target_url: input.targetUrl,
          error: message,
          recorded_at: new Date().toISOString(),
        })}::jsonb
      )
    `
  } catch (loggingError) {
    // Last resort. If even the log write fails there is nothing further to try —
    // swallow it so the caller's success response is never turned into an error.
    console.error(
      `[webhook] Could not record a webhook-persist failure for transaction ${input.transactionId} ` +
      `(event ${input.eventName}). The original failure is lost.`,
      loggingError
    )
  }
}
