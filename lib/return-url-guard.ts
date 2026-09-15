/**
 * Resolves the post-payment redirect target for a single transaction.
 *
 * Background: the gateway stores one redirect target per transaction
 * (`transactions.merchant_success_url`) and the shield success page sends the
 * buyer there verbatim, appending only `transaction_id`, `status` and
 * `paypal_order_id`. That target used to come solely from the store-level
 * `stores.success_return_url`, which is static — the same URL for every order.
 *
 * WooCommerce's thank-you URL is not static: it is
 * `/checkout/order-received/<id>/?key=wc_order_...`, and the `key` is a secret
 * WooCommerce generates per order and never shares. Without it WooCommerce
 * refuses to load the order, `woocommerce_thankyou` never fires, and every
 * analytics purchase event hanging off that hook is lost. Accepting a per-order
 * URL is what makes those events fire.
 *
 * Security: `stores.success_return_url` is set by an admin through the
 * dashboard, so it is trusted. A URL arriving in a request body is not — it is
 * attacker-controlled the moment a store API key leaks, and honouring it
 * unchecked would turn the gateway into an open redirect that borrows the
 * shield domain's credibility. So a requested URL is honoured only when it is
 * https and sits on the same host the store already has configured. Anything
 * else silently falls back to the store default: the buyer still lands
 * somewhere correct, and the caller cannot use us to point elsewhere.
 *
 * A store with no configured default gets no per-order URL either. That is
 * deliberate — with no trusted host to pin against there is nothing to check a
 * requested URL for, so the safe answer is to honour none.
 */
export function resolveMerchantReturnUrl(
  requested: string | null | undefined,
  storeDefault: string | null
): string | null {
  if (typeof requested !== "string" || requested.trim() === "") return storeDefault
  // No trusted host to pin against — refuse rather than guess.
  if (!storeDefault) return storeDefault

  let want: URL
  let trusted: URL
  try {
    want = new URL(requested)
    trusted = new URL(storeDefault)
  } catch {
    // Either side unparseable: fall back to whatever the store configured.
    return storeDefault
  }

  // Blocks javascript:, data:, and plain http downgrades in one check.
  if (want.protocol !== "https:") return storeDefault

  // `host` includes the port, so evil.com:8443 cannot pass as evil.com, and a
  // subdomain (pay.shop.com) cannot pass as the configured host (shop.com).
  if (want.host.toLowerCase() !== trusted.host.toLowerCase()) return storeDefault

  return want.toString()
}
