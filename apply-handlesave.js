const fs = require('fs');
let lines = fs.readFileSync('app/accounts/page.tsx', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('const handleSave = useCallback(async (updated: Merchant) => {'));
const end = lines.findIndex((l, i) => i > start && l.includes('  }, [])'));

if (start > -1 && end > -1) {
  const newLines = `  const handleSave = useCallback(async (updated: Merchant) => {
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
  }, [])`.split('\n');
  
  lines.splice(start, end - start + 1, ...newLines);
  fs.writeFileSync('app/accounts/page.tsx', lines.join('\n'));
  console.log('Replaced handleSave');
}
