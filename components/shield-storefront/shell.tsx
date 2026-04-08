import Link from "next/link"
import { Globe, Mail, PackageCheck, Shield, Truck } from "lucide-react"
import type { ShieldStorefrontConfig } from "@/lib/shield-storefront"

type NavItem = {
  href: string
  label: string
}

type ShellProps = {
  config: ShieldStorefrontConfig
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
              <Shield className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.25em] text-cyan-400">{config.heroBadge}</p>
              <h1 className="text-sm font-semibold">{config.brandName}</h1>
            </div>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} currentPath={currentPath} />
            ))}
          </div>
        </div>
      </div>

      <section className="border-b border-border bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_40%),linear-gradient(180deg,rgba(17,24,39,0.8),rgba(5,10,20,1))]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1.35fr_0.9fr] md:px-6 md:py-18">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400">
              <Globe className="h-3 w-3" />
              {eyebrow}
            </div>
            <div className="space-y-3">
              <h2 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">{title}</h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{description}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-mono text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1.5">Protected checkout bridge</span>
              <span className="rounded-full border border-border px-3 py-1.5">Buyer-facing store facade</span>
              <span className="rounded-full border border-border px-3 py-1.5">Merchant support ready</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <PackageCheck className="h-4 w-4" />
                  Order workflow
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{config.fulfillmentCopy}</p>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Support email</p>
                  <p className="mt-1 font-semibold text-foreground">{config.supportEmail}</p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Support hours</p>
                  <p className="mt-1 font-semibold text-foreground">{config.supportHours}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">{children}</section>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[1fr_auto] md:px-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">{config.brandName}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{config.aboutCopy}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5">
                <Mail className="h-3.5 w-3.5 text-cyan-400" />
                {config.supportEmail}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5">
                <Truck className="h-3.5 w-3.5 text-cyan-400" />
                Fulfillment support available
              </span>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            {POLICY_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  )
}
