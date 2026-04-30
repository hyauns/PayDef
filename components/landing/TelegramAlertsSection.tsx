import SectionHeader from "./SectionHeader"
import TelegramAlertDemo from "./TelegramAlertDemo"
import Link from "next/link"

export default function TelegramAlertsSection() {
  return (
    <section id="alerts" className="flex flex-col md:flex-row w-full bg-[#111111] py-16 px-6 md:py-[100px] md:px-[120px] gap-12 md:gap-[64px] border-t border-[#2D2D2D] items-center scroll-mt-[60px]">
      <div className="flex flex-col w-full md:flex-1 gap-8">
        <SectionHeader
          label="[06] // REAL-TIME ALERTS"
          title={"KNOW WHAT HAPPENS\nTHE MOMENT A PAYMENT CHANGES."}
          subtitle="CONNECT TELEGRAM TO RECEIVE INSTANT OPERATIONAL ALERTS FOR SUCCESSFUL PAYMENTS, FAILED WEBHOOKS, REFUNDS, CAPTURES, VOIDS, AND TRANSACTIONS THAT NEED ATTENTION — WITHOUT REFRESHING THE DASHBOARD."
        />

        <div className="flex flex-col gap-4">
          {[
            "PAYMENT COMPLETED ALERTS",
            "WEBHOOK RETRY AND FAILURE NOTIFICATIONS",
            "REFUND, CAPTURE, AND VOID UPDATES",
            "ACCOUNT ROUTING AND TRANSACTION TRACE CONTEXT",
            "HIGH-SIGNAL ALERTS WITHOUT DASHBOARD NOISE"
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-1.5 h-1.5 bg-[#FF6B35] shrink-0" />
              <span className="font-ibm-mono text-[12px] md:text-[13px] text-[#CCCCCC] tracking-[1px] uppercase">{item}</span>
            </div>
          ))}
        </div>

        <Link 
          href="/request-access"
          className="flex items-center justify-center w-fit px-8 h-[48px] bg-[#1A1A1A] border border-[#3D3D3D] hover:border-[#FF6B35] transition-colors mt-4"
        >
          <span className="font-ibm-mono text-[12px] font-bold text-[#FF6B35] tracking-[2px] uppercase">
            CONNECT TELEGRAM IN MINUTES &gt;
          </span>
        </Link>
      </div>

      <div className="flex justify-center md:justify-end w-full md:flex-1">
        <TelegramAlertDemo />
      </div>
    </section>
  )
}
