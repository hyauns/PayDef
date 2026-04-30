export default function LandingCTA() {
  return (
    <section className="flex flex-col items-center justify-center w-full bg-[#FFD600] py-20 px-6 md:py-[120px] text-center">
      <h2 className="font-grotesk text-[clamp(32px,6vw,72px)] font-bold text-[#0A0A0A] tracking-[-2px] leading-[1] uppercase mb-8 max-w-[900px]">
        READY TO PROTECT YOUR PAYMENT OPERATIONS?
      </h2>
      <p className="font-ibm-mono text-[14px] md:text-[16px] text-[#1A1A1A] tracking-[1px] leading-[1.5] uppercase max-w-[600px] mb-12">
        START MANAGING CHECKOUT ROUTING, MERCHANT ACCOUNTS, DISPLAY PROFILES, AND TRANSACTION EVIDENCE FROM ONE SECURE DASHBOARD.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
        <a href="/request-access" className="flex items-center justify-center w-full sm:w-[260px] h-[64px] bg-[#0A0A0A] hover:bg-[#1A1A1A] transition-colors">
          <span className="font-grotesk text-[14px] font-bold text-[#FFD600] tracking-[2px] uppercase">
            REQUEST ACCESS
          </span>
        </a>
        <a href="/login" className="flex items-center justify-center w-full sm:w-[220px] h-[64px] bg-transparent border-2 border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] transition-colors group">
          <span className="font-ibm-mono text-[14px] font-bold text-[#0A0A0A] tracking-[2px] uppercase group-hover:text-[#FFD600]">
            SIGN IN &gt;
          </span>
        </a>
      </div>
    </section>
  )
}
