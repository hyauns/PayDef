import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql, getPool } from "@/lib/neon"
import { createLogger } from "@/lib/logger"

const log = createLogger({ route: "/api/merchant/payment-identities/items/bulk" })

const MAX_BULK = 1000

// POST — bulk-create bundle items from a pasted list of descriptors.
// Body: { bundleId, descriptors?: string[], text?: string }
// Each descriptor becomes one item with descriptor_name == product_title.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !session.user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { bundleId } = body
  if (!bundleId) return NextResponse.json({ error: "Missing bundleId" }, { status: 400 })

  // Accept either a string[] or a raw block of text (split on newlines/commas).
  const raw: string[] = Array.isArray(body.descriptors)
    ? body.descriptors
    : typeof body.text === "string"
      ? body.text.split(/[\n,]/)
      : []

  // Trim, drop empties, cap length to PayPal's field limit, de-duplicate.
  const seen = new Set<string>()
  const descriptors: string[] = []
  for (const d of raw) {
    const name = String(d ?? "").trim().slice(0, 127)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    descriptors.push(name)
  }

  if (descriptors.length === 0) {
    return NextResponse.json({ error: "No valid descriptors provided" }, { status: 400 })
  }
  if (descriptors.length > MAX_BULK) {
    return NextResponse.json({ error: `Too many descriptors (max ${MAX_BULK})` }, { status: 400 })
  }

  const sql = getSql()

  // Verify bundle ownership + current max sort_order so new items append.
  const ownerCheck = await sql`
    SELECT COALESCE(MAX(i.sort_order), -1)::int AS max_sort
    FROM payment_identity_bundles b
    LEFT JOIN payment_identity_bundle_items i ON i.bundle_id = b.id
    WHERE b.id = ${bundleId} AND b.tenant_id = ${tenantId}
    GROUP BY b.id
  `
  if (ownerCheck.length === 0) {
    return NextResponse.json({ error: "Forbidden or bundle not found" }, { status: 403 })
  }
  let nextSort = Number(ownerCheck[0].max_sort) + 1

  // Single multi-row INSERT inside a transaction — all-or-nothing.
  const cols: string[] = []
  const vals: any[] = []
  let p = 1
  for (const name of descriptors) {
    cols.push(`($${p++}, $${p++}, $${p++}, $${p++}, 'physical_good', true, $${p++})`)
    // tenant_id, bundle_id, descriptor_name, product_title, sort_order
    vals.push(tenantId, bundleId, name, name, nextSort++)
  }

  const pool = getPool()
  const client = await pool.connect()
  let inserted = 0
  try {
    const result = await client.query(
      `INSERT INTO payment_identity_bundle_items
         (tenant_id, bundle_id, descriptor_name, product_title, product_type, is_active, sort_order)
       VALUES ${cols.join(", ")}
       RETURNING id`,
      vals
    )
    inserted = result.rowCount ?? 0
  } catch (err) {
    log.error("merchant_identity_item.bulk_failed", "Bulk insert failed", { tenantId, bundleId, error: err })
    return NextResponse.json({ error: "Failed to add descriptors" }, { status: 500 })
  } finally {
    client.release()
  }

  log.info("merchant_identity_item.bulk_created", `Bulk-added ${inserted} items to bundle ${bundleId}`, {
    tenantId,
    bundleId,
    inserted,
  })
  return NextResponse.json({ success: true, inserted })
}
