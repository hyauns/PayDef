/**
 * lib/smart-buttons.ts — PayPal Smart Payment Buttons framed from the shield
 * domain (stores.checkout_flow = SMART_BUTTONS).
 *
 * The merchant still calls /api/gateway/checkout with the final amount, so
 * account rotation, limits, masking and the PayPal order are produced exactly
 * as for REDIRECT. Only the approval step moves: instead of leaving for
 * approvalUrl, the storefront frames embedUrl, which renders PayPal's own
 * buttons with the client-id of the account that already owns the order.
 *
 * Pure functions only. The DB read lives in app/checkout/buttons/route.ts.
 */

import { resolveShieldBaseUrl } from "@/lib/masking"
import type { SessionPageConfig } from "@/lib/button-sessions"
import type { PayPalPayer, PayPalShippingDetail } from "@/lib/paypal"

/**
 * Payer and full shipping address from a capture / authorize response. Express
 * Smart Buttons orders have no address until PayPal returns one here; it is
 * stored on the transaction and sent to the store in the webhook.
 */
export function payerFromPayPal(result: {
  payer?: PayPalPayer
  purchase_units?: Array<{ shipping?: PayPalShippingDetail }>
}): { payerEmail: string | null; payerName: string | null; shippingAddress: PayPalShippingDetail | null } {
  const email = result.payer?.email_address?.trim() || null
  const name = [result.payer?.name?.given_name, result.payer?.name?.surname]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ")
  return {
    payerEmail:      email,
    payerName:       name || null,
    shippingAddress: result.purchase_units?.[0]?.shipping ?? null,
  }
}

export const BUTTONS_PATH = "/checkout/buttons"
export const MESSAGE_SOURCE = "paydef-buttons"

// PayPal requires an integration date whenever client-id changes dynamically
// (here: per rotated merchant account). Pin it; do not make it "today".
export const SDK_INTEGRATION_DATE = "2026-10-08"

export function buildSmartButtonsUrl(
  shieldDomain: string | null | undefined,
  transactionId: string,
  executeToken: string | null
): string {
  const params = new URLSearchParams({ ref: transactionId })
  if (executeToken) params.set("et", executeToken)
  return `${resolveShieldBaseUrl(shieldDomain)}${BUTTONS_PATH}?${params.toString()}`
}

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"])

/**
 * Origins allowed to frame the buttons page: the merchant's own return URLs.
 * https only, except plain-http local dev hosts.
 */
export function frameAncestorOrigins(urls: Array<string | null | undefined>): string[] {
  const origins = new Set<string>()
  for (const raw of urls) {
    if (!raw) continue
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    const allowed =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOCAL_DEV_HOSTS.has(url.hostname))
    if (allowed) origins.add(url.origin)
  }
  return [...origins]
}

