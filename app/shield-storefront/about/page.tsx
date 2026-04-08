import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontAboutPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/about"
      eyebrow="About the studio"
      title={`About ${config.brandName}`}
      description={config.aboutCopy}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">What we make</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {config.brandName} is presented as a real storefront with product structure, customer support,
            and policy pages so buyers move through a coherent retail journey from discovery to payment.
          </p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">How fulfillment works</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{config.fulfillmentCopy}</p>
        </section>
      </div>
    </ShieldStorefrontShell>
  )
}
