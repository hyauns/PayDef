import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface WelcomeMerchantProps {
  businessName: string
  email: string
  temporaryPassword: string
  loginUrl: string
  plan: string
}

export function WelcomeMerchant({
  businessName = "Acme Corp",
  email = "admin@acmecorp.com",
  temporaryPassword = "••••••••",
  loginUrl = "https://gateway.io/login",
  plan = "Starter",
}: WelcomeMerchantProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to the Gateway — your merchant account is ready</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logoText}>⬢ GATEWAY</Text>
          </Section>

          {/* Welcome Message */}
          <Section style={contentSection}>
            <Heading style={h1}>Welcome aboard, {businessName}!</Heading>
            <Text style={paragraph}>
              Your merchant account has been created and is ready to accept payments.
              Below you&apos;ll find your login credentials to access the dashboard.
            </Text>
          </Section>

          {/* Credentials Card */}
          <Section style={credentialCard}>
            <Text style={credentialLabel}>ACCOUNT DETAILS</Text>
            <Hr style={divider} />

            <table style={credentialTable} cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={credentialKey}>Business</td>
                  <td style={credentialValue}>{businessName}</td>
                </tr>
                <tr>
                  <td style={credentialKey}>Plan</td>
                  <td style={credentialValueAccent}>{plan}</td>
                </tr>
                <tr>
                  <td style={credentialKey}>Email</td>
                  <td style={credentialValue}>{email}</td>
                </tr>
                <tr>
                  <td style={credentialKey}>Password</td>
                  <td style={credentialValueMono}>{temporaryPassword}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Link href={loginUrl} style={ctaButton}>
              Log In Now →
            </Link>
          </Section>

          {/* Security Warning */}
          <Section style={warningSection}>
            <table cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={warningIcon}>⚠</td>
                  <td style={warningText}>
                    <strong>Security Notice:</strong> Please change your password
                    immediately after your first login. This temporary password should
                    not be reused or shared with anyone.
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* What's Next */}
          <Section style={contentSection}>
            <Text style={h2}>Getting Started</Text>
            <Text style={listItem}>
              <span style={listBullet}>01</span> Log in with the credentials above
            </Text>
            <Text style={listItem}>
              <span style={listBullet}>02</span> Change your password in Settings
            </Text>
            <Text style={listItem}>
              <span style={listBullet}>03</span> Create your first Store and get your API keys
            </Text>
            <Text style={listItem}>
              <span style={listBullet}>04</span> Integrate the checkout API into your storefront
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This email was sent by the Gateway Payment Platform.
              If you did not request this account, please contact
              your administrator immediately.
            </Text>
            <Text style={footerMuted}>
              © {new Date().getFullYear()} Gateway. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default WelcomeMerchant

// ─── Styles ───────────────────────────────────────────────────────────────────

const DARK = "#0a0a0a"
const CARD = "#141414"
const BORDER = "#262626"
const EMERALD = "#10b981"
const EMERALD_DIM = "#065f46"
const CYAN = "#22d3ee"
const TEXT = "#e5e5e5"
const MUTED = "#737373"

const body: React.CSSProperties = {
  backgroundColor: DARK,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: 0,
}

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px 20px",
}

const header: React.CSSProperties = {
  textAlign: "center" as const,
  paddingBottom: "24px",
}

const logoText: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "4px",
  color: EMERALD,
  margin: 0,
}

const contentSection: React.CSSProperties = {
  padding: "0 0 20px",
}

const h1: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: TEXT,
  lineHeight: "1.4",
  margin: "0 0 12px",
}

const h2: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: TEXT,
  letterSpacing: "0.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 16px",
}

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.7",
  color: MUTED,
  margin: "0 0 8px",
}

const credentialCard: React.CSSProperties = {
  backgroundColor: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  padding: "20px",
  marginBottom: "24px",
}

const credentialLabel: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "2px",
  color: MUTED,
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
}

const credentialTable: React.CSSProperties = {
  width: "100%",
}

const credentialKey: React.CSSProperties = {
  fontSize: "12px",
  color: MUTED,
  paddingBottom: "10px",
  paddingRight: "16px",
  verticalAlign: "top",
  width: "80px",
}

const credentialValue: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: TEXT,
  paddingBottom: "10px",
  verticalAlign: "top",
}

const credentialValueAccent: React.CSSProperties = {
  ...credentialValue,
  color: EMERALD,
}

const credentialValueMono: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  color: CYAN,
  backgroundColor: "#1a1a1a",
  padding: "4px 8px",
  borderRadius: "4px",
  border: `1px solid ${BORDER}`,
  verticalAlign: "top",
}

const divider: React.CSSProperties = {
  borderColor: BORDER,
  borderStyle: "solid",
  borderWidth: "1px 0 0",
  margin: "12px 0",
}

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "4px 0 28px",
}

const ctaButton: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: EMERALD,
  color: "#000000",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  textDecoration: "none",
  padding: "12px 32px",
  borderRadius: "6px",
}

const warningSection: React.CSSProperties = {
  backgroundColor: EMERALD_DIM + "15",
  border: `1px solid ${EMERALD_DIM}50`,
  borderRadius: "8px",
  padding: "14px 16px",
  marginBottom: "24px",
}

const warningIcon: React.CSSProperties = {
  fontSize: "16px",
  paddingRight: "10px",
  verticalAlign: "top",
  lineHeight: "1.6",
}

const warningText: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.6",
  color: EMERALD,
}

const listItem: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.6",
  color: MUTED,
  margin: "0 0 8px",
  paddingLeft: "0",
}

const listBullet: React.CSSProperties = {
  display: "inline-block",
  width: "24px",
  fontWeight: 700,
  fontSize: "11px",
  color: EMERALD,
  fontFamily: "monospace",
}

const footer: React.CSSProperties = {
  textAlign: "center" as const,
  paddingTop: "16px",
}

const footerText: React.CSSProperties = {
  fontSize: "11px",
  lineHeight: "1.6",
  color: MUTED,
  margin: "0 0 8px",
}

const footerMuted: React.CSSProperties = {
  fontSize: "11px",
  color: "#525252",
  margin: 0,
}
