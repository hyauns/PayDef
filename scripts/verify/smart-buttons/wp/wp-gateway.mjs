// Local stand-in for PayDef, used to test the WooCommerce plugin's Smart Buttons
// against PayPal SANDBOX in a WordPress Playground shop — no PayDef DB, no
// production. Everything money- or page-related runs the REAL lib/ code:
//   lib/paypal.ts          createPayPalOrder (GET_FROM_FILE / SET_PROVIDED_ADDRESS), patchOrderAmount, capture
//   lib/express-amount.ts  the order-amount checks
//   lib/button-sessions.ts decideSessionPage;  lib/smart-buttons.ts the iframe pages, payerFromPayPal
//   lib/shipping-address.ts buildPayPalShipping
// Only the database is an in-memory Map.
//
// Endpoints (same contract as PayDef):
//   GET  /api/gateway/auth-check
//   POST /api/gateway/button-session         → { enabled, sessionId, embedUrl, embedOrigin, expiresAt }
//   POST /api/gateway/checkout               (buttonSessionId / express) → { …, paypalOrderId }
//   POST /api/gateway/order-amount           → PATCH the PayPal total
//   GET  /checkout/buttons?session= | ?ref=
//   POST /api/gateway/execute                → capture + signed webhook (payer + shipping_address)
//   GET  /api/gateway/browser-status/:id, GET /api/gateway/transactions/:id
//
// Run from the repo root (PowerShell, sandbox app credentials in the env only):
//   $env:PP_SANDBOX_CLIENT_ID = "..."; $env:PP_SANDBOX_SECRET = "..."
//   node --experimental-strip-types --import ./scripts/verify/smart-buttons/alias-hook.mjs scripts/verify/smart-buttons/wp/wp-gateway.mjs
//
// Test values must match setup.php (gateway settings in WooCommerce).
import http from "node:http"
import { createHmac, randomUUID } from "node:crypto"

const ROOT = new URL("../../../../", import.meta.url) // repo root
const pp = await import(new URL("lib/paypal.ts", ROOT).href)
const sb = await import(new URL("lib/smart-buttons.ts", ROOT).href)
const bs = await import(new URL("lib/button-sessions.ts", ROOT).href)
const { updateExpressAmount } = await import(new URL("lib/express-amount.ts", ROOT).href)
const { buildPayPalShipping } = await import(new URL("lib/shipping-address.ts", ROOT).href)

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
const ORIGINS = sb.frameAncestorOrigins([SUCCESS_URL, CANCEL_URL])

const sessions = new Map()
const txs = new Map()
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }
const html = (res, status, body, origins) => {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": sb.frameAncestorsCsp(origins) })
  res.end(body)
}
const readBody = (req) => new Promise((resolve) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => resolve(raw)) })
const authed = (req) => req.headers["x-store-id"] === STORE_ID && req.headers["x-api-key"] === API_KEY

