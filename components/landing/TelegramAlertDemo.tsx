"use client"
import { useEffect, useState, useRef } from "react"
import { Send, Bell } from "lucide-react"

type AlertType = "success" | "warning" | "muted" | "danger"

interface AlertData {
  id: string
  title: string
  store: string
  amount?: string
  status: string
  webhook?: string
  nextAttempt?: string
  account?: string
  operator?: string
  evidence?: string
  trace: string
  type: AlertType
  time: string
}

const mockAlertsSource = [
  {
    title: "Payment Captured",
    store: "Demo Store",
    amount: "$302.41",
    status: "COMPLETED",
    webhook: "Delivered 200 OK",
    trace: "tx_98f72a1b4c",
    type: "success" as AlertType
  },
  {
    title: "Webhook Retry Scheduled",
    store: "Demo Store",
    status: "RETRYING",
    nextAttempt: "2 min",
    trace: "tx_a14c92f7e1",
    type: "warning" as AlertType
  },
  {
    title: "Authorization Created",
    store: "Demo Store",
    amount: "$187.19",
    status: "AUTHORIZED",
    account: "Profile Matched",
    trace: "tx_7d0f31aa92",
    type: "warning" as AlertType
  },
  {
    title: "Refund Logged",
    store: "Demo Store",
    amount: "$49.00",
    status: "REFUNDED",
    operator: "Admin Action",
    trace: "tx_c827f2e0ab",
    type: "muted" as AlertType
  },
  {
    title: "Dispute Flag Detected",
    store: "Demo Store",
    status: "Needs Review",
    evidence: "Trace Ready",
    trace: "tx_f91a73dd80",
    type: "danger" as AlertType
  }
]