export function frameAncestorsCsp(origins: string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(" ") : "'none'"}`
}

export function toSdkIntent(intent: string | null | undefined): "capture" | "authorize" {
  return intent === "AUTHORIZE" ? "authorize" : "capture"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isTransactionRef(ref: unknown): ref is string {
  return typeof ref === "string" && UUID_RE.test(ref)
}

export interface ButtonSessionRow {
  id:                   string
  status:               string
  intent:               string | null
  original_currency:    string | null
  paypal_order_id:      string | null
  checkout_expires_at:  string | Date | null
  merchant_success_url: string | null
  merchant_cancel_url:  string | null
  client_id:            string
}

export interface ButtonPageConfig {
  transactionId: string
  executeToken:  string | null
  paypalOrderId: string
  clientId:      string
  currency:      string
  intent:        "capture" | "authorize"
  successUrl:    string | null
  cancelUrl:     string | null
}

export type ButtonErrorCode =
  | "invalid_ref"
  | "not_found"
  | "invalid_token"
  | "no_paypal_order"
  | "framing_not_configured"
  | "expired"          // session pages: the button session ran out (re-render the shop page)

// A transaction that is no longer payable (paid, failed, swept or simply past
// checkout_expires_at). The parent gets the real outcome and where to send the
// buyer, never an "error" — the documented fallback for "error" is PayPal's
// approvalUrl, which is wrong for an order that is already finished.
export interface ButtonFinishedResult {
  type:        "approved" | "failed"
  status:      string
  redirectUrl: string | null
}

export type ButtonPageDecision =
  | { kind: "render"; config: ButtonPageConfig; allowedOrigins: string[] }
  | { kind: "finished"; status: number; result: ButtonFinishedResult; allowedOrigins: string[] }
  | { kind: "error"; status: number; code: ButtonErrorCode; allowedOrigins: string[] }

const SUCCESS_STATUSES = new Set(["AUTHORIZED", "COMPLETED"])

/** Merchant return URL with the same query the shield success page appends. http(s) only. */
export function buildMerchantReturnUrl(
  base: string | null | undefined,
  params: { transactionId: string; status: string; paypalOrderId: string | null }
): string | null {
  if (!base) return null
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  url.searchParams.set("transaction_id", params.transactionId)
  url.searchParams.set("status", params.status)
  if (params.paypalOrderId) url.searchParams.set("paypal_order_id", params.paypalOrderId)
  return url.toString()
}

// Return URLs become a target="_top" href and a top-level redirect, so only
// http(s) may reach the page (store URLs are not scheme-validated on save).
function httpUrlOrNull(value: string | null): string | null {
  if (!value) return null
  try {
    const { protocol } = new URL(value)
    return protocol === "https:" || protocol === "http:" ? value : null
  } catch {
    return null
  }
}

function finishedResult(row: ButtonSessionRow, status: string): ButtonFinishedResult {
  const type = SUCCESS_STATUSES.has(status) ? "approved" : "failed"
  return {
    type,
    status,
    redirectUrl: buildMerchantReturnUrl(
      type === "approved" ? row.merchant_success_url : row.merchant_cancel_url,
      { transactionId: row.id, status, paypalOrderId: row.paypal_order_id }
    ),
  }
}

export function decideButtonPage(input: {
  row: ButtonSessionRow | null
  executeToken: string | null
  tokenShouldBlock: boolean
  now: Date
}): ButtonPageDecision {
  const { row } = input
  if (!row) return { kind: "error", status: 404, code: "not_found", allowedOrigins: [] }

  const allowedOrigins = frameAncestorOrigins([row.merchant_success_url, row.merchant_cancel_url])
  const fail = (status: number, code: ButtonErrorCode): ButtonPageDecision =>
    ({ kind: "error", status, code, allowedOrigins })

  if (input.tokenShouldBlock) return fail(403, "invalid_token")
  if (row.status !== "PENDING") {
    return { kind: "finished", status: 409, result: finishedResult(row, row.status), allowedOrigins }
  }
  if (row.checkout_expires_at && new Date(row.checkout_expires_at).getTime() <= input.now.getTime()) {
    // Past its window but not yet swept: report it as the sweep will record it.
    return { kind: "finished", status: 410, result: finishedResult(row, "EXPIRED"), allowedOrigins }
  }
  if (!row.paypal_order_id) return fail(409, "no_paypal_order")
  if (allowedOrigins.length === 0) return fail(409, "framing_not_configured")

  return {
    kind: "render",
    allowedOrigins,
    config: {
      transactionId: row.id,
      executeToken:  input.executeToken,
      paypalOrderId: row.paypal_order_id,
      clientId:      row.client_id.trim(),
      currency:      (row.original_currency || "USD").toUpperCase(),
      intent:        toSdkIntent(row.intent),
      successUrl:    httpUrlOrNull(row.merchant_success_url),
      cancelUrl:     httpUrlOrNull(row.merchant_cancel_url),
    },
  }
}

// ─── HTML rendering ───────────────────────────────────────────────────────────

export function buildSdkUrl(c: Pick<ButtonPageConfig, "clientId" | "currency" | "intent">): string {
  const params = new URLSearchParams({
    "client-id":        c.clientId,
    currency:           c.currency,
    intent:             c.intent,
    components:         "buttons",
    "integration-date": SDK_INTEGRATION_DATE,
  })
  return `https://www.paypal.com/sdk/js?${params.toString()}`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// JSON that is safe inside an inline <script>: no "</script>", no HTML comment
// openers, no JS line terminators.
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

const PAGE_STYLE =
  "html,body{margin:0;padding:0;background:transparent;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#333}" +
  "#paydef-status{margin:6px 2px 0;min-height:1em;font-size:13px;color:#555}" +
  "#paydef-continue{display:inline-block;margin-top:8px}" +
  // The id rule above would otherwise override the hidden attribute and show
  // an empty Continue link before payment.
  "#paydef-continue[hidden]{display:none}"

// Shared by both pages: posts to every allowed origin explicitly (never "*");
// the browser silently drops the ones that are not the parent.
const POST_FN = `
  function post(msg) {
    msg.source = ${scriptJson(MESSAGE_SOURCE)};
    msg.transactionId = CFG.transactionId;
    for (var i = 0; i < ORIGINS.length; i++) {
      try { window.parent.postMessage(msg, ORIGINS[i]); } catch (e) {}
    }
  }`

