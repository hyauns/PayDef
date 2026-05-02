export type ShieldProduct = {
  title: string
  slug: string
  description: string
  price: string
  imageUrl?: string
  category: string
}

export type ShieldSiteConfig = {
  domain: string
  brandName: string
  tagline: string
  industry: string
  logoText?: string
  logoUrl?: string
  heroTitle: string
  heroSubtitle: string
  heroEyebrow: string
  products: ShieldProduct[]
  supportEmail: string
  supportPhone?: string
  orderLookupUrl?: string
  trackingUrl?: string
  shippingPolicyUrl?: string
  refundPolicyUrl?: string
  privacyPolicyUrl?: string
  termsUrl?: string
  footerText: string
  seoTitle: string
  seoDescription: string
}
