/**
 * POST /api/admin/control/rotate-domains
 *
 * Force-rotates shield domains by cycling to the next active domain.
 * Picks the least-recently-updated active domain and sets it as the
 * current primary in system_settings.
 *
 * Auth: SUPER_ADMIN only.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

interface DomainRow {
  id:     string
  domain: string
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sql = getSql()

  // Get all active domains, ordered by least recently updated (fair rotation)
  const activeDomains = (await sql`
    SELECT id, domain
    FROM shield_domains
    WHERE is_active = true AND health_ok = true
    ORDER BY updated_at ASC NULLS FIRST
    LIMIT 10
  `) as unknown as DomainRow[]

  if (activeDomains.length === 0) {
    return NextResponse.json(
      { error: "No active healthy domains found. Add domains in Shield Domains management." },
      { status: 404 }
    )
  }

  // Read current primary domain (if any)
  const currentRows = (await sql`
    SELECT value FROM system_settings WHERE key = 'current_shield_domain'
  `) as unknown as { value: { domain?: string; id?: string } }[]

  const currentDomain = currentRows[0]?.value?.domain ?? ""

  // Pick the next domain in rotation (skip the current one)
  let nextDomain = activeDomains[0]
  for (const d of activeDomains) {
    if (d.domain !== currentDomain) {
      nextDomain = d
      break
    }
  }

  // Update system_settings with new primary domain
  const jsonValue = JSON.stringify({
    id: nextDomain.id,
    domain: nextDomain.domain,
    rotatedAt: new Date().toISOString(),
  })

  await sql`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('current_shield_domain', ${jsonValue}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = ${jsonValue}::jsonb, updated_at = NOW()
  `

  // Touch the updated_at on the selected domain so it goes to the back of the queue
  await sql`
    UPDATE shield_domains SET updated_at = NOW() WHERE id = ${nextDomain.id}
  `

  // Log to audit
  await sql`
    INSERT INTO system_logs (action, status, level, metadata)
    VALUES (
      'DOMAIN_ROTATED',
      'OK',
      'info',
      ${JSON.stringify({
        admin: session.user.email,
        previousDomain: currentDomain || null,
        newDomain: nextDomain.domain,
        poolSize: activeDomains.length,
      })}::jsonb
    )
  `

  return NextResponse.json({
    ok: true,
    previousDomain: currentDomain || null,
    newDomain: nextDomain.domain,
    poolSize: activeDomains.length,
    message: `Rotated to ${nextDomain.domain}`,
  })
}
