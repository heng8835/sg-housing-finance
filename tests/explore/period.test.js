import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALC_OPTIONS, calcLabel, nearestCalc, yearsOf, histDefault, clampHist, histRange, histText, windowHelp, quickHist, windowFor } from '../../app/modules/explore/period.js';
import { areaPayload, selectionPayload, centroid } from '../../app/modules/explore/selection.js';

const months = []; for (let y = 2017; y <= 2026; y++) for (let m = 1; m <= 12; m++) if (y < 2026 || m <= 9) months.push(`${y}-${String(m).padStart(2, '0')}`);
const fmtMonth = (i) => { const [y, m] = months[i].split('-'); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`; };

test('calculation window options and labels', () => {
  assert.deepEqual(CALC_OPTIONS, [12, 24, 36, 60]);
  assert.deepEqual(CALC_OPTIONS.map(calcLabel), ['1 year', '2 years', '3 years', '5 years']);
  assert.deepEqual([1, 12, 18, 20, 30, 40, 48, 117].map(nearestCalc), [12, 12, 12, 24, 24, 36, 36, 60]);
});

test('slider years: default last 10, clamp to the data, range in month indices', () => {
  assert.deepEqual(yearsOf(months), { first: 2017, last: 2026 });
  assert.deepEqual(histDefault(months), { from: 2017, to: 2026 });
  assert.deepEqual(histDefault(months.slice(0, 30)), { from: 2017, to: 2019 }); // clamped to the first year
  assert.deepEqual(clampHist({ from: 2021, to: 2019 }, months), { from: 2019, to: 2019 });  // handles never cross
  assert.deepEqual(clampHist({ from: 1990, to: 2040 }, months), { from: 2017, to: 2026 });
  assert.deepEqual(clampHist(null, months), { from: 2017, to: 2026 });
  assert.deepEqual(histRange(months, { from: 2017, to: 2026 }), { from: 0, to: 116 });
  const r = histRange(months, { from: 2020, to: 2021 });
  assert.deepEqual([months[r.from], months[r.to]], ['2020-01', '2021-12']);
});

test('labels: partial last year, window help, quick chips', () => {
  assert.equal(histText({ from: 2017, to: 2026 }, 2026, 'Jan–Sep'), '2017 – 2026 (Jan–Sep)');
  assert.equal(histText({ from: 2017, to: 2025 }, 2026, 'Jan–Sep'), '2017 – 2025');
  assert.equal(histText({ from: 2022, to: 2022 }, 2026, 'Jan–Sep'), '2022');
  assert.equal(windowHelp(windowFor({ months, calcM: 12, hist: { from: 2017, to: 2026 } }), fmtMonth), 'Oct 2025 – Sep 2026 · used for colours, medians and $psf');
  assert.equal(windowHelp(windowFor({ months, calcM: 60, hist: { from: 2024, to: 2026 } }), fmtMonth), 'Jan 2024 – Sep 2026 · used for colours, medians and $psf Shortened to your sales-history range.');
  assert.deepEqual(quickHist('5', months), { from: 2022, to: 2026 });
  assert.deepEqual(quickHist('10', months), { from: 2017, to: 2026 });
  assert.deepEqual(quickHist('all', months), { from: 2017, to: 2026 });
});

// explore:area / explore:selection payloads (spec §2.3 / §10)
const D = {
  flat_types: ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'], towns: ['ANG MO KIO', 'BEDOK', 'BISHAN'], months,
  blocks: [{ t: 0, lat: 1.370, lon: 103.850 }, { t: 0, lat: 1.371, lon: 103.851 }, { t: 2, lat: 1.372, lon: 103.849 }, { t: 1, lat: 1.330, lon: 103.930 }, { t: 0, lat: 1.369, lon: 103.848 }],
};
const near = (b) => Math.abs(b.lat - 1.37) < 0.005 && Math.abs(b.lon - 103.85) < 0.005;

test('areaPayload: every block inside (no filters), majority town, centre', () => {
  const a = areaPayload({ area: { type: 'circle', lat: 1.37, lon: 103.85, r: 800 }, blocks: D.blocks, towns: D.towns, pred: near, label: '800 m circle' });
  assert.deepEqual(a, { kind: 'circle', label: '800 m circle', blockIds: [0, 1, 2, 4], town: 'ANG MO KIO', centre: { lat: 1.37, lon: 103.85 }, n: 4 });
  const split = areaPayload({ area: { type: 'poly', pts: [[1, 2], [3, 4], [5, 0]] }, blocks: D.blocks, towns: D.towns, pred: (b) => b.t !== 0, label: 'drawn area (1.20 km²)' });
  assert.equal(split.kind, 'poly');
  assert.deepEqual(split.blockIds, [2, 3]);
  assert.equal(split.town, 'BISHAN');   // 50 % counts as holding the area (first such town)
  assert.deepEqual(split.centre, centroid([[1, 2], [3, 4], [5, 0]]));
  assert.deepEqual(centroid([[1, 2], [3, 4], [5, 0]]), { lat: 3, lon: 2 });
  assert.equal(areaPayload({ area: { type: 'poly', pts: [[1, 1]] }, blocks: D.blocks, towns: D.towns, pred: (b) => b.t === 9, label: 'x' }).town, null);
  assert.equal(areaPayload({ area: null, blocks: D.blocks, towns: D.towns, pred: near, label: '' }), null);
});

test('selectionPayload: flat types, towns (null = all), area, window, history — no personal data', () => {
  const S = { ft: [4, 3], towns: [0, 1, 2], mFrom: 105, mTo: 116, hist: { from: 2017, to: 2026 }, profile: { income: 9000 } };
  const p = selectionPayload({ S, D, area: null });
  assert.deepEqual(p, { flatTypes: ['4 ROOM', '5 ROOM'], allTypes: false, towns: null, area: null, window: { from: '2025-10', to: '2026-09', months: 12 }, history: { from: 2017, to: 2026 } });
  assert.doesNotMatch(JSON.stringify(p), /9000|income/);
  const q = selectionPayload({ S: { ...S, ft: [0, 1, 2, 3, 4, 5, 6], towns: [2, 0] }, D, area: { kind: 'circle', n: 1 } });
  assert.equal(q.allTypes, true);
  assert.deepEqual(q.towns, ['ANG MO KIO', 'BISHAN']);
  assert.deepEqual(q.area, { kind: 'circle', n: 1 });
});
