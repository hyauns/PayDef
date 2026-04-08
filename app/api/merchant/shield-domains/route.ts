import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import {
  createShieldDomain,
  deleteShieldDomain,
  listShieldDomains,
  updateShieldDomain,
} from "@/lib/shield-domain-service"

async function requireMerchant() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MERCHANT" || !session.user.tenantId) {
    return null
  }

  return {
    role: session.user.role,
    tenantId: session.user.tenantId,
  } as const
}

function getErrorStatus(message: string) {
  if (message === "Forbidden") return 403
  if (message === "Domain not found.") return 404
  if (
    message === "No fields to update." ||
    message === "domain is required." ||
    message === "Invalid domain format." ||
    message === "Tenant not found." ||
    message === "Merchants cannot reassign domains." ||
    message === "Merchants can only add domains to their own tenant." ||
    message === "Merchant account is not attached to a tenant." ||
    message === "Domain already exists in the pool." ||
    message === "storeId is required." ||
    message === "Store not found." ||
    message === "Store does not belong to the same tenant as this domain."
  ) {
    return message === "Domain already exists in the pool." ? 409 : 400
  }

  return 500
}

export async function GET() {
  const actor = await requireMerchant()
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = await listShieldDomains(actor)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const actor = await requireMerchant()
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { domain: string; tenantId?: string | null; isActive?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  try {
    const data = await createShieldDomain(actor, body)
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create shield domain."
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireMerchant()
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    id: string
    isActive?: boolean
    tenantId?: string | null
    healthOk?: boolean
    storeId?: string
    action?: "syncVercel" | "verifyDns" | "assignStore" | "unassignStore"
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 })
  }

  try {
    const data = await updateShieldDomain(actor, body)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update shield domain."
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}

export async function DELETE(req: NextRequest) {
  const actor = await requireMerchant()
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const domainId = req.nextUrl.searchParams.get("id")
  if (!domainId) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 })
  }

  try {
    const data = await deleteShieldDomain(actor, domainId)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete shield domain."
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) })
  }
}
