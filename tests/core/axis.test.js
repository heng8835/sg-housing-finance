import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, sgdShort, quarterTicks, parseQuarter } from '../../app/core/axis.js';

test('niceTicks: steps from {1, 2, 2.5, 5}×10ⁿ, at most n ticks, cover the data', () => {
  assert.deepEqual(niceTicks(0, 812345, 5).ticks, [0, 250000, 500000, 750000, 1000000]);
  assert.deepEqual(niceTicks(-50000, 300000, 5).ticks, [-100000, 0, 100000, 200000, 300000]);
  for (const [lo, hi] of [[0, 1], [0, 37], [-1234, 98765], [0, 4.2e6], [-3e5, -1e4], [12, 12], [431000, 655000]]) {
    for (const n of [4, 5]) {
      const r = niceTicks(lo, hi, n);
      assert.ok(r.ticks.length >= 2 && r.ticks.length <= n, `${lo}..${hi}: ${r.ticks}`);
      assert.ok(r.lo <= Math.min(lo, hi) && r.hi >= Math.max(lo, hi), `${lo}..${hi} covered`);
      const m = r.step / 10 ** Math.floor(Math.log10(r.step));
      assert.ok([1, 2, 2.5, 5].some((s) => Math.abs(s - m) < 1e-9), `nice step ${r.step}`);
    }
  }
});

test('sgdShort: S$0, S$250k, S$1.2m, −S$50k', () => {
  assert.equal(sgdShort(0), 'S$0');
  assert.equal(sgdShort(250000), 'S$250k');
  assert.equal(sgdShort(12500), 'S$12.5k');
  assert.equal(sgdShort(1200000), 'S$1.2m');
  assert.equal(sgdShort(1000000), 'S$1m');
  assert.equal(sgdShort(-50000), '−S$50k');
  assert.equal(sgdShort(500), 'S$500');
  assert.equal(sgdShort(NaN), '—');
});


test('quarterTicks: Q1 of each year is a major tick, labels every 1/2/5/10 years by room, last quarter separate', () => {
  assert.deepEqual(parseQuarter('2019-Q3'), { year: 2019, q: 3 });
  assert.equal(parseQuarter('2019-3'), null);
  const wide = quarterTicks('2016-Q3', '2026-Q2', 600);                    // 40 quarters, 15.4 px each
  assert.equal(wide.count, 40);
  assert.equal(wide.step, 1);                                              // 61 px a year ≥ 34
  assert.deepEqual(wide.major.map((m) => m.year), [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.equal(wide.major[0].i, 2);                                        // 2017-Q1 is 2 quarters after 2016-Q3
  assert.equal(wide.minor.length, 40);
  assert.deepEqual(wide.end, { i: 39, year: 2026, q: 2 });
  assert.equal(wide.major.at(-1).label, false);                            // 2026-Q1 is 1 quarter from the end label
  const narrow = quarterTicks('2005-Q2', '2026-Q2', 260);                  // 85 quarters, ~3 px each
  assert.equal(narrow.minor.length, 0);                                    // quarter ticks only when ≥ 6 px apart
  assert.equal(narrow.step, 5);
  assert.ok(narrow.major.filter((m) => m.label).every((m) => m.year % 5 === 0));
  assert.equal(narrow.major.length, 21);                                   // 2006 … 2026, every Q1 still ticked
  assert.equal(quarterTicks('bad', '2026-Q2', 300), null);
  assert.equal(quarterTicks('2026-Q2', '2026-Q1', 300), null);
});
