// Builds the Phase 7a compare fixtures (A1 "one numbers engine"): compare-phase6d(.txt|-fv|-nobto) with the money rows
// of "Can we afford it?" and the At-a-glance money lines re-rendered by app/modules/explore/money.js (the same
// planPurchase() call as Afford), and the header "best in X of N" counts re-scored for the changed measures.
// Nothing else is touched (tests/explore/money.test.js checks that every other line equals the 6d fixture).
// Usage: node tests/fixtures/gen/money_fixture.mjs [in=<dir with compare-phase6d*.txt>] [out=<dir>]   (default tests/fixtures)
// Replicates legacy.js: block lease = most common lease year of its sales; remaining lease as of 7 Oct 2026;
// COV = asking − benchmark $psf × sqft (./comparables.js, as in seed_rows.mjs); household = the seed migrated by core/store.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root (tests/fixtures/gen/ → ../../../)
const imp = (p) => import(pathToFileURL(ROOT + p).href);
const { createMoney, ROW_KEYS, SECTION } = await imp('app/modules/explore/money.js');
const { createComparables } = await imp('app/modules/explore/comparables.js');
const { createStore, LEGACY_KEY } = await imp('app/core/store.js');
const { createPolicy } = await imp('app/core/policy.js');
const { remainingLease } = await imp('app/engine/lease.js');

export const AS_OF = new Date(2026, 9, 7);
export const JOBS = [['compare-phase6d.txt', 'compare-phase7a.txt'], ['compare-phase6d-fv.txt', 'compare-phase7a-fv.txt'], ['compare-phase6d-nobto.txt', 'compare-phase7a-nobto.txt']];
/** Old 6d money rows (in order) and those that were best-in-row measures (all best = min). */
export const OLD_ROWS = ['Loan', 'Monthly instalment', 'Affordability', 'Upfront cash + CPF needed', 'Upfront if COV materialises', 'Max price your income supports'];
const OLD_MEASURES = ['Monthly instalment', 'Upfront cash + CPF needed', 'Upfront if COV materialises'];

const g = {}; vm.createContext(g); g.window = g;
vm.runInContext(readFileSync(ROOT + 'app/data/data.js', 'utf8'), g);
const D = g.HDB_DATA;
const policy = createPolicy(JSON.parse(readFileSync(ROOT + 'app/policy/sg-policy.json', 'utf8')), AS_OF);
const seed = JSON.parse(readFileSync(ROOT + 'tests/fixtures/compare-seed.json', 'utf8')).state;
const mem = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; }, removeItem: (k) => { delete o[k]; } });
export const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');