export default function TelegramAlertDemo() {
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [isClient, setIsClient] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    setIsClient(true)
    
    // Deterministic initial messages
    const now = new Date()
    const timeStr = () => `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    
    const initial: AlertData[] = [
      { ...mockAlertsSource[0], id: "init1", time: timeStr() }
    ]
    setAlerts(initial)

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReducedMotion) {
      setAlerts([
        { ...mockAlertsSource[0], id: "init1", time: timeStr() },
        { ...mockAlertsSource[1], id: "init2", time: timeStr() },
        { ...mockAlertsSource[2], id: "init3", time: timeStr() },
      ])
      return
    }

    let currentIndex = 1
    let idCounter = 10
    
    const timeout = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setAlerts(prev => {
          const newItem = {
            ...mockAlertsSource[currentIndex],
            id: `alert-${idCounter++}`,
            time: timeStr()
          }
          currentIndex = (currentIndex + 1) % mockAlertsSource.length
          const next = [newItem, ...prev]
          if (next.length > 4) next.pop()
          return next
        })
      }, 2500)
    }, 1000)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const getTypeColor = (type: AlertType) => {
    switch(type) {
      case "success": return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
      case "warning": return "border-[var(--landing-orange)]/30 bg-[var(--landing-orange)]/10 text-[var(--landing-orange)]"
      case "danger": return "border-red-500/30 bg-red-500/10 text-red-500"
      case "muted": return "border-[#3D3D3D] bg-[#2D2D2D]/30 text-[#888888]"
    }
  }

  const getTypeGlow = (type: AlertType) => {
    switch(type) {
      case "success": return "bg-emerald-500"
      case "warning": return "bg-[var(--landing-orange)]"
      case "danger": return "bg-red-500"
      case "muted": return "bg-[#888888]"
    }
  }

  return (
    <div className="flex flex-col w-full max-w-[500px] bg-[#0A0A0A] border border-[#2D2D2D] relative overflow-hidden h-[450px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#2D2D2D] bg-[#111111] z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#2D2D2D] flex items-center justify-center relative">
            <Send size={14} className="text-[#F5F5F0]" />
            {isClient && (
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border-2 border-[#111111]" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-ibm-mono text-[13px] font-bold text-[#F5F5F0] tracking-[1px]">PayDef Alerts</span>
            <span className="font-ibm-mono text-[10px] text-emerald-500 tracking-[1px]">bot • online</span>
          </div>
        </div>
        <Bell size={16} className="text-[#555555]" />
      </div>

      {/* Messages */}
      <div className="flex flex-col-reverse gap-4 p-4 md:p-6 overflow-hidden flex-1 relative z-0">
        {alerts.map((alert, idx) => {
          // idx 0 is the newest (bottom conceptually, but rendered flex-col-reverse puts it at bottom)
          const opacity = idx === 0 ? "opacity-100" : idx === 1 ? "opacity-80" : idx === 2 ? "opacity-50" : "opacity-20"
          const scale = idx === 0 ? "scale-100" : idx === 1 ? "scale-[0.98]" : idx === 2 ? "scale-[0.96]" : "scale-[0.94]"
          
          return (
            <div 
              key={alert.id}
              className={`flex flex-col gap-2 p-4 border border-[#2D2D2D] bg-[#111111] rounded-[4px] transition-all duration-500 ease-out transform-gpu animate-in slide-in-from-bottom-4 fade-in ${opacity} ${scale}`}
              style={{ transformOrigin: "bottom center" }}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${getTypeGlow(alert.type)}`} />
                  <span className="font-grotesk text-[14px] font-bold text-[#F5F5F0] tracking-[1px] uppercase">
                    {alert.title}
                  </span>
                </div>
                <span className="font-ibm-mono text-[10px] text-[#555555]">{alert.time}</span>
              </div>
              
              <div className="flex flex-col gap-1.5 pl-3.5">
                <div className="flex justify-between">
                  <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Store:</span>
                  <span className="font-ibm-mono text-[11px] text-[#CCCCCC] uppercase">{alert.store}</span>
                </div>
                {alert.amount && (
                  <div className="flex justify-between">
                    <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Amount:</span>
                    <span className="font-ibm-mono text-[11px] text-[#F5F5F0] font-bold uppercase">{alert.amount}</span>
                  </div>
                )}
                {alert.webhook && (
                  <div className="flex justify-between">
                    <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Webhook:</span>
                    <span className="font-ibm-mono text-[11px] text-[#CCCCCC] uppercase">{alert.webhook}</span>
                  </div>
                )}
                {alert.nextAttempt && (
                  <div className="flex justify-between">
                    <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Next Attempt:</span>
                    <span className="font-ibm-mono text-[11px] text-[var(--landing-orange)] uppercase">{alert.nextAttempt}</span>
                  </div>
                )}
                {alert.account && (
                  <div className="flex justify-between">
                    <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Account:</span>
                    <span className="font-ibm-mono text-[11px] text-[#CCCCCC] uppercase">{alert.account}</span>
                  </div>
                )}
                {alert.operator && (
                  <div className="flex justify-between">
                    <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Operator:</span>
                    <span className="font-ibm-mono text-[11px] text-[#CCCCCC] uppercase">{alert.operator}</span>
                  </div>
                )}
                {alert.evidence && (
                  <div className="flex justify-between">
                    <span className="font-ibm-mono text-[11px] text-[#888888] uppercase">Evidence:</span>
                    <span className="font-ibm-mono text-[11px] text-[#CCCCCC] uppercase">{alert.evidence}</span>
                  </div>
                )}
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#2D2D2D]">
                  <span className={`font-ibm-mono text-[9px] px-1.5 py-0.5 border uppercase ${getTypeColor(alert.type)}`}>
                    {alert.status}
                  </span>
                  <span className="font-ibm-mono text-[10px] text-[#555555]">{alert.trace}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Input bar mock */}
      <div className="flex items-center p-4 border-t border-[#2D2D2D] bg-[#111111] z-10 gap-3">
        <div className="flex-1 h-8 rounded-full bg-[#1A1A1A] border border-[#2D2D2D] flex items-center px-4">
          <span className="font-ibm-mono text-[11px] text-[#555555]">Message...</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-[var(--landing-yellow)] flex items-center justify-center">
          <span className="font-ibm-mono text-[14px] text-[#0A0A0A] font-bold">/</span>
        </div>
      </div>
    </div>
  )
}
