// Phase 7a A8 — hand-offs carry the right flat (app/modules/explore/handoff.js): the Afford / Rent check flat type is
// the type of the sales behind the median handed over (one type); "Add a flat from this block…" uses the user's flat
// type here (added directly when only one type is selected); Plan's typical next flat for an upgrader = the largest
// selected type (core/typical.js). Fixtures: P4 (mostly 3-room block, 2–3 room selected), P6 (4-room block).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeCounts, topType, handoffFlat, typeWithoutPrice, addPlan, focusLabel, nearestStorey, createHandoff, RECENT_M } from '../../app/modules/explore/handoff.js';
import { cardHtml, cardState } from '../../app/modules/explore/card.js';
import { defaultFlatType, largestType, effectiveFlat } from '../../app/core/typical.js';

const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const I = Object.fromEntries(FT.map((f, i) => [f, i]));
const STOREY_MID = [2, 5, 8, 11, 14];
const STOREY_CHOICES = STOREY_MID.map((_, i) => ({ i }));
const LAST = 120;

/** A tiny legacy-shaped world: sales = [[block, type name, month, price, sqm, storey]]. */
function world(sales, S) {
  const TX = { b: [], ft: [], m: [], p: [], a: [], s: [] };
  const nb = Math.max(...sales.map((x) => x[0])) + 1;
  const blockTx = Array.from({ length: nb }, () => []);
  sales.forEach(([b, ft, m, p, a, s], i) => { TX.b.push(b); TX.ft.push(I[ft]); TX.m.push(m); TX.p.push(p); TX.a.push(a); TX.s.push(s); blockTx[b].push(i); });
  const D = { flat_types: FT, blocks: Array.from({ length: nb }, (_, k) => ({ label: `Blk ${k}` })) };
  // the map's colouring rule (legacy aggregateBlocks): selected types in the window → coloured
  const agg = () => blockTx.map((idx) => (idx.some((i) => S.ft.includes(TX.ft[i]) && TX.m[i] >= S.mFrom && TX.m[i] <= S.mTo) ? { n: 1 } : null));
  const ho = createHandoff({ D, TX, blockTx, getS: () => S, getAgg: agg, txOk: () => true, median, lastMonthIdx: LAST, storeyMid: STOREY_MID, storeyChoices: STOREY_CHOICES });
  return { TX, blockTx, D, ho, agg };
}

test('topType: most sales, only among the given types; ties → the larger type; null when none', () => {
  const c = typeCounts([0, 1, 2, 3, 4], (i) => [2, 2, 3, 3, 1][i]);
  assert.equal(topType(c), 3);
  assert.equal(topType(c, [1, 2]), 2);
  assert.equal(topType(c, [5]), null);
  assert.equal(topType(new Map()), null);
});

test('handoffFlat: one type in the sales → that type and the same median as the tiles', () => {
  const idx = [0, 1, 2], ft = () => 3, price = (i) => [500000, 520000, 560000][i];
  const h = handoffFlat({ idx, ftOf: ft, priceOf: price, selected: [3, 4], median });
  assert.deepEqual(h, { ft: 3, price: 520000, n: 3, mixed: false, mine: true });
  assert.equal(handoffFlat({ idx: [], ftOf: ft, priceOf: price, selected: [3], median }), null);
});

test('P4: mostly 3-room block, 2–3 room selected → Afford gets 3-room and the 3-room median, and says which', () => {
  const S = { ft: [I['2 ROOM'], I['3 ROOM']], mFrom: LAST - 11, mTo: LAST };
  const { ho } = world([
    [0, '3 ROOM', 112, 400000, 67, 1], [0, '3 ROOM', 114, 420000, 68, 2], [0, '3 ROOM', 116, 410000, 67, 2],
    [0, '3 ROOM', 118, 440000, 68, 3], [0, '3 ROOM', 119, 430000, 67, 2], [0, '2 ROOM', 117, 300000, 45, 1],
  ], S);
  const f = ho.focus(0, 52);
  assert.equal(f.flatType, '3 ROOM');                           // not 2-room (the first selected type, P4-2)
  assert.equal(f.price, 420000);                                // the 3-room median, not the mixed one (415k)
  assert.equal(f.remainingLease, 52);
  assert.equal(f.source, 'block'); assert.equal(f.bid, 0);
  assert.match(f.label, /Using 3-room — the type of the recent sales here; change it/);
  assert.equal(ho.flat(0).ft, '3 ROOM');
});

