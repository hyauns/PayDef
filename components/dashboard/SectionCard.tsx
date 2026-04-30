import { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { GridBackground } from "@/components/ui/grid-background"

interface SectionCardProps {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function SectionCard({ title, description, action, children, className, noPadding = false }: SectionCardProps) {
  return (
    <div className={cn("bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden flex flex-col relative", className)} data-ui-version="grid-background-v1">
      <GridBackground />
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#343947] to-transparent opacity-50 z-10" />
      {(title || action) && (
        <div className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-[#343947] bg-[#1f222c]">
          <div>
            {title && <h3 className="text-lg font-bold text-[#e7edf8]">{title}</h3>}
            {description && <p className="text-sm font-medium text-[#97a3b6] mt-1">{description}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn("relative z-10 flex-1 bg-[#222530]", !noPadding && "p-6")}>
        {children}
      </div>
    </div>
  )
}

