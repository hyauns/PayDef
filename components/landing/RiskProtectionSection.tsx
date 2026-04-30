import { CheckCircle2 } from "lucide-react"

export default function RiskProtectionSection() {
  const points = [
    "Consistent payment display profiles",
    "Merchant account and checkout domain alignment",
    "Webhook retry and recovery",
    "Transaction trace IDs",
    "Refund and capture audit logs",
    "Order and payment status visibility",
  ]

  return (
    <section className="py-24 px-4 md:px-6 bg-card/30 border-y border-border">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row-reverse items-center gap-16">
        <div className="flex-1 text-center lg:text-left">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-6 text-balance">
            Reduce the risks that cause payment operations to break.
          </h2>
          <p className="text-lg text-muted-foreground mb-8 text-pretty">
            Payment issues are often caused by inconsistent checkout records, unclear descriptors, delayed fulfillment updates, failed webhooks, and weak audit trails. PayDef helps reduce these risks by keeping payment operations consistent, traceable, and easier to manage.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {points.map((point, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-sm font-medium text-foreground">{point}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 w-full">
          {/* Abstract visual for risk protection */}
          <div className="relative w-full aspect-square max-w-md mx-auto">
            <div className="absolute inset-4 border border-border rounded-full flex items-center justify-center">
              <div className="absolute inset-8 border border-border/50 rounded-full flex items-center justify-center border-dashed animate-[spin_60s_linear_infinite_reverse]">
                <div className="absolute inset-12 bg-primary/5 border border-primary/20 rounded-full flex items-center justify-center backdrop-blur-3xl animate-[spin_40s_linear_infinite]">
                  <ShieldIcon className="w-16 h-16 text-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  )
}
