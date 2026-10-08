// Zoomed-out hex grid (app/modules/explore/hexgrid.js): axial binning, geometry, per-metric aggregation,
// colour = the dots' scale, tooltip text, legend hint. Display only — no number shown at zoom ≥ 14 changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMP, quantileScale, dotOptions, dotStyle, COLOR } from '../../app/modules/explore/blocks.js';
import { commuteScale } from '../../app/modules/explore/commute.js';
import { distanceKm } from '../../app/core/geo.js';
import { t } from '../../app/core/i18n.js';
import { HEX_M, HEX_ZOOM_MAX, HEX_CLICK_ZOOM, SG_CENTRE, hexSize, project, unproject, hexOf, hexKey, hexCentre, hexCorners, metres, median, binPoints, aggregateHexes, hexFill, hexTipParts, hexTipText, hexHint } from '../../app/modules/explore/hexgrid.js';

const NEIGHBOURS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const at = (q, r) => hexCentre(q, r);
// a block point: kind 'sale' with matching transactions, or grey
const sale = (q, r, prices, extra = {}) => ({ ...at(q, r), kind: 'sale', a: { n: prices.length, prices, psfs: prices.map((p) => p / 1000), price: median(prices) }, ...extra });
const grey = (q, r, kind = 'none') => ({ ...at(q, r), kind, a: null, v: null });

test('constants: ~500 m hexes up to zoom 13, click zooms to 15', () => {
  assert.equal(HEX_M, 500);
  assert.equal(HEX_ZOOM_MAX, 13);
  assert.equal(HEX_CLICK_ZOOM, 15);
});

test('projection round-trips around the Singapore centre', () => {
  assert.deepEqual(project(SG_CENTRE.lat, SG_CENTRE.lon), { x: 0, y: 0 });
  for (const [lat, lon] of [[1.29, 103.85], [1.44, 103.78], [1.35, 103.95]]) {
    const p = project(lat, lon), b = unproject(p.x, p.y);
    assert.ok(Math.abs(b.lat - lat) < 1e-12 && Math.abs(b.lon - lon) < 1e-12);
  }
});

test('neighbouring hex centres are HEX_M apart (local metres and great-circle within 0.5 %)', () => {
  for (const [q0, r0] of [[0, 0], [12, -7], [-20, 15]]) {
    for (const [dq, dr] of NEIGHBOURS) {
      const a = at(q0, r0), b = at(q0 + dq, r0 + dr);
      assert.ok(Math.abs(metres(a, b) - HEX_M) < 1e-6, `${q0},${r0} → ${dq},${dr}`);
      assert.ok(Math.abs(distanceKm(a, b) * 1000 - HEX_M) / HEX_M < 0.005);
    }
  }
});

test('hex geometry: pointy-top, corners at the centre-to-corner radius, flat-to-flat = HEX_M', () => {
  const c = at(3, -2), cs = hexCorners(3, -2);
  assert.equal(cs.length, 6);
  for (const [lat, lon] of cs) assert.ok(Math.abs(metres(c, { lat, lon }) - hexSize()) < 1e-6);
  const top = cs.reduce((m, p) => (p[0] > m[0] ? p : m));
  assert.ok(Math.abs(top[1] - c.lon) < 1e-12, 'one corner straight north of the centre (pointy-top)');
  const pc = project(c.lat, c.lon), right = cs.map(([la, lo]) => project(la, lo).x - pc.x).filter((x) => x > 1);
  assert.ok(right.every((x) => Math.abs(x - HEX_M / 2) < 1e-6), 'vertical right edge half a width from the centre');
});

