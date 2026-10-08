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
  renderButtonsPage,
} from "@/lib/smart-buttons"

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

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref")
  const et  = req.nextUrl.searchParams.get("et")

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
    executeToken: et,
    tokenShouldBlock: token.shouldBlock,
    now: new Date(),
  })

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
