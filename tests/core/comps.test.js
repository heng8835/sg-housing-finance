// core/comps.js: the tiered comparables used by Plan → Sell then buy must pick exactly the sales Explore's
// "Over-priced?" row picks (modules/explore/comparables.js) — same tiers, minimums, windows and widening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieredComps, blockLease, nearBlocks, MIN_COMPS, NEAR_M, LEASE_TOL, BLOCK_MIN, AREA_MIN } from '../../app/core/comps.js';
import * as explore from '../../app/modules/explore/comparables.js';

const { createComparables } = explore;

function market() {
  // blocks 0 and 1 are 100 m apart (same lease), block 2 is 3 km away in the same town, block 3 new lease, block 4 another town 3 km away
  const blocks = [
    { lat: 1.35, lon: 103.8, t: 0, lease: 1990, label: 'A' }, { lat: 1.3509, lon: 103.8, t: 0, lease: 1992, label: 'B' },
    { lat: 1.377, lon: 103.8, t: 0, lease: 1990, label: 'C' }, { lat: 1.3501, lon: 103.8001, t: 0, lease: 2015, label: 'D' },
    { lat: 1.38, lon: 103.8, t: 1, lease: 1990, label: 'E' },
  ];
  const tx = { b: [], m: [], ft: [], ly: [], p: [], a: [], s: [] };
  const add = (b, m, p, n = 1, ft = 3) => { for (let k = 0; k < n; k++) { tx.b.push(b); tx.m.push(m); tx.ft.push(ft); tx.ly.push(blocks[b].lease); tx.p.push(p + k * 1000); tx.a.push(100); tx.s.push(0); } };
  const hdb = { months: Array.from({ length: 36 }, (_, i) => `M${i}`), blocks, tx, towns: ['BISHAN', 'OTHER'], storeys: ['01 TO 03'] };
  return { hdb, add };
}
function exploreComps(hdb, bid, ft = 3, last = 35) {
  const tx = hdb.tx, PSF = tx.p.map((p, i) => p / (tx.a[i] * 10.7639));
  const blockTx = hdb.blocks.map((_, bi) => tx.b.map((b, i) => (b === bi ? i : -1)).filter((i) => i >= 0));
  const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const statsFor = (idx, f, mFrom, mTo) => { const psfs = []; for (const i of idx) { if (tx.m[i] < mFrom || tx.m[i] > mTo || (f != null && tx.ft[i] !== f)) continue; psfs.push(PSF[i]); } return { n: psfs.length, psf: median(psfs) }; };
  const haversine = (la1, lo1, la2, lo2) => { const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
  const townTx = (ti) => tx.b.map((b, i) => (hdb.blocks[b].t === ti ? i : -1)).filter((i) => i >= 0);
  const cmp = createComparables({ D: hdb, TX: tx, PSF, blockTx, statsFor, townTx, haversine, title: (s) => s, lastMonthIdx: last, fmtMonth: String });
  const m = { c: { id: 1, bid, ft, name: 'X' }, b: hdb.blocks[bid], sqft: 1000, psf: 600 };
  m.bench = cmp.benchmark(m.c, m.b);
  return { idx: cmp.compsOf(m).slice().sort((a, b) => a - b), tier: cmp.fairOf(m).tier };
}
const same = (hdb, bid) => {
  const a = tieredComps(hdb, { bid, ft: 3, last: 35 }), b = exploreComps(hdb, bid);
  assert.deepEqual([a.tier, a.idx], [b.tier, b.idx], `block ${bid}`);
  return a;
};

test('constants are the ones Explore uses (re-exported, not copied)', () => {
  assert.deepEqual([explore.MIN_COMPS, explore.NEAR_M, explore.LEASE_TOL, explore.BLOCK_MIN, explore.AREA_MIN], [MIN_COMPS, NEAR_M, LEASE_TOL, BLOCK_MIN, AREA_MIN]);
});

test('same picks as the Explore "Over-priced?" row, tier by tier', () => {
  let x = market(); x.add(0, 30, 600000, 6);                                   // own block 12 m, enough
  assert.equal(same(x.hdb, 0).tier, 1);
  x = market(); x.add(0, 30, 600000, 3); x.add(0, 15, 610000, 3); x.add(1, 30, 650000, 9);
  assert.equal(same(x.hdb, 0).tier, 2);                                        // thin 12 m → this block 24 m
  x = market(); x.add(0, 30, 600000, 3); x.add(1, 30, 650000, 6); x.add(3, 30, 900000, 6); x.add(4, 30, 1, 9);
  const near = same(x.hdb, 0);
  assert.equal(near.tier, 3);                                                  // new-lease block 3 and other-town block 4 stay out
  assert.ok(near.idx.every((i) => x.hdb.tx.b[i] === 1));
  x = market(); x.add(0, 30, 600000, 3); x.add(1, 30, 650000, 2); x.add(2, 30, 500000, 4);
  assert.equal(same(x.hdb, 0).tier, 5);                                        // town, similar lease
  x = market(); x.add(0, 30, 600000, 3); x.add(3, 30, 900000, 3);
  assert.equal(same(x.hdb, 0).tier, 6);                                        // town overall
  x = market(); x.add(0, 30, 600000, 3); x.add(3, 30, 900000, 1);
  const thin = same(x.hdb, 0);
  assert.deepEqual([thin.tier, thin.n], [1, 3]);                               // nothing wider has 5 → the benchmark's own
  x = market(); x.add(0, 5, 600000, 9); x.add(0, 30, 600000, 2, 2);            // too old / other flat type
  assert.equal(same(x.hdb, 0).n, 0);
});

test('helpers: lease fallback, near blocks, unknown block / type', () => {
  const x = market(); x.add(1, 30, 650000, 2);
  assert.deepEqual(nearBlocks(x.hdb, 0), [1, 3]);
  const h = { ...x.hdb, blocks: x.hdb.blocks.map((b) => ({ ...b, lease: undefined, yc: 1999 })) };
  assert.equal(blockLease(h, 1), 1992);                                        // most common lease year of its sales
  assert.equal(blockLease(h, 2), 1999);                                        // no sales → completion year
  assert.equal(tieredComps(x.hdb, { bid: 99, ft: 3 }), null);
  assert.equal(tieredComps(x.hdb, { bid: 0, ft: -1 }), null);
});
