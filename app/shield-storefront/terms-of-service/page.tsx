import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontTermsPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/terms-of-service"
      eyebrow="Policy"
      title="Terms of Service"
      description="These terms describe the buying, support, and fulfillment conditions for orders placed through this storefront."
    >
      <article className="rounded-2xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground">
        <p>Orders are accepted subject to payment confirmation, product availability, and review of any customization details supplied by the buyer.</p>
        <p className="mt-4">Customers are responsible for ensuring shipping and contact information is accurate before payment is completed.</p>
        <p className="mt-4">Questions about order handling can be directed to {config.supportEmail} during the listed support window.</p>
      </article>
    </ShieldStorefrontShell>
  )
}
