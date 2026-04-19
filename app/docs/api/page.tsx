import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  KeyRound,
  ShieldCheck,
  Webhook,
} from "lucide-react"
import { DashboardHeader } from "@/components/dashboard/header"

const GATEWAY_BASE_URL = "https://www.gooytoy.com"
const CHECKOUT_ENDPOINT = `${GATEWAY_BASE_URL}/api/gateway/checkout`
const LOOKUP_ENDPOINT = `${GATEWAY_BASE_URL}/api/gateway/transactions/{transactionId}`

const events = [
  {
    name: "payment.authorization.created",
    meaning: "Buyer approved an AUTHORIZE payment and PayPal created an authorization.",
  },
  {
    name: "payment.capture.completed",
    meaning: "Payment was captured successfully and should normally be treated as paid.",
  },
  {
    name: "payment.capture.denied",
    meaning: "PayPal denied the capture.",
  },
  {
    name: "payment.capture.refunded",
    meaning: "A completed capture was refunded.",
  },
  {
    name: "payment.dispute.created",
    meaning: "PayPal opened a dispute on the payment.",
  },
  {
    name: "payment.checkout.canceled",
    meaning: "Buyer returned through the shield cancel flow before completion.",
  },
  {
    name: "payment.session.expired",
    meaning: "The checkout remained pending past the gateway session timeout.",
  },
  {
    name: "payment.authorization.expired",
    meaning: "An authorization aged out before capture.",
  },
] as const

const outboundHeaders = [
  ["Content-Type", "application/json"],
  ["X-Webhook-Source", "payment-gateway"],
  ["X-Webhook-Event", "Explicit event name such as payment.capture.completed"],
  ["X-Webhook-Timestamp", "ISO timestamp used in HMAC signing"],
  ["X-Webhook-Signature", "sha256=<hex digest>"],
  ["X-Webhook-Event-ID", "Stable logical event ID for idempotent dedupe"],
  ["X-Webhook-Delivery-ID", "Unique delivery attempt ID"],
  ["X-Webhook-Attempt", "1-based retry attempt number"],
] as const

const requiredValues = [
  "Store ID",
  "API Key",
  "Webhook URL",
  "Webhook Secret",
  "Success Return URL (optional)",
  "Cancel Return URL (optional)",
] as const

const checkoutRequest = `{
  "amount": 49.99,
  "currency": "USD",
  "itemName": "Premium Plan",
  "intent": "CAPTURE",
  "customerEmail": "buyer@example.com",
  "buyerIp": "203.0.113.10",
  "buyerCountry": "US"
}`

const checkoutResponse = `{
  "transactionId": "uuid",
  "approvalUrl": "https://www.paypal.com/checkoutnow?...",
  "flow": "REDIRECT",
  "popupUrl": "https://shield-domain.com/checkout/popup?...",
  "popupOrigin": "https://shield-domain.com",
  "intent": "CAPTURE",
  "status": "PENDING",
  "merchantReturnConfigured": true
}`

const lookupResponse = `{
  "transaction_id": "uuid",
  "current_status": "COMPLETED",
  "amount": "49.99",
  "currency": "USD",
  "paypal_order_id": "8RX12345AB6789012",
  "timestamps": {
    "created_at": "2026-04-08T12:30:00.000Z",
    "completed_at": "2026-04-08T12:34:56.000Z"
  }
}`

const webhookPayload = `{
  "event": "payment.capture.completed",
  "event_id": "2aa6b7df-3c7e-49b2-9df8-dc6ab7fd8a8b",
  "transaction_id": "7c1d8e1d-43f8-4c79-b6b1-bf1d11f8f4fd",
  "paypal_order_id": "8RX12345AB6789012",
  "amount": "49.99",
  "status": "COMPLETED",
  "timestamp": "2026-04-08T12:34:56.000Z",
  "paypal_event_type": "PAYMENT.CAPTURE.COMPLETED",
  "paypal_capture_id": "4XU12345CD6789012",
  "gateway_fee": "1.00",
  "net_amount": "48.99"
}`

