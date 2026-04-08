import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontRefundPolicyPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/refund-policy"
      eyebrow="Policy"
      title="Refund Policy"
      description="Refund terms should be visible before a buyer enters payment. This page clarifies what happens if an order is damaged, incorrect, or canceled before production."
    >
      <article className="rounded-2xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground">
        <p>Refunds are reviewed for damaged, defective, or incorrect items reported promptly after delivery.</p>
        <p className="mt-4">Custom or personalized goods are generally not refundable once production has started, except in cases of confirmed production error.</p>
        <p className="mt-4">Approved refunds are returned using the original payment method according to the payment processor timeline.</p>
      </article>
    </ShieldStorefrontShell>
  )
}
