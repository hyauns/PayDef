import type { ShieldSiteConfig } from "./types"

export const exampleAutoStore: ShieldSiteConfig = {
  domain: "exampleautostore.test",
  brandName: "Example Auto Store",
  tagline: "Quality automotive accessories and performance parts.",
  industry: "Automotive Parts",
  logoText: "AutoStore",
  heroTitle: "Premium auto accessories for your ride.",
  heroSubtitle:
    "We provide high-quality automotive parts, car care essentials, and performance accessories shipped securely to your door.",
  heroEyebrow: "Auto Parts & Accessories",
  products: [
    {
      title: "Performance Wiper Blades",
      slug: "performance-wiper-blades",
      category: "Exterior",
      price: "$24.99",
      description: "All-weather silicone wiper blades engineered for maximum visibility and durability.",
    },
    {
      title: "Premium Microfiber Towel Set",
      slug: "microfiber-towel-set",
      category: "Car Care",
      price: "$18.50",
      description: "Ultra-soft, scratch-free microfiber towels for safe detailing and washing.",
    },
    {
      title: "Heavy Duty Floor Mats",
      slug: "heavy-duty-floor-mats",
      category: "Interior",
      price: "$45.00",
      description: "All-season rubber floor mats tailored to protect your vehicle's interior from dirt and moisture.",
    },
    {
      title: "LED Headlight Conversion Kit",
      slug: "led-headlight-kit",
      category: "Lighting",
      price: "$59.99",
      description: "Bright, energy-efficient LED bulbs for improved nighttime driving safety.",
    },
  ],
  supportEmail: "support@exampleautostore.test",
  supportPhone: "1-800-555-AUTO",
  footerText:
    "Example Auto Store is dedicated to providing enthusiasts with top-tier automotive products. All orders are processed securely and shipped with tracking information.",
  seoTitle: "Example Auto Store | Auto Parts & Accessories",
  seoDescription:
    "Shop Example Auto Store for premium automotive accessories, performance parts, and car care essentials.",
}
