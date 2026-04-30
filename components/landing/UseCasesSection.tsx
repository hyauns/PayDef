export default function UseCasesSection() {
  const useCases = [
    {
      title: "Multi-store ecommerce operators",
      desc: "Manage checkout settings, payment accounts, and transaction operations across multiple stores.",
    },
    {
      title: "High-volume payment operations",
      desc: "Track payment status, account routing, webhook delivery, and recovery workflows with better visibility.",
    },
    {
      title: "Teams using manual capture",
      desc: "Authorize payments first, capture later, and keep fulfillment and payment operations aligned.",
    },
    {
      title: "Agencies managing client stores",
      desc: "Centralize payment account setup, transaction monitoring, and gateway configuration across multiple client storefronts.",
    },
  ]

  return (
    <section className="py-24 px-4 md:px-6 bg-card/50 border-y border-border">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-6 text-balance">
            Built for ecommerce payment teams that need more control.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {useCases.map((uc, idx) => (
            <div key={idx} className="bg-background border border-border p-6 rounded-xl hover:border-primary/50 transition-colors">
              <h3 className="text-lg font-bold text-foreground mb-2">{uc.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{uc.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
