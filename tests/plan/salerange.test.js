// Plan → Sell then buy "Similar recent sales" (PA-06): block search, saved-block check, typical size, the
// P25–P75 range (S$, rounded) from the same tiered comparables as Explore, and the line it renders.
// Sev-1: the range only suggests; the "Use median" button carries the median, nothing is written on render.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normQuery, searchBlocks, blockName, resolveBlock, typicalSqm, saleRange, scopeText, rangeHtml, rangeFor, ROUND_TO } from '../../app/modules/plan/salerange.js';
import { SQFT_PER_SQM } from '../../app/core/comps.js';
import { quantile } from '../../app/engine/fairvalue.js';

function hdb() {
  const blocks = [
    { b: '101', s: 0, t: 0, lat: 1.35, lon: 103.8, lease: 1990 },   // 0 subject
    { b: '103', s: 0, t: 0, lat: 1.3509, lon: 103.8, lease: 1991 }, // 1 within 400 m, similar lease
    { b: '12A', s: 1, t: 0, lat: 1.377, lon: 103.8, lease: 2015 },  // 2 far, new lease
    { b: '5', s: 2, t: 1, lat: 1.44, lon: 103.7, lease: 1985 },     // 3 other town
  ];
  const tx = { b: [], m: [], ft: [], ly: [], p: [], a: [], s: [] };
  const add = (b, m, ft, p, a = 90) => { tx.b.push(b); tx.m.push(m); tx.ft.push(ft); tx.ly.push(blocks[b].lease); tx.p.push(p); tx.a.push(a); tx.s.push(0); };
  return { months: Array.from({ length: 36 }, (_, i) => `2023-${i}`), towns: ['BISHAN', 'YISHUN'], streets: ['BISHAN ST 12', 'BISHAN NTH AVE 3', 'YISHUN RING RD'] /* data.js spelling */, flat_types: ['3 ROOM', '4 ROOM'], blocks, tx, add };
}

test('block search: Explore normalisation, numbers match exactly, street-first order', () => {
  const h = hdb();
  assert.equal(normQuery('Blk 101 Bishan Street 12'), '101 BISHAN ST 12');
  assert.deepEqual(searchBlocks(h, 'bishan st 12'), [0, 1]);
  assert.deepEqual(searchBlocks(h, '101 bishan'), [0]);
  assert.deepEqual(searchBlocks(h, 'bishan nth'), [2]);
  assert.deepEqual(searchBlocks(h, '10'), []);                  // numbers are whole words
  assert.deepEqual(searchBlocks(h, 'b'), []);                   // too short
  assert.deepEqual(searchBlocks(null, 'bishan'), []);
  assert.equal(blockName(h, 2), '12A Bishan Nth Ave 3');
  assert.deepEqual(searchBlocks(h, 'Bishan North Avenue'), [2]); // typed in full → abbreviated like the data
});

test('saved block: kept only while it names the same block in this data.js', () => {
  const h = hdb();
  assert.equal(resolveBlock(h, { bid: 1, label: '103 Bishan St 12' }), 1);
  assert.equal(resolveBlock(h, { bid: 1, label: '101 Bishan St 12' }), null);  // data.js rebuilt, index moved
  assert.equal(resolveBlock(h, null), null);
  assert.equal(resolveBlock(h, { bid: 9, label: 'x' }), null);
});

