/**
 * POST /api/auth/change-password
 *
 * Secure password change flow:
 *   1. Verify current password with bcrypt.compare()
 *   2. Validate new password (min 12 chars)
 *   3. Hash new password with bcrypt (12 rounds)
 *   4. Update users table
 *
 * Security:
 *  • Current password is verified before allowing any change
 *  • Passwords are NEVER stored or logged in plain text
 *  • bcrypt cost factor 12 ensures strong hashing
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { currentPassword, newPassword } = body

  if (!currentPassword || typeof currentPassword !== "string") {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 })
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 12) {
    return NextResponse.json({ error: "New password must be at least 12 characters" }, { status: 400 })
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "New password must be different from current password" }, { status: 400 })
  }

  const sql = getSql()

  // Fetch current hash
  const rows = await sql`
    SELECT password_hash FROM users WHERE id = ${session.user.userId} LIMIT 1
  `

  if (rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const user = rows[0] as { password_hash: string }

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.password_hash)
  if (!isValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 })
  }

  // Hash new password
  const newHash = await bcrypt.hash(newPassword, 12)

  // Update in database
  await sql`
    UPDATE users SET password_hash = ${newHash}, updated_at = NOW()
    WHERE id = ${session.user.userId}
  `

  return NextResponse.json({ message: "Password updated successfully" })
}
