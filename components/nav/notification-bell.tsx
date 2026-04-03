"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  BellOff,
  Check,
  Trash2,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useNotifications, type Notification, type NotificationType } from "@/hooks/use-notifications"

// ─── Type config ──────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<NotificationType, {
  Icon:       React.ComponentType<{ className?: string }>
  iconClass:  string
  bgClass:    string
  borderClass: string
  label:      string
}> = {
  success: {
    Icon:        CheckCircle2,
    iconClass:   "text-emerald-400",
    bgClass:     "bg-emerald-400/10",
    borderClass: "border-emerald-400/20",
    label:       "SUCCESS",
  },
  failed: {
    Icon:        XCircle,
    iconClass:   "text-red-400",
    bgClass:     "bg-red-400/10",
    borderClass: "border-red-400/20",
    label:       "FAILED",
  },
  warning: {
    Icon:        AlertTriangle,
    iconClass:   "text-amber-400",
    bgClass:     "bg-amber-400/10",
    borderClass: "border-amber-400/20",
    label:       "WARNING",
  },
}

// ─── Time-ago helper ──────────────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const s    = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="px-4 py-3 border-b border-border/50 flex items-start gap-3 animate-pulse">
      <div className="w-7 h-7 rounded-md bg-secondary shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-secondary rounded w-3/4" />
        <div className="h-2.5 bg-secondary rounded w-1/2" />
      </div>
      <div className="h-2.5 bg-secondary rounded w-10 shrink-0" />
    </div>
  )
}

// ─── Single notification row ──────────────────────────────────────────────────
function NotificationRow({ n }: { n: Notification }) {
  const cfg = TYPE_CONFIG[n.type]
  return (
    <div
      className={`px-4 py-3 border-b border-border/50 flex items-start gap-3 transition-colors
        ${n.read ? "opacity-60" : "bg-secondary/10"}`}
    >
      {/* Icon */}
      <div className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ${cfg.bgClass} ${cfg.borderClass}`}>
        <cfg.Icon className={`w-3.5 h-3.5 ${cfg.iconClass}`} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-foreground truncate">{n.title}</span>
          {!n.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-4 truncate">{n.description}</p>
        {n.amount !== undefined && (
          <p className={`text-[11px] font-mono font-semibold mt-0.5 ${cfg.iconClass}`}>
            ${n.amount.toFixed(2)}
          </p>
        )}
      </div>

      {/* Time */}
      <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">{timeAgo(n.timeMs)}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NotificationBell() {
  const { items, unreadCount, markAllRead, clearAll } = useNotifications()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [pulse, setPulse]     = useState(false)

  // Track prev unread count to trigger pulse animation
  const prevUnread = useState(0)
  if (unreadCount > (prevUnread[0] as number)) {
    prevUnread[1](unreadCount)
    setPulse(true)
    setTimeout(() => setPulse(false), 1500)
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      // Simulate brief fetch delay for UX realism
      setLoading(true)
      setTimeout(() => setLoading(false), 600)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          className="relative p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center
                bg-red-500 text-[9px] font-bold text-white rounded-full px-0.5
                ${pulse ? "animate-ping-once" : ""}`}
              style={pulse ? {
                animation: "pulse-badge 0.6s ease-out 2"
              } : undefined}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[340px] p-0 bg-card border-border shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="text-sm font-mono font-semibold text-foreground">Notifications</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                title="Mark all as read"
                className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded hover:bg-cyan-400/10 transition-colors"
              >
                <Check className="w-3 h-3" />
                Read all
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={clearAll}
                title="Clear all"
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-red-400 px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center">
                <BellOff className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-xs font-mono text-muted-foreground text-center">
                No new notifications
              </p>
            </div>
          ) : (
            items.map((n) => <NotificationRow key={n.id} n={n} />)
          )}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border">
            <Link
              href="/logs"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View all transactions
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
