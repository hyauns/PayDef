// Sandbox e2e for Smart Buttons (plan Task 11). No DB. PAYPAL_ENV must not be "live".
// Run: node --experimental-strip-types --import ./scripts/verify/smart-buttons/alias-hook.mjs scripts/verify/smart-buttons/e2e-server.mjs
// Needs PP_SANDBOX_CLIENT_ID + PP_SANDBOX_SECRET in the environment (never written to disk).
import http from "node:http"
import { randomUUID } from "node:crypto"


const ROOT = new URL("../../../", import.meta.url) // repo root
const pp = await import(new URL("lib/paypal.ts", ROOT).href)
const sb = await import(new URL("lib/smart-buttons.ts", ROOT).href)

if (process.env.PAYPAL_ENV === "live") throw new Error("Refusing to run against live PayPal")
const clientId = process.env.PP_SANDBOX_CLIENT_ID
const clientSecret = process.env.PP_SANDBOX_SECRET
if (!clientId || !clientSecret) throw new Error("Set PP_SANDBOX_CLIENT_ID and PP_SANDBOX_SECRET")

const MERCHANT = "http://localhost:4101"
const SHIELD = "http://127.0.0.1:4102"
const tx = { id: randomUUID(), status: "PENDING" }

const order = await pp.createPayPalOrder({
  clientId, clientSecret,
  amount: "1.00", currencyCode: "USD", intent: "CAPTURE",
  items: [{ name: "Smart Buttons e2e", quantity: "1", unitAmount: { currencyCode: "USD", value: "1.00" } }],
  returnUrl: `${SHIELD}/order/success?ref=${tx.id}`,
  cancelUrl: `${SHIELD}/order/cancel?ref=${tx.id}`,
  customId: tx.id,
})
tx.paypalOrderId = order.id
const approvalUrl = pp.getApprovalUrl(order)
console.log("order", order.id, "status", order.status)

const row = {
  id: tx.id, status: "PENDING", intent: "CAPTURE", original_currency: "USD",
  paypal_order_id: order.id, checkout_expires_at: new Date(Date.now() + 30 * 60e3).toISOString(),
  merchant_success_url: `${MERCHANT}/thanks`, merchant_cancel_url: `${MERCHANT}/cart`,
  client_id: clientId,
}
const embedUrl = `${SHIELD}/checkout/buttons?ref=${tx.id}`

const snippetPage = `<!doctype html><meta charset="utf-8"><title>Merchant e2e</title>
<h2>Merchant checkout (localhost:4101)</h2><div id="paydef-buttons"></div><pre id="log"></pre>
<script>
(function () {
  var embedUrl = ${JSON.stringify(embedUrl)};
  var approvalUrl = ${JSON.stringify(approvalUrl)};
  var origin = new URL(embedUrl).origin;
  var frame = document.createElement("iframe");
  frame.src = embedUrl; frame.allow = "payment"; frame.title = "PayPal";
  frame.style.cssText = "width:100%;border:0;height:160px;";
  document.getElementById("paydef-buttons").appendChild(frame);
  var ready = false;
  var fallback = setTimeout(function () { if (!ready) window.location.href = approvalUrl; }, 10000);
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.origin !== origin || !m || m.source !== "paydef-buttons") return;
    if (m.type === "ready") { ready = true; clearTimeout(fallback); }
    if (m.type === "approved" || m.type === "failed" || m.type === "error") clearTimeout(fallback);
    document.getElementById("log").textContent += JSON.stringify(m) + String.fromCharCode(10);
    console.log("[E2E]", JSON.stringify(m));
    if (m.type === "resize" && m.height) frame.style.height = m.height + "px";
    if ((m.type === "approved" || m.type === "failed") && m.redirectUrl) window.location.href = m.redirectUrl;
    if (m.type === "error") window.location.href = approvalUrl;
  });
})();
</script>`

const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body) }

http.createServer((req, res) => {
  const u = new URL(req.url, MERCHANT)
  if (u.pathname === "/thanks" || u.pathname === "/cart") {
    return send(res, 200, `<h2>${u.pathname}</h2><pre>${u.search}</pre>`, { "content-type": "text/html" })
  }
  send(res, 200, snippetPage, { "content-type": "text/html; charset=utf-8" })
}).listen(4101, () => console.log("merchant", MERCHANT))

// A third origin that must NOT be able to frame the page (Review Focus 5).
http.createServer((req, res) => {
  send(res, 200, `<h2>Attacker (localhost:4103)</h2><iframe src="${embedUrl}" style="width:100%;height:200px"></iframe>`,
    { "content-type": "text/html" })
}).listen(4103, () => console.log("attacker http://localhost:4103"))

http.createServer(async (req, res) => {
  const u = new URL(req.url, SHIELD)
  if (u.pathname === "/checkout/buttons") {
    const d = sb.decideButtonPage({ row: { ...row, status: tx.status }, executeToken: null, tokenShouldBlock: false, now: new Date() })
    // Mirrors app/checkout/buttons/route.ts: render | finished | error
    const html = d.kind === "render" ? sb.renderButtonsPage(d.config, d.allowedOrigins)
      : d.kind === "finished" ? sb.renderButtonsFinishedPage(d.result, d.allowedOrigins, tx.id)
      : sb.renderButtonsErrorPage(d.code, d.allowedOrigins)
    return send(res, d.kind === "render" ? 200 : d.status, html, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": sb.frameAncestorsCsp(d.allowedOrigins),
    })
  }
  if (u.pathname === "/api/gateway/execute" && req.method === "POST") {
    if (tx.status === "PENDING") {
      const r = await pp.captureApprovedOrder({ clientId, clientSecret, orderId: tx.paypalOrderId })
      console.log("capture result", r.status, r.id)
      tx.status = r.status === "COMPLETED" ? "COMPLETED" : "FAILED"
    }
    return send(res, 200, JSON.stringify({ status: tx.status, transaction_id: tx.id }), { "content-type": "application/json" })
  }
  if (u.pathname.startsWith("/api/gateway/browser-status/")) {
    return send(res, 200, JSON.stringify({ transaction_id: tx.id, status: tx.status, paypal_order_id: tx.paypalOrderId }),
      { "content-type": "application/json" })
  }
  send(res, 404, "not found")
}).listen(4102, "127.0.0.1", () => console.log("shield", SHIELD))
