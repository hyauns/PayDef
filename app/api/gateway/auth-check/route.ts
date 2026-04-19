import { NextRequest, NextResponse } from "next/server"
import { authenticateStoreHeaders } from "@/lib/gateway-auth"

export async function GET(req: NextRequest) {
  try {
    await authenticateStoreHeaders(req)

    return NextResponse.json(
      { ok: true, message: "Store authenticated successfully" },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }
}
