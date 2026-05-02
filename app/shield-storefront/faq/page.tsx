import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontFaqPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/faq"
      eyebrow="Support"
      title="Frequently asked questions"
      description="Find answers to common questions about shipping, returns, and support."
    >
      <div className="grid gap-4">
        <article className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">When will my order ship?</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">Orders are processed within standard fulfillment times. Tracking information will be emailed once your order ships.</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">How can I contact support?</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">You can reach us at {config.supportEmail} for any assistance with your order.</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Where can I read your policies?</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">Our full privacy, terms, shipping, and refund policies are available via the footer links.</p>
        </article>
      </div>
    </ShieldStorefrontShell>
  )
}
