// Block card market charts (PA-03 town vs RPI, PA-05 lease curve): pure helpers on synthetic data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_Q, RANGES, quarterOf, quarterSpan, qLabel, townQuarterly, rebase, alignIndex, leaseSlots,
  indexModel, indexSvg, indexTip, indexSummary, leaseModel, leaseSvg, leaseTip, dragText, createMarketCharts,
} from '../../app/modules/explore/marketcharts.js';
import { SQFT_PER_SQM } from '../../app/core/comps.js';

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function months(from, to) {
  const out = []; let [y, m] = from.split('-').map(Number);
  for (;;) { const s = `${y}-${String(m).padStart(2, '0')}`; out.push(s); if (s === to) return out; m += 1; if (m > 12) { m = 1; y += 1; } }
}
// town 0: block 0; town 1: block 1. ft 0 = 3-room, 1 = 4-room. 4-room psf grows 1 % a quarter; 3-room flat 300.
function data({ to = '2026-08', perMonth = 2 } = {}) {
  const ms = months('2016-01', to);
  const D = { months: ms, blocks: [{ t: 0 }, { t: 1 }], flat_types: ['3 ROOM', '4 ROOM'] };
  const TX = { b: [], m: [], ft: [], p: [] }, PSF = [];
  const add = (b, mi, ft, psf) => { TX.b.push(b); TX.m.push(mi); TX.ft.push(ft); TX.p.push(psf * 1000); PSF.push(psf); };
  ms.forEach((_, mi) => {
    const q = Math.floor(mi / 3);
    for (let k = 0; k < perMonth; k++) { add(0, mi, 1, 500 * 1.01 ** q); add(0, mi, 0, 300); add(1, mi, 1, 900); }
  });
  return { D, TX, PSF };
}
function rpiFor(first, last, start = 100, step = 0.5) {
  const quarters = quarterSpan(first, last);
  return { base: '2009-Q1', quarters, index: quarters.map((_, i) => start + step * i) };
}

test('quarters: month → quarter, spans, labels', () => {
  assert.deepEqual(['2024-01', '2024-03', '2024-04', '2024-12'].map(quarterOf), ['2024-Q1', '2024-Q1', '2024-Q2', '2024-Q4']);
  assert.deepEqual(quarterSpan('2023-Q3', '2024-Q2'), ['2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2']);
  assert.deepEqual(quarterSpan('bad', '2024-Q2'), []);
  assert.equal(qLabel('2026-Q2'), 'Q2 2026');
});

test('townQuarterly: median $psf per quarter for the town and types; thin quarters null; part quarter dropped', () => {
  const { D, TX, PSF } = data();
  const all = townQuarterly({ D, TX, PSF, town: 0 });
  assert.equal(all.quarters[0], '2016-Q1');
  assert.equal(all.quarters.at(-1), '2026-Q2');                  // data stop in Aug → Q3 2026 is partial, dropped
  assert.equal(all.n[0], 3 * 2 * 2);                             // 3 months × 2 per month × 2 types
  assert.ok(close(all.med[0], (300 + 500) / 2));                 // even count: mean of the two middle values
  const four = townQuarterly({ D, TX, PSF, town: 0, types: new Set([1]) });
  assert.ok(close(four.med[4], 500 * 1.01 ** 4));
  assert.equal(townQuarterly({ D, TX, PSF, town: 1, types: new Set([0]) }).quarters.length, 0); // no 3-room there
  const full = townQuarterly({ ...data({ to: '2026-09' }), town: 0 });
  assert.equal(full.quarters.at(-1), '2026-Q3');                 // quarter complete → kept
  const thin = townQuarterly({ ...data({ perMonth: 1 }), town: 0, types: new Set([1]) });
  assert.ok(thin.n.every((n) => n === 3) && thin.med.every((v) => v === null), `fewer than ${MIN_Q} sales → null`);
});

test('rebase + alignIndex: common window, both start at 100, range 5 y / 10 y / All', () => {
  assert.deepEqual(rebase([50, 75, null, 100], 0), [100, 150, null, 200]);
  assert.deepEqual(rebase([null, 2], 0), [null, null]);
  const { D, TX, PSF } = data();
  const tq = townQuarterly({ D, TX, PSF, town: 0, types: new Set([1]) });
  const rpi = rpiFor('2010-Q1', '2026-Q1');                      // RPI one quarter behind the town data
  const al = alignIndex(tq, rpi, '5');
  assert.equal(al.quarters.length, RANGES[0][1]);
  assert.equal(al.quarters.at(-1), '2026-Q1');                   // last quarter where both have a figure
  assert.equal(al.base, al.quarters[0]);
  assert.ok(close(al.town[0], 100) && close(al.rpi[0], 100));
  assert.ok(close(al.town.at(-1), 1.01 ** 19 * 100, 1e-6));       // 19 quarters of 1 % growth
  assert.ok(close(al.change.rpi, (rpi.index.at(-1) / rpi.index.at(-20) - 1) * 100, 1e-9));
  assert.equal(alignIndex(tq, rpi, '10').quarters.length, 40);
  const every = alignIndex(tq, rpi, 'all');
  assert.equal(every.quarters[0], '2016-Q1');                    // town data start (RPI starts earlier)
  assert.equal(alignIndex(tq, null), null);
  assert.equal(alignIndex({ quarters: [], med: [], n: [] }, rpi), null);
  assert.match(indexSummary(al, 'Bishan'), /^Since Q2 2021: Bishan \+21%, HDB Resale Price Index \+\d+%\.$/);
});

