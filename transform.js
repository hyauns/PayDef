const fs = require('fs');

function transformTenants() {
  let code = fs.readFileSync('app/super-admin/tenants/page.tsx', 'utf8');

  // Trial status change to yellow/amber
  code = code.replace(/text-violet-400/g, 'text-amber-400');
  code = code.replace(/bg-violet-400\/10/g, 'bg-amber-400/10');
  code = code.replace(/border-violet-400\/20/g, 'border-amber-400/20');

  // Colors
  code = code.replace(/text-cyan-400/g, 'text-[#FFD600]');
  code = code.replace(/bg-cyan-400/g, 'bg-[#FFD600]');
  code = code.replace(/bg-cyan-300/g, 'bg-[#e6c100]');
  code = code.replace(/border-cyan-400\/20/g, 'border-[#FFD600]/20');
  code = code.replace(/border-cyan-400\/30/g, 'border-[#FFD600]/30');
  code = code.replace(/border-cyan-400\/50/g, 'border-[#FFD600]/50');
  code = code.replace(/bg-cyan-400\/10/g, 'bg-[#FFD600]/10');
  code = code.replace(/text-cyan-300/g, 'text-[#e6c100]');
  code = code.replace(/border-cyan-400/g, 'border-[#FFD600]');
  code = code.replace(/accent-cyan-400/g, 'accent-[#FFD600]');

  // Layout Colors
  code = code.replace(/bg-card/g, 'bg-[#151821]');
  code = code.replace(/border-border/g, 'border-[#343947]');
  code = code.replace(/text-foreground/g, 'text-[#e7edf8]');
  code = code.replace(/text-muted-foreground/g, 'text-[#97a3b6]');
  code = code.replace(/hover:text-foreground/g, 'hover:text-[#e7edf8]');
  code = code.replace(/bg-background/g, 'bg-[#1a1d24]');
  code = code.replace(/bg-secondary\/80/g, 'bg-[#2a2d39]/80');
  code = code.replace(/bg-secondary\/60/g, 'bg-[#2a2d39]/60');
  code = code.replace(/bg-secondary\/50/g, 'bg-[#2a2d39]/50');
  code = code.replace(/bg-secondary\/30/g, 'bg-[#2a2d39]/30');
  code = code.replace(/bg-secondary/g, 'bg-[#2a2d39]');
  code = code.replace(/hover:bg-secondary\/50/g, 'hover:bg-[#343947]/50');
  code = code.replace(/hover:bg-secondary\/30/g, 'hover:bg-[#343947]/30');
  code = code.replace(/hover:bg-secondary/g, 'hover:bg-[#343947]');
  code = code.replace(/bg-border/g, 'bg-[#343947]');
  code = code.replace(/border-border\/60/g, 'border-[#343947]/60');

  // Typography
  code = code.replace(/text-\[10px\]/g, 'text-xs');
  code = code.replace(/text-\[11px\]/g, 'text-sm');

  // Layout width
  code = code.replace(/px-4 md:px-6 py-5 space-y-5 max-w-\[1600px\] mx-auto/g, 'w-full px-6 md:px-8 py-8 space-y-6');

  // Header integration
  if (!code.includes('DashboardPageHeader')) {
    code = code.replace(
      'import { DashboardShell } from "@/components/dashboard/DashboardShell"',
      'import { DashboardShell } from "@/components/dashboard/DashboardShell"\nimport { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"'
    );
  }

  // Header block replacement
  const headerRegex = /<div className="flex items-center justify-between gap-4">[\s\S]*?<\/div>\s*<\/div>/;
  const newHeader = `<DashboardPageHeader
          title="Tenants"
          description="Manage platform tenants, store access, account ownership, and operational status."
          eyebrow="SUPER ADMIN"
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#97a3b6] bg-[#2a2d39] border border-[#343947] px-2.5 py-1.5 rounded-md">
                {tenants.length} tenants total
              </span>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-[#151821] bg-[#FFD600] rounded-md hover:bg-[#e6c100] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Tenant
              </button>
            </div>
          }
        />`;

  if (code.match(headerRegex)) {
    code = code.replace(headerRegex, newHeader);
  }

  // Marker
  code = code.replace(/<DashboardShell>/g, '<DashboardShell data-ui-version="super-admin-tenants-boron-v1">');

  fs.writeFileSync('app/super-admin/tenants/page.tsx', code);
}

transformTenants();
console.log('Tenants page transformed successfully');