test('binning is deterministic: centres and near-centre points map to their own hex; input order does not matter', () => {
  for (let q = -30; q <= 30; q += 7) for (let r = -25; r <= 25; r += 6) {
    const c = at(q, r);
    assert.deepEqual(hexOf(c.lat, c.lon), { q, r });
    const p = project(c.lat, c.lon), off = unproject(p.x + 0.4 * hexSize(), p.y - 0.4 * hexSize());
    assert.deepEqual(hexOf(off.lat, off.lon), { q, r });
  }
  assert.equal(Object.is(hexOf(SG_CENTRE.lat, SG_CENTRE.lon).q, -0), false, 'no -0 keys');
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push({ lat: 1.28 + ((i * 7919) % 1000) / 6000, lon: 103.65 + ((i * 104729) % 1000) / 3300, kind: 'sale', a: { n: 1, prices: [400000 + i], psfs: [500], price: 400000 + i } });
  const a = aggregateHexes(pts, 'price'), b = aggregateHexes(pts.slice().reverse(), 'price'), c = aggregateHexes(pts, 'price');
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [k, h] of a) { assert.equal(h.value, b.get(k).value); assert.equal(h.sales, b.get(k).sales); assert.deepEqual(h, c.get(k)); }
  assert.equal([...a.values()].reduce((s, h) => s + h.sales, 0), 400);
  // every point lies within the corner radius of its hex centre
  for (const p of pts) { const { q, r } = hexOf(p.lat, p.lon); assert.ok(metres(p, at(q, r)) <= hexSize() + 1e-6); assert.ok(a.has(hexKey(q, r))); }
});

test('binPoints skips holes and points without coordinates', () => {
  const pts = [grey(0, 0), , null, { lat: NaN, lon: 103.8, kind: 'none' }, grey(0, 0, 'new'), grey(1, 0)]; // eslint-disable-line no-sparse-arrays
  const bins = binPoints(pts);
  assert.equal(bins.size, 2);
  assert.equal(bins.get(hexKey(0, 0)).points.length, 2);
});

test('price / $psf: median over the matching TRANSACTIONS of the hex, not the median of block medians', () => {
  const pts = [sale(2, 2, [400000, 410000, 420000]), sale(2, 2, [600000]), grey(2, 2)];
  const h = aggregateHexes(pts, 'price').get(hexKey(2, 2));
  assert.equal(h.value, 415000); // transactions 400k 410k 420k 600k → 415k (block medians 410k / 600k would give 505k)
  assert.notEqual(h.value, median([410000, 600000]));
  assert.equal(h.sales, 4);
  assert.equal(h.blocks, 2);
  assert.equal(h.total, 3);
  assert.equal(aggregateHexes(pts, 'psf').get(hexKey(2, 2)).value, 415);
  assert.equal(aggregateHexes(pts, 'budget').get(hexKey(2, 2)).value, 415000);
});

test('count: shade = median sales per block (dots scale), total in the tooltip; rent / commute: median of block values', () => {
  const pts = [sale(0, 0, [1, 2, 3], { v: 2800 }), sale(0, 0, [1], { v: 3100 }), sale(0, 0, [1, 2], { v: 2500 })];
  const c = aggregateHexes(pts, 'count').get(hexKey(0, 0));
  assert.equal(c.value, 2);
  assert.equal(c.sales, 6);
  assert.equal(aggregateHexes(pts, 'rent').get(hexKey(0, 0)).value, 2800);
  const m = [sale(0, 0, [1], { v: 35 }), sale(0, 0, [1], { v: 50 })];
  assert.equal(aggregateHexes(m, 'commute').get(hexKey(0, 0)).value, 42.5);
});

test('budget: within count uses the block medians, like the green dots', () => {
  const pts = [sale(0, 0, [500000]), sale(0, 0, [560000, 580000]), sale(0, 0, [700000])];
  // block medians 500k / 570k / 700k; hex median over transactions = (560k + 580k) / 2 = 570k
  const h = aggregateHexes(pts, 'budget', { budgetMax: 569999 }).get(hexKey(0, 0));
  assert.equal(h.within, 1);
  assert.equal(h.value, 570000);
  assert.equal(aggregateHexes(pts, 'budget', { budgetMax: 570000 }).get(hexKey(0, 0)).within, 2); // ≤ budget counts, like the dots
  assert.equal(aggregateHexes(pts, 'price', { budgetMax: 570000 }).get(hexKey(0, 0)).within, null);
});

