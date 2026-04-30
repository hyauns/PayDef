import { ReactNode } from "react"

interface DashboardPageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function DashboardPageHeader({ eyebrow, title, description, action }: DashboardPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <div className="text-xs font-bold text-[#97aac1] uppercase tracking-wider mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-bold text-[#e2eeff] tracking-tight">{title}</h1>
        {description && (
          <div className="text-base text-[#97aac1] mt-2">{description}</div>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
