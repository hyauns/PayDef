const fs = require('fs');
let content = fs.readFileSync('app/accounts/page.tsx', 'utf8');

const badgeComponent = `
function PaymentDisplayProfileBadge({ profileId, profiles, isActive }: { profileId: string | null, profiles: any[], isActive: boolean }) {
  if (!profileId) return <span className="text-xs text-[#97a3b6]">—</span>
  const p = profiles.find(x => x.id === profileId)
  if (!p) return <span className="text-xs text-[#97a3b6]">Unknown</span>
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-xs font-mono text-[#e7edf8]">
      <span className="truncate max-w-[120px]">{p.internalName}</span>
    </div>
  )
}
`;

content = content + '\n' + badgeComponent;
fs.writeFileSync('app/accounts/page.tsx', content);