test('saleRange: P25–P75 of the comparables × your sqft, rounded to S$1,000; median for the button', () => {
  const h = hdb();
  const prices = [500000, 520000, 540000, 560000, 580000, 600000];
  prices.forEach((p) => h.add(0, 30, 1, p, 90));               // this block, 4-room, last 12 m, 90 sqm
  h.add(0, 30, 0, 300000, 70);                                 // 3-room: other type
  const r = saleRange(h, { bid: 0, flatType: '4 ROOM', sqm: 100 });
  const psf = prices.map((p) => p / (90 * SQFT_PER_SQM)).sort((a, b) => a - b), sqft = 100 * SQFT_PER_SQM;
  const round = (v) => Math.round(v / ROUND_TO) * ROUND_TO;
  assert.deepEqual([r.n, r.enough, r.tier, r.months, r.sqm, r.sqmTypical], [6, true, 1, 12, 100, false]);
  assert.equal(r.low, round(quantile(psf, 25) * sqft));
  assert.equal(r.mid, round(quantile(psf, 50) * sqft));
  assert.equal(r.high, round(quantile(psf, 75) * sqft));
  assert.deepEqual([r.low, r.mid, r.high], [583000, 611000, 639000]);  // 90 → 100 sqm scales the 90 sqm prices
  // no size typed → the block's typical size for the type (here 90 sqm → the sale prices themselves)
  const t = saleRange(h, { bid: 0, flatType: '4 ROOM' });
  assert.deepEqual([t.sqm, t.sqmTypical, t.low, t.mid, t.high], [90, true, 525000, 550000, 575000]);
  assert.equal(typicalSqm(h, 0, 1), 90);
  assert.equal(typicalSqm(h, 0, 0), 70);
});

test('saleRange: thin block widens like Explore (nearby similar lease); too few anywhere → no range', () => {
  const h = hdb();
  h.add(0, 30, 1, 500000); h.add(0, 30, 1, 510000);             // 2 own sales
  for (let k = 0; k < 6; k++) h.add(1, 31, 1, 600000 + k * 1000); // nearby, similar lease
  for (let k = 0; k < 6; k++) h.add(3, 31, 1, 900000);            // other town: never used
  const r = saleRange(h, { bid: 0, flatType: '4 ROOM', sqm: 90 });
  assert.deepEqual([r.tier, r.n, r.enough], [3, 6, true]);
  assert.equal(scopeText(r), 'nearby blocks, similar lease, last 12 m');
  const thin = hdb(); thin.add(0, 30, 1, 500000);
  const x = saleRange(thin, { bid: 0, flatType: '4 ROOM', sqm: 90 });
  assert.deepEqual([x.enough, x.n, x.low, x.mid], [false, 1, null, null]);
  assert.equal(saleRange(thin, { bid: 9, flatType: '4 ROOM' }), null);
  assert.equal(saleRange(thin, { bid: 0, flatType: 'EXECUTIVE' }), null);
  assert.equal(scopeText({ tier: 6, town: 'BISHAN' }), 'Bishan overall, last 12 m');
});

test('rangeHtml: hint until a block is picked; range + n + scope; button carries the median only', () => {
  assert.match(rangeHtml(undefined, false), /Pick your current block above/);
  assert.match(rangeHtml(null, true), /No sales of this flat type found/);
  assert.match(rangeHtml({ enough: false, n: 3 }, true), /Only 3 similar sales recently — too few for a range \(at least 5 needed\)/);
  assert.match(rangeHtml({ enough: false, n: 0 }, true), /No similar sales in the last 24 months/);
  const html = rangeHtml({ enough: true, n: 14, low: 585000, mid: 611000, high: 1036000, tier: 1, months: 12, sqm: 92, sqmTypical: true, town: 'BISHAN' }, true);
  assert.match(html, /Similar recent sales: S\$585k–S\$1,036k \(middle half, n=14\) · this block, last 12 m · for 92 sqm, typical for this block/);
  assert.match(html, /<button type="button" class="link" id="sbMedian" data-sb-median="611000">Use median \(S\$611,000\)<\/button>/);
  assert.match(html, /not a valuation/);
  assert.equal((html.match(/<button/g) || []).length, 1);
});

test('rangeFor: nothing without data or for a private home (no globals needed)', () => {
  assert.equal(rangeFor({ propertyType: 'hdb', flatType: '4 ROOM' }), '');  // HDB_DATA not loaded in node
  assert.equal(rangeFor({ propertyType: 'private' }), '');
});
