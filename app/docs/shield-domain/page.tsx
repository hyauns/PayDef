import Link from "next/link"
import { ExternalLink, Globe, Shield, ShieldCheck } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/DashboardShell"

const BENEFITS = [
  "Keeps popup, success, and cancel traffic on a merchant-controlled domain instead of exposing the gateway hostname in the buyer journey.",
  "Lets the gateway preserve PayPal rotation and item masking while still giving each store a stable checkout-facing domain.",
  "Improves operational recovery because DNS, bridge health, and store assignment are visible in one dashboard.",
]

const HOW_IT_WORKS = [
  "A shield domain is added to the gateway pool and pointed to the same Vercel deployment that serves the gateway app.",
  "Once DNS is verified, the dashboard checks the popup bridge route at /checkout/popup on that domain.",
  "When a store is assigned that domain, the gateway can use it for popup bridge, success, and cancel flows.",
  "The store still calls the same gateway checkout endpoint. Rotation, masking, and PayPal order creation remain server-side.",
]

const WHAT_THE_MERCHANT_DOES = [
  "Add the domain in Domains and follow the DNS record shown by Vercel.",
  "Wait for DNS status Ready and Bridge status Healthy.",
  "Open Stores, edit the target store, and select the shield domain from the Shield Domain field.",
  "Set success and cancel return URLs if the store wants buyers sent back after the shield flow completes.",
]

const STOREFRONT_FACADE_NOTES = [
  "Shield domains can point to the exact same Vercel project as the gateway admin domain. The app decides what to render by hostname, not by creating a second project.",
  "The gateway admin domain keeps serving dashboard routes such as /login, /dashboard, and /stores.",
  "Shield hosts such as rainbowprinthouse.com are rewritten to storefront facade pages while keeping /checkout/popup, /order/success, and /order/cancel available on the same host.",
]

export default function ShieldDomainDocsPage() {
  return (
    <DashboardShell>
      <main className="px-4 md:px-6 py-5 max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>DOCS</span>
              <span>/</span>
              <span className="text-cyan-400">SHIELD DOMAIN</span>
            </div>
            <h1 className="text-xl font-semibold text-foreground mt-1">Shield Domain Guide</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-6">
              This page explains what a shield domain is, how it works with Popup + Shield Bridge,
              and why assigning the right domain to a store improves checkout quality and operational safety.
            </p>
          </div>
          <Link
            href="/domains"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Domains
          </Link>
        </div>

        <section className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">What Is a Shield Domain?</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-6">
            A shield domain is a custom domain connected to the gateway deployment. It fronts the popup bridge
            and return pages so the buyer sees a domain associated with the merchant checkout flow instead of the
            core gateway hostname.
          </p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">Why It Helps</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground leading-6">
              {BENEFITS.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>

          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground">How It Works</h2>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground leading-6">
              {HOW_IT_WORKS.map((item, index) => (
                <li key={item}>{index + 1}. {item}</li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Merchant Setup Steps</h2>
          <ol className="space-y-2 text-sm text-muted-foreground leading-6">
            {WHAT_THE_MERCHANT_DOES.map((item, index) => (
              <li key={item}>{index + 1}. {item}</li>
            ))}
          </ol>
        </section>

        <section className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Storefront Facade Routing</h2>
          <ul className="space-y-2 text-sm text-muted-foreground leading-6">
            {STOREFRONT_FACADE_NOTES.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Important Notes</h2>
          <ul className="space-y-2 text-sm text-muted-foreground leading-6">
            <li>• The shield domain must point to the same Vercel project that serves this gateway deployment.</li>
            <li>• A domain is considered ready only when DNS is ready and the popup bridge health check succeeds.</li>
            <li>• Assigning a shield domain to a store does not change rotation logic, PayPal account selection, or item masking. Those stay in the gateway backend.</li>
            <li>• Popup success remains a buyer UX signal. Final payment confirmation still comes from webhook or reconciliation state.</li>
          </ul>
        </section>
      </main>
    </DashboardShell>
  )
}
