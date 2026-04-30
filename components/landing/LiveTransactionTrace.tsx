"use client"
import { useEffect, useState } from "react"

type Status = "CHECKOUT" | "AUTHORIZED" | "CAPTURED" | "VOIDED" | "REFUNDED" | "WEBHOOK OK" | "RETRYING" | "DISPUTE FLAG"

interface TraceEvent {
  id: string
  time: string
  tx: string
  status: Status
}

const mockTxs = [
  "tx_98f72a1b4c", "tx_a14c92f7e1", "tx_7d0f31aa92", "tx_c827f2e0ab", "tx_f91a73dd80",
  "tx_1e4a78bc90", "tx_b49e31d2a1", "tx_5c829e1f4a", "tx_8b21a0f9e3", "tx_2a4e9b7d1c"
]
const mockStatuses: Status[] = ["CHECKOUT", "AUTHORIZED", "CAPTURED", "VOIDED", "REFUNDED", "WEBHOOK OK", "RETRYING", "DISPUTE FLAG"]

const initialEvents: TraceEvent[] = [
  { id: "e1", time: "14:02:18", tx: "wh_2f918a", status: "WEBHOOK OK" },
  { id: "e2", time: "14:02:15", tx: "tx_98f72a1b4c", status: "CAPTURED" },
  { id: "e3", time: "14:02:12", tx: "tx_98f72a1b4c", status: "AUTHORIZED" },
  { id: "e4", time: "14:02:10", tx: "tx_98f72a1b4c", status: "CHECKOUT" },
  { id: "e5", time: "14:01:55", tx: "tx_7d0f31aa92", status: "REFUNDED" },
]

export default function LiveTransactionTrace() {
  const [events, setEvents] = useState<TraceEvent[]>(initialEvents)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    let counter = 6
    const interval = setInterval(() => {
      setEvents(prev => {
        const now = new Date()
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
        
        const randomTx = mockTxs[Math.floor(Math.random() * mockTxs.length)]
        const randomStatus = mockStatuses[Math.floor(Math.random() * mockStatuses.length)]
        
        const newEvent: TraceEvent = {
          id: `e${counter++}`,
          time,
          tx: randomStatus === "WEBHOOK OK" ? `wh_${Math.random().toString(36).substr(2, 6)}` : randomTx,
          status: randomStatus
        }

        const next = [newEvent, ...prev]
        if (next.length > 5) next.pop()
        return next
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: Status) => {
    switch (status) {
      case "CAPTURED":
      case "WEBHOOK OK": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30"
      case "AUTHORIZED":
      case "CHECKOUT": return "text-[var(--landing-yellow)] bg-[var(--landing-yellow)]/10 border-[var(--landing-yellow)]/30"
      case "VOIDED":
      case "REFUNDED": return "text-[#888888] bg-[#2D2D2D]/30 border-[#3D3D3D]"
      case "RETRYING": return "text-[var(--landing-orange)] bg-[var(--landing-orange)]/10 border-[var(--landing-orange)]/30"
      case "DISPUTE FLAG": return "text-red-500 bg-red-500/10 border-red-500/30"
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center justify-between mb-6">
        <span className="font-ibm-mono text-[11px] font-bold text-[var(--landing-orange)] tracking-[2px]">
          [02] TRANSACTION TRACE
        </span>
        {isClient && (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-ibm-mono text-[9px] text-[#888] tracking-[1px]">LIVE • 24 EVENTS/MIN</span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col gap-2 relative overflow-hidden">
        {events.map((ev, i) => (
          <div 
            key={ev.id} 
            className="flex items-center justify-between border-b border-[#2D2D2D] pb-3 mb-1 animate-in fade-in slide-in-from-top-2 duration-500"
            style={{ animationFillMode: "both" }}
          >
            <div className="flex items-center gap-3">
              <div className="font-ibm-mono text-[10px] text-[#555]">{ev.time}</div>
              <div className="font-ibm-mono text-[12px] text-[var(--landing-text-light)]">{ev.tx}</div>
            </div>
            <div className={`px-2 py-1 border font-ibm-mono text-[9px] tracking-[1px] uppercase ${getStatusColor(ev.status)}`}>
              {ev.status}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4 flex items-center gap-2">
        <span className="font-ibm-mono text-[9px] text-[#444] tracking-[1px]">checkout → execute → webhook</span>
      </div>
    </div>
  )
}
