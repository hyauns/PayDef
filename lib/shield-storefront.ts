export type ShieldProduct = {
  name: string
  category: string
  price: string
  description: string
}

export type ShieldFaq = {
  question: string
  answer: string
}

export type ShieldStorefrontConfig = {
  host: string
  brandName: string
  supportEmail: string
  supportHours: string
  heroBadge: string
  heroTitle: string
  heroCopy: string
  aboutCopy: string
  fulfillmentCopy: string
  featuredProducts: ShieldProduct[]
  faqs: ShieldFaq[]
}

const RAINBOW_PRINT_HOUSE: ShieldStorefrontConfig = {
  host: "rainbowprinthouse.com",
  brandName: "Rainbow Print House",
  supportEmail: "support@rainbowprinthouse.com",
  supportHours: "Monday to Saturday, 9:00 AM to 6:00 PM ICT",
  heroBadge: "Custom print studio",
  heroTitle: "Colorful custom goods for events, shops, and gift-ready launches.",
  heroCopy:
    "Rainbow Print House produces made-to-order posters, tees, tote bags, and packaging inserts for brands that need fast artwork handling and dependable small-batch fulfillment.",
  aboutCopy:
    "We work with design-forward storefronts that need short-run print products, clean packaging, and clear after-sales support. Every order is reviewed before production and shipped with tracking once it clears payment.",
  fulfillmentCopy:
    "Production starts after payment confirmation. Printed goods typically ship within 3 to 5 business days, while rush jobs are reviewed case by case by our support team.",
  featuredProducts: [
    {
      name: "Premium Art Poster",
      category: "Wall Decor",
      price: "$34.00",
      description: "Museum-grade matte poster printed on archival stock with edge-safe packaging.",
    },
    {
      name: "Launch Day Tote",
      category: "Apparel",
      price: "$29.00",
      description: "Heavy cotton tote bag with full-color front print for events and merch bundles.",
    },
    {
      name: "Sticker Pack Set",
      category: "Accessories",
      price: "$18.00",
      description: "Die-cut laminated sticker pack sized for laptops, mailers, and welcome kits.",
    },
  ],
  faqs: [
    {
      question: "How fast do you ship custom orders?",
      answer: "Most paid orders leave production within 3 to 5 business days. Tracking is emailed after dispatch.",
    },
    {
      question: "Can I request a proof before printing?",
      answer: "Yes. Design proof requests can be added during checkout notes or by replying to the order confirmation email.",
    },
    {
      question: "Do you accept returns on personalized items?",
      answer: "Personalized and custom-printed goods are non-returnable unless the item arrives damaged or incorrect.",
    },
  ],
}

function normalizeHost(host: string | null) {
  return host?.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "") ?? ""
}

function titleFromHost(host: string) {
  const base = host.replace(/^www\./, "").split(".")[0] ?? "Studio Store"
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

export function getShieldStorefrontConfig(host: string | null): ShieldStorefrontConfig {
  const normalizedHost = normalizeHost(host)

  if (normalizedHost === "rainbowprinthouse.com" || normalizedHost === "www.rainbowprinthouse.com") {
    return RAINBOW_PRINT_HOUSE
  }

  const brandName = titleFromHost(normalizedHost || "shield store")
  const safeHost = normalizedHost || "shield-store.example"

  return {
    host: safeHost,
    brandName,
    supportEmail: `support@${safeHost.replace(/^www\./, "")}`,
    supportHours: "Monday to Friday, 9:00 AM to 5:00 PM local time",
    heroBadge: "Protected checkout storefront",
    heroTitle: `${brandName} offers curated goods with secure order handling.`,
    heroCopy:
      "This storefront facade is served by the protected gateway environment to keep buyer-facing checkout steps consistent while the payment backend handles routing and confirmation securely.",
    aboutCopy:
      `${brandName} presents a polished storefront experience with clear policies, support details, and order expectations so the buyer journey stays coherent from product view through payment confirmation.`,
    fulfillmentCopy:
      "Orders are reviewed after payment confirmation and routed to the merchant workflow for fulfillment, support, and post-purchase follow-up.",
    featuredProducts: [
      {
        name: `${brandName} Signature Item`,
        category: "Featured",
        price: "$39.00",
        description: "A representative catalog item used to present a complete storefront flow for buyers.",
      },
      {
        name: `${brandName} Essentials Bundle`,
        category: "Bundle",
        price: "$54.00",
        description: "A curated bundle page that keeps the storefront structure complete and shopper-friendly.",
      },
      {
        name: `${brandName} Gift Set`,
        category: "Gifts",
        price: "$24.00",
        description: "A lightweight product listing that rounds out the catalog and policy flow.",
      },
    ],
    faqs: [
      {
        question: "When will my order ship?",
        answer: "Fulfillment timing depends on the merchant workflow and product type, but all paid orders are reviewed before dispatch.",
      },
      {
        question: "How can I contact support?",
        answer: `For storefront questions, contact ${`support@${safeHost.replace(/^www\./, "")}`}.`,
      },
      {
        question: "Where can I read the store policies?",
        answer: "Policy pages are available from the footer, including privacy, terms, shipping, and refund details.",
      },
    ],
  }
}
