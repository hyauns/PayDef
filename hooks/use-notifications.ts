"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
export type NotificationType = "success" | "failed" | "warning"

export type Notification = {
  id: string
  type: NotificationType
  title: string
  description: string
  amount?: number
  timeMs: number   // Date.now() at creation
  read: boolean
}

interface ApiNotification {
  id: string
  type: NotificationType
  title: string
  description: string
  amount?: number
  timeMs: number
  read: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  const seenIds           = useRef<Set<string>>(new Set())
  const lastFetchedAt     = useRef<number>(0)

  const mergeNotifications = useCallback((incoming: ApiNotification[]) => {
    const newItems: Notification[] = []
    for (const n of incoming) {
      if (seenIds.current.has(n.id)) continue
      seenIds.current.add(n.id)
      newItems.push({ ...n, read: false })
    }
    if (newItems.length > 0) {
      setItems((prev) => [...newItems, ...prev].slice(0, 50))
    }
    lastFetchedAt.current = Date.now()
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const res  = await fetch("/api/merchant/notifications")
      if (!res.ok) return
      const data = await res.json() as { notifications?: ApiNotification[] }
      mergeNotifications(data.notifications ?? [])
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [mergeNotifications])

  // Initial fetch + poll every 30 s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
    seenIds.current.clear()
  }, [])

  const unreadCount = items.filter((n) => !n.read).length

  return { items, unreadCount, markAllRead, clearAll }
}
