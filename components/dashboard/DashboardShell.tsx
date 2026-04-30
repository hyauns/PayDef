"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar"

type Role = "SUPER_ADMIN" | "MERCHANT"

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { data: session, status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const role = (session?.user?.role as Role) ?? "MERCHANT"

  // Show a minimal loading shell while session is resolving
  if (status === "loading") {
    return (
      <div className="flex h-dvh bg-[#151821]">
        {/* Sidebar skeleton */}
        <div className="hidden lg:flex w-[250px] bg-[#1f222c] border-r border-[#303442] flex-col">
          <div className="h-[60px] px-5 border-b border-[#303442] flex items-center">
            <div className="h-5 w-24 bg-[#2a2d39] rounded animate-pulse" />
          </div>
          <div className="flex-1 p-3 space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 bg-[#2a2d39] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
        {/* Content skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="h-[60px] bg-[#1b1e27] border-b border-[#303442] flex items-center px-6">
            <div className="h-4 w-32 bg-[#2a2d39] rounded animate-pulse" />
          </div>
          <div className="flex-1 p-6 space-y-4">
            <div className="h-8 w-48 bg-[#2a2d39] rounded animate-pulse" />
            <div className="h-32 bg-[#2a2d39] rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh bg-[#151821] overflow-hidden">
      {/* Sidebar */}
      <DashboardSidebar
        role={role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <DashboardTopbar onMenuToggle={() => setSidebarOpen(o => !o)} />

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
