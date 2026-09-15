/**
 * How long a PayPal authorization stays alive.
 *
 * PayPal keeps an authorization valid for 29 days from creation. The first 3
 * days are the "honor period", during which a capture is guaranteed to succeed;
 * after that a capture may be declined and the merchant is expected to
 * reauthorize first — but the authorization itself is still live and must not
 * be treated as dead.
 *
 * PayDef used 7 days here, which is neither of those numbers. Because
 * `processExpiredTransactions` (lib/gateway-recovery.ts) flips
 * `status='AUTHORIZED'` rows to `EXPIRED` purely on this clock and never asks
 * PayPal, that shortfall silently killed authorizations roughly 22 days early
 * and emitted a false `payment.authorization.expired` to the merchant.
 *
 * The value is fixed rather than read from PayPal's `expiration_time` field so
 * that a missing or malformed field in a PayPal response can never break the
 * write. 29 days is never longer than PayPal's real window, so erring here can
 * only expire a row slightly early, never keep a dead one alive.
 *
 * PayPal-only: Stripe and Shopify transactions are always `intent='CAPTURE'`
 * and insert `authorization_expires_at = NULL`, so this never applies to them.
 *
 * NOT for reauthorization: `POST /v2/payments/authorizations/{id}/reauthorize`
 * starts a fresh 3-day honor period, which is why the two reauthorize routes
 * deliberately use `INTERVAL '3 days'` instead.
 */
export const PAYPAL_AUTHORIZATION_VALID_DAYS = 29

/**
 * SQL fragment for the `authorization_expires_at` column.
 *
 * Interpolated rather than bound as a parameter because Postgres does not
 * accept a bind parameter inside an INTERVAL literal. The interpolated value is
 * a module-level integer constant, never user input.
 */
export function authorizationExpirySql(): string {
  return `NOW() + INTERVAL '${PAYPAL_AUTHORIZATION_VALID_DAYS} days'`
}
