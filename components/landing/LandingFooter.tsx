export default function LandingFooter() {
  return (
    <footer className="flex flex-col w-full bg-[#0A0A0A] border-t border-[#2D2D2D] pt-16 pb-8 px-6 md:px-[120px]">
      <div className="flex flex-col md:flex-row justify-between gap-12 border-b border-[#2D2D2D] pb-12 mb-8">
        <div className="flex flex-col gap-6 max-w-[400px]">
          <div className="flex items-center gap-[8px] h-[32px] px-[12px] border-2 border-[#FFD600] w-fit">
            <div className="w-[8px] h-[8px] bg-[#FFD600]" />
            <span className="font-ibm-mono text-[11px] font-bold text-[#FFD600] tracking-[2px] uppercase">
              PAYDEF
            </span>
          </div>
          <p className="font-ibm-mono text-[12px] text-[#666666] tracking-[1px] leading-[1.6] uppercase">
            PAYDEF HELPS ECOMMERCE TEAMS OPERATE PAYMENT WORKFLOWS WITH MORE CLARITY, CONSISTENCY, AND CONTROL.
          </p>
        </div>

        <div className="flex flex-wrap md:flex-nowrap gap-12 md:gap-24">
          <div className="flex flex-col gap-4">
            <span className="font-ibm-mono text-[10px] font-bold text-[#F5F5F0] tracking-[2px] uppercase mb-2">PLATFORM</span>
            <a href="/login" className="font-ibm-mono text-[12px] text-[#888888] hover:text-[#FFD600] tracking-[1px] uppercase transition-colors">Dashboard</a>
            <a href="/request-access" className="font-ibm-mono text-[12px] text-[#888888] hover:text-[#FFD600] tracking-[1px] uppercase transition-colors">Request Access</a>
          </div>
          <div className="flex flex-col gap-4">
            <span className="font-ibm-mono text-[10px] font-bold text-[#F5F5F0] tracking-[2px] uppercase mb-2">LEGAL</span>
            <a href="/privacy" className="font-ibm-mono text-[12px] text-[#888888] hover:text-[#FFD600] tracking-[1px] uppercase transition-colors">Privacy Policy</a>
            <a href="/terms" className="font-ibm-mono text-[12px] text-[#888888] hover:text-[#FFD600] tracking-[1px] uppercase transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <span className="font-ibm-mono text-[10px] text-[#555555] tracking-[2px] uppercase">
          © {new Date().getFullYear()} PAYDEF. ALL RIGHTS RESERVED.
        </span>
        <span className="font-ibm-mono text-[10px] text-[#555555] tracking-[2px] uppercase">
          VERSION 2.0 // SYSTEMS OPERATIONAL
        </span>
      </div>
    </footer>
  )
}
