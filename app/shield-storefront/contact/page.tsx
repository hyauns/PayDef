import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontContactPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/contact"
      eyebrow="Support"
      title="Contact support"
      description="We are here to help. Contact us if you need assistance with your order."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Customer support</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Email: <span className="text-foreground">{config.supportEmail}</span>
          </p>
          {config.supportPhone && (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Phone: <span className="text-foreground">{config.supportPhone}</span>
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Order assistance</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            For order updates, proof requests, or delivery issues, customers can contact support with the order reference
            shown after payment confirmation.
          </p>
        </section>
      </div>
    </ShieldStorefrontShell>
  )
}
