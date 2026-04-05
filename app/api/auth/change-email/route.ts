/**
 * POST /api/auth/change-email
 *
 * Two-step secure email change flow:
 *
 * Step 1 (action: "request"):
 *   - User submits { action: "request", newEmail: "..." }
 *   - Generate 6-digit code
 *   - Store in email_change_codes table (10-min TTL)
 *   - Send code to the OLD email via Resend
 *
 * Step 2 (action: "verify"):
 *   - User submits { action: "verify", code: "123456" }
 *   - Validate code against DB (check TTL)
 *   - Update email in users table
 *   - Delete used code
 *
 * Security:
 *  • Code sent to OLD email — ensures the current account owner approves
 *  • 6-digit code with 10-minute TTL
 *  • Old codes cleaned up on new request
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-config"
import { getSql } from "@/lib/neon"

// ─── Generate 6-digit code ────────────────────────────────────────────────────

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error"
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.userId || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { action?: string; newEmail?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sql = getSql()
  const userId = session.user.userId
  const currentEmail = session.user.email

  // ── Step 1: Request ─────────────────────────────────────────────────────────
  if (body.action === "request") {
    const { newEmail } = body

    if (!newEmail || typeof newEmail !== "string" || !newEmail.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 })
    }

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      return NextResponse.json({ error: "New email is the same as current email" }, { status: 400 })
    }

    // Check if email is already taken
    const existing = await sql`
      SELECT id FROM users WHERE LOWER(email) = LOWER(${newEmail}) AND id != ${userId} LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: "This email is already in use by another account" }, { status: 409 })
    }

    // Clean up old codes for this user
    await sql`
      DELETE FROM email_change_codes WHERE user_id = ${userId}
    `

    // Generate and store new code
    const code = generateCode()
    await sql`
      INSERT INTO email_change_codes (user_id, new_email, code)
      VALUES (${userId}, ${newEmail.trim()}, ${code})
    `

    // Send code to OLD email via Resend
    try {
      const { Resend } = await import("resend")
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Gateway <noreply@resend.dev>",
        to: currentEmail,
        subject: "Email Change Verification Code",
        html: `
          <div style="font-family: monospace; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
            <h2 style="color: #22d3ee; margin: 0 0 16px 0;">🔐 Email Change Request</h2>
            <p style="margin: 0 0 8px 0;">Someone requested to change the email on your account to:</p>
            <p style="color: #34d399; font-size: 14px; margin: 0 0 16px 0;"><strong>${newEmail}</strong></p>
            <p style="margin: 0 0 8px 0;">Your verification code is:</p>
            <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; text-align: center; margin: 0 0 16px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #22d3ee;">${code}</span>
            </div>
            <p style="color: #888; font-size: 12px; margin: 0;">This code expires in <strong>10 minutes</strong>. If you did not request this change, ignore this email.</p>
          </div>
        `,
      })
    } catch (err) {
      console.error("[change-email] Failed to send code:", getErrorMessage(err))
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      message: `Verification code sent to ${currentEmail.replace(/(.{3}).*(@.*)/, "$1•••$2")}`,
    })
  }

  // ── Step 2: Verify ──────────────────────────────────────────────────────────
  if (body.action === "verify") {
    const { code } = body

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "A 6-digit verification code is required" }, { status: 400 })
    }

    // Find valid, non-expired code
    const codeRows = await sql`
      SELECT id, new_email FROM email_change_codes
      WHERE user_id = ${userId}
        AND code = ${code}
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (codeRows.length === 0) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    const { id: codeId, new_email: newEmail } = codeRows[0] as { id: string; new_email: string }

    // Update email in users table
    await sql`
      UPDATE users SET email = ${newEmail}, updated_at = NOW()
      WHERE id = ${userId}
    `

    // Delete used code
    await sql`DELETE FROM email_change_codes WHERE id = ${codeId}`

    // Clean up any remaining codes for this user
    await sql`DELETE FROM email_change_codes WHERE user_id = ${userId}`

    return NextResponse.json({
      message: "Email updated successfully. Please log in again with your new email.",
      newEmail,
    })
  }

  return NextResponse.json({ error: "Invalid action. Use 'request' or 'verify'." }, { status: 400 })
}