test('only one type sold → label names it, no "Using" note; nothing selected sold → most-sold type, said', () => {
  const S = { ft: [I['4 ROOM'], I['5 ROOM']], mFrom: LAST - 11, mTo: LAST };
  const { ho } = world([
    [0, '4 ROOM', 115, 600000, 92, 2], [0, '4 ROOM', 116, 640000, 93, 3],
    [1, '3 ROOM', 115, 380000, 67, 2], [1, '3 ROOM', 117, 390000, 67, 2], [1, '2 ROOM', 118, 290000, 45, 1],
  ], S);
  const a = ho.focus(0, 70);
  assert.equal(a.flatType, '4 ROOM'); assert.equal(a.price, 620000);
  assert.equal(a.label, 'Blk 0 — median of recent 4-room sales');
  const b = ho.focus(1, 70); // not coloured: the tiles use all types in the window → the most-sold type of those
  assert.equal(b.flatType, '3 ROOM'); assert.equal(b.price, 385000);
  assert.match(b.label, /Using 3-room — none of your flat types sold here recently; change it/);
});

test('no sales in the window → no price; the flat type is the user\'s type sold here, never a default 4-room', () => {
  const S = { ft: [I['3 ROOM'], I['4 ROOM'], I['5 ROOM']], mFrom: LAST - 11, mTo: LAST };
  const { ho } = world([[0, '5 ROOM', 40, 500000, 110, 2], [0, '5 ROOM', 50, 520000, 110, 2], [0, '4 ROOM', 60, 450000, 92, 2]], S);
  const f = ho.focus(0, 60);
  assert.equal(f.price, null);
  assert.equal(f.flatType, '5 ROOM');
  assert.equal(f.label, 'Blk 0 — no recent sales');
  assert.equal(typeWithoutPrice({ all: [], ftOf: () => 0, selected: [4] }), 4);
  assert.equal(typeWithoutPrice({ all: [], ftOf: () => 0, selected: [3, 4] }), null);
});

test('median price and type always match (random blocks and selections)', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let run = 0; run < 40; run++) {
    const sales = [];
    for (let b = 0; b < 6; b++) for (let k = 0, n = Math.floor(rnd() * 9); k < n; k++) sales.push([b, FT[1 + Math.floor(rnd() * 5)], 90 + Math.floor(rnd() * 31), 250000 + Math.floor(rnd() * 60) * 10000, 60 + Math.floor(rnd() * 60), Math.floor(rnd() * 5)]);
    if (!sales.length) continue;
    const ft = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => 1 + Math.floor(rnd() * 5)))];
    const S = { ft, mFrom: LAST - 11, mTo: LAST };
    const { ho, TX, blockTx, agg } = world(sales, S);
    blockTx.forEach((idx, bi) => {
      const f = ho.focus(bi, 60);
      const behind = idx.filter((i) => TX.m[i] >= S.mFrom && TX.m[i] <= S.mTo && (!agg()[bi] || S.ft.includes(TX.ft[i])));
      if (!behind.length) { assert.equal(f.price, null); return; }
      const sameType = behind.filter((i) => FT[TX.ft[i]] === f.flatType);
      assert.ok(sameType.length > 0, 'the handed-over type has sales behind the median');
      assert.equal(f.price, Math.round(median(sameType.map((i) => TX.p[i]))));
      if (new Set(behind.map((i) => TX.ft[i])).size === 1) assert.equal(f.price, Math.round(median(behind.map((i) => TX.p[i])))); // single type: same as the tiles
      if (agg()[bi]) assert.ok(S.ft.includes(I[f.flatType]), 'a coloured block hands over one of the selected types');
    });
  }
});

test('P6: 4-room block, 4- and 5-room selected → the form gets 4-room with its median price and size', () => {
  const S = { ft: [I['4 ROOM'], I['5 ROOM']], mFrom: LAST - 11, mTo: LAST };
  const { ho } = world([
    [0, '4 ROOM', 110, 560000, 92, 2], [0, '4 ROOM', 112, 580000, 93, 3], [0, '4 ROOM', 115, 600000, 92, 3],
    [0, '4 ROOM', 119, 590000, 93, 4], [0, '5 ROOM', 118, 660000, 110, 3], [0, '3 ROOM', 117, 420000, 67, 1],
  ], S);
  const r = ho.add(0);
  assert.equal(r.direct, false);                 // two types selected → the form, highlighted
  assert.equal(FT[r.row.ft], '4 ROOM');          // not the 5-room "typical" (P6-4)
  assert.equal(r.row.price, 585000);             // median of the 4-room sales, rounded to S$1,000
  assert.equal(r.row.sqm, 93);                   // median size of the same sales (92.5 → 93)
  assert.equal(r.row.storey, 3);
  assert.equal(r.n, 4);
});

test('Add: one type selected and sold here → added directly; one type never sold here → the form', () => {
  const S = { ft: [I['4 ROOM']], mFrom: LAST - 11, mTo: LAST };
  const { ho } = world([[0, '4 ROOM', 115, 600000, 92, 2], [0, '5 ROOM', 116, 700000, 110, 2], [1, '3 ROOM', 115, 400000, 67, 1]], S);
  const a = ho.add(0);
  assert.equal(a.direct, true); assert.equal(FT[a.row.ft], '4 ROOM'); assert.equal(a.row.price, 600000);
  const b = ho.add(1);
  assert.equal(b.direct, false); assert.equal(FT[b.row.ft], '4 ROOM'); // the user's type, price left for the listing
  assert.equal(b.row.price, null); assert.equal(b.row.sqm, null);
});

