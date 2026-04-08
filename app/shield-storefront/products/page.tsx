import { headers } from "next/headers"
import { ShieldStorefrontShell } from "@/components/shield-storefront/shell"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"

export default async function ShieldStorefrontProductsPage() {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return (
    <ShieldStorefrontShell
      config={config}
      currentPath="/products"
      eyebrow="Catalog"
      title="Selected catalog items"
      description="This product catalog keeps the storefront coherent and visually complete while the gateway handles checkout routing behind the scenes."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {config.featuredProducts.map((product) => (
          <article key={product.name} className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-400">{product.category}</p>
            <h3 className="mt-3 text-xl font-semibold">{product.name}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{product.description}</p>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{product.price}</span>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-mono text-muted-foreground">
                Made to order
              </span>
            </div>
          </article>
        ))}
      </div>
    </ShieldStorefrontShell>
  )
}
