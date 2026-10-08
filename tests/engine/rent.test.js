// Rent comps fallback tiers, "Is this rent fair?" verdict edges, monotonicity, yield helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policy, close } from '../helpers.js';
import { rentComps, fairRent, grossYield, rentToIncome, RENT_FIELDS, areaRentComps } from '../../app/engine/rent.js';

const MIN_N = policy.get('rent.comps.min_n');
const MARGIN = policy.get('rent.verdict.well_above_margin');
const HW = policy.get('rent.fair.median_only_halfwidth');
const ORDER = ['below', 'fair', 'above', 'well-above'];

const block = {
  '4 ROOM': [6, 3200, 3400, 3600, '2026-09'],                                  // 12-month stats
  '3 ROOM': [1, null, 2800, null, '2026-02', 4, 2600, 2750, 2900],             // 24-month fallback
  '5 ROOM': [0, null, null, null, '2025-01', 1, null, 3900, null],             // too thin -> town
};
const town = {
  '4 ROOM': { q: [3000, null, 3300], n: 400, p25: 3100, med: 3300, p75: 3500 },
  '5 ROOM': { q: [3600, 3700, null], n: 120, p25: 3500, med: 3800, p75: 4100 },
  '2 ROOM': { q: [1800, 2000, null] },                                        // series only
  'EXECUTIVE': { q: [null, null] },
};

test('policy entries for rent are ASSUMPTIONs with values', () => {
  for (const id of ['rent.comps.min_n', 'rent.fair.band_percentiles', 'rent.verdict.well_above_margin', 'rent.fair.median_only_halfwidth']) {
    assert.equal(policy.meta(id).status, 'ASSUMPTION', id);
    assert.ok(policy.get(id) != null, id);
  }
  assert.equal(RENT_FIELDS.length, 9);
});

test('rentComps: block 12 months when n >= min_n', () => {
  const c = rentComps(block, '4 ROOM', policy, town);
  assert.equal(c.tier, 'block12');
  assert.deepEqual([c.n, c.p25, c.med, c.p75, c.months, c.last], [6, 3200, 3400, 3600, 12, '2026-09']);
});

test('rentComps: falls back to 24 months, then town, then the town median series', () => {
  const c24 = rentComps(block, '3 ROOM', policy, town);
  assert.equal(c24.tier, 'block24');
  assert.deepEqual([c24.n, c24.p25, c24.med, c24.p75, c24.months], [4, 2600, 2750, 2900, 24]);

  const ct = rentComps(block, '5 ROOM', policy, town);
  assert.equal(ct.tier, 'town');
  assert.equal(ct.source, 'transactions');
  assert.equal(ct.med, 3800);

  const cs = rentComps(undefined, '2 ROOM', policy, town);
  assert.equal(cs.tier, 'town');
  assert.equal(cs.source, 'median-series');
  assert.equal(cs.med, 2000);
  assert.equal(cs.quarterIndex, 1);
  assert.equal(cs.p25, null);
});

test('rentComps: nothing usable -> null', () => {
  assert.equal(rentComps(undefined, '4 ROOM', policy), null);
  assert.equal(rentComps({}, '4 ROOM', policy, {}), null);
  assert.equal(rentComps(null, 'EXECUTIVE', policy, town), null);
  assert.equal(rentComps({ '4 ROOM': [MIN_N - 1, null, 3000, null, '2026-01'] }, '4 ROOM', policy), null);
});

test('rentComps: accepts the object form of a block entry', () => {
  const c = rentComps({ '4 ROOM': { n: 5, p25: 3000, med: 3100, p75: 3300, last: '2026-08' } }, '4 ROOM', policy);
  assert.equal(c.tier, 'block12');
  assert.equal(c.p75, 3300);
});

test('fairRent: verdict edges on the interquartile band', () => {
  const comps = rentComps(block, '4 ROOM', policy, town);
  const v = (asking) => fairRent({ asking, comps }, policy);
  const r = v(3400);
  assert.deepEqual(r.band, [3200, 3600]);
  assert.equal(r.wellAbove, Math.round(3600 * (1 + MARGIN)));
  assert.equal(r.verdict, 'fair');
  assert.equal(r.position, 100 / 2);
  assert.ok(close(r.ratio, 1));
  assert.equal(v(3199).verdict, 'below');
  assert.equal(v(3200).verdict, 'fair');
  assert.equal(v(3600).verdict, 'fair');
  assert.equal(v(3601).verdict, 'above');
  assert.equal(v(r.wellAbove).verdict, 'above');
  assert.equal(v(r.wellAbove + 1).verdict, 'well-above');
  assert.equal(v(3200).position, 100 / 2 / 2);
  assert.equal(v(3600).position, 100 - 100 / 2 / 2);
  assert.equal(v(1).position, 0);
  assert.equal(v(99999).position, 100);
  assert.match(r.basis.label, /6 rentals .* block, last 12 months/);
});

test('fairRent: median-only comps use the halfwidth band and no position', () => {
  const comps = rentComps(undefined, '2 ROOM', policy, town);
  const r = fairRent({ asking: 2000, comps }, policy);
  assert.deepEqual(r.band, [Math.round(2000 * (1 - HW)), Math.round(2000 * (1 + HW))]);
  assert.equal(r.verdict, 'fair');
  assert.equal(r.position, null);
  assert.match(r.basis.label, /quarterly median/);
});