async function sendWebhook(tx, event, extra) {
  const body = JSON.stringify({ event, event_id: randomUUID(), transaction_id: tx.id, status: tx.status, paypal_order_id: tx.paypalOrderId, amount: tx.amount, currency: tx.currency, ...extra })
  const ts = String(Date.now())
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex")
  const r = await fetch(`${WP}/wc-api/paydef_webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": `sha256=${sig}`, "x-webhook-timestamp": ts, "x-webhook-event": event },
    body,
  })
  log(`webhook ${event} → ${r.status} ${(await r.text()).slice(0, 100)}`)
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, GATEWAY)
  try {
    if (u.pathname === "/api/gateway/auth-check") {
      return authed(req) ? json(res, 200, { ok: true, store: STORE_ID }) : json(res, 401, { error: "Invalid API key." })
    }

    if (u.pathname === "/api/gateway/button-session" && req.method === "POST") {
      if (!authed(req)) return json(res, 401, { error: "Invalid API key." })
      const body = JSON.parse(await readBody(req))
      if (!bs.isButtonContext(body.context)) return json(res, 400, { error: "bad context" })
      const id = randomUUID()
      const expires = new Date(Date.now() + 30 * 60e3)
      sessions.set(id, { id, context: body.context, amount: Number(body.amount).toFixed(2), currency: (body.currency || "USD").toUpperCase(), expires })
      const embedUrl = `${GATEWAY}/checkout/buttons?session=${id}`
      log(`button-session ${body.context} ${Number(body.amount).toFixed(2)} → ${id}`)
      return json(res, 200, { enabled: true, sessionId: id, embedUrl, embedOrigin: GATEWAY, expiresAt: expires.toISOString() })
    }

    if (u.pathname === "/api/gateway/checkout" && req.method === "POST") {
      if (!authed(req)) return json(res, 401, { error: "Invalid API key." })
      const body = JSON.parse(await readBody(req))
      const session = body.buttonSessionId ? sessions.get(body.buttonSessionId) : null
      if (body.buttonSessionId && (!session || session.expires <= new Date())) {
        return json(res, 409, { error: "Button session is invalid or expired.", code: "button_session_invalid" })
      }
      const express = bs.isExpressCheckout(body, session)
      const id = randomUUID()
      const amount = Number(body.amount).toFixed(2)
      const currency = body.currency || "USD"
      const shipping = express ? null : buildPayPalShipping(body.shippingAddress)
      log(`checkout #${body.orderId} ${amount} ${currency} session=${session ? session.context : "-"} express=${express} address=${shipping ? "SET_PROVIDED_ADDRESS" : express ? "GET_FROM_FILE" : "NO_SHIPPING"}`)
      const order = await pp.createPayPalOrder({
        clientId, clientSecret, amount, currencyCode: currency, intent: "CAPTURE",
        items: [{ name: `#${body.orderId} Smart Buttons test`, quantity: "1", unitAmount: { currencyCode: currency, value: amount } }],
        skipRandomization: true,
        returnUrl: `${GATEWAY}/order/success?ref=${id}`,
        cancelUrl: `${GATEWAY}/order/cancel?ref=${id}`,
        customId: id,
        shipping: shipping ?? undefined,
        shippingPreference: express ? "GET_FROM_FILE" : undefined,
      })
      txs.set(id, { id, status: "PENDING", paypalOrderId: order.id, amount, currency, express, expressItemTotal: express ? amount : null, orderId: body.orderId })
      const embedUrl = session ? null : `${GATEWAY}/checkout/buttons?ref=${id}`
      return json(res, 201, {
        transactionId: id, executeToken: null, approvalUrl: pp.getApprovalUrl(order), flow: "SMART_BUTTONS",
        popupUrl: null, popupOrigin: null, embedUrl, embedOrigin: embedUrl ? GATEWAY : null,
        paypalOrderId: order.id, intent: "CAPTURE", status: "PENDING",
      })
    }

    if (u.pathname === "/api/gateway/order-amount" && req.method === "POST") {
      if (!authed(req)) return json(res, 401, { error: "Invalid API key." })
      const body = JSON.parse(await readBody(req))
      const result = await updateExpressAmount(
        {
          loadTx: async (id) => {
            const tx = txs.get(id)
            return tx && { id: tx.id, status: tx.status, express: tx.express, express_item_total: tx.expressItemTotal, paypal_order_id: tx.paypalOrderId, original_currency: tx.currency, client_id: clientId, client_secret: clientSecret, proxy_url: null }
          },
          patch: (row, a) => pp.patchOrderAmount({ clientId, clientSecret, orderId: row.paypal_order_id, currency: a.currency, itemTotal: a.itemTotal, shipping: a.shipping, taxTotal: a.taxTotal }),
          saveAmount: async (id, total) => { txs.get(id).amount = total },
        },
        { transactionId: body.transactionId, storeId: STORE_ID, shipping: body.shipping, taxTotal: body.taxTotal, total: body.total }
      )
      log(`order-amount tx ${body.transactionId} shipping=${body.shipping} tax=${body.taxTotal} total=${body.total} → ${result.ok ? "OK " + result.amount : result.code + (result.expected ? " expected " + result.expected : "")}`)
      return result.ok ? json(res, 200, { ok: true, amount: result.amount }) : json(res, result.status, { error: result.code, code: result.code, expected: result.expected })
    }

    if (u.pathname === "/checkout/buttons") {
      const sid = u.searchParams.get("session")
      if (sid !== null) {
        const s = sessions.get(sid)
        const row = s && { id: s.id, store_id: STORE_ID, merchant_account_id: "acct", shield_domain: null, context: s.context, amount: s.amount, currency: s.currency, intent: "CAPTURE", allowed_origins: ORIGINS, expires_at: s.expires, client_id: clientId }
        const d = bs.decideSessionPage({ row: row || null, tokenShouldBlock: false, now: new Date() })
        return d.kind === "render"
          ? html(res, 200, sb.renderSessionButtonsPage(d.config, d.allowedOrigins), d.allowedOrigins)
          : html(res, d.status, sb.renderButtonsErrorPage(d.code, d.allowedOrigins), d.allowedOrigins)
      }
      const tx = txs.get(u.searchParams.get("ref") || "")
      const row = tx && { id: tx.id, status: tx.status, intent: "CAPTURE", original_currency: tx.currency, paypal_order_id: tx.paypalOrderId, checkout_expires_at: new Date(Date.now() + 30 * 60e3).toISOString(), merchant_success_url: SUCCESS_URL, merchant_cancel_url: CANCEL_URL, client_id: clientId }
      const d = sb.decideButtonPage({ row: row || null, executeToken: null, tokenShouldBlock: false, now: new Date() })
      const page = d.kind === "render" ? sb.renderButtonsPage(d.config, d.allowedOrigins)
        : d.kind === "finished" ? sb.renderButtonsFinishedPage(d.result, d.allowedOrigins, tx.id)
        : sb.renderButtonsErrorPage(d.code, d.allowedOrigins)
      return html(res, d.kind === "render" ? 200 : d.status, page, d.allowedOrigins)
    }

    if (u.pathname === "/api/gateway/execute" && req.method === "POST") {
      const { transactionId } = JSON.parse(await readBody(req))
      const tx = txs.get(transactionId)
      if (!tx) return json(res, 404, { error: "Transaction not found." })
      if (tx.status === "PENDING") {
        const r = await pp.captureApprovedOrder({ clientId, clientSecret, orderId: tx.paypalOrderId })
        tx.status = r.status === "COMPLETED" ? "COMPLETED" : "FAILED"
        const payer = sb.payerFromPayPal(r)
        tx.payer = payer
        const captured = r.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value
        log(`capture tx ${tx.id} → ${r.status} captured=${captured} payer=${payer.payerEmail} shipping=${JSON.stringify(payer.shippingAddress)}`)
        if (tx.status === "COMPLETED") {
          await sendWebhook(tx, "payment.capture.completed", {
            paypal_capture_id: r.id,
            payer_email: payer.payerEmail ?? undefined,
            buyer_name: payer.payerName ?? undefined,
            shipping_address: payer.shippingAddress ?? undefined,
          })
        }
      }
      return json(res, 200, { status: tx.status, transaction_id: tx.id })
    }

    if (u.pathname.startsWith("/api/gateway/browser-status/")) {
      const tx = txs.get(u.pathname.split("/").pop())
      if (!tx) return json(res, 404, { error: "Transaction not found." })
      return json(res, 200, { transaction_id: tx.id, status: tx.status, paypal_order_id: tx.paypalOrderId, merchant_success_url: SUCCESS_URL, merchant_cancel_url: CANCEL_URL })
    }

    if (u.pathname.startsWith("/api/gateway/transactions/")) {
      if (!authed(req)) return json(res, 401, { error: "Invalid API key." })
      const tx = txs.get(u.pathname.split("/").pop())
      if (!tx) return json(res, 404, { error: "Transaction not found." })
      return json(res, 200, {
        transaction_id: tx.id, current_status: tx.status, amount: tx.amount, currency: tx.currency, paypal_order_id: tx.paypalOrderId,
        payer_email: tx.payer?.payerEmail ?? null, payer_name: tx.payer?.payerName ?? null, shipping_address: tx.payer?.shippingAddress ?? null,
      })
    }

    json(res, 404, { error: "not found" })
  } catch (e) {
    log("gateway error:", e && e.message)
    json(res, 500, { error: String(e && e.message) })
  }
}).listen(4200, () => log(`fake PayDef gateway ${GATEWAY} (WordPress expected at ${WP})`))
