"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BarChart3,
  ArrowRightLeft,
  Users,
  Store,
  Globe,
  ScrollText,
  Settings,
  ShieldAlert,
  Users2,
  Boxes,
  X,
  BookOpen,
  Layers,
} from "lucide-react"

type Role = "SUPER_ADMIN" | "MERCHANT"

interface SidebarProps {
  role: Role
  open: boolean
  onClose: () => void
}

const SHARED_LINKS = [
  { label: "Dashboard",    href: "/dashboard",     icon: LayoutDashboard },
  { label: "Analytics",    href: "/analytics",     icon: BarChart3 },
  { label: "Transactions", href: "/transactions",  icon: ArrowRightLeft },
  { label: "Payment Identities", href: "/payment-identities", icon: Layers },
  { label: "Domains",      href: "/domains",       icon: Globe },
  { label: "Logs",         href: "/logs",          icon: ScrollText },
]

const MERCHANT_ONLY_LINKS = [
  { label: "Accounts",     href: "/accounts",      icon: Users },
  { label: "Stores",       href: "/stores",        icon: Store },
  { label: "Settings",     href: "/settings",      icon: Settings },
  { label: "Documents",    href: "/documents",     icon: BookOpen },
]

const ADMIN_LINKS = [
  { label: "Admin Overview", href: "/super-admin",                    icon: ShieldAlert },
  { label: "Tenants",        href: "/super-admin/tenants",            icon: Users2 },
  { label: "Admin Domains",  href: "/super-admin/domains",            icon: Globe },
  { label: "Identity Bundles", href: "/super-admin/identity-bundles", icon: Boxes },
]

export function DashboardSidebar({ role, open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const isSuperAdmin = role === "SUPER_ADMIN"

  const isActive = (href: string) => {
    if (href === "/dashboard" || href === "/super-admin") return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        data-ui-version="super-admin-sidebar-merchant-links-hidden-v1"
        className={`
          fixed top-0 left-0 z-50 h-dvh w-[250px] bg-[#1f222c]
          border-r border-[#303442] flex flex-col
          transition-transform duration-200 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand / logo area — matches template .logo sticky top */}
        <div className="flex items-center justify-between h-[60px] px-5 border-b border-[#303442] shrink-0">
          <Link
            href={isSuperAdmin ? "/super-admin" : "/dashboard"}
            className="flex items-center gap-2.5"
            onClick={onClose}
          >
            <img
              src="/redesign/brand/dr.png"
              alt="PayDef"
              className="h-[22px] w-auto"
            />
            <span className="text-[14px] font-semibold text-[#c8cfd8] tracking-wide">
              PayDef
            </span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-[#6b7280] hover:text-[#e2eeff] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-0.5">
          {/* Section title — template: .side-nav-title uppercase, letter-spacing 0.1em */}
          <p className="px-3 pb-2.5 pt-1 text-[11px] font-bold text-[#6b7280] uppercase tracking-[0.1em]">
            {isSuperAdmin ? "Platform" : "Merchant"}
          </p>

          {/* Shared operational links (rendered for everyone) */}
          {SHARED_LINKS.map((link) => {
            const active = isActive(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`
                  group relative flex items-center gap-3 px-3 py-[9px] rounded-lg
                  text-[14px] transition-colors
                  ${active
                    ? "bg-[#2a2d39] text-[#e2eeff] font-medium"
                    : "text-[#97aac1] hover:text-[#e2eeff] hover:bg-[#2a2d39]"
                  }
                `}
              >
                {/* Active left accent bar */}
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-sm bg-[#FFD600]" />
                )}
                <link.icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-[#e2eeff]" : "text-[#6b7280] group-hover:text-[#97aac1]"}`} />
                <span>{link.label}</span>
              </Link>
            )
          })}

          {/* Merchant-only links */}
          {!isSuperAdmin && MERCHANT_ONLY_LINKS.map((link) => {
            const active = isActive(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`
                  group relative flex items-center gap-3 px-3 py-[9px] rounded-lg
                  text-[14px] transition-colors
                  ${active
                    ? "bg-[#2a2d39] text-[#e2eeff] font-medium"
                    : "text-[#97aac1] hover:text-[#e2eeff] hover:bg-[#2a2d39]"
                  }
                `}
              >
                {/* Active left accent bar */}
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-sm bg-[#FFD600]" />
                )}
                <link.icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-[#e2eeff]" : "text-[#6b7280] group-hover:text-[#97aac1]"}`} />
                <span>{link.label}</span>
              </Link>
            )
          })}

          {/* Super Admin section */}
          {isSuperAdmin && (
            <>
              <div className="pt-5 pb-2.5">
                <p className="px-3 text-[11px] font-bold text-[#6b7280] uppercase tracking-[0.1em]">
                  Super Admin
                </p>
              </div>
              {ADMIN_LINKS.map((link) => {
                const active = isActive(link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className={`
                      group relative flex items-center gap-3 px-3 py-[9px] rounded-lg
                      text-[14px] transition-colors
                      ${active
                        ? "bg-[#2a2d39] text-red-400 font-medium"
                        : "text-[#97aac1] hover:text-[#e2eeff] hover:bg-[#2a2d39]"
                      }
                    `}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-sm bg-red-400" />
                    )}
                    <link.icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-red-400" : "text-[#6b7280] group-hover:text-[#97aac1]"}`} />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        {/* Footer status */}
        <div className="px-5 py-3 border-t border-[#303442] shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[#97aac1]">Systems</span>
            <span>Operational</span>
          </div>
        </div>
      </aside>
    </>
  )
}
