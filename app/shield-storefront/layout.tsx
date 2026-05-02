import { headers } from "next/headers"
import { getShieldStorefrontConfig } from "@/lib/shield-storefront"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers()
  const config = getShieldStorefrontConfig(headerStore.get("x-forwarded-host") ?? headerStore.get("host"))

  return {
    title: config.seoTitle,
    description: config.seoDescription,
  }
}

export default function ShieldStorefrontLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