// ---- legacy data prep (seed_rows.mjs): tx arrays, block lease, statsFor / townTx for the benchmark
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const haversine = (la1, lo1, la2, lo2) => { const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
const N = D.tx.p.length, SQFT = 10.7639, NM = D.months.length, lastMonthIdx = NM - 1;
const TX = { b: Int32Array.from(D.tx.b), m: Int16Array.from(D.tx.m), ft: Int8Array.from(D.tx.ft), s: Int8Array.from(D.tx.s), a: Int16Array.from(D.tx.a), mo: Int8Array.from(D.tx.mo), ly: Int16Array.from(D.tx.ly), p: Int32Array.from(D.tx.p) };
const PSF = new Float32Array(N); for (let i = 0; i < N; i++) PSF[i] = TX.p[i] / (TX.a[i] * SQFT);
const blockTx = Array.from({ length: D.blocks.length }, () => []);
for (let i = 0; i < N; i++) blockTx[TX.b[i]].push(i);
D.blocks.forEach((b, bi) => { const c = {}; let best = 0, bl = 0; for (const i of blockTx[bi]) { const y = TX.ly[i]; c[y] = (c[y] || 0) + 1; if (c[y] > best) { best = c[y]; bl = y; } } b.lease = bl || b.yc || 0; b.label = b.b + ' ' + title(D.streets[b.s]); });
function statsFor(indices, ft, mFrom, mTo) { const psfs = [], prices = []; let last = null; for (const i of indices) { if (TX.m[i] < mFrom || TX.m[i] > mTo || (ft != null && TX.ft[i] !== ft)) continue; psfs.push(PSF[i]); prices.push(TX.p[i]); if (!last || TX.m[i] >= TX.m[last]) last = i; } return { n: psfs.length, psf: median(psfs), price: median(prices), last }; }
const townTxCache = {};
function townTx(ti) { if (!townTxCache[ti]) { const a = []; for (let i = 0; i < N; i++) if (D.blocks[TX.b[i]].t === ti) a.push(i); townTxCache[ti] = a; } return townTxCache[ti]; }
const fmtMonth = (mi) => { const [y, m] = D.months[mi].split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-SG', { month: 'short', year: 'numeric' }); };
export const comps = createComparables({ D, TX, PSF, blockTx, statsFor, townTx, haversine, title, lastMonthIdx, fmtMonth }); // also used by phase7b_fixture.mjs

/** The legacy metrics fields money.js reads: the choice, remaining lease, benchmark COV. */
export const seedMetrics = () => seed.choices.map((c) => {
  const b = D.blocks[c.bid], sqft = c.sqm * SQFT, bench = comps.benchmark(c, b), fair = bench.psf ? bench.psf * sqft : null;
  return { c, b, leaseNow: remainingLease(b.lease, AS_OF, policy.get('lease.term.years')), cov: fair ? Math.max(0, c.price - fair) : 0 };
});
const store = createStore({ storage: mem({ [LEGACY_KEY]: JSON.stringify({ profile: seed.profile, choices: seed.choices }) }) });
export const money = createMoney({ policy, store, D, year: () => AS_OF.getFullYear() });
export const ms = seedMetrics();

/** legacy renderCompare best-in-row rule → set of winning column indexes. */
function winners(vals, best) {
  const valid = vals.map((v, i) => [v, i]).filter(([v]) => v != null && !isNaN(v));
  if (valid.length < 2) return new Set();
  const bv = best === 'min' ? Math.min(...valid.map(([v]) => v)) : Math.max(...valid.map(([v]) => v));
  const w = new Set(valid.filter(([v]) => v === bv).map(([, i]) => i));
  return w.size === valid.length ? new Set() : w;
}
const firstMoney = (cell) => { const x = cell.match(/S\$([\d,]+)/); return x ? +x[1].replace(/,/g, '') : null; };
const cellsOf = (line) => line.split(' | ').slice(1);
// the two old glance lines: instalment share, then the upfront check (legacy verdict() before 7a)
const OLD_INSTALMENT = /[✓!✕] instalment \d+% of income(?: \(\d+% at the [\d.]+% test rate\) — near the [\d.]+% cap|; \d+% at the [\d.]+% test rate — over the [\d.]+% MSR)?/u;
const OLD_UPFRONT = / [✓!✕] upfront S\$-?\d+k (?:exceeds your S\$\d+k|fits, but not if COV of S\$\d+k materialises|within funds even with est\. COV|within funds)/u;

export function build(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n', L = text.split(nl);
  const at = L.findIndex((l) => l.startsWith(`${OLD_ROWS[0]}i | `)), sec = L.findIndex((l) => l.startsWith(`${SECTION.toUpperCase()} |`));
  if (at !== sec + 1) throw new Error('money rows not right after the section header');
  OLD_ROWS.forEach((k, i) => { if (!L[at + i].startsWith(`${k}i | `)) throw new Error('unexpected row ' + L[at + i].slice(0, 40)); });
  const old = Object.fromEntries(OLD_ROWS.map((k, i) => [k, cellsOf(L[at + i])]));
  const oldVals = (k) => old[k].map((c, j) => (/^same as above/.test(c) ? firstMoney(old['Upfront cash + CPF needed'][j]) : firstMoney(c)));
  const rows = money.rows();
  const lines = rows.map((r) => `${r.k}i | ` + ms.map((m) => strip(r.f(m))).join(' | '));
  L.splice(at, OLD_ROWS.length, ...lines);
  // header: old measures out, new measures in
  const delta = ms.map(() => 0);
  for (const k of OLD_MEASURES) winners(oldVals(k), 'min').forEach((i) => { delta[i] -= 1; });
  for (const r of rows.filter((x) => x.v)) winners(ms.map(r.v), r.best).forEach((i) => { delta[i] += 1; });
  const dn = rows.filter((x) => x.v).length - OLD_MEASURES.length;
  const hi = L.findIndex((l) => l.startsWith(' | 1. '));
  L[hi] = L[hi].split(' | ').map((c, j) => (j === 0 ? c : c.replace(/best in (\d+) of (\d+) measures/, (m0, w, n) => `best in ${+w + delta[j - 1]} of ${+n + dn} measures`))).join(' | ');
  // At a glance: the instalment + upfront lines → money.glance()
  const gi = L.findIndex((l) => l.startsWith('At a glance | '));
  const gc = L[gi].split(' | ');
  ms.forEach((m, j) => {
    let cell = gc[j + 1];
    const a = cell.match(OLD_INSTALMENT); if (!a) throw new Error('no instalment flag in column ' + j);
    const rest = cell.slice(a.index + a[0].length), u = rest.match(OLD_UPFRONT);
    const end = a.index + a[0].length + (u && u.index === 0 ? u[0].length : 0);
    cell = cell.slice(0, a.index) + money.glance(m).map(([, ic, txt]) => `${ic} ${txt}`).join(' ') + cell.slice(end);
    // A4 wording (7a): the short-lease flag no longer claims the numbers are pro-rated
    cell = cell.replace('lease does not cover youngest owner to 95 — CPF usage pro-rated', 'lease does not cover youngest owner to 95 — HDB/CPF will lower the loan and CPF use (not in these figures)');
    gc[j + 1] = cell;
  });
  L[gi] = gc.join(' | ');
  return L.join(nl);
}

if (/money_fixture\.mjs$/.test(process.argv[1] || '')) { // run as a script (not imported by a test)
  const arg = (k) => (process.argv.find((x) => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
  const IN = arg('in') || join(ROOT, 'tests/fixtures'), OUT = arg('out') || join(ROOT, 'tests/fixtures');
  for (const [src, dst] of JOBS) { writeFileSync(join(OUT, dst), build(readFileSync(join(IN, src), 'utf8'))); console.log('wrote', dst); }
  for (const m of ms) console.log(m.c.name, 'lease', m.leaseNow.toFixed(2), 'cov', m.cov.toFixed(0), JSON.stringify(money.glance(m)));
}
