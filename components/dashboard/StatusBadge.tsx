import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const s = status.toLowerCase()

  // Default neutral
  let styles = "text-[#cbd5e1] bg-[#2f3542] border-[#475569]"
  let dot = "bg-[#94a3b8]"

  if (["active", "success", "completed", "captured", "delivered", "healthy", "operational"].includes(s)) {
    styles = "text-[#34d399] bg-[#063f33] border-[#0f766e]"
    dot = "bg-[#34d399]"
  } else if (["pending", "authorized", "retrying", "warming_up", "warm-up", "warming up"].includes(s)) {
    styles = "text-[#facc15] bg-[#4a3908] border-[#ca8a04]"
    dot = "bg-[#facc15]"
  } else if (["suspended", "failed", "error", "declined", "dispute", "down"].includes(s)) {
    styles = "text-[#fb7185] bg-[#4a1d24] border-[#be123c]"
    dot = "bg-[#fb7185]"
  } else if (["paused"].includes(s)) {
    styles = "text-[#cbd5e1] bg-[#2f3542] border-[#475569]"
    dot = "bg-[#cbd5e1]"
  } else if (["refunded", "voided", "canceled", "limited"].includes(s)) {
    styles = "text-[#93c5fd] bg-[#1e3a8a]/40 border-[#1e40af]/60"
    dot = "bg-[#60a5fa]"
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase", styles, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      {label || status}
    </span>
  )
}
