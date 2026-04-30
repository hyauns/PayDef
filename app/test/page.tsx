"use client"
import { StatCard } from "@/components/dashboard/StatCard"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { TransactionFeed } from "@/components/dashboard/transaction-feed"

export default function TestPage() {
  return (
    <div className="w-full bg-[#151821] min-h-screen p-8 text-white test-wrapper">
      <StatCard label="Total Volume Today" value="$12,345" active />
      <div className="mt-8">
        <SectionCard title="Rotation Logic" description="Desc">
          <div className="p-4 bg-[#2a2d39] rounded">Inner element</div>
        </SectionCard>
      </div>
      <div className="mt-8">
        <TransactionFeed />
      </div>
    </div>
  )
}
