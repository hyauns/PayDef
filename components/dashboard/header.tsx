"use client"

// This file is the canonical DashboardHeader implementation.
// It was formerly at components/nav/top-bar.tsx which is now deleted.

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import {
  Shield,
  Settings,
  ChevronDown,
  Circle,
  User,
  FileText,
  LogOut,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/components/nav/notification-bell"

type Role = "SUPER_ADMIN" | "MERCHANT"

const MERCHANT_NAV = [
  { label: "Overview",     href: "/" },
  { label: "Accounts",     href: "/accounts" },
  { label: "Stores",       href: "/stores" },
  { label: "Transactions", href: "/transactions" },
  { label: "Analytics",    href: "/analytics" },
  { label: "Logs",         href: "/logs" },
  { label: "Settings",     href: "/settings" },
]

const ADMIN_NAV = [
  { label: "Overview",  href: "/super-admin" },
  { label: "Tenants",   href: "/super-admin/tenants" },
  { label: "Analytics", href: "/analytics" },
  { label: "Logs",      href: "/logs" },
  { label: "Settings",  href: "/settings" },
]

export function DashboardHeader() {
  const pathname = usePathname()
  const router   = useRouter()
  const { data: session, status } = useSession()

  const role         = (session?.user?.role as Role) ?? "MERCHANT"
  const userName     = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "User"
  const initial      = userName.charAt(0).toUpperCase()
  const navItems     = role === "SUPER_ADMIN" ? ADMIN_NAV : MERCHANT_NAV
  const settingsHref = role === "SUPER_ADMIN" ? "/admin/settings" : "/settings"

  const handleLogout = async () => {
    await signOut({ redirect: false })
    router.push("/login")
  }

  if (status === "loading") {
    return (
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="flex items-center justify-between px-6 h-12">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-cyan-400/10 border border-cyan-400/30 rounded-md flex items-center justify-center">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="font-mono text-sm font-semibold text-foreground">Gateway Central</span>
          </div>
          <div className="w-24 h-6 bg-secondary animate-pulse rounded" />
        </div>
      </header>
    )
  }

  return (
    <header className="border-b border-border bg-card sticky top-0 z-30">
      <div className="flex items-center justify-between px-6 h-12 gap-4">

        {/* Logo */}
        <Link
          href={role === "SUPER_ADMIN" ? "/super-admin" : "/"}
          className="flex items-center gap-2.5 shrink-0"
        >
          <div className="w-7 h-7 bg-cyan-400/10 border border-cyan-400/30 rounded-md flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-semibold text-foreground">Gateway</span>
            <span className="font-mono text-sm font-semibold text-cyan-400">Central</span>
            <span className="text-xs font-mono text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded ml-1">
              {role === "SUPER_ADMIN" ? "ADMIN" : "ENTERPRISE"}
            </span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" || item.href === "/super-admin"
                ? pathname === item.href
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                  isActive
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right-side controls */}
        <div className="flex items-center gap-2 shrink-0">

          {/* System status pill */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-md">
            <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400 animate-pulse" />
            All Systems Operational
          </div>

          {/* Notification bell */}
          <NotificationBell />

          {/* Settings icon */}
          <Link
            href={settingsHref}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md"
          >
            <Settings className="w-4 h-4" />
          </Link>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-xs font-mono text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 hover:bg-secondary/80 transition-colors">
                <div className="w-5 h-5 rounded-full bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center text-cyan-400 text-[10px] font-bold">
                  {initial}
                </div>
                <span className="max-w-[80px] truncate">{userName}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border">
              <DropdownMenuLabel className="font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">{userName}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {role === "SUPER_ADMIN" ? "Super Administrator" : "Merchant"}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem asChild className="cursor-pointer font-mono text-xs">
                <Link href={settingsHref}>
                  <User className="w-4 h-4 mr-2" />
                  Profile Settings
                </Link>
              </DropdownMenuItem>
              {role === "MERCHANT" && (
                <DropdownMenuItem asChild className="cursor-pointer font-mono text-xs">
                  <Link href="/docs/api">
                    <FileText className="w-4 h-4 mr-2" />
                    API Documentation
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer font-mono text-xs text-red-400 focus:text-red-400 focus:bg-red-400/10"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </header>
  )
}