test('empty hex: only grey / new blocks → no value, no fill, "no sales" tooltip', () => {
  const h = aggregateHexes([grey(5, 5), grey(5, 5, 'new')], 'price').get(hexKey(5, 5));
  assert.equal(h.value, null);
  assert.equal(h.sales, 0);
  assert.equal(h.blocks, 0);
  assert.equal(h.total, 2);
  assert.equal(hexFill(h.value, { mode: 'price', scale: quantileScale([1, 2, 3]) }), null);
  assert.equal(hexTipText(h, 'price', t), 'No sales match your filters · 2 blocks');
});

test('hexFill: the same scale / bins as the dots; budget uses the dots within / near / over rule', () => {
  const scale = quantileScale([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  for (const v of [100, 350, 640, 1000]) assert.equal(hexFill(v, { mode: 'price', scale }), scale.color(v));
  assert.ok(RAMP.includes(hexFill(450, { mode: 'psf', scale })));
  assert.equal(hexFill(35, { mode: 'commute', scale: commuteScale() }), RAMP[2]);
  const budget = { max: 500000, stretch: 0.1, colors: { within: 'g', near: 'y', over: 'o' } };
  assert.deepEqual([500000, 540000, 560000].map((v) => hexFill(v, { mode: 'budget', budget })), ['g', 'y', 'o']);
  assert.equal(hexFill(null, { mode: 'price', scale }), null);
  assert.equal(hexFill(400000, { mode: 'budget', budget: { max: null } }), null);
});

test('tooltip text per metric', () => {
  const h = { value: 612400, sales: 48, blocks: 23, total: 25, within: null };
  assert.equal(hexTipText(h, 'price', t), 'Median S$612k · 48 sales · 23 blocks');
  assert.equal(hexTipText({ ...h, within: 14 }, 'budget', t), 'Median S$612k · 48 sales · 23 blocks · 14 of 23 blocks within budget');
  assert.equal(hexTipText({ ...h, value: 540.4 }, 'psf', t), 'Median S$540 psf · 48 sales · 23 blocks');
  assert.equal(hexTipText({ ...h, value: 2 }, 'count', t), '48 sales · 23 blocks · median 2 per block');
  assert.equal(hexTipText({ ...h, value: 2.5 }, 'count', t), '48 sales · 23 blocks · median 2.5 per block');
  assert.equal(hexTipText({ ...h, value: 2850 }, 'rent', t), 'Median rent S$2,850 · 23 blocks');
  assert.equal(hexTipText({ ...h, value: 42.5 }, 'commute', t), 'Median ~43 min · 23 blocks');
  assert.equal(hexTipText({ value: 400000, sales: 1, blocks: 1, total: 1 }, 'price', t), 'Median S$400k · 1 sale · 1 block');
  assert.equal(hexTipText({ ...h, sales: 1234 }, 'price', t), 'Median S$612k · 1,234 sales · 23 blocks');
  assert.deepEqual(hexTipParts(h, 'price', t)[0], 'Median S$612k');
});

test('legend hint only at hex zoom', () => {
  assert.equal(hexHint(13, t), '<div class="hint">Zoomed out: each hexagon ≈ 500 m, shaded by the median of the blocks inside. Zoom in for blocks.</div>');
  assert.equal(hexHint(11, t).includes('hexagon'), true);
  assert.equal(hexHint(14, t), '');
});

test('dotOptions (moved from legacy.js to blocks.js) keeps the dot styles', () => {
  const r = { id: 'canvas' };
  for (const z of [12, 14, 16]) {
    const s = dotStyle(z, 'sale');
    assert.deepEqual(dotOptions('sale', '#123456', z, r), { renderer: r, radius: s.radius, color: '#fff', weight: s.weight, fillColor: '#123456', fillOpacity: s.fillOpacity });
    const n = dotStyle(z, 'new');
    assert.deepEqual(dotOptions('new', null, z, r), { renderer: r, radius: n.radius, color: COLOR.newRing, weight: n.weight, fillColor: '#fff', fillOpacity: n.fillOpacity });
    const g = dotStyle(z, 'none');
    assert.deepEqual(dotOptions('none', null, z, r), { renderer: r, radius: g.radius, stroke: false, fillColor: COLOR.noSales, fillOpacity: g.fillOpacity });
  }
});
