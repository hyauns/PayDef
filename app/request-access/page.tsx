import LandingNavbar from "@/components/landing/LandingNavbar"
import RequestAccessForm from "@/components/landing/RequestAccessForm"

export const metadata = {
  title: "Request Access — PayDef",
  description: "Request access to PayDef, a payment gateway protection and operations platform for ecommerce teams."
}

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen bg-[#060606] font-sans selection:bg-[#FFD600] selection:text-[#0A0A0A] overflow-x-hidden flex flex-col relative">
      
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Grain */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')", mixBlendMode: "overlay" }} />
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        {/* Glow */}
        <div className="absolute top-0 right-[10%] w-[500px] h-[500px] bg-[var(--landing-yellow)] opacity-[0.05] blur-[100px] rounded-full" />
      </div>

      {/* Header */}
      <LandingNavbar isLoggedIn={false} />

      <main className="flex-1 flex flex-col px-6 md:px-[48px] max-w-[1400px] mx-auto w-full pt-[120px] pb-24 relative z-10">
        
        {/* Hero / Intro */}
        <div className="flex flex-col gap-6 max-w-[800px] animate-in fade-in slide-in-from-bottom-8 duration-500">
          <span className="font-ibm-mono text-[12px] font-bold text-[var(--landing-yellow)] tracking-[3px] uppercase">
            [REQUEST ACCESS]
          </span>
          <h1 className="font-grotesk text-[32px] md:text-[56px] font-bold text-[#F5F5F0] tracking-[1px] leading-[1.1] uppercase">
            Get early access<br />to PayDef.
          </h1>
          <p className="font-ibm-mono text-[12px] md:text-[14px] text-[#888888] tracking-[1px] leading-relaxed uppercase max-w-[600px]">
            Tell us about your store, payment setup, and operational needs. Our team will review your request and help you decide if PayDef is the right fit for your payment workflow.
          </p>
          <div className="flex items-center gap-3 py-3 px-4 bg-[#111111] border border-[#2D2D2D] w-fit mt-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
            <span className="font-ibm-mono text-[10px] text-[#CCCCCC] tracking-[1px] uppercase">
              Built for ecommerce operators who need better checkout visibility, webhook reliability, and payment operation control.
            </span>
          </div>
        </div>

        {/* Form & Contact */}
        <RequestAccessForm />

      </main>
    </div>
  )
}
