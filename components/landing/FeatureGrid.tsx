import SectionHeader from "./SectionHeader"

export default function FeatureGrid() {
  const features = [
    {
      title: "PROTECT YOUR\nPAYMENT GATEWAY",
      text: "MONITOR PAYMENT ACTIVITY, ACCOUNT ROUTING, CHECKOUT STATUS, AND WEBHOOK DELIVERY FROM ONE DASHBOARD BEFORE THEY BECOME SERIOUS.",
      tag: "MONITOR",
      color: "#FFD600"
    },
    {
      title: "ROUTE WITH\nACCOUNT HEALTH",
      text: "ASSIGN MERCHANT ACCOUNTS TO SPECIFIC STORES, PAYMENT PROFILES, AND CHECKOUT IDENTITIES. KEEP ROUTING CONSISTENT.",
      tag: "ROUTING",
      color: "#FF6B35",
      bg: "#0F0F0F"
    },
    {
      title: "REDUCE BUYER\nCONFUSION",
      text: "USE BRAND-AWARE, INDUSTRY-SPECIFIC PAYMENT DISPLAY PROFILES SO BUYERS CAN RECOGNIZE WHAT THEY PURCHASED.",
      tag: "CLARITY",
      color: "#F5F5F0",
      bg: "#111111"
    },
    {
      title: "PREPARE FOR\nDISPUTES",
      text: "KEEP TRANSACTION RECORDS, CHECKOUT REFERENCES, WEBHOOK EVENTS, AND FULFILLMENT CONTEXT ORGANIZED FOR FASTER DISPUTE RESPONSE.",
      tag: "RECORDS",
      color: "#FFD600",
      bg: "#0A0A0A"
    },
    {
      title: "RECOVER FAILED\nUPDATES",
      text: "PAYDEF TRACKS WEBHOOK DELIVERY, RETRIES FAILED EVENTS, AND HELPS KEEP STORE ORDER STATUS ALIGNED WITH PAYMENT STATUS.",
      tag: "RECOVERY",
      color: "#FF6B35",
      bg: "#111111"
    },
    {
      title: "CONTROL THE\nLIFECYCLE",
      text: "AUTHORIZE, CAPTURE, REFUND, VOID, AND REPLAY WEBHOOK EVENTS FROM A SINGLE DASHBOARD WITH STRUCTURED LOGS.",
      tag: "CONTROL",
      color: "#F5F5F0",
      bg: "#0F0F0F"
    }
  ]

  return (
    <section id="features" className="flex flex-col w-full bg-[#0A0A0A] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px] border-t border-[#2D2D2D] scroll-mt-[60px]">
      <SectionHeader
        label="[01] // CAPABILITIES"
        title={"BUILD A SAFER PAYMENT\nOPERATION LAYER."}
        subtitle="CENTRALIZED GATEWAY CONTROL TO MANAGE CHECKOUT ROUTING, MERCHANT ACCOUNTS, DISPLAY PROFILES, AND RECOVERY."
      />

      <div className="flex flex-col w-full gap-[2px]">
        {/* Row 1 */}
        <div className="flex flex-col md:flex-row w-full gap-[2px]">
          {features.slice(0, 3).map((f, i) => (
            <div key={i} className="flex flex-col gap-5 p-8 md:p-[32px] border w-full md:flex-1 md:h-[320px]" style={{ backgroundColor: f.bg || "#111111", borderColor: f.color }}>
              <div className="w-[40px] h-[40px] shrink-0" style={{ backgroundColor: f.color }} />
              <h3 className="font-grotesk text-[18px] font-bold text-[#F5F5F0] tracking-[1px] leading-[1.2] whitespace-pre-line uppercase">
                {f.title}
              </h3>
              <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6] uppercase">
                {f.text}
              </p>
              <div className="flex items-center justify-center h-[28px] px-[12px] bg-[#1A1A1A] border w-fit" style={{ borderColor: f.color }}>
                <span className="font-ibm-mono text-[11px] tracking-[2px] uppercase" style={{ color: f.color }}>
                  {f.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
        {/* Row 2 */}
        <div className="flex flex-col md:flex-row w-full gap-[2px]">
          {features.slice(3, 6).map((f, i) => (
            <div key={i} className="flex flex-col gap-5 p-8 md:p-[32px] border w-full md:flex-1 md:h-[320px]" style={{ backgroundColor: f.bg || "#111111", borderColor: f.color }}>
              <div className="w-[40px] h-[40px] shrink-0" style={{ backgroundColor: f.color }} />
              <h3 className="font-grotesk text-[18px] font-bold text-[#F5F5F0] tracking-[1px] leading-[1.2] whitespace-pre-line uppercase">
                {f.title}
              </h3>
              <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6] uppercase">
                {f.text}
              </p>
              <div className="flex items-center justify-center h-[28px] px-[12px] bg-[#1A1A1A] border w-fit" style={{ borderColor: f.color }}>
                <span className="font-ibm-mono text-[11px] tracking-[2px] uppercase" style={{ color: f.color }}>
                  {f.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