const retryPolicy = [
  "Attempt 1: immediate",
  "Attempt 2: +30s",
  "Attempt 3: +2m",
  "Attempt 4: +10m",
  "Attempt 5: +30m",
  "Attempt 6: +2h",
  "Attempt 7: +12h",
  "Attempt 8: +24h",
] as const

const signatureSnippet = `import { createHmac, timingSafeEqual } from "crypto"

function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex")

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}`

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-foreground">
      <code className={`language-${language}`}>{code}</code>
    </pre>
  )
}

function SectionTitle({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-400">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background font-mono">
      <DashboardHeader />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-5 md:px-6">
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Merchant API Docs</p>
                <h1 className="text-xl font-semibold text-foreground">Gateway Checkout And Webhook Contract</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Use this page as the canonical integration reference for merchant stores. The checkout API starts the payment flow.
                  The webhook is the authoritative server-to-server confirmation channel.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/stores"
                  className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-400 transition-colors hover:bg-cyan-400/15"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Open Stores
                </Link>
                <a
                  href="https://www.paydef.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Gateway Site
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-5 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Base URL</p>
              <p className="mt-2 text-xs text-foreground">{GATEWAY_BASE_URL}</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Checkout</p>
              <p className="mt-2 text-xs text-cyan-400">POST /api/gateway/checkout</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Webhook Security</p>
              <p className="mt-2 text-xs text-foreground">HMAC-SHA256</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Primary UX</p>
              <p className="mt-2 text-xs text-foreground">Popup + Shield Bridge</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<FileCode2 className="h-5 w-5" />}
                eyebrow="Getting Started"
                title="What The Merchant Must Configure"
                description="Every store needs four values from the dashboard. Merchants can copy them from Stores -> open a store -> Integration panel."
              />

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {requiredValues.map((value) => (
                  <div key={value} className="rounded-lg border border-border bg-background px-4 py-3">
                    <div className="flex items-center gap-2 text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs">{value}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[11px] leading-6 text-muted-foreground">
                Stores created before webhook signing was added must generate or regenerate a <span className="text-amber-400">Webhook Secret</span> once in the dashboard.
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<ShieldCheck className="h-5 w-5" />}
                eyebrow="Checkout API"
                title="Create A Gateway Checkout Session"
                description="The merchant backend calls the gateway checkout endpoint. The gateway decides PayPal rotation, item masking, shield domain, and final buyer flow."
              />

              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Endpoint</p>
                  <p className="mt-2 text-xs text-cyan-400">{CHECKOUT_ENDPOINT}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Required Headers</p>
                    <div className="rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-foreground">
                      <div>`X-Store-ID: {`{STORE_ID}`}`</div>
                      <div>`X-API-Key: {`{API_KEY}`}`</div>
                      <div>`Content-Type: application/json`</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Flow Rules</p>
                    <div className="rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-muted-foreground">
                      <div>`POPUP_BRIDGE`: open `popupUrl`</div>
                      <div>`REDIRECT`: navigate to `approvalUrl`</div>
                      <div>Always reconcile final payment state through webhook</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Request Body</p>
                    <CodeBlock code={checkoutRequest} />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Response Body</p>
                    <CodeBlock code={checkoutResponse} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<ShieldCheck className="h-5 w-5" />}
                eyebrow="Status Lookup API"
                title="Query Canonical Transaction State"
                description="Securely query the final, authoritative state of a transaction using Server-to-Server API credentials."
              />

              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Endpoint</p>
                  <p className="mt-2 text-xs text-cyan-400">{LOOKUP_ENDPOINT}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Required Headers</p>
                    <div className="rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-foreground">
                      <div>`X-Store-ID: {`{STORE_ID}`}`</div>
                      <div>`X-API-Key: {`{API_KEY}`}`</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Response Body Fragment</p>
                    <CodeBlock code={lookupResponse} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<Webhook className="h-5 w-5" />}
                eyebrow="Webhook"
                title="Gateway To Merchant Store Webhook"
                description="This is the authoritative server-to-server signal that tells the merchant store what happened to the payment."
              />

              <div className="mt-5 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/30">
                    <tr>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Header</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundHeaders.map(([header, value], index) => (
                      <tr key={header} className={index % 2 === 0 ? "bg-card" : "bg-secondary/10"}>
                        <td className="px-4 py-3 text-xs text-foreground">{header}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Payload Example</p>
                <CodeBlock code={webhookPayload} />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">How To Sign</p>
                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-muted-foreground">
                    <div>Algorithm: `HMAC-SHA256`</div>
                    <div>Message: `timestamp + {"."} + rawBody`</div>
                    <div>Key: merchant store `Webhook Secret`</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Verification Snippet</p>
                  <CodeBlock code={signatureSnippet} language="ts" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<Webhook className="h-5 w-5" />}
                eyebrow="Supported Events"
                title="Explicit Event Names"
                description="The merchant store should branch on these explicit events and use `transaction_id` as the main reconciliation key."
              />

              <div className="mt-5 space-y-3">
                {events.map((event) => (
                  <div key={event.name} className="rounded-lg border border-border bg-background px-4 py-3">
                    <p className="text-xs text-cyan-400">{event.name}</p>
                    <p className="mt-2 text-[11px] leading-6 text-muted-foreground">{event.meaning}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<ArrowRight className="h-5 w-5" />}
                eyebrow="Recovery"
                title="Retry, Replay, And Status Lookup"
                description="The gateway now keeps durable delivery history so merchants can reconcile missed events and replay canonical payloads safely."
              />

              <div className="mt-5 grid gap-4">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Retry Schedule</p>
                  <div className="mt-2 space-y-1 text-[11px] leading-6 text-muted-foreground">
                    {retryPolicy.map((step) => (
                      <div key={step}>{step}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3 text-[11px] leading-6 text-muted-foreground">
                  <div><span className="text-foreground">Status lookup:</span> `GET /api/gateway/transactions/:transactionId`</div>
                  <div><span className="text-foreground">Replay latest event:</span> `POST /api/gateway/transactions/:transactionId/replay`</div>
                  <div><span className="text-foreground">Deduplication:</span> use `event_id`, not delivery metadata.</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<ArrowRight className="h-5 w-5" />}
                eyebrow="Recommended Flow"
                title="Minimum Merchant Integration Flow"
                description="This is the simplest reliable path for a Next.js merchant store."
              />

              <div className="mt-5 space-y-3 text-[11px] leading-6 text-muted-foreground">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  1. Merchant backend calls <span className="text-cyan-400">`POST /api/gateway/checkout`</span>.
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  2. Merchant frontend opens <span className="text-cyan-400">`popupUrl`</span> for `POPUP_BRIDGE`, or redirects to <span className="text-cyan-400">`approvalUrl`</span> for `REDIRECT`.
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  3. Merchant store receives webhook updates at its configured <span className="text-cyan-400">`webhook_url`</span> and deduplicates by <span className="text-cyan-400">`event_id`</span>.
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  4. Merchant backend reconciles final payment state using <span className="text-cyan-400">`transaction_id`</span> and falls back to status lookup or replay when needed.
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  5. If return URLs are configured, the shield success/cancel pages redirect buyers back to the merchant store with <span className="text-cyan-400">`transaction_id`</span> and <span className="text-cyan-400">`status`</span>.
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <SectionTitle
                icon={<KeyRound className="h-5 w-5" />}
                eyebrow="Merchant Checklist"
                title="What Merchants Should Copy From The Dashboard"
                description="Keep this section visible in the dashboard so integration is mostly copy-paste."
              />

              <div className="mt-5 space-y-3 text-[11px] leading-6 text-muted-foreground">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="text-foreground">Stores {"->"} open a store {"->"} Integration panel</div>
                  <div className="mt-1">Copy `Store ID`, `API Key`, `Webhook Secret`, and verify the configured `Webhook URL`.</div>
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="text-foreground">Use this page as the API contract</div>
                  <div className="mt-1">Developers should implement checkout and webhook verification from the exact headers and payload shown here.</div>
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="text-foreground">Treat webhook as final source of truth</div>
                  <div className="mt-1">Popup success or redirect completion does not replace server-to-server reconciliation.</div>
                </div>
              </div>

              <div className="mt-5">
                <Link
                  href="/stores"
                  className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-400 transition-colors hover:bg-cyan-400/15"
                >
                  Open Store Integration Panel
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
