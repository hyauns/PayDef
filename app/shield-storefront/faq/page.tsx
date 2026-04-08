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
      description="A short FAQ makes the storefront feel complete and gives buyers quick answers before they continue to payment."
    >
      <div className="grid gap-4">
        {config.faqs.map((item) => (
          <article key={item.question} className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">{item.question}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
          </article>
        ))}
      </div>
    </ShieldStorefrontShell>
  )
}
