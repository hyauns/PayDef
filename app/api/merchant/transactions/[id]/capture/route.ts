/**
 * POST /api/merchant/transactions/[id]/capture
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  DISABLED — Product-boundary decision (2026-04-09)                  │
 * │                                                                     │
 * │  Manual capture is a merchant-store backend responsibility.         │
 * │  The gateway dashboard is payment infrastructure + observability.   │
 * │  It must not become an operational capture console.                 │
 * │                                                                     │
 * │  Merchant stores should capture via:                                │
 * │    POST /api/gateway/capture  (X-Store-ID + X-API-Key auth)         │
 * │                                                                     │
 * │  Capture timing is owned by the merchant's fulfillment workflow     │
 * │  (e.g. after shipping/tracking), not by the gateway operator.       │
 * └─────────────────────────────────────────────────────────────────────┘
 */
import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    {
      error: "Dashboard capture is disabled. Manual capture must be initiated from the merchant store backend via POST /api/gateway/capture with X-Store-ID + X-API-Key authentication.",
      docs: "https://www.paylaz.nl/docs/STORE_WEBHOOK_CONTRACT.md",
    },
    { status: 403 }
  )
}
