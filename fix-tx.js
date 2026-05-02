const fs = require('fs');
let code = fs.readFileSync('app/transactions/page.tsx', 'utf8');

if (!code.includes('GridBackground')) {
  code = code.replace(
    'import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"',
    'import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"\nimport { GridBackground } from "@/components/ui/grid-background"'
  );
}

code = code.replace(
  /<div key=\{item\.label\} className=\{\`bg-\[\#151821\] border \$\{item\.color\} rounded-lg p-4\`\}>/g,
  '<div key={item.label} className={`bg-[#151821] border ${item.color} rounded-lg p-4 relative overflow-hidden`} data-ui-version="grid-background-v1">\n              <GridBackground />'
);

code = code.replace(
  /<p className="text-xs font-mono text-\[\#97a3b6\] uppercase tracking-wider">\{item\.label\}<\/p>/g,
  '<p className="relative z-10 text-xs font-mono text-[#97a3b6] uppercase tracking-wider">{item.label}</p>'
);

code = code.replace(
  /<p className=\{\`text-xl font-mono font-bold mt-1 \$\{item\.accent\}\`\}>\{item\.value\}<\/p>/g,
  '<p className={`relative z-10 text-xl font-mono font-bold mt-1 ${item.accent}`}>{item.value}</p>'
);

code = code.replace(
  /<p className="text-sm font-mono text-\[\#97a3b6\] mt-1">\{item\.sub\}<\/p>/g,
  '<p className="relative z-10 text-sm font-mono text-[#97a3b6] mt-1">{item.sub}</p>'
);

code = code.replace(
  /<div className="bg-\[\#151821\] border border-\[\#343947\] rounded-lg overflow-hidden">\r?\n\s*<div className="p-4 border-b border-\[\#343947\] space-y-3">/,
  '<div className="bg-[#151821] border border-[#343947] rounded-lg overflow-hidden relative" data-ui-version="grid-background-v1">\n          <GridBackground />\n          <div className="relative z-10 p-4 border-b border-[#343947] space-y-3 bg-[#1f222c]/80 backdrop-blur-sm">'
);

code = code.replace(
  /<div className="overflow-x-auto">\r?\n\s*<table className="w-full text-left text-sm">/,
  '<div className="relative z-10 overflow-x-auto">\n            <table className="w-full text-left text-sm">'
);

fs.writeFileSync('app/transactions/page.tsx', code);
console.log('Fixed tx page');
