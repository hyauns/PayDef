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
      eyebrow="About the store"
      title={`About ${config.brandName}`}
      description={config.tagline}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-xl font-semibold">Storefront Overview</h3>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">{config.footerText}</p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-xl font-semibold">Fulfillment Standards</h3>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Orders are securely processed and shipped with standard fulfillment timelines. See our shipping policy for details.</p>
        </section>
      </div>
    </ShieldStorefrontShell>
  )
}
