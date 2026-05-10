import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "payment-gateway",
    timestamp: new Date().toISOString()
  });
}
