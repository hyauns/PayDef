import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontHomePage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/"
      eyebrow="Storefront facade"
      title={config.heroTitle}
      description={config.heroCopy}
    >
      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-5">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-400">Featured products</p>
            <h3 className="mt-2 text-2xl font-semibold">A storefront that looks complete and buyer-ready.</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {config.featuredProducts.map((product) => (
              <article key={product.name} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">{product.category}</p>
                <h4 className="mt-3 text-lg font-semibold">{product.name}</h4>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description}</p>
                <p className="mt-4 text-sm font-semibold text-cyan-400">{product.price}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-400">Why this exists</p>
            <h3 className="mt-2 text-xl font-semibold">Buyer-facing trust layer</h3>
          </div>
          <p className="text-sm leading-7 text-muted-foreground">{config.aboutCopy}</p>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>1. Buyers see a polished storefront instead of a raw payment utility domain.</li>
            <li>2. Popup bridge, success, and cancel routes stay on the same branded host.</li>
            <li>3. Policies, contact details, and product structure remain consistent throughout checkout.</li>
          </ul>
        </section>
      </div>
    </ShieldStorefrontShell>
  )
}
