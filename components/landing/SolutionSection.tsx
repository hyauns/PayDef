export default function SolutionSection() {
  return (
    <section className="py-24 px-4 md:px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-block mb-6 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider">
          The Solution
        </div>
        <h2 className="text-3xl md:text-5xl font-sans font-bold text-foreground mb-8 text-balance">
          Build a safer payment operation layer between your store and your payment provider.
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed text-pretty">
          PayDef gives your team a centralized gateway control layer to manage checkout routing, merchant accounts, transaction display, webhook recovery, captures, refunds, and operational logs — so every payment is easier to track, explain, and recover.
        </p>
      </div>
    </section>
  )
}
