const fs = require('fs');
let content = fs.readFileSync('app/accounts/page.tsx', 'utf8');

// 1. Replace DashboardHeader with DashboardShell and DashboardPageHeader imports
if (content.includes('import { DashboardHeader }')) {
  content = content.replace('import { DashboardHeader } from "@/components/dashboard/DashboardHeader"', 'import { DashboardShell } from "@/components/dashboard/DashboardShell"\nimport { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"');
}

let lines = content.split('\n');

const actualOldReturnStart = lines.findIndex((l, i) => l.includes('return (') && lines[i+1].includes('<div className="min-h-screen'));
const oldReturnEnd = lines.findIndex(l => l.includes('{/* Slide-over edit panel */}'));

if (actualOldReturnStart > -1 && oldReturnEnd > -1) {
  const newReturn = `  return (
    <DashboardShell data-ui-version="accounts-boron-v2">
      <main className="px-4 md:px-6 py-5 w-full max-w-[1800px] mx-auto space-y-5">
        {/* Page header */}
        <DashboardPageHeader 
          eyebrow="ACCOUNTS"
          title="Merchant Accounts"
          description="Manage payment provider accounts, routing status, limits, profile mapping, and operational health."
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#97a3b6] hover:text-[#e7edf8] border border-[#343947] rounded-md px-4 py-2 hover:bg-[#2a2d39] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={\`w-3.5 h-3.5 \${syncing ? "animate-spin" : ""}\`} />
                {syncing ? "Syncing..." : "Sync"}
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#151821] bg-[#FFD600] hover:bg-[#e6c100] rounded-md px-4 py-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Account
              </button>
            </div>
          }
        />

        {/* Summary stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="col-span-2 md:col-span-2 bg-[#222530] border border-[#343947] rounded-lg px-4 py-3">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Total Volume Today</p>
            <p className="text-xl font-mono font-semibold text-[#e7edf8] mt-1">\${totalVolume.toLocaleString()}</p>
            <p className="text-sm text-[#aab4c5] leading-6 mt-1">{activeCount} active accounts</p>
          </div>
          {statusCounts.map(({ status, count }) => {
            const cfg = statusConfig[status]
            return (
              <div key={status} className="bg-[#222530] border border-[#343947] rounded-lg px-4 py-3">
                <div className={\`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider \${cfg.text}\`}>
                  {cfg.icon}
                  {status}
                </div>
                <p className="text-xl font-mono font-semibold text-[#e7edf8] mt-2">{count}</p>
              </div>
            )
          })}
        </div>

        {/* Main content area */}
        <div className="bg-[#222530] border border-[#343947] rounded-lg shadow-sm">
          {/* Tabs */}
          <div className="flex items-center gap-6 px-6 border-b border-[#343947] bg-[#1f222c] rounded-t-lg overflow-x-auto">
            {(["All", "Active", "Limited", "Warm-up", "Paused", "Suspended"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={\`py-4 text-sm font-semibold uppercase tracking-[0.08em] transition-colors border-b-2 whitespace-nowrap \${
                  filterStatus === s
                    ? "border-[#FFD600] text-[#FFD600]"
                    : "border-transparent text-[#97a3b6] hover:text-[#e7edf8]"
                }\`}
              >
                {s}
                <span className={\`ml-2 text-xs px-2 py-0.5 rounded-full \${
                  filterStatus === s ? "bg-[#FFD600]/10 text-[#FFD600]" : "bg-[#2a2d39] text-[#97a3b6]"
                }\`}>
                  {s === "All" ? merchants.length : merchants.filter((m) => m.status === s).length}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#343947] bg-[#1a1d24]">
                  {[
                    "Account Name",
                    "Shield Domain",
                    "Status",
                    "Display Profile",
                    "Daily Volume",
                    "Priority",
                    "Tx",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#b6c2d3] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={\`border-b border-[#343947] cursor-pointer transition-colors hover:bg-[#2a2d39] \${
                      selected?.id === m.id ? "bg-[#FFD600]/5 border-l-2 border-l-[#FFD600]" : ""
                    }\`}
                  >
                    {/* Account Name */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-[#e7edf8]">{m.accountName}</span>
                        <span className="text-xs text-[#97a3b6]">{m.email}</span>
                      </div>
                    </td>

                    {/* Shield Domain */}
                    <td className="px-6 py-4">
                      <a
                        href={\`https://\${m.shieldDomain}\`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[#FFD600] hover:text-[#e6c100] transition-colors group max-w-[140px] md:max-w-[180px]" title={m.shieldDomain}
                      >
                        <span className="truncate">{m.shieldDomain}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-70 group-hover:opacity-100 transition-colors" />
                      </a>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <StatusBadge status={m.status} />
                    </td>

                    {/* Display Profile */}
                    <td className="px-6 py-4">
                      <PaymentDisplayProfileBadge profileId={m.displayProfileId} profiles={displayProfiles} isActive={m.status === "Active" || m.status === "Limited"} />
                    </td>

                    {/* Volume */}
                    <td className="px-6 py-4 min-w-[220px]">
                      <VolumeBar
                        current={m.currentVolume}
                        soft={m.softLimit}
                        hard={m.hardLimit}
                      />
                    </td>

                    {/* Priority */}
                    <td className="px-6 py-4">
                      <PriorityStars value={m.priority} />
                    </td>

                    {/* Tx Count */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-[#e7edf8]">{m.txCount}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setSelected(m)}
                        className="p-2 text-[#97a3b6] hover:text-[#FFD600] transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-full bg-[#1a1d24] flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-[#343947]" />
              </div>
              <p className="text-lg font-semibold text-[#e7edf8] mb-2">No accounts found</p>
              <p className="text-[#97a3b6] max-w-sm">There are no accounts matching the selected filter status.</p>
            </div>
          )}
        </div>
      </main>

`.split('\n');

  lines.splice(actualOldReturnStart, oldReturnEnd - actualOldReturnStart, ...newReturn);
  
  const oldCloseStart = lines.length - 10;
  for (let i = oldCloseStart; i < lines.length; i++) {
    if (lines[i].includes('</div>')) {
      lines[i] = lines[i].replace('</div>', '</DashboardShell>');
      break;
    }
  }

  fs.writeFileSync('app/accounts/page.tsx', lines.join('\n'));
  console.log('Restored layout successfully');
} else {
  console.log('Could not find bounds:', actualOldReturnStart, oldReturnEnd);
}
