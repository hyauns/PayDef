import SectionHeader from "./SectionHeader"

export default function SecuritySection() {
  const securityFeatures = [
    { title: "ENCRYPTED CREDENTIALS", text: "ENCRYPTED PAYMENT PROVIDER CREDENTIALS.", bg: "#FFD600", textCol: "#0A0A0A" },
    { title: "HASHED STORE KEYS", text: "HASHED STORE API KEYS.", bg: "#111111", textCol: "#F5F5F0" },
    { title: "WEBHOOK SAFETY", text: "WEBHOOK SIGNING AND RETRY RECOVERY.", bg: "#0A0A0A", textCol: "#F5F5F0" },
    { title: "ROLE-BASED ACCESS", text: "MERCHANT AND SUPER ADMIN ACCESS.", bg: "#0A0A0A", textCol: "#F5F5F0" },
    { title: "STRUCTURED LOGS", text: "LOGS WITH TRACE IDS.", bg: "#111111", textCol: "#F5F5F0" },
    { title: "FALLBACK BEHAVIOR", text: "SAFE FALLBACK ROUTING.", bg: "#FF6B35", textCol: "#0A0A0A" },
  ]

  return (
    <section id="security" className="flex flex-col w-full bg-[#0D0D0D] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px] border-t border-[#2D2D2D] scroll-mt-[60px]">
      <SectionHeader
        label="[05] // SECURITY"
        title="DESIGNED WITH SECURITY AND OPERATIONAL SAFETY IN MIND."
        subtitle="PAYDEF IS BUILT WITH SECURE API AUTHENTICATION, ENCRYPTED PROVIDER CREDENTIALS, AND STRUCTURED LOGS."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[2px] w-full">
        {securityFeatures.map((feat, idx) => (
          <div key={idx} className="flex flex-col gap-5 p-8 border border-[#2D2D2D]" style={{ backgroundColor: feat.bg }}>
            <h3 className="font-grotesk text-[18px] font-bold tracking-[-1px] leading-[1.1] uppercase" style={{ color: feat.textCol }}>
              {feat.title}
            </h3>
            <p className="font-ibm-mono text-[11px] tracking-[1px] leading-[1.6] uppercase" style={{ color: feat.textCol === "#0A0A0A" ? "#1A1A1A" : "#666666" }}>
              {feat.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
