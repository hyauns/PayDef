"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

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

// ─── Mock generators ──────────────────────────────────────────────────────────
const MOCK_MERCHANTS = ["Acme Store", "TechVault", "NovaPay", "ByteCart", "SwiftGoods"]
const MOCK_ITEMS     = ["Digital License", "SaaS Subscription", "API Credits", "Support Plan", "Cloud Storage"]

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateMockNotification(): Notification {
  const roll = Math.random()

  if (roll < 0.55) {
    // Transaction success
    const merchant = MOCK_MERCHANTS[randomBetween(0, MOCK_MERCHANTS.length - 1)]
    const item     = MOCK_ITEMS[randomBetween(0, MOCK_ITEMS.length - 1)]
    const amount   = randomBetween(29, 999)
    return {
      id:          crypto.randomUUID(),
      type:        "success",
      title:       "Payment Captured",
      description: `${merchant} — ${item}`,
      amount,
      timeMs:      Date.now(),
      read:        false,
    }
  } else if (roll < 0.80) {
    // Transaction failed
    const merchant = MOCK_MERCHANTS[randomBetween(0, MOCK_MERCHANTS.length - 1)]
    return {
      id:          crypto.randomUUID(),
      type:        "failed",
      title:       "Payment Failed",
      description: `${merchant} — capture declined by issuer`,
      timeMs:      Date.now(),
      read:        false,
    }
  } else {
    // Account limit warning
    const pct = randomBetween(82, 97)
    return {
      id:          crypto.randomUUID(),
      type:        "warning",
      title:       "Account Limit Warning",
      description: `A PayPal account has reached ${pct}% of its daily limit`,
      timeMs:      Date.now(),
      read:        false,
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  const seenIds           = useRef<Set<string>>(new Set())

  const addNotification = useCallback((n: Notification) => {
    if (seenIds.current.has(n.id)) return
    seenIds.current.add(n.id)

    setItems((prev) => [n, ...prev].slice(0, 50)) // cap at 50

    // Fire a Sonner toast for successes only (as per spec)
    if (n.type === "success") {
      toast.success(n.title, {
        description: n.description + (n.amount ? ` · $${n.amount.toFixed(2)}` : ""),
        position:    "bottom-right",
        duration:    5000,
      })
    }
  }, [])

  // Simulate real-time: new notification every 10 s
  useEffect(() => {
    // Seed 3 initial notifications immediately
    const seed = Array.from({ length: 3 }, generateMockNotification)
    seed.forEach(addNotification)

    const id = setInterval(() => {
      addNotification(generateMockNotification())
    }, 10_000)

    return () => clearInterval(id)
  }, [addNotification])

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
