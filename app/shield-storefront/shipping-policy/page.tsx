import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontShippingPolicyPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/shipping-policy"
      eyebrow="Policy"
      title="Shipping Policy"
      description="Learn about our shipping and delivery expectations."
    >
      <article className="rounded-2xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground">
        <p>Orders are securely processed and shipped within standard fulfillment timelines. See your tracking email for delivery estimates.</p>
        <p className="mt-4">Transit time depends on destination, shipping class, and customs handling for international deliveries.</p>
        <p className="mt-4">Tracking details are shared once the order leaves production. Shipping questions can be sent to {config.supportEmail}.</p>
      </article>
    </ShieldStorefrontShell>
  )
}
