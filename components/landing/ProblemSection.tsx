import { AlertTriangle, XCircle, RefreshCcw, Settings, FileText, CheckSquare } from "lucide-react"

export default function ProblemSection() {
  const problems = [
    { icon: FileText, text: "Unclear buyer-facing transaction descriptions" },
    { icon: XCircle, text: "Failed webhook updates that leave orders stuck" },
    { icon: RefreshCcw, text: "Manual refund and capture workflows with little visibility" },
    { icon: Settings, text: "Payment account routing that is hard to control" },
    { icon: AlertTriangle, text: "Weak transaction records when disputes happen" },
    { icon: CheckSquare, text: "No clear audit trail from checkout to fulfillment" },
  ]

  return (
    <section className="py-24 px-4 md:px-6 border-t border-border bg-card/30">
      <div className="max-w-5xl mx-auto text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-6 text-balance">
          Payment problems do not start when money is lost. They start when your operations are unclear.
        </h2>
        <p className="text-base text-muted-foreground max-w-3xl mx-auto text-pretty">
          Unexpected payment holds, failed webhooks, unclear transaction names, delayed captures, refund errors, and poor dispute evidence can quickly disrupt a growing ecommerce business.
        </p>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        {problems.map((problem, idx) => {
          const Icon = problem.icon
          return (
            <div key={idx} className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-background/50">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-sm font-medium text-foreground leading-relaxed">{problem.text}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
