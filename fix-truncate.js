const fs = require('fs');
let lines = fs.readFileSync('app/accounts/page.tsx', 'utf8').split('\n');
lines[1531] = lines[1531].replace('group"', 'group max-w-[140px] md:max-w-[180px]" title={m.shieldDomain}');
lines[1533] = lines[1533].replace('{m.shieldDomain}', '<span className="truncate">{m.shieldDomain}</span>');
lines[1534] = lines[1534].replace('w-3 h-3', 'w-3 h-3 shrink-0');
fs.writeFileSync('app/accounts/page.tsx', lines.join('\n'));
