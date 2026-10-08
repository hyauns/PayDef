/**
 * GET /checkout/buttons?ref=<transactionId>&et=<executeToken>
 *
 * Shield-domain page framed by the merchant storefront when the store's
 * checkout_flow is SMART_BUTTONS. Renders PayPal's own buttons for the order
 * /api/gateway/checkout already created, with that order's account client-id.
 *
 * A Route Handler (not a page) so every response can carry its own
 * frame-ancestors CSP, built from this transaction's merchant return URLs.
 * See lib/smart-buttons.ts.
 */

import { NextRequest } from "next/server"
import { getSql } from "@/lib/neon"
import { createLogger } from "@/lib/logger"
import { verifyExecuteToken } from "@/lib/execute-token"
import {
  type ButtonSessionRow,
  decideButtonPage,
  frameAncestorsCsp,
  isTransactionRef,
  renderButtonsErrorPage,
  renderButtonsFinishedPage,
  renderButtonsPage,
  renderSessionButtonsPage,
} from "@/lib/smart-buttons"
import {
  type ButtonSessionRow as SessionRow,
  decideSessionPage,
  verifySessionToken,
} from "@/lib/button-sessions"

export const dynamic = "force-dynamic"

const log = createLogger({ route: "/checkout/buttons" })

function htmlResponse(body: string, status: number, origins: string[]): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type":            "text/html; charset=utf-8",
      "Cache-Control":           "no-store",
      "Content-Security-Policy": frameAncestorsCsp(origins),
      "X-Content-Type-Options":  "nosniff",
    },
  })
}

/**
 * ?session=<id>&st=<token> — buttons rendered before the order exists
 * (checkout / cart / product page). The SDK loads with the account the
 * session pinned; createOrder and shipping changes are relayed to the shop.
 */
async function sessionPage(sessionId: string, st: string | null): Promise<Response> {
  if (!isTransactionRef(sessionId)) {
    return htmlResponse(renderButtonsErrorPage("invalid_ref", []), 400, [])
  }

  const rows = (await getSql()`
    SELECT s.id, s.store_id, s.merchant_account_id, s.shield_domain, s.context,
           s.amount, s.currency, s.intent, s.allowed_origins, s.expires_at,
           ma.client_id
    FROM   button_sessions s
    JOIN   merchant_accounts ma ON ma.id = s.merchant_account_id
    WHERE  s.id = ${sessionId}
    LIMIT  1
  `) as unknown as SessionRow[]

  const token = verifySessionToken(sessionId, st)
  const decision = decideSessionPage({ row: rows[0] ?? null, tokenShouldBlock: token.shouldBlock, now: new Date() })

  if (decision.kind === "error") {
    log.warn("smart_buttons.session_refused", `Session page refused session=${sessionId} code=${decision.code}`, {
      sessionId, code: decision.code, tokenReason: token.reason,
    })
    // The error page posts {type:"error", code} so the shop falls back.
    return htmlResponse(renderButtonsErrorPage(decision.code, decision.allowedOrigins), decision.status, decision.allowedOrigins)
  }

  log.info("smart_buttons.session_rendered", `Session page rendered session=${sessionId} express=${decision.config.express}`, {
    sessionId, express: decision.config.express, tokenReason: token.reason,
  })
  return htmlResponse(renderSessionButtonsPage(decision.config, decision.allowedOrigins), 200, decision.allowedOrigins)
}

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref")
  const et  = req.nextUrl.searchParams.get("et")

  const session = req.nextUrl.searchParams.get("session")
  if (session !== null && ref === null) {
    return sessionPage(session, req.nextUrl.searchParams.get("st"))
  }

  if (!isTransactionRef(ref)) {
    return htmlResponse(renderButtonsErrorPage("invalid_ref", []), 400, [])
  }

  const rows = (await getSql()`
    SELECT t.id, t.status, t.intent, t.original_currency, t.paypal_order_id,
           t.checkout_expires_at, t.merchant_success_url, t.merchant_cancel_url,
           ma.client_id
    FROM   transactions t
    JOIN   merchant_accounts ma ON ma.id = t.merchant_id
    WHERE  t.id = ${ref}
    LIMIT  1
  `) as unknown as ButtonSessionRow[]

  const token = verifyExecuteToken(ref, et)
  const decision = decideButtonPage({
    row: rows[0] ?? null,
    // Shadow mode renders even with a bad token; never echo one that failed.
    executeToken: token.valid ? et : null,
    tokenShouldBlock: token.shouldBlock,
    now: new Date(),
  })

  if (decision.kind === "finished") {
    log.info("smart_buttons.finished", `Buttons page for finished tx=${ref} status=${decision.result.status}`, {
      transactionId: ref,
      status: decision.result.status,
    })
    return htmlResponse(
      renderButtonsFinishedPage(decision.result, decision.allowedOrigins, ref),
      decision.status,
      decision.allowedOrigins
    )
  }

  if (decision.kind === "error") {
    log.warn("smart_buttons.refused", `Buttons page refused tx=${ref} code=${decision.code}`, {
      transactionId: ref,
      code: decision.code,
      tokenReason: token.reason,
    })
    return htmlResponse(
      renderButtonsErrorPage(decision.code, decision.allowedOrigins),
      decision.status,
      decision.allowedOrigins
    )
  }

  log.info("smart_buttons.rendered", `Buttons page rendered tx=${ref} intent=${decision.config.intent}`, {
    transactionId: ref,
    originCount: decision.allowedOrigins.length,
    tokenReason: token.reason,
  })
  return htmlResponse(renderButtonsPage(decision.config, decision.allowedOrigins), 200, decision.allowedOrigins)
}
