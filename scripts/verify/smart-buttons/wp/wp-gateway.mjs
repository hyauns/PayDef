// Local stand-in for PayDef, used to test the WooCommerce plugin's Smart Buttons
// flow against PayPal SANDBOX in a WordPress Playground site — no PayDef DB, no
// production. It speaks the same contract the plugin uses:
//   GET  /api/gateway/auth-check            (plugin "Test connection")
//   POST /api/gateway/checkout              → { transactionId, approvalUrl, flow, embedUrl, embedOrigin }
//   GET  /checkout/buttons?ref=             (real lib/smart-buttons.ts page + CSP)
//   POST /api/gateway/execute               (real lib/paypal.ts capture, then the signed
//                                            payment.capture.completed webhook to WordPress)
//   GET  /api/gateway/browser-status/:id
//
// Run from the repo root (PowerShell, sandbox app credentials in the env only):
//   $env:PP_SANDBOX_CLIENT_ID = "..."; $env:PP_SANDBOX_SECRET = "..."
//   node --experimental-strip-types --import ./scripts/verify/smart-buttons/alias-hook.mjs scripts/verify/smart-buttons/wp/wp-gateway.mjs
//
// Test values below must match blueprint.json (gateway settings in WooCommerce).
import http from "node:http"
import { createHmac, randomUUID } from "node:crypto"

const ROOT = new URL("../../../../", import.meta.url) // repo root
const pp = await import(new URL("lib/paypal.ts", ROOT).href)
const sb = await import(new URL("lib/smart-buttons.ts", ROOT).href)

if (process.env.PAYPAL_ENV === "live") throw new Error("Refusing to run against live PayPal")
const clientId = process.env.PP_SANDBOX_CLIENT_ID
const clientSecret = process.env.PP_SANDBOX_SECRET
if (!clientId || !clientSecret) throw new Error("Set PP_SANDBOX_CLIENT_ID and PP_SANDBOX_SECRET")

const STORE_ID = "local-test-store"
const API_KEY = "local-test-key"
const WEBHOOK_SECRET = "local-test-webhook-secret"
const WP = "http://127.0.0.1:9400"
// localhost (not 127.0.0.1) so the framed page is cross-site from the shop, like production.
const GATEWAY = "http://localhost:4200"
const SUCCESS_URL = `${WP}/checkout/order-received/`
const CANCEL_URL = `${WP}/checkout/`

const txs = new Map()

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => resolve(raw))
  })
const authed = (req) => req.headers["x-store-id"] === STORE_ID && req.headers["x-api-key"] === API_KEY

async function sendWebhook(tx, event, extra) {
  const body = JSON.stringify({
    event,
    event_id: randomUUID(),
    transaction_id: tx.id,
    status: tx.status,
    paypal_order_id: tx.paypalOrderId,
    amount: tx.amount,
    currency: tx.currency,
    ...extra,
  })
  const ts = String(Date.now())
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex")
  const r = await fetch(`${WP}/wc-api/paydef_webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": `sha256=${sig}`,
      "x-webhook-timestamp": ts,
      "x-webhook-event": event,
    },
    body,
  })
  console.log(`webhook ${event} → ${r.status} ${(await r.text()).slice(0, 120)}`)
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, GATEWAY)
    try {
      if (u.pathname === "/api/gateway/auth-check") {
        return authed(req) ? json(res, 200, { ok: true, store: STORE_ID }) : json(res, 401, { error: "Invalid API key." })
      }

      if (u.pathname === "/api/gateway/checkout" && req.method === "POST") {
        if (!authed(req)) return json(res, 401, { error: "Invalid API key." })
        const body = JSON.parse(await readBody(req))
        const id = randomUUID()
        const amount = Number(body.amount).toFixed(2)
        const currency = body.currency || "USD"
        const order = await pp.createPayPalOrder({
          clientId, clientSecret, amount, currencyCode: currency, intent: "CAPTURE",
          items: [{ name: `#${body.orderId} Smart Buttons test`, quantity: "1", unitAmount: { currencyCode: currency, value: amount } }],
          returnUrl: `${GATEWAY}/order/success?ref=${id}`,
          cancelUrl: `${GATEWAY}/order/cancel?ref=${id}`,
          customId: id,
        })
        const tx = { id, status: "PENDING", paypalOrderId: order.id, amount, currency, orderId: body.orderId }
        txs.set(id, tx)
        const embedUrl = `${GATEWAY}/checkout/buttons?ref=${id}`
        console.log(`checkout WC order #${body.orderId} → tx ${id} PayPal ${order.id} ${amount} ${currency}`)
        return json(res, 201, {
          transactionId: id,
          approvalUrl: pp.getApprovalUrl(order),
          flow: "SMART_BUTTONS",
          popupUrl: null,
          popupOrigin: null,
          embedUrl,
          embedOrigin: new URL(embedUrl).origin,
          intent: "CAPTURE",
          status: "PENDING",
        })
      }

      if (u.pathname === "/checkout/buttons") {
        const tx = txs.get(u.searchParams.get("ref") || "")
        const row = tx && {
          id: tx.id, status: tx.status, intent: "CAPTURE", original_currency: tx.currency,
          paypal_order_id: tx.paypalOrderId,
          checkout_expires_at: new Date(Date.now() + 30 * 60e3).toISOString(),
          merchant_success_url: SUCCESS_URL, merchant_cancel_url: CANCEL_URL, client_id: clientId,
        }
        const d = sb.decideButtonPage({ row: row || null, executeToken: null, tokenShouldBlock: false, now: new Date() })
        const html = d.kind === "render" ? sb.renderButtonsPage(d.config, d.allowedOrigins)
          : d.kind === "finished" ? sb.renderButtonsFinishedPage(d.result, d.allowedOrigins, tx.id)
          : sb.renderButtonsErrorPage(d.code, d.allowedOrigins)
        res.writeHead(d.kind === "render" ? 200 : d.status, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": sb.frameAncestorsCsp(d.allowedOrigins),
        })
        return res.end(html)
      }

      if (u.pathname === "/api/gateway/execute" && req.method === "POST") {
        const { transactionId } = JSON.parse(await readBody(req))
        const tx = txs.get(transactionId)
        if (!tx) return json(res, 404, { error: "Transaction not found." })
        if (tx.status === "PENDING") {
          const r = await pp.captureApprovedOrder({ clientId, clientSecret, orderId: tx.paypalOrderId })
          tx.status = r.status === "COMPLETED" ? "COMPLETED" : "FAILED"
          console.log(`capture tx ${tx.id} → ${r.status}`)
          if (tx.status === "COMPLETED") await sendWebhook(tx, "payment.capture.completed", { capture_id: r.id })
        }
        return json(res, 200, { status: tx.status, transaction_id: tx.id })
      }

      if (u.pathname.startsWith("/api/gateway/browser-status/")) {
        const tx = txs.get(u.pathname.split("/").pop())
        if (!tx) return json(res, 404, { error: "Transaction not found." })
        return json(res, 200, {
          transaction_id: tx.id, status: tx.status, paypal_order_id: tx.paypalOrderId,
          merchant_success_url: SUCCESS_URL, merchant_cancel_url: CANCEL_URL,
        })
      }

      json(res, 404, { error: "not found" })
    } catch (e) {
      console.error("gateway error:", e && e.message)
      json(res, 500, { error: String(e && e.message) })
    }
  })
  .listen(4200, () => console.log(`fake PayDef gateway ${GATEWAY} (WordPress expected at ${WP})`))