// Runtime shared by both page modes. Expects CFG and ORIGINS in scope:
// CFG.transactionId / CFG.executeToken are fixed for a transaction page and
// assigned once the shop has created the order on a session page. Return
// URLs come from CFG or, failing that, from browser-status.
const RUNTIME_JS = `
  var SUCCESS = ["AUTHORIZED", "COMPLETED"];
  var FAILURE = ["FAILED", "REFUNDED", "DISPUTED", "CANCELED", "EXPIRED"];
  var statusEl = document.getElementById("paydef-status");
  var busy = false;
${POST_FN}
  function say(text) { statusEl.textContent = text; }
  function returnUrl(base, s) {
    if (!base) return null;
    try {
      var u = new URL(base);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      u.searchParams.set("transaction_id", s.transaction_id);
      u.searchParams.set("status", s.status);
      if (s.paypal_order_id) u.searchParams.set("paypal_order_id", s.paypal_order_id);
      return u.toString();
    } catch (e) { return null; }
  }
  function showContinue(url) {
    if (!url) return;
    var a = document.getElementById("paydef-continue");
    a.href = url;
    a.hidden = false;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function finalStatus() {
    for (var i = 0; i < 20; i++) {
      try {
        var r = await fetch("/api/gateway/browser-status/" + encodeURIComponent(CFG.transactionId), { cache: "no-store" });
        var s = await r.json();
        if (r.ok && (SUCCESS.indexOf(s.status) >= 0 || FAILURE.indexOf(s.status) >= 0)) return s;
      } catch (e) {}
      await sleep(1500);
    }
    return null;
  }
  async function execute() {
    say("Confirming payment\\u2026");
    try {
      await fetch("/api/gateway/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ transactionId: CFG.transactionId, executeToken: CFG.executeToken || undefined })
      });
    } catch (e) {}
    var s = await finalStatus();
    // The order is spent either way; a second approval could only error out.
    document.getElementById("paydef-buttons").style.display = "none";
    if (!s) { say("Payment is still processing."); post({ type: "pending" }); return; }
    var ok = SUCCESS.indexOf(s.status) >= 0;
    var url = returnUrl(ok ? (CFG.successUrl || s.merchant_success_url) : (CFG.cancelUrl || s.merchant_cancel_url), s);
    say(ok ? "Payment confirmed." : "Payment was not completed.");
    showContinue(url);
    post({ type: ok ? "approved" : "failed", status: s.status, redirectUrl: url });
  }
`

