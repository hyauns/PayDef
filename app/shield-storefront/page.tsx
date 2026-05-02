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
      eyebrow={config.heroEyebrow}
      title={config.heroTitle}
      description={config.heroSubtitle}
    >
      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-5" data-ui-version="shield-storefront-config-v1">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-400">Featured products</p>
            <h3 className="mt-2 text-2xl font-semibold">Shop our latest collection.</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {config.products.map((product) => (
              <article key={product.slug} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">{product.category}</p>
                <h4 className="mt-3 text-lg font-semibold">{product.title}</h4>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.description}</p>
                <p className="mt-4 text-sm font-semibold text-cyan-400">{product.price}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-400">About {config.brandName}</p>
            <h3 className="mt-2 text-xl font-semibold">{config.tagline}</h3>
          </div>
          <p className="text-sm leading-7 text-muted-foreground">{config.footerText}</p>
        </section>
      </div>
    </ShieldStorefrontShell>
  )
}