test('fairRent: unknown on missing comps or bad asking, never NaN', () => {
  const comps = rentComps(block, '4 ROOM', policy, town);
  for (const [asking, c] of [[3000, null], [3000, undefined], [NaN, comps], [0, comps], [-5, comps], [undefined, comps], ['3000', comps], [Infinity, comps]]) {
    const r = fairRent({ asking, comps: c }, policy);
    assert.equal(r.verdict, 'unknown', `${asking}`);
    assert.equal(r.position, null);
    assert.equal(r.ratio, null);
    for (const x of [r.wellAbove, ...(r.band || [])]) assert.ok(x === null || Number.isFinite(x));
  }
  const flat = { tier: 'block12', n: 4, p25: 3000, med: 3000, p75: 3000, months: 12, source: 'transactions' };
  for (const asking of [2999, 3000, 3001]) {
    const r = fairRent({ asking, comps: flat }, policy);
    assert.ok(Number.isFinite(r.position) && Number.isFinite(r.ratio), `flat comps ${asking}`);
  }
});

test('fairRent: a higher asking rent never improves the verdict or position', () => {
  const sets = [
    rentComps(block, '4 ROOM', policy, town),
    rentComps(block, '3 ROOM', policy, town),
    rentComps(undefined, '2 ROOM', policy, town),
    { tier: 'block12', n: 3, p25: 3000, med: 3000, p75: 3500, months: 12, source: 'transactions' },
    { tier: 'block12', n: 3, p25: 2500, med: 3000, p75: 3000, months: 12, source: 'transactions' },
  ];
  for (const comps of sets) {
    let prevV = -1, prevP = -1;
    for (let asking = 1000; asking <= 6000; asking += 25) {
      const r = fairRent({ asking, comps }, policy);
      const vi = ORDER.indexOf(r.verdict);
      assert.ok(vi >= prevV, `${comps.tier} ${asking}: ${r.verdict}`);
      if (r.position != null) { assert.ok(r.position >= prevP, `${asking} position`); prevP = r.position; }
      prevV = vi;
    }
    assert.equal(ORDER[prevV], 'well-above');
  }
});

test('grossYield and rentToIncome', () => {
  assert.ok(close(grossYield({ annualRent: 3000 * 12, price: 600000 }), 0.06, 1e-9));
  assert.equal(grossYield({ annualRent: 36000, price: 0 }), null);
  assert.equal(grossYield({ annualRent: undefined, price: 600000 }), null);
  assert.ok(close(rentToIncome({ rent: 3000, income: 10000 }), 0.3, 1e-9));
  assert.equal(rentToIncome({ rent: 3000, income: 0 }), null);
  assert.equal(rentToIncome({ rent: NaN, income: 8000 }), null);
});

test('areaRentComps: n-weighted block figures (12 months, else 24), quartiles only from complete rows', () => {
  const rows = [
    { '4 ROOM': [4, 3000, 3200, 3400, '2026-09'] },
    { '4 ROOM': [0, null, null, null, '2025-01', 2, 2800, 3000, 3100] },   // 24-month figures
    { '4 ROOM': [2, null, 3500, null, '2026-08'] },                         // median only: no quartiles
    { '3 ROOM': [9, 2000, 2200, 2400, '2026-09'] },                         // other flat type: ignored
    null,
  ];
  const c = areaRentComps(rows, '4 ROOM', policy);
  assert.equal(c.tier, 'area');
  assert.equal(c.n, 8);
  assert.equal(c.blocks, 3);
  assert.ok(close(c.med, (3200 * 4 + 3000 * 2 + 3500 * 2) / 8, 1e-9));
  assert.ok(close(c.p25, (3000 * 4 + 2800 * 2) / 6, 1e-9));
  assert.ok(close(c.p75, (3400 * 4 + 3100 * 2) / 6, 1e-9));
  assert.equal(c.months, 24);                                              // one block needed the 24-month figures
  assert.equal(areaRentComps(rows.slice(0, 1), '4 ROOM', policy).months, 12);
  const f = fairRent({ asking: 3300, comps: c }, policy);                  // fairRent accepts it unchanged
  assert.match(f.basis.label, /^8 rentals in this area, last 12–24 months \(average of block figures\)$/);
  assert.ok(['below', 'fair', 'above', 'well-above'].includes(f.verdict));
});

test('areaRentComps: fewer than rent.comps.min_n rentals in total → null; out-of-order quartiles dropped', () => {
  const thin = [{ '4 ROOM': [MIN_N - 1, 3000, 3200, 3400, '2026-09'] }];
  assert.equal(areaRentComps(thin, '4 ROOM', policy), null);
  assert.equal(areaRentComps([], '4 ROOM', policy), null);
  assert.equal(areaRentComps(null, '4 ROOM', policy), null);
  const odd = [{ '4 ROOM': [MIN_N, 3000, 3200, 3400, 'x'] }, { '4 ROOM': [MIN_N * 9, null, 5000, null, 'x'] }];
  const c = areaRentComps(odd, '4 ROOM', policy);                           // med pulled above the only p75
  assert.equal(c.p25, null);
  assert.equal(c.p75, null);
  assert.equal(fairRent({ asking: c.med, comps: c }, policy).position, null);
});
