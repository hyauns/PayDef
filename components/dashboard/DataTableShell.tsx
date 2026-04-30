import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DataTableShellProps {
  children: ReactNode
  className?: string
}

export function DataTableShell({ children, className }: DataTableShellProps) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="min-w-full inline-block align-middle">
        <div className="overflow-hidden border-t border-[#343947]">
          {children}
        </div>
      </div>
    </div>
  )
}
