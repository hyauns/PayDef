import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import { sanitizePayPalField } from "@/lib/masking"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const industry = searchParams.get("industry")

  const sql = getSql()
  let templates = []

  if (industry) {
    templates = await sql`
      SELECT id, industry_vertical, descriptor_text, is_active, created_at
      FROM payment_descriptor_templates
      WHERE industry_vertical = ${industry}
      ORDER BY created_at DESC
    `
  } else {
    templates = await sql`
      SELECT id, industry_vertical, descriptor_text, is_active, created_at
      FROM payment_descriptor_templates
      ORDER BY industry_vertical ASC, created_at DESC
    `
  }

  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { industryVertical, descriptorText } = body

  if (!industryVertical || !descriptorText) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const safeText = sanitizePayPalField(descriptorText)
  if (!safeText) return NextResponse.json({ error: "Invalid descriptor" }, { status: 400 })

  const sql = getSql()
  try {
    const res = await sql`
      INSERT INTO payment_descriptor_templates (industry_vertical, descriptor_text, is_active)
      VALUES (${industryVertical}, ${safeText}, true)
      RETURNING id
    `
    return NextResponse.json({ success: true, id: res[0].id })
  } catch (err) {
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, isActive } = body

  if (!id || isActive === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const sql = getSql()
  try {
    await sql`UPDATE payment_descriptor_templates SET is_active = ${Boolean(isActive)} WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}