test('leaseSlots: most lease left first, gaps kept, $psf from $/m², this block now / in 10 y marked', () => {
  const curve = [{ from: 50, to: 60, n: 4, psm: 5000 }, { from: 60, to: 70, n: 20, psm: 5600 }, { from: 80, to: 90, n: 30, psm: 6500 }];
  const s = leaseSlots(curve, { now: 67.5, later: 57.5, minN: 5 });
  assert.deepEqual(s.map((x) => x.from), [80, 70, 60, 50]);
  assert.equal(s[1].psf, null);                                  // 70–80: no sales → gap
  assert.ok(close(s[0].psf, 6500 / SQFT_PER_SQM));
  assert.deepEqual(s.map((x) => [x.now, x.later, x.thin]), [[false, false, false], [false, false, true], [true, false, false], [false, true, true]]);
  assert.deepEqual(leaseSlots([], {}), []);
  assert.deepEqual(leaseSlots(curve, {}).map((x) => x.now || x.later), [false, false, false, false]);
});

test('index chart: geometry, markup, tooltip', () => {
  const { D, TX, PSF } = data();
  const al = alignIndex(townQuarterly({ D, TX, PSF, town: 0, types: new Set([1]) }), rpiFor('2010-Q1', '2026-Q1'), '10');
  const m = indexModel(al, { width: 320 });
  assert.equal(m.pts.length, 40);
  assert.ok(m.pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(m.yTicks[0].v <= 100 && m.yTicks.at(-1).v >= Math.max(...al.town, ...al.rpi));
  assert.equal(m.segT.length, 1);
  const svg = indexSvg(m, 'Town <x>');
  assert.match(svg, /aria-label="Town &lt;x&gt;"/);
  assert.match(svg, /tabindex="0" role="img"/);
  assert.match(svg, /stroke-dasharray:5 3/);                     // RPI dashed, not colour alone
  assert.match(indexTip(m.pts[0], 'Bishan'), /<b>Q2 2016<\/b><span>Bishan: 100\.0 \(median S\$505 psf, 6 sales\)<\/span><span>HDB RPI: 100\.0<\/span>/);
  assert.match(indexTip({ ...m.pts[0], town: null }, 'Bishan'), /fewer than 5 sales/);
  assert.equal(indexModel(null), null);
});

test('lease chart: bars, marks, tooltip, drag text', () => {
  const curve = [{ from: 50, to: 60, n: 4, psm: 5000 }, { from: 60, to: 70, n: 20, psm: 5600 }, { from: 80, to: 90, n: 30, psm: 6500 }];
  const m = leaseModel(leaseSlots(curve, { now: 67, later: 57, minN: 5 }), { width: 320 });
  assert.equal(m.pts.filter((p) => p.bar).length, 3);
  assert.equal(m.yTicks[0].v, 0);                                // bars start at zero
  const svg = leaseSvg(m, 'aria');
  assert.match(svg, />Now</);
  assert.match(svg, />In 10 y</);
  assert.match(svg, />80–90</);
  assert.match(leaseTip(m.pts[2], 36), /^<b>60–70 years of lease left · this block now<\/b><span>Median S\$520 psf<\/span><span>20 sales<\/span>$/);
  assert.match(leaseTip(m.pts[3], 36), /Few sales — a rough guide/);
  assert.match(leaseTip(m.pts[1], 36), /No sales in the last 36 months/);
  assert.equal(leaseModel(leaseSlots([curve[0]], {}), {}), null);  // one band → no chart
  assert.equal(dragText({ pct: -8.4, from: [60, 70], to: [50, 60] }, { town: 'Bishan', type: '4-room' }),
    'In Bishan, 4-room flats with 50–60 years left sold for 8% less per sqft than those with 60–70 years left.');
  assert.match(dragText({ pct: 3, from: [60, 70], to: [50, 60] }, { town: 'T', type: 'x' }), /3% more per sqft/);
  assert.equal(dragText({ pct: null }, {}), '');
  assert.equal(dragText(null, {}), '');
});

test('createMarketCharts: hasRpi follows market.js', () => {
  const { D, TX, PSF } = data();
  assert.equal(createMarketCharts({ D, TX, PSF, market: () => null }).hasRpi(), false);
  assert.equal(createMarketCharts({ D, TX, PSF, market: () => ({ rpi: rpiFor('2020-Q1', '2020-Q4') }) }).hasRpi(), true);
});
