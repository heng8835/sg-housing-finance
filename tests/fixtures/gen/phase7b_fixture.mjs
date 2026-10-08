// Builds the Phase 7b compare fixtures: compare-phase7a-family(.txt|-fv|-nobto) → compare-phase7b(.txt|-fv|-nobto).
// Changed (intended, reviewed in hdb-data-pipeline/docs/specs/phase7b-compare-diff.md):
//   - At a glance: the premium flag (first flag of each column) re-rendered by app/modules/explore/comparables.js
//     premiumFlag() — B13 "Unusually high / low" beyond ±UNUSUAL_PREMIUM; inside it the old flag (asserted identical).
// Checked unchanged (asserted, so a regression fails the chain):
//   - "Over-priced? (vs comparable sales)": re-rendered by the app row — B13 rank text only below RANK_TEXT_MAX_N sales;
//   - the money rows of "Can we afford it?" (money.js): no daily place tagged as the parents' home → no PHG row and the
//     same planPurchase() inputs (B12 adds flat.parentsKm only when a place is tagged);
//   - the header "best in X of N" (B1 replaces it only while ticks are saved; the seed has none).
// Usage: node tests/fixtures/gen/phase7b_fixture.mjs [in=<dir with compare-phase7a-family*.txt>] [out=<dir>]   (default tests/fixtures)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { comps, money, ms as moneyMs, strip } from './money_fixture.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const { premiumFlag, ROW_KEY: OVERPRICED } = await import(pathToFileURL(ROOT + 'app/modules/explore/comparables.js').href);

export const JOBS = [['compare-phase7a-family.txt', 'compare-phase7b.txt'], ['compare-phase7a-family-fv.txt', 'compare-phase7b-fv.txt'], ['compare-phase7a-family-nobto.txt', 'compare-phase7b-nobto.txt']];
const SQFT = 10.7639;

/** legacy metrics() fields the premium flag and the Over-priced row read (same formulas as legacy.js). */
export const ms = moneyMs.map((x) => {
  const { c, b } = x, sqft = c.sqm * SQFT, bench = comps.benchmark(c, b), fair = bench.psf ? bench.psf * sqft : null;
  return { ...x, sqft, psf: c.price / sqft, bench, fair, premium: fair ? c.price / fair - 1 : null };
});
// the pre-7b legacy verdict() premium flag, verbatim (fmt.pct(v, 0))
const pct0 = (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%';
export const oldFlag = (m) => (m.premium > 0.08 ? ['serious', '▲', `${pct0(m.premium)} above recent sales (${m.bench.short})`] : m.premium < -0.03 ? ['good', '▼', `${pct0(m.premium)} below recent sales`] : ['good', '≈', 'priced in line with recent sales']);
const key = (l) => l.split(' | ')[0];

export function build(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n', L = text.split(nl);
  const find = (k) => { const i = L.findIndex((l) => key(l) === k); if (i < 0) throw new Error('no row ' + k); return i; };
  // At a glance: the first flag of each column is the premium flag
  const gi = find('At a glance'), gc = L[gi].split(' | ');
  ms.forEach((m, j) => {
    const [, oi, ot] = oldFlag(m), old = `${oi} ${ot}`, cell = gc[j + 1];
    if (!cell.startsWith(old + ' ')) throw new Error(`column ${j}: premium flag is not "${old}"`);
    const [, ni, nt] = premiumFlag(m.premium, m.bench.short);
    gc[j + 1] = `${ni} ${nt}` + cell.slice(old.length);
  });
  L[gi] = gc.join(' | ');
  // unchanged: the Over-priced row (rank text needs < 8 sales) and the money rows (no parents' place tagged)
  const op = `${OVERPRICED}i | ` + ms.map((m) => strip(comps.row().f(m))).join(' | ');
  if (L[find(`${OVERPRICED}i`)] !== op) throw new Error('Over-priced row changed: ' + op);
  for (const r of money.rows()) {
    const line = `${r.k}i | ` + moneyMs.map((m) => strip(r.f(m))).join(' | ');
    if (L[find(`${r.k}i`)] !== line) throw new Error('money row changed: ' + r.k);
  }
  return L.join(nl);
}

if (/phase7b_fixture\.mjs$/.test(process.argv[1] || '')) { // run as a script (not imported by a test)
  const arg = (k) => (process.argv.find((x) => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
  const IN = arg('in') || join(ROOT, 'tests/fixtures'), OUT = arg('out') || join(ROOT, 'tests/fixtures');
  for (const [src, dst] of JOBS) { writeFileSync(join(OUT, dst), build(readFileSync(join(IN, src), 'utf8'))); console.log('wrote', dst); }
  for (const m of ms) console.log(m.c.name, 'premium', m.premium.toFixed(4), JSON.stringify(premiumFlag(m.premium, m.bench.short)));
}