test('addPlan: recent sales first, else all years; never sold with several types → the largest selected', () => {
  const ft = (i) => [3, 3, 4][i];
  assert.equal(addPlan({ recent: [2], all: [0, 1, 2], ftOf: ft, selected: [3, 4] }).ft, 4);
  assert.equal(addPlan({ recent: [], all: [0, 1, 2], ftOf: ft, selected: [3, 4] }).ft, 3);
  const none = addPlan({ recent: [], all: [], ftOf: ft, selected: [2, 4] });
  assert.equal(none.ft, 4); assert.equal(none.mine, false); assert.equal(none.direct, false);
  assert.equal(RECENT_M, 24);
});

test('focusLabel and nearestStorey', () => {
  assert.equal(focusLabel('Blk 1', '4 ROOM', { mixed: false, mine: true }), 'Blk 1 — median of recent 4-room sales');
  assert.equal(focusLabel('Blk 1', 'EXECUTIVE', { mixed: true, mine: true }), 'Blk 1 — median of recent sales · Using Executive — the type of the recent sales here; change it');
  assert.equal(nearestStorey(null, STOREY_MID, STOREY_CHOICES), null);
  assert.equal(nearestStorey(2.4, STOREY_MID, STOREY_CHOICES), 2);
});

test('block card: "Add a flat from this block…" and a line naming the type handed to Afford / Rent check', () => {
  const cols = { month: () => 'Jan 2026', type: () => '4-room', storey: () => '7–9', sqm: () => 92, price: () => 600000, psf: () => 600 };
  const model = (ho) => ({ key: 1, head: { sub: 'Ang Mo Kio', facts: [], items: [], newYear: null }, st: cardState({ matchN: 4, aggOk: true, periodN: 4 }), tiles: { price: 610000, psf: 600, n: 4 },
    scope: '4-room', period: 'x', win: '1 year', trend: { heading: 'Median price by year', caption: '', enough: false },
    sales: { idx: [], cols, total: 4, mine: 4, from: 2017, to: 2026, open: false }, rent: null, rentFirst: false, folds: {}, affordPrice: 610000, ho });
  const html = cardHtml(model({ ft: '3 ROOM', price: 420000 }));
  assert.match(html, /data-act="add">Add a flat from this block…</);
  assert.doesNotMatch(html, /Add to my choices/);
  assert.match(html, /Afford this and Rent check use the 3-room median: S\$420k\./);
  assert.doesNotMatch(cardHtml(model(null)), /use the .* median/);
});

test('Plan: an upgrader\'s typical next flat is the largest selected type', () => {
  assert.equal(largestType(['4 ROOM', '5 ROOM', 'EXECUTIVE']), 'EXECUTIVE');
  assert.equal(largestType(['3 ROOM', '2 ROOM']), '3 ROOM');
  assert.equal(largestType(['MULTI-GENERATION', '5 ROOM']), 'MULTI-GENERATION');
  assert.equal(largestType([]), null);
  const sel = { flatTypes: ['4 ROOM', '5 ROOM', 'EXECUTIVE'] };
  assert.equal(defaultFlatType(null, sel), '4 ROOM');                // other tabs: unchanged
  assert.equal(defaultFlatType(null, sel, 'largest'), 'EXECUTIVE'); // P2-9
  assert.equal(defaultFlatType({ flatType: '3 ROOM' }, sel, 'largest'), '3 ROOM'); // a picked flat always wins
  assert.equal(defaultFlatType(null, { flatTypes: [] }, 'largest'), '4 ROOM');
  const store = { get: (k) => (k === 'focus' ? { source: 'block', price: 650000, flatType: '5 ROOM' } : null) };
  assert.equal(effectiveFlat(store, sel, { prefer: 'largest' }).flatType, '5 ROOM');
});

test('A8 strings have 中文 entries (zh-explore; guide step key updated)', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => JSON.parse(readFileSync(new URL(`../../app/i18n/${p}`, import.meta.url), 'utf8'));
  const zh = read('zh-explore.json');
  for (const k of ['Add a flat from this block…', 'Afford this and Rent check use the {0} median: {1}.', '{0} — median of recent {1} sales', '{0} — no recent sales',
    'Using {0} — the type of the recent sales here; change it', 'Using {0} — none of your flat types sold here recently; change it', 'Added — edit in My choices', 'Open My choices →']) assert.ok(zh[k], k);
  assert.ok(read('zh-guide.json')['Paste the block and street from a listing, or click a block → “Add a flat from this block…”.']);
});
