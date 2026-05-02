import Link from "next/link"
import { Globe, Mail, PackageCheck, Shield, Truck } from "lucide-react"
import type { ShieldSiteConfig } from "@/config/shield-sites/types"

type NavItem = {
  href: string
  label: string
}

type ShellProps = {
  config: ShieldSiteConfig
  currentPath: string
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
]

const POLICY_ITEMS: NavItem[] = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/shipping-policy", label: "Shipping Policy" },
]

function NavLink({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const active = currentPath === item.href
  return (
    <Link
      href={item.href}
      className={`rounded-full px-3 py-1.5 text-xs font-mono transition-colors ${
        active
          ? "bg-cyan-400 text-black"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
      }`}
    >
      {item.label}
    </Link>
  )
}

export function ShieldStorefrontShell({
  config,
  currentPath,
  eyebrow,
  title,
  description,
  children,
}: ShellProps) {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans selection:bg-muted" data-ui-version="bubblyscent-automotive-storefront-v1">
      {/* Top utility bar */}
      <div className="bg-muted px-4 py-2 text-center text-xs font-medium text-muted-foreground">
        Free standard shipping on orders over $50 | Secure checkout guaranteed
      </div>

      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-foreground text-background">
                <Shield className="h-4 w-4" />
              </div>
              <span className="font-bold tracking-tight text-lg">{config.logoText || config.brandName}</span>
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors hover:text-foreground/80 ${
                  currentPath === item.href ? "text-foreground" : "text-foreground/60"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {currentPath === "/" && (
        <section className="relative overflow-hidden border-b border-border bg-card">
          {/* Subtle road line accent */}
          <div className="absolute left-0 top-0 h-1 w-full bg-foreground/10" />
          
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 md:grid-cols-[1fr_auto] md:px-8 md:py-24 lg:grid-cols-2">
            <div className="flex flex-col justify-center space-y-6">
              <div className="inline-flex items-center self-start rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {eyebrow}
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
                  {title}
                </h1>
                <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <Link href="/products" className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-8 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2">
                  Shop Essentials
                </Link>
                <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
                  <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> Secure checkout</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex flex-col justify-center gap-4 p-8">
              <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
                <div className="flex items-center gap-3 text-base font-semibold">
                  <Truck className="h-5 w-5 text-muted-foreground" />
                  Reliable Shipping
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Orders are processed securely and dispatched quickly to get you back on the road.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
                <div className="flex items-center gap-3 text-base font-semibold">
                  <PackageCheck className="h-5 w-5 text-muted-foreground" />
                  Quality Assured
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Everyday auto care products tested for durability and practical performance.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">{children}</section>

      <footer className="border-t border-border bg-muted/40 pb-12 pt-16">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 md:grid-cols-[1.5fr_1fr_1fr] md:px-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background">
                <Shield className="h-3 w-3" />
              </div>
              <span className="font-bold text-base">{config.brandName}</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {config.footerText}
            </p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground pt-2">
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> {config.supportEmail}
              </span>
              {config.supportPhone && (
                <span className="flex items-center gap-2">
                  <Globe className="h-4 w-4" /> {config.supportPhone}
                </span>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Quick Links</h4>
            <nav className="flex flex-col gap-3 text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
              <Link href="/products" className="text-muted-foreground hover:text-foreground">Products</Link>
              <Link href="/about" className="text-muted-foreground hover:text-foreground">About Us</Link>
              <Link href="/contact" className="text-muted-foreground hover:text-foreground">Contact</Link>
              <Link href="/faq" className="text-muted-foreground hover:text-foreground">FAQ</Link>
            </nav>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Policies & Support</h4>
            <nav className="flex flex-col gap-3 text-sm">
              {POLICY_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/order-lookup" className="text-muted-foreground hover:text-foreground">Order Lookup</Link>
              <Link href="/tracking" className="text-muted-foreground hover:text-foreground">Tracking</Link>
            </nav>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-7xl border-t border-border px-4 pt-8 md:px-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {config.brandName}. All rights reserved.
        </div>
      </footer>
    </main>
  )
}
