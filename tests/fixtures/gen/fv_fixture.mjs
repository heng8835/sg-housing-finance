// Builds tests/fixtures/compare-phase6b-fv.txt = compare-phase6b.txt + the future-value section + the MOP-wave flag.
// Replicates legacy.js: block lease = most common lease year of its sales, asOf = last data month.
// Usage: node tests/fixtures/gen/fv_fixture.mjs [out] [nomarket] [nobto] [base=<file name in tests/fixtures, or a path>]
//   nobto = btoData switch off (DEC-015): bto.js not loaded, ctx.btoOff, and the base loses the BTO-supply row.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root (tests/fixtures/gen/ → ../../../)
const imp = (p) => import(pathToFileURL(ROOT + p).href);
const { createFutureValue } = await imp('app/modules/explore/futurevalue-ui.js');
const { createPolicy } = await imp('app/core/policy.js');
const g = {}; vm.createContext(g); g.window = g;
const opts = new Set(process.argv.slice(3)), NOBTO = opts.has("nobto");
const BASE = ([...opts].find((x) => x.startsWith('base=')) || 'base=compare-phase6b.txt').slice(5);
const want = ['data.js', ...(opts.has("nomarket") ? [] : ['market.js']), 'future_rail.js', ...(NOBTO ? [] : ['bto.js']), 'rents.js'];
for (const f of want) vm.runInContext(readFileSync(ROOT + 'app/data/' + f, 'utf8'), g);
const D = g.HDB_DATA;
const blockTx = Array.from({ length: D.blocks.length }, () => []);
for (let i = 0; i < D.tx.p.length; i++) blockTx[D.tx.b[i]].push(i);
D.blocks.forEach((b, bi) => { const c = {}; let best = 0, bl = 0; for (const i of blockTx[bi]) { const y = D.tx.ly[i]; c[y] = (c[y] || 0) + 1; if (c[y] > best) { best = c[y]; bl = y; } } b.lease = bl || b.yc || 0; });
const policy = createPolicy(JSON.parse(readFileSync(ROOT + 'app/policy/sg-policy.json', 'utf8')), new Date(2026, 9, 7));
const last = D.months.length - 1;
const fv = createFutureValue({ ctx: () => ({ hdb: D, market: g.HDB_MARKET || null, future: g.HDB_FUTURE || null, bto: NOBTO ? null : g.HDB_BTO || null, btoOff: NOBTO, rents: g.HDB_RENTS }), policy, asOf: () => D.months[last], asOfLabel: () => 'Sep 2026' });
const seed = JSON.parse(readFileSync(ROOT + 'tests/fixtures/compare-seed.json', 'utf8')).state;
const ms = seed.choices.map((c) => ({ c }));
const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
const t0 = performance.now();
const rows = fv.rows();
const lines = rows.map((r) => (r.sec ? `${r.sec.toUpperCase()} |` : `${r.k}i | ` + ms.map((m) => strip(r.f(m))).join(' | ')));
console.error('rows ms', (performance.now() - t0).toFixed(0), 'cache', fv.size());
const t1 = performance.now(); fv.rows().forEach((r) => r.f && ms.forEach((m) => r.f(m))); console.error('cached ms', (performance.now() - t1).toFixed(1));
const flags = ms.map((m) => fv.badges(m).map(([, ic, txt]) => `${ic} ${txt}`).join(' '));
console.log(lines.join('\n')); console.log('BADGES', JSON.stringify(flags));
if (process.argv[2]) {
  const fx = readFileSync(isAbsolute(BASE) ? BASE : join(ROOT, 'tests/fixtures', BASE), 'utf8');
  const nl = fx.includes('\r\n') ? '\r\n' : '\n';
  const L = fx.split(nl);
  if (NOBTO) {
    const bi = L.findIndex((l) => l.startsWith('Upcoming BTO supply within 1 km'));
    if (bi >= 0) {
      // the row had v = btoUnits (best = max): its winners lose one "best in", and every flat one measure
      const units = L[bi].split(' | ').slice(1).map((c) => { const m = c.match(/~([\d,]+) units/); return m ? +m[1].replace(/,/g, '') : 0; });
      const top = Math.max(...units), win = units.map((u) => u === top && !units.every((x) => x === top));
      const hi = L.findIndex((l) => l.startsWith(' | 1. '));
      const cells = L[hi].split(' | ');
      L[hi] = cells.map((c, k) => (k === 0 ? c : c.replace(/best in (\d+) of (\d+) measures/, (m0, w, n) => `best in ${+w - (win[k - 1] ? 1 : 0)} of ${+n - 1} measures`))).join(' | ');
      L.splice(bi, 1);
    }
  }
  const lf = L.findIndex((l) => l.startsWith('LEASE & FUTURE VALUE'));
  const at = L.findIndex((l, i) => i > lf && /^[A-Z][A-Z0-9 &()\-;.,'/]+ \|$/.test(l));
  L.splice(at, 0, ...lines);
  const gi = L.findIndex((l) => l.startsWith('At a glance'));
  const cells = L[gi].split(' | ');
  flags.forEach((f, k) => {
    if (!f) return;
    const cell = cells[k + 1], re = /(?:[✓•!] \S+ (?:k?m) to (?:nearest )?MRT \(~\d+ min walk\))(?: ✓ \S+ (?:k?m) to future .+? MRT \(\d{4}\))?/u;
    const mm = cell.match(re); if (!mm) throw new Error('no MRT flag in cell ' + k);
    const end = mm.index + mm[0].length;
    cells[k + 1] = cell.slice(0, end) + ' ' + f + cell.slice(end);
  });
  L[gi] = cells.join(' | ');
  writeFileSync(process.argv[2], L.join(nl));
  console.error('wrote', process.argv[2], 'section at line', at + 1);
}
