"use client"

import { Zap } from "lucide-react"
import { LiveFeedClient } from "./live-feed-client"

export function LiveFeed() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-sm font-semibold text-foreground">Live Transaction Feed</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400">LIVE</span>
        </div>
      </div>
      <LiveFeedClient />
    </div>
  )
}
