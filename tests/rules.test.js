// Closed seasons computed by index.html, checked against published dates.  Run: cd tests && npm test
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const cut = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
const RULES = eval('(' + cut(SRC, 'const RULES=', 'const OVERRIDES').replace('const RULES=', '').trim().replace(/;$/, '') + ')');
const api = new Function(cut(SRC, '/* ---------- calendar', '  const endLabel') + '; return {closedSpans, easter};')();
const f = d => (d.getMonth() + 1) + '-' + d.getDate();
const span = (k, y) => { const s = api.closedSpans(RULES[k].closed[0], true, y); const x = s[s.length - 1]; return f(x.a) + '..' + f(x.b); };
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// the hand-made 2026 table of version 1.4 (taken from the published 2026 dates)
const Y2026 = { 'csuka': '2-2..3-31', 'balin': '3-2..4-30', 'sügér': '3-2..4-30', 'fogassüllő': '3-2..4-30', 'kősüllő': '3-2..6-30',
  'domolykó': '4-15..5-29', 'jászkeszeg': '4-15..5-29', 'garda': '4-15..5-29', 'márna': '4-15..5-29', 'paduc': '4-15..5-29',
  'szilvaorrú keszeg': '4-15..5-29', 'ponty': '5-4..5-29', 'compó': '5-4..6-15', 'harcsa': '5-4..6-15', 'sebes pisztráng': '10-1..3-31' };
for (const [k, v] of Object.entries(Y2026)) ok(span(k, 2026) === v, `2026 ${k}: ${span(k, 2026)}`);
ok(span('csuka', 2025) === '2-3..3-31', '2025 csuka 02.03. (febr. 1. szombat)');
ok(span('ponty', 2025) === '5-5..5-30', '2025 ponty 05.05–05.30 (máj. 2. hídnap, máj. 31. szombat)');
ok(span('ponty', 2027) === '5-3..5-31', '2027 ponty 05.03–05.31 (máj. 2. vasárnap)');
ok([2025, 2026, 2027].map(y => f(api.easter(y))).join() === '4-20,4-5,3-28', 'húsvét 2025–2027');
const tr = api.closedSpans([10, 1, 3, 31], true, 2027), jan = new Date(2027, 0, 15);
ok(tr.some(s => s.a <= jan && jan <= s.b), 'évhatáron átnyúló tilalom (sebes pisztráng, 2027.01.15.)');
console.log(fails ? fails + ' HIBA' : 'MIND RENDBEN'); process.exit(fails ? 1 : 0);
