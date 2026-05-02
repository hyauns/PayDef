const fs = require('fs');
let content = fs.readFileSync('app/accounts/page.tsx', 'utf8');

// 1. Replace AccountsPage handleSave
const oldHandleSave = `  const handleSave = useCallback(async (updated: Merchant) => {
    // Optimistic UI
    setMerchants((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    setSelected(null)

    // Persist to backend
    try {
      await fetch(\`/api/merchant/accounts/\${updated.id}\`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updated.accountName,
          email: updated.email,
          clientId: updated.clientId,
          shieldDomain: updated.shieldDomain,
          displayProfileId: updated.displayProfileId || null,
          proxyUrl: updated.proxyUrl,
          status: mapUiStatus(updated.status),
          priority: updated.priority,
          softLimit: updated.softLimit,
          hardLimit: updated.hardLimit,
          itemMasking: updated.itemMasking,
          fakeProductName: updated.fakeProductName,
        }),
      })
    } catch {}
  }, [])`;

const newHandleSave = `  const handleSave = useCallback(async (updated: Merchant) => {
    // Optimistic UI
    setMerchants((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))

    // Persist to backend
    const res = await fetch(\`/api/merchant/accounts/\${updated.id}\`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.accountName,
        email: updated.email,
        clientId: updated.clientId,
        shieldDomain: updated.shieldDomain,
        displayProfileId: updated.displayProfileId || null,
        proxyUrl: updated.proxyUrl,
        status: mapUiStatus(updated.status),
        priority: updated.priority,
        softLimit: updated.softLimit,
        hardLimit: updated.hardLimit,
        itemMasking: updated.itemMasking,
        fakeProductName: updated.fakeProductName,
      }),
    })
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Unable to save changes. Please try again.")
    }
  }, [])`;

content = content.replace(oldHandleSave, newHandleSave);

// 2. Replace SlideOverProps
const oldProps = `interface SlideOverProps {
  merchant: Merchant | null
  verifiedPlatformDomains: string[]
  displayProfiles: PaymentDisplayProfile[]
  onClose: () => void
  onSave: (updated: Merchant) => void
}`;

const newProps = `interface SlideOverProps {
  merchant: Merchant | null
  verifiedPlatformDomains: string[]
  displayProfiles: PaymentDisplayProfile[]
  onClose: () => void
  onSave: (updated: Merchant) => Promise<void> | void
}`;

content = content.replace(oldProps, newProps);

// 3. Inject new SlideOver
const newSlideOver = fs.readFileSync('slideover-new.tsx', 'utf8');
const startIdx = content.indexOf('function SlideOver({');
const endIdx = content.indexOf('// ─── Add Merchant Modal');

if (startIdx > -1 && endIdx > -1) {
  content = content.substring(0, startIdx) + newSlideOver + '\n\n' + content.substring(endIdx);
} else {
  console.error('Could not find SlideOver bounds');
}

fs.writeFileSync('app/accounts/page.tsx', content);

// 4. Truncation fix
let lines = content.split('\n');
const lineIndex = lines.findIndex(l => l.includes('href={`https://${m.shieldDomain}`}'));
if (lineIndex > -1) {
  lines[lineIndex + 4] = lines[lineIndex + 4].replace('group"', 'group max-w-[140px] md:max-w-[180px]" title={m.shieldDomain}');
  lines[lineIndex + 6] = lines[lineIndex + 6].replace('{m.shieldDomain}', '<span className="truncate">{m.shieldDomain}</span>');
  lines[lineIndex + 7] = lines[lineIndex + 7].replace('w-3 h-3 text', 'w-3 h-3 shrink-0 text');
}

fs.writeFileSync('app/accounts/page.tsx', lines.join('\n'));
console.log('done');
