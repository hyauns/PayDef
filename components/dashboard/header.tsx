"use client"

import { useState } from "react"
import { Shield, Bell, Settings, ChevronDown, Circle } from "lucide-react"

const navItems = ["Overview", "Accounts", "Stores", "Analytics", "Logs", "Settings"]

export function DashboardHeader() {
  const [activeNav, setActiveNav] = useState("Overview")

  return (
    <header className="border-b border-border bg-card sticky top-0 z-30">
      <div className="flex items-center justify-between px-6 h-12 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 bg-cyan-400/10 border border-cyan-400/30 rounded-md flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-semibold text-foreground">Gateway</span>
            <span className="font-mono text-sm font-semibold text-cyan-400">Central</span>
            <span className="text-xs font-mono text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded ml-1">
              ENTERPRISE
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                activeNav === item
                  ? "text-foreground bg-secondary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-md">
            <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400 animate-pulse" />
            All Systems Operational
          </div>
          <button className="relative p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-400 rounded-full" />
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md">
            <Settings className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-2 text-xs font-mono text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 hover:bg-secondary/80 transition-colors">
            <div className="w-5 h-5 rounded-full bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center text-cyan-400 text-[10px] font-bold">
              A
            </div>
            Admin
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  )
}
