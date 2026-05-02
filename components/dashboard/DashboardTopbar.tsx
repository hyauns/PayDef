"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import {
  Menu,
  ChevronDown,
  User,
  FileText,
  LogOut,
  Settings,
  Search,
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
import { useLanguage } from "@/components/i18n/LanguageProvider"

type Role = "SUPER_ADMIN" | "MERCHANT"

// Map pathname to a readable page title
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/analytics": "Analytics",
  "/transactions": "Transactions",
  "/accounts": "Merchant Accounts",
  "/stores": "Connected Stores",
  "/domains": "Shield Domains",
  "/logs": "System Logs",
  "/settings": "Settings",
  "/super-admin": "Super Admin",
  "/super-admin/tenants": "Tenant Management",
  "/super-admin/domains": "Domain Admin",
}

interface TopbarProps {
  onMenuToggle: () => void
}

export function DashboardTopbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const useLanguageHook = useLanguage()

  const role = (session?.user?.role as Role) ?? "MERCHANT"
  const userName = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "User"
  const userEmail = session?.user?.email ?? ""
  const initial = userName.charAt(0).toUpperCase()

  const pageTitle = PAGE_TITLES[pathname] ?? "Dashboard"

  const handleLogout = async () => {
    await signOut({ redirect: false })
    router.push("/login")
  }

  return (
    <header className="sticky top-0 z-30 h-[60px] bg-[#1b1e27] border-b border-[#303442] flex items-center justify-between px-4 md:px-6 gap-4">
      {/* Left: hamburger + page title + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 text-[#97aac1] hover:text-white transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page title — matches template .page-title-head h4 uppercase */}
        <div className="flex items-center gap-2">
          <h4 className="text-[15px] font-semibold text-[#aab8c5] uppercase tracking-wide">
            {pageTitle}
          </h4>
        </div>
      </div>

      {/* Center: search placeholder — matches template .topbar-search */}
      <div className="hidden xl:flex items-center gap-2 text-[13px] text-[#97aac1] bg-[#2a2d39] border border-[#303442] rounded-lg px-3 py-1.5 min-w-[260px] cursor-default">
        <Search className="w-4 h-4 shrink-0" />
        <span>Search...</span>
        <span className="ml-auto text-[11px] bg-[#343947] border border-[#404656] rounded px-1.5 py-0.5 text-[#97aac1]">⌘K</span>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Language Switcher */}
        <div className="hidden sm:flex items-center bg-[#2a2d39] border border-[#303442] rounded-md p-0.5">
          <button
            onClick={() => useLanguageHook.setLanguage("en")}
            className={`px-2 py-1 text-[11px] font-semibold rounded-[4px] transition-colors ${
              useLanguageHook.language === "en"
                ? "bg-[#343947] text-white shadow-sm"
                : "text-[#97aac1] hover:text-[#e2eeff]"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => useLanguageHook.setLanguage("vi")}
            className={`px-2 py-1 text-[11px] font-semibold rounded-[4px] transition-colors ${
              useLanguageHook.language === "vi"
                ? "bg-[#343947] text-white shadow-sm"
                : "text-[#97aac1] hover:text-[#e2eeff]"
            }`}
          >
            VI
          </button>
        </div>

        {/* Role badge */}
        <span className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border ${
          role === "SUPER_ADMIN"
            ? "text-red-400 bg-red-400/10 border-red-400/20"
            : "text-[#FFD600] bg-[#FFD600]/8 border-[#FFD600]/15"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${role === "SUPER_ADMIN" ? "bg-red-400" : "bg-[#FFD600]"}`} />
          {role === "SUPER_ADMIN" ? "ADMIN" : "MERCHANT"}
        </span>

        {/* Notification bell */}
        <NotificationBell />

        {/* Settings shortcut — matches template topbar-item icon button */}
        <Link
          href="/settings"
          className="p-1.5 text-[#97aac1] hover:text-[#e2eeff] transition-colors rounded-md border border-[#303442] hover:bg-[#2a2d39]"
        >
          <Settings className="w-4 h-4" />
        </Link>

        {/* User dropdown — matches template user dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 text-[13px] text-[#aab8c5] border border-[#303442] rounded-lg px-2.5 py-1.5 hover:bg-[#2a2d39] transition-colors">
              <div className="w-6 h-6 rounded-full bg-[#2a2d39] border border-[#404656] flex items-center justify-center text-[#e2eeff] text-[11px] font-semibold">
                {initial}
              </div>
              <span className="max-w-[90px] truncate hidden lg:inline">{userName}</span>
              <ChevronDown className="w-3 h-3 text-[#97aac1] hidden lg:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#1f222c] border-[#303442]">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-[#e2eeff]">{userName}</span>
                <span className="text-xs text-[#97aac1] font-normal">
                  {role === "SUPER_ADMIN" ? "Super Administrator" : "Merchant"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#303442]" />
            <DropdownMenuItem asChild className="cursor-pointer text-[13px] text-[#97aac1] hover:text-[#e2eeff] focus:text-[#e2eeff] focus:bg-[#2a2d39]">
              <Link href="/settings">
                <User className="w-4 h-4 mr-2" />
                Profile Settings
              </Link>
            </DropdownMenuItem>
            {role === "MERCHANT" && (
              <DropdownMenuItem asChild className="cursor-pointer text-[13px] text-[#97aac1] hover:text-[#e2eeff] focus:text-[#e2eeff] focus:bg-[#2a2d39]">
                <Link href="/docs/api">
                  <FileText className="w-4 h-4 mr-2" />
                  API Documentation
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-[#303442]" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-[13px] text-red-400 focus:text-red-400 focus:bg-red-400/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
