const fs = require('fs');
let code = fs.readFileSync('app/super-admin/tenants/page.tsx', 'utf8');

code = code.replace(
  /\{\/\* Filters \*\/\}\r?\n\s*<div className="bg-\[\#151821\] border border-\[\#343947\] rounded-lg overflow-hidden">\r?\n\s*<div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-\[\#343947\]">/,
  '{/* Filters */}\n        <div className="bg-[#151821] border border-[#343947] rounded-lg overflow-hidden relative" data-ui-version="grid-background-v1">\n          <GridBackground />\n          <div className="relative z-10 flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#343947] bg-[#1f222c]/80 backdrop-blur-sm">'
);

code = code.replace(
  /\{\/\* Table \*\/\}\r?\n\s*<div className="overflow-x-auto">/,
  '{/* Table */}\n          <div className="relative z-10 overflow-x-auto">'
);

fs.writeFileSync('app/super-admin/tenants/page.tsx', code);
console.log('Fixed regex');
