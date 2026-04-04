/**
 * Email service — sends transactional emails via Resend.
 *
 * Usage:
 *   import { sendWelcomeEmail } from "@/lib/email"
 *   await sendWelcomeEmail({ businessName, email, temporaryPassword, plan })
 *
 * Non-blocking:
 *   Use `sendWelcomeEmail(...).catch(...)` to fire-and-forget.
 *
 * Environment:
 *   RESEND_API_KEY    — Resend API key (required)
 *   NEXT_PUBLIC_APP_URL — Login URL base (defaults to NEXTAUTH_URL)
 */
import { Resend } from "resend"
import { WelcomeMerchant } from "@/emails/WelcomeMerchant"

// Lazy-init to avoid crashing if env var is missing during build
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error("RESEND_API_KEY is not configured")
    _resend = new Resend(key)
  }
  return _resend
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WelcomeEmailPayload {
  businessName: string
  email: string
  temporaryPassword: string
  plan: string
}

/**
 * Sends the Welcome Merchant email via Resend.
 * Returns `{ success, messageId?, error? }`.
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  const { businessName, email, temporaryPassword, plan } = payload

  const loginUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"

  try {
    const resend = getResend()

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Gateway <onboarding@resend.dev>",
      to: [email],
      subject: `Welcome to Gateway — your ${businessName} account is ready`,
      react: WelcomeMerchant({
        businessName,
        email,
        temporaryPassword,
        loginUrl: `${loginUrl}/login`,
        plan,
      }),
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown email error" }
  }
}