export function renderButtonsPage(config: ButtonPageConfig, allowedOrigins: string[]): string {
  const sdkSrc = escapeAttr(buildSdkUrl(config))
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div id="paydef-buttons"></div>
<p id="paydef-status" role="status"></p>
<a id="paydef-continue" target="_top" hidden>Continue</a>
<script src="${sdkSrc}"></script>
<script>
(function () {
  var CFG = ${scriptJson(config)};
  var ORIGINS = ${scriptJson(allowedOrigins)};
${RUNTIME_JS}

  if (!window.paypal || !window.paypal.Buttons) {
    say("PayPal could not be loaded.");
    post({ type: "error", code: "sdk_load_failed" });
    return;
  }

  window.paypal.Buttons({
    // The order already exists (created by /api/gateway/checkout on this exact
    // account), so the button just hands PayPal its id.
    createOrder: function () { return CFG.paypalOrderId; },
    onApprove: function () {
      if (busy) return;
      busy = true;
      return execute();
    },
    // Deliberately NOT the cancel endpoint: the buyer may click again and
    // PayPal reuses the same order. Expiry is the 30-minute sweep's job.
    onCancel: function () { post({ type: "cancelled" }); },
    onError: function (err) {
      say("PayPal reported an error.");
      post({ type: "error", code: "paypal_error", message: String((err && err.message) || err).slice(0, 200) });
    }
  }).render("#paydef-buttons").then(function () {
    post({ type: "ready" });
  }).catch(function () {
    post({ type: "error", code: "render_failed" });
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      post({ type: "resize", height: document.documentElement.scrollHeight });
    }).observe(document.body);
  }
})();
</script>
</body>
</html>`
}

/**
 * Session page: buttons rendered BEFORE the order exists (checkout, cart and
 * product pages). PayPal's callbacks are relayed to the shop page, which owns
 * the WooCommerce order:
 *   createOrder               → "create-order"    ⇄ "order-created" | "order-failed"
 *   onShippingAddressChange   → "shipping-change" ⇄ "shipping-updated" | "shipping-rejected"
 *     (express sessions only — on the checkout page the buyer typed the address)
 * Replies are accepted only from the session's allowed (shop) origins.
 */
export function renderSessionButtonsPage(config: SessionPageConfig, allowedOrigins: string[]): string {
  const sdkSrc = escapeAttr(buildSdkUrl(config))
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div id="paydef-buttons"></div>
<p id="paydef-status" role="status"></p>
<a id="paydef-continue" target="_top" hidden>Continue</a>
<script src="${sdkSrc}"></script>
<script>
(function () {
  var SESSION = ${scriptJson(config)};
  var CFG = { transactionId: null, executeToken: null, successUrl: null, cancelUrl: null };
  var ORIGINS = ${scriptJson(allowedOrigins)};
${RUNTIME_JS}
  var seq = 0;
  var waiting = {};
  function ask(msg, timeoutMs) {
    var id = String(++seq) + "-" + Date.now();
    msg.requestId = id;
    return new Promise(function (resolve, reject) {
      waiting[id] = resolve;
      setTimeout(function () {
        if (waiting[id]) { delete waiting[id]; reject(new Error("timeout")); }
      }, timeoutMs);
      post(msg);
    });
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (ORIGINS.indexOf(e.origin) < 0 || !m || m.source !== "paydef-shop" || !waiting[m.requestId]) return;
    var resolve = waiting[m.requestId];
    delete waiting[m.requestId];
    resolve(m);
  });

  if (!window.paypal || !window.paypal.Buttons) {
    say("PayPal could not be loaded.");
    post({ type: "error", code: "sdk_load_failed" });
    return;
  }

  // Set when the shop refused the order (e.g. an incomplete checkout form). PayPal
  // reports that rejected createOrder through onError, but it is not a PayPal
  // failure: the shop already shows its notices and the buttons must stay.
  var refused = false;

  var options = {
    // The shop creates its order and asks PayDef for the PayPal order on the
    // account pinned by this session; we just hand the id to PayPal.
    createOrder: function () {
      refused = false;
      return ask({ type: "create-order" }, 60000).then(function (m) {
        if (m.type !== "order-created" || !m.paypalOrderId) {
          refused = m.type === "order-failed";
          throw new Error(m.message || "order_failed");
        }
        CFG.transactionId = m.transactionId;
        CFG.executeToken = m.executeToken || null;
        return m.paypalOrderId;
      });
    },
    onApprove: function () {
      if (busy) return;
      busy = true;
      return execute();
    },
    onCancel: function () { post({ type: "cancelled" }); },
    onError: function (err) {
      if (refused) { refused = false; return; }
      say("PayPal reported an error.");
      post({ type: "error", code: "paypal_error", message: String((err && err.message) || err).slice(0, 200) });
    }
  };

  if (SESSION.express) {
    // Cart / product page: the shop prices shipping for the address the buyer
    // picks in PayPal and PayDef updates the order total — or the shop rejects it.
    options.onShippingAddressChange = function (data, actions) {
      return ask({ type: "shipping-change", address: data.shippingAddress }, 20000).then(function (m) {
        if (m.type !== "shipping-updated") return actions.reject(data.errors[m.reason] || data.errors.ADDRESS_ERROR);
      }, function () {
        return actions.reject(data.errors.ADDRESS_ERROR);
      });
    };
  }

  window.paypal.Buttons(options).render("#paydef-buttons").then(function () {
    post({ type: "ready" });
  }).catch(function () {
    post({ type: "error", code: "render_failed" });
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      post({ type: "resize", height: document.documentElement.scrollHeight });
    }).observe(document.body);
  }
})();
</script>
</body>
</html>`
}

export function renderButtonsFinishedPage(
  result: ButtonFinishedResult,
  allowedOrigins: string[],
  transactionId: string | null = null
): string {
  const text = result.type === "approved" ? "Payment confirmed." : "Payment was not completed."
  const link = result.redirectUrl
    ? `<a id="paydef-continue" target="_top" href="${escapeAttr(result.redirectUrl)}">Continue</a>`
    : ""
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<p id="paydef-status" role="status">${text}</p>
${link}
<script>
(function () {
  var CFG = ${scriptJson({ transactionId })};
  var ORIGINS = ${scriptJson(allowedOrigins)};
${POST_FN}
  post(${scriptJson(result)});
})();
</script>
</body>
</html>`
}

export function renderButtonsErrorPage(code: ButtonErrorCode, allowedOrigins: string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<p id="paydef-status" role="status">This checkout session is no longer available.</p>
<script>
(function () {
  var CFG = { transactionId: null };
  var ORIGINS = ${scriptJson(allowedOrigins)};
${POST_FN}
  post({ type: "error", code: ${scriptJson(code)} });
})();
</script>
</body>
</html>`
}
