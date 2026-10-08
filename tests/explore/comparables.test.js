import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_COMPS, LIST_MAX, ROW_KEY, pickComps, newestFirst, ordinal, overpricedCell, summaryText, panelHtml, createComparables } from '../../app/modules/explore/comparables.js';
import { fairValue } from '../../app/engine/fairvalue.js';

test('ordinal percentiles (English suffixes, rounded)', () => {
  const out = [0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 35.48, 68.5, 100].map(ordinal);
  assert.deepEqual(out, ['0th percentile', '1st percentile', '2nd percentile', '3rd percentile', '4th percentile', '11th percentile', '12th percentile', '13th percentile', '21st percentile', '22nd percentile', '23rd percentile', '35th percentile', '69th percentile', '100th percentile']);
});

test('pickComps: same flat type and month window, like statsFor; newestFirst', () => {
  const TX = { m: [5, 9, 10, 11, 11, 3], ft: [3, 3, 2, 3, 3, 3] };
  assert.deepEqual(pickComps([0, 1, 2, 3, 4, 5], 3, 5, 11, TX), [0, 1, 3, 4]);
  assert.deepEqual(newestFirst([0, 1, 3, 4], TX), [4, 3, 1, 0]);
});

test('overpricedCell: percentile line, thin line, button only with sales', () => {
  const fv = fairValue({ psfs: [500, 520, 540, 560, 580, 600, 620, 640, 660], sqft: 1000, askingPsf: 610, minN: MIN_COMPS });
  const html = overpricedCell(fv, { id: 7 });
  assert.match(html, /^69th percentile<small>in the usual range · P25–P75 S\$540k–S\$620k · n=9<\/small><button /);
  assert.match(html, /data-comps="7"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(overpricedCell(fv, { id: 7, expanded: true }), /aria-expanded="true"/);
  const thin = fairValue({ psfs: [600, 620, 640], sqft: 1000, askingPsf: 610, minN: MIN_COMPS });
  assert.match(overpricedCell(thin, { id: 2 }), /^<span class="muted">not enough sales<\/span><small>n=3 \(at least 5 needed\)<\/small><button /);
  const none = fairValue({ psfs: [], sqft: 1000, askingPsf: 610, minN: MIN_COMPS });
  assert.doesNotMatch(overpricedCell(none, { id: 2 }), /button/);
  // the button has no text node: the compare dump and "Copy table" stay data only
  assert.equal(html.replace(/<[^>]+>/g, ''), '69th percentilein the usual range · P25–P75 S$540k–S$620k · n=9');
});

test('summaryText', () => {
  const fv = fairValue({ psfs: [500, 520, 540, 560, 580], sqft: 1000, askingPsf: 590, minN: MIN_COMPS });
  assert.equal(summaryText(fv, 590), 'asking S$590 psf · 100th percentile · above most comparable sales · P25–P75 S$520–560 psf');
  const thin = fairValue({ psfs: [500], sqft: 1000, askingPsf: 590, minN: MIN_COMPS });
  assert.equal(summaryText(thin, 590), 'asking S$590 psf · not enough sales');
});

test('panelHtml: first LIST_MAX rows, then "Show all"; all → every row', () => {
  const idx = Array.from({ length: LIST_MAX + 10 }, (_, i) => i);
  const cols = { month: (i) => `M${i}`, block: () => '101 Bishan St 12', storey: () => '10–12', sqm: () => 93, price: () => 700000, psf: () => 699.6 };
  const s = { id: 1, name: 'Bishan <4R>', src: 'this block, 60 sales, last 24 m', summary: 'asking S$719 psf', idx, all: false };
  const html = panelHtml(s, cols);
  assert.equal((html.match(/<tr><td>/g) || []).length, LIST_MAX);
  assert.match(html, /Show all 60/);
  assert.match(html, /Comparable sales · Bishan &lt;4R&gt;/);
  assert.match(html, /<td class="r">700,000<\/td><td class="r">700<\/td>/);
  assert.equal((panelHtml({ ...s, all: true }, cols).match(/<tr><td>/g) || []).length, LIST_MAX + 10);
  assert.match(panelHtml({ ...s, all: true }, cols), /Show fewer/);
  assert.doesNotMatch(panelHtml({ ...s, idx: idx.slice(0, 3) }, cols), /Show all/);
  assert.match(panelHtml({ ...s, idx: [] }, cols), /No comparable sales in this window/);
});

// --- benchmark tiers on a tiny synthetic market (same rules as before the move out of legacy.js)
function market() {
  // blocks 0 and 1 are 100 m apart (same lease), block 2 is 3 km away in the same town, block 3 new lease
  const blocks = [
    { lat: 1.35, lon: 103.8, t: 0, lease: 1990, label: 'A' }, { lat: 1.3509, lon: 103.8, t: 0, lease: 1992, label: 'B' },
    { lat: 1.377, lon: 103.8, t: 0, lease: 1990, label: 'C' }, { lat: 1.3501, lon: 103.8001, t: 0, lease: 2015, label: 'D' },
  ];
  const tx = { b: [], m: [], ft: [], ly: [], p: [], a: [], s: [] };
  const add = (b, m, p, n = 1) => { for (let k = 0; k < n; k++) { tx.b.push(b); tx.m.push(m); tx.ft.push(3); tx.ly.push(blocks[b].lease); tx.p.push(p + k * 1000); tx.a.push(100); tx.s.push(0); } };
  return { blocks, tx, add };
}
function ctxFor(mk, lastMonthIdx) {
  const { blocks, tx } = mk;
  const PSF = tx.p.map((p, i) => p / (tx.a[i] * 10.7639));
  const blockTx = blocks.map((_, bi) => tx.b.map((b, i) => (b === bi ? i : -1)).filter((i) => i >= 0));
  const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const statsFor = (indices, ft, mFrom, mTo) => { const psfs = []; for (const i of indices) { if (tx.m[i] < mFrom || tx.m[i] > mTo || (ft != null && tx.ft[i] !== ft)) continue; psfs.push(PSF[i]); } return { n: psfs.length, psf: median(psfs) }; };
  const haversine = (la1, lo1, la2, lo2) => { const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
  const D = { blocks, towns: ['BISHAN'], storeys: ['01 TO 03'] };
  return { D, TX: tx, PSF, blockTx, statsFor, townTx: () => tx.b.map((_, i) => i), haversine, title: (s) => s[0] + s.slice(1).toLowerCase(), lastMonthIdx, fmtMonth: (m) => `M${m}` };
}

test('benchmark tiers: block 12 m → block 24 m → 400 m similar lease → town; pool matches n', () => {
  const mk = market();
  mk.add(0, 30, 600000, 3);                 // own block, last 12 m
  let cx = ctxFor(mk, 35), cmp = createComparables(cx);
  let bn = cmp.benchmark({ bid: 0, ft: 3 }, mk.blocks[0]);
  assert.deepEqual([bn.tier, bn.n, bn.months, bn.src], [1, 3, 12, 'this block, 3 sales, last 12 m']);

  const mk2 = market();
  mk2.add(0, 15, 600000, 3);                // own block, 13–24 m ago
  bn = createComparables(ctxFor(mk2, 35)).benchmark({ bid: 0, ft: 3 }, mk2.blocks[0]);
  assert.deepEqual([bn.tier, bn.n, bn.months], [2, 3, 24]);

  const mk3 = market();
  mk3.add(1, 30, 650000, 5); mk3.add(3, 30, 900000, 4); mk3.add(2, 30, 500000, 9);
  cx = ctxFor(mk3, 35); cmp = createComparables(cx);
  bn = cmp.benchmark({ bid: 0, ft: 3 }, mk3.blocks[0]);
  assert.equal(bn.tier, 3);                 // block 1 within 400 m; block 3 (lease 2015) excluded; block 2 too far
  assert.equal(bn.src, 'blocks within 400 m, similar lease, 5 sales, last 12 m');
  const m = { c: { id: 1, bid: 0, ft: 3, name: 'X' }, b: mk3.blocks[0], sqft: 1000, psf: 610, bench: bn };
  assert.equal(cmp.compsOf(m).length, bn.n);
  assert.ok(cmp.compsOf(m).every((i) => cx.TX.b[i] === 1));
  assert.ok(Math.abs(cmp.fairOf(m).p50 - bn.psf) < 1e-9); // P50 = the benchmark median (fair value unchanged)

  bn = cmp.benchmark({ bid: 2, ft: 3 }, mk3.blocks[2]);   // own block has 9 sales → tier 1
  assert.equal(bn.tier, 1);
  const mk4 = market(); mk4.add(3, 30, 900000, 2); mk4.add(2, 30, 500000, 2);
  bn = createComparables(ctxFor(mk4, 35)).benchmark({ bid: 0, ft: 3 }, mk4.blocks[0]);
  assert.deepEqual([bn.tier, bn.n, bn.short], [6, 4, 'Bishan overall']);
});

// --- "Over-priced?" widening: a benchmark tier with < MIN_COMPS sales → the next wider tier with enough
function opened(mk, last = 35) {
  let handler = null;
  const body = { addEventListener: (_, f) => { handler = f; }, querySelector: () => null };
  const cx = ctxFor(mk, last), cmp = createComparables({ ...cx, body, rerender: () => {} });
  const flat = (bid = 0) => { const m = { c: { id: 1, bid, ft: 3, name: 'X' }, b: mk.blocks[bid], sqft: 1000, psf: 610 }; m.bench = cmp.benchmark(m.c, m.b); return m; };
  const open = (id) => handler({ target: { closest: () => ({ dataset: { comps: String(id) }, hasAttribute: () => false }) } });
  return { cx, cmp, flat, open };
}
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('overpricedCell: widened scope sits before n; none when not widened', () => {
  const fv = fairValue({ psfs: [500, 520, 540, 560, 580, 600, 620, 640, 660], sqft: 1000, askingPsf: 610, minN: MIN_COMPS });
  assert.match(overpricedCell(fv, { scope: 'nearby blocks, similar lease' }), /S\$620k · nearby blocks, similar lease · n=9<\/small>/);
  assert.match(overpricedCell(fv, { scope: '<b>' }), /&lt;b&gt; · n=9/);
  assert.match(overpricedCell(fv), /S\$620k · n=9<\/small>/);
});

test('widening: thin block (12 m) → this block over 24 m; benchmark unchanged', () => {
  const mk = market(); mk.add(0, 30, 600000, 3); mk.add(0, 15, 610000, 3); mk.add(1, 30, 650000, 9);
  const { cx, cmp, flat } = opened(mk), m = flat();
  assert.deepEqual([m.bench.tier, m.bench.n, m.bench.src], [1, 3, 'this block, 3 sales, last 12 m']);
  const fv = cmp.fairOf(m);
  assert.deepEqual([fv.enough, fv.n, fv.tier, fv.window.months], [true, 6, 2, 24]);
  assert.ok(cmp.compsOf(m).every((i) => cx.TX.b[i] === 0));
  assert.match(strip(cmp.row().f(m)), /· this block, last 24 m · n=6$/);
});

test('widening: thin block → nearby blocks with similar lease; list shows the widened set and says so', () => {
  const mk = market(); mk.add(0, 30, 600000, 3); mk.add(1, 30, 650000, 6); mk.add(3, 30, 900000, 6);
  const { cx, cmp, flat, open } = opened(mk), m = flat();
  assert.deepEqual([m.bench.tier, m.bench.n, m.bench.psf], [1, 3, cmp.benchmark(m.c, m.b).psf]);
  const fv = cmp.fairOf(m);
  assert.deepEqual([fv.n, fv.tier, fv.window.months], [6, 3, 12]);
  assert.ok(cmp.compsOf(m).every((i) => cx.TX.b[i] === 1));      // block 3 (lease 2015) stays out
  const cell = strip(cmp.row().f(m));
  // 7b B13: fewer than RANK_TEXT_MAX_N (8) sales → a plain rank instead of a percentile
  assert.match(cell, /^Dearer than all 6 recent sales \(\+1%\) .* · nearby blocks, similar lease · n=6$/);
  open(1);
  const html = cmp.panel([m]);
  assert.match(html, /blocks within 400 m, similar lease, 6 sales, last 12 m, same flat type · newest first/);
  assert.match(html, /Widened: the benchmark above has only 3 sales \(this block\); at least 5 are needed for a percentile\./);
  assert.equal((html.match(/<tr><td>/g) || []).length, 6);
});

test('widening: nearby thin → town with similar lease → town overall', () => {
  const mk = market(); mk.add(0, 30, 600000, 3); mk.add(1, 30, 650000, 2); mk.add(2, 30, 500000, 4);
  let { cmp, flat, open } = opened(mk), m = flat();
  assert.equal(m.bench.tier, 1);
  assert.deepEqual([cmp.fairOf(m).n, cmp.fairOf(m).tier], [9, 5]);
  assert.match(strip(cmp.row().f(m)), /· Bishan, similar lease · n=9$/);
  open(1);
  assert.match(cmp.panel([m]), /Bishan, similar lease \(±5 y\), 9 sales, last 12 m/);

  const mk2 = market(); mk2.add(0, 30, 600000, 3); mk2.add(3, 30, 900000, 3);   // only a new-lease block nearby
  ({ cmp, flat } = opened(mk2)); m = flat();
  assert.deepEqual([cmp.fairOf(m).n, cmp.fairOf(m).tier], [6, 6]);
  assert.match(strip(cmp.row().f(m)), /· Bishan overall · n=6$/);
});

test('widening: every wider tier thin → "not enough sales" on the benchmark\'s own sales, no note', () => {
  const mk = market(); mk.add(0, 30, 600000, 3); mk.add(3, 30, 900000, 1);
  const { cmp, flat, open } = opened(mk), m = flat();
  const fv = cmp.fairOf(m);
  assert.deepEqual([m.bench.tier, fv.enough, fv.n, fv.tier], [1, false, 3, 1]);
  assert.equal(strip(cmp.row().f(m)), 'not enough sales n=3 (at least 5 needed)');
  open(1);
  const html = cmp.panel([m]);
  assert.match(html, /this block, 3 sales, last 12 m, same flat type/);
  assert.doesNotMatch(html, /Widened/);
  // a benchmark that is already the town overall cannot widen
  const mk2 = market(); mk2.add(3, 30, 900000, 2); mk2.add(2, 30, 500000, 2);
  const o2 = opened(mk2), m2 = o2.flat();
  assert.deepEqual([m2.bench.tier, o2.cmp.fairOf(m2).enough, o2.cmp.fairOf(m2).n], [6, false, 4]);
});

test('row(): key, Simple-visible, no best-in-row value; panel follows the open flat', () => {
  const mk = market(); mk.add(1, 30, 650000, 6);
  const cmp = createComparables(ctxFor(mk, 35));
  const r = cmp.row();
  assert.equal(r.k, ROW_KEY);
  assert.equal(r.simple, true);
  assert.equal(r.v, undefined);             // keeps the "best in X of Y measures" counts unchanged
  assert.equal(cmp.panel([]), '');
});
