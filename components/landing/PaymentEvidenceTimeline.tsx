"use client"
import { useEffect, useState, useRef } from "react"
import { GitBranch, RefreshCcw, CreditCard, RotateCcw, BadgeCheck, ShieldCheck, Check } from "lucide-react"

const events = [
  { time: "14:02:10", label: "CHECKOUT CREATED", checklistIndex: 0 },
  { time: "14:02:11", label: "ACCOUNT ROUTED", checklistIndex: 2 },
  { time: "14:02:12", label: "AUTHORIZED // PAYPAL", checklistIndex: -1 },
  { time: "14:02:13", label: "DISPLAY PROFILE MATCHED", checklistIndex: 4 },
  { time: "14:02:15", label: "WEBHOOK SENT // 200 OK", checklistIndex: 1 },
  { time: "14:03:00", label: "CAPTURED MANUALLY", checklistIndex: 3 },
  { time: "14:03:02", label: "EVIDENCE READY", checklistIndex: 5 },
]

const checklist = [
  { label: "TRACE CHECKOUT TO CAPTURE", Icon: GitBranch },
  { label: "TRACK WEBHOOK HISTORY", Icon: RefreshCcw },
  { label: "VIEW ACCOUNT USED", Icon: CreditCard },
  { label: "REVIEW REFUND ACTIONS", Icon: RotateCcw },
  { label: "CONSISTENT DESCRIPTIONS", Icon: BadgeCheck },
  { label: "FASTER DISPUTE RESPONSE", Icon: ShieldCheck },
]

export default function PaymentEvidenceTimeline() {
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isClient, setIsClient] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setIsClient(true)
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReducedMotion) {
      setActiveIndex(events.length - 1)
      return
    }

    let current = 0
    const timeout = setTimeout(() => {
      setActiveIndex(current)
      intervalRef.current = setInterval(() => {
        current = (current + 1) % (events.length + 2) // pause briefly at the end
        if (current >= events.length) {
           // stay on the last index for a bit
           setActiveIndex(events.length - 1)
        } else {
           setActiveIndex(current)
        }
      }, 1500)
    }, 500)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const getStatusBadge = () => {
    if (!isClient || activeIndex < 0) return "WAITING"
    if (activeIndex >= 6) return "EVIDENCE READY"
    if (activeIndex >= 5) return "CAPTURED"
    if (activeIndex >= 4) return "WEBHOOK OK"
    if (activeIndex >= 2) return "AUTHORIZED"
    return "CHECKOUT"
  }

  const activeChecklistIndices = new Set(
    events.slice(0, activeIndex + 1).map(e => e.checklistIndex).filter(i => i !== -1)
  )

  return (
    <div className="flex flex-col lg:flex-row w-full gap-[2px]">
      {/* TIMELINE PANEL */}
      <div className="flex flex-col bg-[#0A0A0A] p-6 md:p-10 border border-[#2D2D2D] flex-[2]">
        <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-4 mb-6 h-[40px]">
          <span className="font-ibm-mono text-[12px] text-[#F5F5F0] tracking-[1px] uppercase">
            TRANSACTION TRACE // tx_98f72a1b4c
          </span>
          {isClient && activeIndex >= 0 && (
            <span className={`font-ibm-mono text-[10px] px-2 py-1 font-bold tracking-[1px] uppercase transition-colors duration-300 ${
              getStatusBadge() === "EVIDENCE READY" ? "bg-emerald-500 text-[#0A0A0A]" :
              getStatusBadge() === "WEBHOOK OK" ? "bg-[var(--landing-yellow)] text-[#0A0A0A]" :
              getStatusBadge() === "CAPTURED" ? "bg-[var(--landing-yellow)] text-[#0A0A0A]" :
              "bg-[#2D2D2D] text-[#888888]"
            }`}>
              {getStatusBadge()}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 relative">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-[#2D2D2D]" />
          
          {isClient && activeIndex >= 0 && (
            <div 
              className="absolute left-3 top-2 w-px bg-[var(--landing-yellow)] transition-all duration-700 ease-out z-0" 
              style={{ height: `${Math.min((activeIndex / (events.length - 1)) * 100, 100)}%` }}
            />
          )}

          {events.map((event, i) => {
            const isCompleted = isClient && i < activeIndex
            const isCurrent = isClient && i === activeIndex
            const isPending = !isClient || i > activeIndex

            return (
              <div key={i} className="flex gap-4 relative z-10 items-center min-h-[32px]">
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 bg-[#0A0A0A]
                  ${isCurrent ? "border-[var(--landing-yellow)] shadow-[0_0_10px_rgba(255,214,0,0.3)]" : 
                    isCompleted ? "border-emerald-500/50" : "border-[#2D2D2D]"}`
                }>
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 
                    ${isCurrent ? "bg-[var(--landing-yellow)] animate-pulse" : 
                      isCompleted ? "bg-emerald-500" : "bg-[#2D2D2D]"}`
                  } />
                </div>
                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-3">
                    <span className={`font-ibm-mono text-[11px] transition-colors duration-300 ${
                      isCurrent ? "text-[var(--landing-yellow)]" : 
                      isCompleted ? "text-[#888888]" : "text-[#444444]"
                    }`}>
                      {event.time}
                    </span>
                    <span className={`font-ibm-mono text-[12px] md:text-[13px] font-bold uppercase transition-colors duration-300 ${
                      isCurrent ? "text-[var(--landing-text-light)]" : 
                      isCompleted ? "text-[#CCCCCC]" : "text-[#555555]"
                    }`}>
                      {event.label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CHECKLIST PANEL */}
      <div className="flex flex-col bg-[#0F0F0F] border border-[#2D2D2D] flex-1">
        {checklist.map((item, i) => {
          const isChecklistActive = isClient && activeChecklistIndices.has(i)
          return (
            <div 
              key={i} 
              className={`flex items-center justify-between border-b border-[#2D2D2D] p-5 lg:p-6 last:border-b-0 h-full transition-all duration-500 ${
                isChecklistActive ? "bg-[#141414]" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-4">
                <item.Icon 
                  size={16} 
                  className={`transition-colors duration-500 ${
                    isChecklistActive ? "text-[var(--landing-yellow)]" : "text-[#444444]"
                  }`} 
                />
                <span className={`font-ibm-mono text-[11px] md:text-[12px] tracking-[1px] uppercase transition-colors duration-500 ${
                  isChecklistActive ? "text-[#F5F5F0]" : "text-[#555555]"
                }`}>
                  {item.label}
                </span>
              </div>
              {isChecklistActive && (
                <div className="animate-in fade-in zoom-in duration-300">
                  <Check size={14} className="text-emerald-500" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
