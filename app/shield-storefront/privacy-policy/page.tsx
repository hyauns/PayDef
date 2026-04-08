import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontPrivacyPolicyPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/privacy-policy"
      eyebrow="Policy"
      title="Privacy Policy"
      description="This privacy notice explains how buyer contact details, payment references, and shipping information are handled for order support and fulfillment."
    >
      <article className="rounded-2xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground">
        <p>{config.brandName} collects only the customer data needed to process paid orders, respond to support requests, and arrange delivery.</p>
        <p className="mt-4">Payment processing is handled through protected payment infrastructure. Storefront pages do not expose raw payment credentials.</p>
        <p className="mt-4">Customers may contact {config.supportEmail} for privacy or data correction requests related to their order records.</p>
      </article>
    </ShieldStorefrontShell>
  )
}
