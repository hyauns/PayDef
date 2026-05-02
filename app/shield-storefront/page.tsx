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
      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <section className="space-y-6" data-ui-version="bubblyscent-automotive-storefront-v1">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">Shop our latest collection</h3>
            <p className="text-sm text-muted-foreground mt-1">Quality gear for your daily drive.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {config.products.map((product) => (
              <article key={product.slug} className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:shadow-md">
                <div className="aspect-[4/3] bg-muted/50 flex items-center justify-center p-6">
                  {/* Subtle tire/road pattern or icon could go here, using a generic package icon for now */}
                  <div className="text-muted-foreground/30">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{product.category}</p>
                  <div>
                    <h4 className="font-semibold line-clamp-1">{product.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <p className="font-bold">{product.price}</p>
                    <span className="text-xs font-semibold underline underline-offset-4 opacity-0 transition-opacity group-hover:opacity-100">View Details</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6 self-start">
          <div>
            <h3 className="text-lg font-semibold">About {config.brandName}</h3>
            <p className="text-sm text-muted-foreground mt-1">{config.tagline}</p>
          </div>
          <div className="h-px w-full bg-border" />
          <p className="text-sm leading-relaxed text-muted-foreground">{config.footerText}</p>
        </section>
      </div>
    </ShieldStorefrontShell>
  )
}
