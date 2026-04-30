import Link from "next/link"
import GlitchText from "./GlitchText"
import CollabCursors from "./CollabCursors"
import LiveTransactionTrace from "./LiveTransactionTrace"

export default function LandingHero({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative flex flex-col items-center w-full bg-[var(--landing-bg)] py-16 px-6 md:py-[100px] md:px-[120px] overflow-hidden">
      {/* Badge */}
      <div className="flex items-center justify-center gap-[8px] h-[32px] px-[12px] md:px-[16px] bg-[#1A1A1A] border-2 border-[var(--landing-yellow)]">
        <div className="w-[8px] h-[8px] bg-[var(--landing-yellow)] shrink-0" />
        <span className="font-ibm-mono text-[9px] md:text-[11px] font-bold text-[var(--landing-yellow)] tracking-[1px] md:tracking-[2px] whitespace-nowrap uppercase">
          [NEW] // PAYMENT GATEWAY PROTECTION
        </span>
      </div>

      <div className="h-8 md:h-[32px]" />

      {/* Headline */}
      <h1 className="font-grotesk text-[clamp(32px,8vw,80px)] font-bold text-[var(--landing-text-light)] tracking-[-1px] leading-none text-center w-full max-w-[1100px] uppercase z-10 relative">
        <GlitchText text="PROTECT YOUR CHECKOUT." speed={45} delay={100} />
        <br />
        <span className="text-[var(--landing-yellow)]">
          <GlitchText text="REDUCE DISRUPTIONS." speed={45} delay={400} />
        </span>
      </h1>

      <div className="h-8 md:h-[32px]" />

      {/* Subheading */}
      <p className="font-ibm-mono text-[13px] md:text-[15px] text-[var(--landing-text-muted)] tracking-[1px] leading-[1.6] text-center w-full max-w-[800px] uppercase z-10 relative">
        PAYDEF HELPS ECOMMERCE TEAMS STRENGTHEN PAYMENT OPERATIONS WITH SMART ACCOUNT ROUTING, BUYER-FRIENDLY DISPLAY PROFILES, WEBHOOK RECOVERY, AND SAFER WORKFLOWS.
      </p>

      <div className="h-10 md:h-[48px]" />

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-[16px] w-full sm:w-auto z-10 relative">
        <Link 
          href="/request-access"
          className="flex items-center justify-center w-full sm:w-[220px] h-[56px] bg-[var(--landing-yellow)] hover:bg-[#e6c200] transition-colors"
        >
          <span className="font-grotesk text-[12px] font-bold text-[#0A0A0A] tracking-[2px]">
            REQUEST ACCESS
          </span>
        </Link>
        <Link 
          href={isLoggedIn ? "/dashboard" : "/login"}
          className="flex items-center justify-center w-full sm:w-[200px] h-[56px] bg-[var(--landing-bg)] border-2 border-[#3D3D3D] hover:border-[var(--landing-text-muted)] transition-colors"
        >
          <span className="font-ibm-mono text-[12px] text-[var(--landing-text-muted)] tracking-[2px] uppercase">
            {isLoggedIn ? "OPEN DASHBOARD >" : "SIGN IN >"}
          </span>
        </Link>
      </div>

      <div className="h-6 md:h-[24px]" />

      <p className="font-ibm-mono text-[11px] text-[#555555] tracking-[2px] text-center uppercase">
        DESIGNED FOR MERCHANTS // BUILT FOR CONTROL // SAAS INFRASTRUCTURE
      </p>

      <div className="h-12 md:h-[64px]" />

      {/* Abstract Dashboard Mock */}
      <div
        className="w-full max-w-[1100px] bg-[#0F0F0F] overflow-hidden flex flex-col md:flex-row gap-[2px] p-[2px] z-10 relative"
        style={{ border: "2px solid #2D2D2D" }}
      >
        <div className="flex flex-col bg-[#111] p-6 flex-1 min-h-[300px]">
          <span className="font-ibm-mono text-[11px] font-bold text-[var(--landing-yellow)] tracking-[2px] mb-6">[01] GATEWAY HEALTH</span>
          <div className="flex items-center gap-4 border border-[#2D2D2D] p-4 bg-[#0A0A0A]">
            <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div>
              <div className="font-grotesk font-bold text-[var(--landing-text-light)] text-xl">99.99%</div>
              <div className="font-ibm-mono text-[10px] text-[#888] tracking-[1px]">ALL SYSTEMS OPERATIONAL</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 border border-[#2D2D2D] p-4 bg-[#0A0A0A]">
            <div className="w-8 h-8 bg-[var(--landing-orange)]/20 border border-[var(--landing-orange)] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[var(--landing-orange)] animate-pulse" />
            </div>
            <div>
              <div className="font-grotesk font-bold text-[var(--landing-text-light)] text-xl">ACTIVE</div>
              <div className="font-ibm-mono text-[10px] text-[#888] tracking-[1px]">WEBHOOK RECOVERY QUEUE</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col bg-[#0A0A0A] p-6 flex-[2] border-l border-[#2D2D2D] min-h-[300px]">
          <LiveTransactionTrace />
        </div>
      </div>
      
      <CollabCursors />
    </section>
  )
}
