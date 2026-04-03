"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import useSWR from "swr"
import {
  Shield,
  Bell,
  Settings,
  ChevronDown,
  Circle,
  User,
  FileText,
  LogOut,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "SUPER_ADMIN" | "MERCHANT"

type NotificationTransaction = {
  id: string
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" | "DISPUTED"
  originalAmount: number
  maskedItemName: string
  createdAt: string
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Nav Items ────────────────────────────────────────────────────────────────
const merchantNavItems = [
  { label: "Overview", href: "/" },
  { label: "Accounts", href: "/accounts" },
  { label: "Stores", href: "/stores" },
  { label: "Transactions", href: "/transactions" },
  { label: "Analytics", href: "/analytics" },
  { label: "Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
]

const adminNavItems = [
  { label: "Overview", href: "/super-admin" },
  { label: "Tenants", href: "/super-admin/tenants" },
  { label: "Analytics", href: "/analytics" },
  { label: "Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
]

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: NotificationTransaction["status"] }) {
  const config = {
    COMPLETED: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    FAILED:    { icon: XCircle,      color: "text-red-400",     bg: "bg-red-400/10" },
    PENDING:   { icon: Clock,        color: "text-amber-400",   bg: "bg-amber-400/10" },
    REFUNDED:  { icon: XCircle,      color: "text-orange-400",  bg: "bg-orange-400/10" },
    DISPUTED:  { icon: XCircle,      color: "text-purple-400",  bg: "bg-purple-400/10" },
  }
  const { icon: Icon, color, bg } = config[status] ?? config.PENDING
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${bg} ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {status}
    </span>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
export function DashboardHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [hasUnread, setHasUnread] = useState(true)

  const role = (session?.user?.role as Role) ?? "MERCHANT"
  const userName = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "User"
  const userInitial = userName.charAt(0).toUpperCase()

  // Fetch recent transactions for notifications
  const { data: notificationsData } = useSWR<{ transactions: NotificationTransaction[] }>(
    status === "authenticated" ? "/api/merchant/logs?limit=5" : null,
    fetcher,
    { refreshInterval: 30000 }
  )
  const notifications = notificationsData?.transactions ?? []

  // Clear unread indicator when popover is opened
  const handleNotificationOpen = (open: boolean) => {
    if (open && hasUnread) {
      setHasUnread(false)
    }
  }

  // Dynamic settings link based on role
  const settingsHref = role === "SUPER_ADMIN" ? "/admin/settings" : "/dashboard/settings"

  // Dynamic nav items based on role
  const navItems = role === "SUPER_ADMIN" ? adminNavItems : merchantNavItems

  // Logout handler
  const handleLogout = async () => {
    await signOut({ redirect: false })
    router.push("/login")
  }

  // Show loading state while session is loading
  if (status === "loading") {
    return (
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="flex items-center justify-between px-6 h-12 gap-4">
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
        <Link href={role === "SUPER_ADMIN" ? "/super-admin" : "/"} className="flex items-center gap-2.5 shrink-0">
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
            const isActive = item.href === "/" || item.href === "/super-admin"
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

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* System Status */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-md">
            <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400 animate-pulse" />
            All Systems Operational
          </div>

          {/* Notifications Bell */}
          <Popover onOpenChange={handleNotificationOpen}>
            <PopoverTrigger asChild>
              <button className="relative p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md">
                <Bell className="w-4 h-4" />
                {hasUnread && notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-400 rounded-full" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 bg-card border-border">
              <div className="px-4 py-3 border-b border-border">
                <h4 className="text-sm font-mono font-semibold text-foreground">Recent Transactions</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Latest activity on your account</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No recent transactions
                  </div>
                ) : (
                  notifications.map((txn) => (
                    <div
                      key={txn.id}
                      className="px-4 py-2.5 border-b border-border/50 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-foreground truncate">
                          {txn.maskedItemName || "Transaction"}
                        </span>
                        <StatusBadge status={txn.status} />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ${Number(txn.originalAmount).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(txn.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border">
                <Link
                  href="/logs"
                  className="flex items-center justify-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View All Transactions
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </PopoverContent>
          </Popover>

          {/* Settings Gear */}
          <Link
            href={settingsHref}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md"
          >
            <Settings className="w-4 h-4" />
          </Link>

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-xs font-mono text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 hover:bg-secondary/80 transition-colors">
                <div className="w-5 h-5 rounded-full bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center text-cyan-400 text-[10px] font-bold">
                  {userInitial}
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
