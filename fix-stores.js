const fs = require('fs');
let code = fs.readFileSync('app/stores/page.tsx', 'utf8');

if (!code.includes('GridBackground')) {
  code = code.replace(
    'import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"',
    'import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"\nimport { GridBackground } from "@/components/ui/grid-background"'
  );
}

code = code.replace(
  /<div\s+key=\{card\.label\}\s+className=\{\`bg-\[\#151821\] border \$\{card\.border\} rounded-lg px-4 py-3\.5\`\}\s+>/g,
  '<div\n              key={card.label}\n              className={`bg-[#151821] border ${card.border} rounded-lg px-4 py-3.5 relative overflow-hidden`} data-ui-version="grid-background-v1"\n            >\n              <GridBackground />'
);

code = code.replace(
  /<p className="text-xs font-semibold tracking-wider text-\[\#b6c2d3\] uppercase tracking-wider mb-1\.5">\{card\.label\}<\/p>/g,
  '<p className="relative z-10 text-xs font-semibold tracking-wider text-[#b6c2d3] uppercase tracking-wider mb-1.5">{card.label}</p>'
);

code = code.replace(
  /<p className=\{\`text-2xl font-mono font-bold \$\{card\.accent\}\`\}>\{card\.value\}<\/p>/g,
  '<p className={`relative z-10 text-2xl font-mono font-bold ${card.accent}`}>{card.value}</p>'
);

code = code.replace(
  /<p className="text-sm font-mono text-\[\#97a3b6\] mt-1">\{card\.sub\}<\/p>/g,
  '<p className="relative z-10 text-sm font-mono text-[#97a3b6] mt-1">{card.sub}</p>'
);

code = code.replace(
  /\{\/\* Table card \*\/\}\r?\n\s*<div className="bg-\[\#151821\] border border-\[\#343947\] rounded-lg overflow-hidden">/,
  '{/* Table card */}\n        <div className="bg-[#151821] border border-[#343947] rounded-lg overflow-hidden relative" data-ui-version="grid-background-v1">\n          <GridBackground />'
);

code = code.replace(
  /\{\/\* Table toolbar \*\/\}\r?\n\s*<div className="flex items-center justify-between px-4 py-3 border-b border-\[\#343947\] gap-4">/,
  '{/* Table toolbar */}\n          <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-[#343947] gap-4 bg-[#1f222c]/80 backdrop-blur-sm">'
);

code = code.replace(
  /\{\/\* Table \*\/\}\r?\n\s*<div className="overflow-x-auto">/,
  '{/* Table */}\n          <div className="relative z-10 overflow-x-auto">'
);

fs.writeFileSync('app/stores/page.tsx', code);
console.log('Fixed stores page');
