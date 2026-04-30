import SectionHeader from "./SectionHeader"

export default function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "CONNECT YOUR STORE",
      text: "ADD YOUR STORE, CONFIGURE API ACCESS, WEBHOOK URL, AND CHECKOUT MODE.",
      color: "#FFD600"
    },
    {
      num: "02",
      title: "ADD MERCHANT ACCOUNTS",
      text: "CONNECT PAYMENT ACCOUNTS, CONFIGURE ROUTING RULES, LIMITS, AND PROXY SETTINGS.",
      color: "#FF6B35"
    },
    {
      num: "03",
      title: "DEFINE DISPLAY PROFILES",
      text: "CHOOSE THE BUSINESS CATEGORY, PUBLIC BRAND NAME, AND LINE ITEM POLICY.",
      color: "#F5F5F0"
    },
    {
      num: "04",
      title: "MONITOR AND RECOVER",
      text: "TRACK CHECKOUT STATUS, CAPTURES, REFUNDS, AND WEBHOOK DELIVERY FROM ONE DASHBOARD.",
      color: "#FFD600"
    },
  ]

  return (
    <section className="flex flex-col w-full bg-[#0A0A0A] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px] border-t border-[#2D2D2D]">
      <SectionHeader
        label="[04] // WORKFLOW"
        title={"HOW IT WORKS"}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-col gap-5 p-8 border border-[#2D2D2D] bg-[#111111] hover:border-[#F5F5F0] transition-colors relative">
            <span className="font-ibm-mono text-[11px] font-bold tracking-[2px]" style={{ color: step.color }}>
              [STEP {step.num}]
            </span>
            <h3 className="font-grotesk text-[20px] font-bold text-[#F5F5F0] tracking-[-1px] leading-[1.1] uppercase">
              {step.title}
            </h3>
            <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6] uppercase">
              {step.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
