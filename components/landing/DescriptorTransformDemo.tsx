"use client"
import { useEffect, useState, useRef } from "react"

const rows = [
  { before: "Service Extension", after: "Verified Category: Product Order", status: "verified", tag: "OK" },
  { before: "Enterprise Solution", after: "Verified Category: Ecommerce Purchase", status: "verified", tag: "OK" },
  { before: "Unclear Product Order", after: "Verified Category: Apparel Order", status: "verified", tag: "OK" },
  { before: "Yeezy Sneakers", after: "Manual Review: Brand Authorization Required", status: "review", tag: "REVIEW" },
  { before: "NFL Jersey", after: "Manual Review: Licensed Merchandise", status: "review", tag: "REVIEW" },
  { before: "Unverified Supplement Pack", after: "Blocked: Restricted Category", status: "blocked", tag: "BLOCKED" }
]

export default function DescriptorTransformDemo() {
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isClient, setIsClient] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setIsClient(true)
    let current = 0
    // Start animation loop after 500ms
    const timeout = setTimeout(() => {
      setActiveIndex(current)
      intervalRef.current = setInterval(() => {
        current = (current + 1) % rows.length
        setActiveIndex(current)
      }, 2000)
    }, 500)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "verified": return "border-[var(--landing-yellow)] text-[var(--landing-yellow)] bg-[var(--landing-yellow)]/10"
      case "review": return "border-[var(--landing-orange)] text-[var(--landing-orange)] bg-[var(--landing-orange)]/10"
      case "blocked": return "border-red-500 text-red-500 bg-red-500/10"
      default: return "border-[#2D2D2D] text-[#888888]"
    }
  }

  const getBeforeColor = (status: string, isActive: boolean) => {
    if (!isActive) return "border-transparent text-[#666666]"
    switch (status) {
      case "verified": return "border-[var(--landing-yellow)] text-[var(--landing-yellow)] bg-[#1A1A1A]"
      case "review": return "border-[var(--landing-orange)] text-[var(--landing-orange)] bg-[#1A1A1A]"
      case "blocked": return "border-red-500 text-red-500 bg-[#1A1A1A]"
      default: return "border-transparent text-[#666666]"
    }
  }

  return (
    <div className="flex flex-col md:flex-row w-full gap-[2px] relative mt-8">
      {/* Scanline Effect behind everything */}
      {isClient && activeIndex >= 0 && (
        <div 
          className="hidden md:block absolute left-0 right-0 h-[48px] bg-[#FFFFFF]/5 z-0 transition-all duration-500 ease-out pointer-events-none"
          style={{ top: `${activeIndex * 50 + 130}px` }} 
        />
      )}

      {/* BEFORE PANEL */}
      <div className="flex flex-col p-8 md:p-[40px] bg-[#111111] border border-[#2D2D2D] w-full md:flex-1 relative z-10">
        <span className="font-ibm-mono text-[11px] font-bold text-[#FF6B35] tracking-[2px] mb-4 uppercase">
          [BEFORE] // UNCLEAR OR RISKY RECORDS
        </span>
        <p className="font-ibm-mono text-[11px] text-[#666666] tracking-[1px] leading-[1.6] uppercase mb-8 h-[36px]">
          GENERIC, UNCLEAR, OR RESTRICTED TRANSACTION LABELS CAN CREATE BUYER CONFUSION AND OPERATIONAL RISK.
        </p>

        <div className="flex flex-col gap-[2px]">
          {rows.map((row, idx) => {
            const isActive = isClient && activeIndex === idx;
            const isRevealed = isClient && activeIndex >= idx;
            return (
              <div 
                key={`before-${idx}`} 
                className={`flex items-center h-[48px] px-6 bg-[#0A0A0A] border-l-2 transition-all duration-300 ${getBeforeColor(row.status, isActive)} ${!isRevealed ? "opacity-50" : "opacity-100"}`}
              >
                <span className="font-ibm-mono text-[12px] uppercase">- {row.before}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* AFTER PANEL */}
      <div className="flex flex-col p-8 md:p-[40px] bg-[#0A0A0A] border border-[var(--landing-yellow)] w-full md:flex-1 relative z-10 overflow-hidden">
        <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-[var(--landing-yellow)] opacity-[0.03] blur-[40px] pointer-events-none" />
        <span className="font-ibm-mono text-[11px] font-bold text-[var(--landing-yellow)] tracking-[2px] mb-4 uppercase">
          [AFTER] // COMPLIANT PAYMENT CLARITY
        </span>
        <p className="font-ibm-mono text-[11px] text-[#888888] tracking-[1px] leading-[1.6] uppercase mb-8 h-[36px]">
          VERIFIED CATEGORIES BECOME CLEARER DESCRIPTORS, WHILE SENSITIVE OR RESTRICTED ITEMS ARE ROUTED TO REVIEW INSTEAD OF BEING DISGUISED.
        </p>

        <div className="flex flex-col gap-[2px]">
          {rows.map((row, idx) => {
            const isRevealed = isClient && activeIndex >= idx;
            return (
              <div 
                key={`after-${idx}`} 
                className={`flex items-center justify-between h-[48px] px-6 bg-[#111111] border-l-2 transition-all duration-500 overflow-hidden ${isRevealed ? getStatusColor(row.status) : "border-[#1D1D1D] opacity-0 translate-x-4"}`}
              >
                <span className="font-ibm-mono text-[11px] md:text-[12px] uppercase truncate pr-4">{isRevealed ? row.after : ""}</span>
                {isRevealed && (
                  <span className={`font-ibm-mono text-[9px] font-bold px-2 py-0.5 border shrink-0 tracking-[1px] ${getStatusColor(row.status)}`}>
                    {row.tag}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-[#1D1D1D] pt-6">
          <div className="flex items-center justify-center h-[28px] px-[12px] bg-[var(--landing-yellow)] w-fit">
            <span className="font-ibm-mono text-[10px] font-bold text-[#0A0A0A] tracking-[2px] uppercase">
              VERIFIED CLARITY
            </span>
          </div>
          <span className="font-ibm-mono text-[9px] text-[#555] tracking-[1px] uppercase max-w-[250px] text-left md:text-right">
            BRAND-SENSITIVE OR RESTRICTED PRODUCTS SHOULD REQUIRE AUTHORIZATION REVIEW, NOT DESCRIPTOR MASKING.
          </span>
        </div>
      </div>
    </div>
  )
}
