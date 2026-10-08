// Replicates legacy.js data prep for the compare seed and prints the new compare row (dump format).
// Usage: node tests/fixtures/gen/seed_rows.mjs <out> [nobto]   (compare-phase2.txt + the over-priced row →
//   compare-phase6b.txt; nobto: btoData switch off — the BTO-supply row is dropped, DEC-015). See README.md here.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root (tests/fixtures/gen/ → ../../../)
const { createComparables, ROW_KEY } = await import(pathToFileURL(ROOT + 'app/modules/explore/comparables.js').href);

const sandbox = { window: {} }; sandbox.self = sandbox.window; vm.createContext(sandbox);
vm.runInContext(readFileSync(ROOT + 'app/data/data.js', 'utf8'), sandbox);
const D = sandbox.window.HDB_DATA || sandbox.HDB_DATA;
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAve\b/g, 'Ave').replace(/\bSt\b/g, 'St');
const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const haversine = (la1, lo1, la2, lo2) => { const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
const N = D.tx.p.length;
const TX = { b: Int32Array.from(D.tx.b), m: Int16Array.from(D.tx.m), ft: Int8Array.from(D.tx.ft), s: Int8Array.from(D.tx.s), a: Int16Array.from(D.tx.a), mo: Int8Array.from(D.tx.mo), ly: Int16Array.from(D.tx.ly), p: Int32Array.from(D.tx.p) };
const PSF = new Float32Array(N); for (let i = 0; i < N; i++) PSF[i] = TX.p[i] / (TX.a[i] * 10.7639);
const SQFT = 10.7639, NB = D.blocks.length, NM = D.months.length;
const blockTx = Array.from({ length: NB }, () => []);
for (let i = 0; i < N; i++) blockTx[TX.b[i]].push(i);
D.blocks.forEach((b, bi) => { const c = {}; let best = 0, bl = 0; for (const i of blockTx[bi]) { const y = TX.ly[i]; c[y] = (c[y] || 0) + 1; if (c[y] > best) { best = c[y]; bl = y; } } b.lease = bl || b.yc || 0; b.label = b.b + ' ' + title(D.streets[b.s]); });
const lastMonthIdx = NM - 1;
function statsFor(indices, ft, mFrom, mTo) { const psfs = [], prices = []; let last = null; for (const i of indices) { if (TX.m[i] < mFrom || TX.m[i] > mTo || (ft != null && TX.ft[i] !== ft)) continue; psfs.push(PSF[i]); prices.push(TX.p[i]); if (!last || TX.m[i] >= TX.m[last]) last = i; } return { n: psfs.length, psf: median(psfs), price: median(prices), last }; }
const townTxCache = {};
function townTx(ti) { if (!townTxCache[ti]) { const a = []; for (let i = 0; i < N; i++) if (D.blocks[TX.b[i]].t === ti) a.push(i); townTxCache[ti] = a; } return townTxCache[ti]; }
const fmtMonth = (mi) => { const [y, m] = D.months[mi].split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-SG', { month: 'short', year: 'numeric' }); };

const comps = createComparables({ D, TX, PSF, blockTx, statsFor, townTx, haversine, title, lastMonthIdx, fmtMonth });
const seed = JSON.parse(readFileSync(ROOT + 'tests/fixtures/compare-seed.json', 'utf8')).state;
const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
const ms = seed.choices.map((c) => { const b = D.blocks[c.bid], sqft = c.sqm * SQFT; return { c, b, sqft, psf: c.price / sqft, bench: comps.benchmark(c, b) }; });
const row = comps.row();
for (const m of ms) {
  const fv = comps.fairOf(m);
  console.log(m.c.name, '| bench', Math.round(m.bench.psf), 'n', m.bench.n, 'tier', m.bench.tier, '| comps', comps.compsOf(m).length, '| p50*sqft', Math.round(fv.price.p50), 'fair', Math.round(m.bench.psf * m.sqft), '| pct', fv.percentile);
}
const line = `${ROW_KEY}i | ` + ms.map((m) => strip(row.f(m))).join(' | ');
console.log(line);
const fx = readFileSync(ROOT + 'tests/fixtures/compare-phase2.txt', 'utf8');
const nl = fx.includes('\r\n') ? '\r\n' : '\n';
const L = fx.split(nl); const at = L.findIndex((l) => l.startsWith('Premium vs. recent sales'));
L.splice(at + 1, 0, line);
if (process.argv[3] === 'nobto') { const bi = L.findIndex((l) => l.startsWith('Upcoming BTO supply within 1 km')); if (bi >= 0) L.splice(bi, 1); }
writeFileSync(process.argv[2], L.join(nl));
// panel sanity
console.log(comps.panel.length);
