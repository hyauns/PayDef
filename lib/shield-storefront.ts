import { getShieldSiteByHost, normalizeShieldHost } from "../config/shield-sites"
import type { ShieldSiteConfig, ShieldProduct } from "../config/shield-sites/types"

// We export the new types under the old names to maintain backward compatibility 
// for any imports we don't refactor, but we should refactor them to use the new types directly.
export type { ShieldSiteConfig as ShieldStorefrontConfig }
export type { ShieldProduct }

export function normalizeHost(host: string | null) {
  return normalizeShieldHost(host)
}

function titleFromHost(host: string) {
  const base = host.replace(/^www\./, "").split(".")[0] ?? "Store"
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

export function getShieldStorefrontConfig(host: string | null): ShieldSiteConfig {
  const siteConfig = getShieldSiteByHost(host)
  if (siteConfig) {
    return siteConfig
  }

  // Safe Fallback - Generic normal ecommerce site
  const safeHost = normalizeHost(host) || "store.example.com"
  const brandName = titleFromHost(safeHost)

  return {
    domain: safeHost,
    brandName,
    tagline: `Premium goods and essentials from ${brandName}`,
    industry: "Retail",
    logoText: brandName,
    heroTitle: `Welcome to ${brandName}`,
    heroSubtitle: `Discover our curated collection of high-quality products designed for everyday life. Shop securely with our trusted checkout.`,
    heroEyebrow: "Official Store",
    products: [
      {
        title: `${brandName} Signature Item`,
        slug: "signature-item",
        category: "Featured",
        price: "$39.00",
        description: "Our flagship product. Crafted with care and built to last.",
      },
      {
        title: `${brandName} Essentials Bundle`,
        slug: "essentials-bundle",
        category: "Bundle",
        price: "$54.00",
        description: "Everything you need in one convenient package. Perfect for gifting.",
      },
      {
        title: `${brandName} Gift Set`,
        slug: "gift-set",
        category: "Gifts",
        price: "$24.00",
        description: "A thoughtful collection of our most popular accessories.",
      },
    ],
    supportEmail: `support@${safeHost.replace(/^www\./, "")}`,
    footerText: `Thank you for shopping with ${brandName}. All orders are processed securely and shipped with care. If you have any questions, our support team is ready to help.`,
    seoTitle: `${brandName} | Official Store`,
    seoDescription: `Shop the official ${brandName} store for premium goods.`,
  }
}
