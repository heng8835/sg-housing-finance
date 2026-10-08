import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOW_N, median, trendSpec, yearlyStats, rentYearly, yearTicks, trendModel, trendSvg, trendTip, trendAria } from '../../app/modules/explore/trend.js';

// legacy.js l.33 median and l.173 yearlySeries (removed by the card change), copied for the characterisation check
const legacyMedian = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
function legacyYearlySeries(TX, PSF, months, indices, ftSet) { const by = {}; for (const i of indices) { if (ftSet && !ftSet.has(TX.ft[i])) continue; const y = months[TX.m[i]].slice(0, 4); (by[y] = by[y] || []).push(PSF[i]); } return Object.keys(by).sort().map((y) => ({ y, v: legacyMedian(by[y]), n: by[y].length })); }

// a small block: months 2019-01 … 2021-12, mixed flat types
const months = []; for (let y = 2019; y <= 2021; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
const TX = { m: [0, 3, 5, 14, 15, 20, 30, 31, 33, 35], ft: [3, 4, 3, 3, 5, 4, 3, 3, 4, 3], p: [400000, 520000, 410000, 430000, 610000, 540000, 455000, 470000, 560000, 480000], a: [93, 110, 93, 92, 121, 110, 93, 93, 111, 94] };
const PSF = Float32Array.from(TX.p.map((p, i) => p / (TX.a[i] * 10.7639)));
const idx = TX.p.map((_, i) => i);

test('median: same as legacy (odd, even, empty)', () => {
  for (const a of [[3, 1, 2], [4, 1, 3, 2], [5], []]) assert.equal(median(a), legacyMedian(a));
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('yearlyStats: median / n / lo / hi per year; all types psf = the old sparkline numbers', () => {
  const s = yearlyStats([{ y: '2020', v: 5 }, { y: '2019', v: 1 }, { y: '2019', v: 3 }, { y: '2020', v: 9 }, { y: '2020', v: 7 }]);
  assert.deepEqual(s, [{ y: '2019', v: 2, n: 2, lo: 1, hi: 3 }, { y: '2020', v: 7, n: 3, lo: 5, hi: 9 }]);
  const items = idx.map((i) => ({ y: months[TX.m[i]].slice(0, 4), v: PSF[i] }));
  assert.deepEqual(yearlyStats(items).map(({ y, v, n }) => ({ y, v, n })), legacyYearlySeries(TX, PSF, months, idx, null));
  // selected flat types (display change 1: the trend follows the filters, same median function)
  const sel = new Set([3]);
  const selItems = idx.filter((i) => sel.has(TX.ft[i])).map((i) => ({ y: months[TX.m[i]].slice(0, 4), v: TX.p[i] }));
  assert.deepEqual(yearlyStats(selItems).map((r) => [r.y, r.v, r.n]), [['2019', 405000, 2], ['2020', 430000, 1], ['2021', 470000, 3]]);
});

test('trendSpec: every colour mode', () => {
  assert.equal(trendSpec('price', false), 'price');
  assert.equal(trendSpec('budget', false), 'price');
  assert.equal(trendSpec('psf', false), 'psf');
  assert.equal(trendSpec('count', false), 'count');
  assert.equal(trendSpec('rent', true), 'rent');
  assert.equal(trendSpec('rent', false), 'price'); // no town series → price chart
  assert.equal(trendSpec('commute', true), 'price');
});

test('rentYearly: the latest non-null quarter per year, values as published', () => {
  const quarters = ['2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q2'];
  const q = [2800, 2900, 3000, null, 3100, null, 3200, 3250];
  assert.deepEqual(rentYearly(q, quarters), [{ y: '2023', v: 2900, n: null, quarter: 'Q4' }, { y: '2024', v: 3100, n: null, quarter: 'Q3' }, { y: '2025', v: 3250, n: null, quarter: 'Q2' }]);
  assert.deepEqual(rentYearly(null, quarters), []);
});

test('yearTicks: step 1 / 2 / 5 by width, last year always labelled, labels ≥ 34 px apart', () => {
  assert.deepEqual(yearTicks(2021, 2026, 258), [2021, 2022, 2023, 2024, 2025, 2026]); // 43 px per year → every year
  assert.deepEqual(yearTicks(2017, 2026, 258), [2018, 2020, 2022, 2024, 2026]);       // 25.8 px → every 2nd
  const wide = yearTicks(2000, 2026, 258);                                            // 9.6 px → every 5th
  assert.equal(wide.at(-1), 2026);
  assert.ok(wide.slice(0, -1).every((y) => y % 5 === 0));
  for (const [f, l, w] of [[2017, 2026, 258], [2000, 2026, 258], [2017, 2025, 245], [2010, 2026, 300], [2019, 2026, 150]]) {
    const ticks = yearTicks(f, l, w), px = w / (l - f + 1);
    assert.equal(ticks.at(-1), l);
    for (let i = 1; i < ticks.length; i++) assert.ok((ticks[i] - ticks[i - 1]) * px >= 34, `${f}-${l}@${w}: ${ticks}`);
  }
});

const S3 = [{ y: '2019', v: 400000, n: 5, lo: 380000, hi: 420000 }, { y: '2020', v: 430000, n: 2, lo: 420000, hi: 440000 }, { y: '2022', v: 470000, n: 4, lo: 450000, hi: 490000 }, { y: '2023', v: 480000, n: 6, lo: 460000, hi: 500000 }];

test('trendModel: line broken at gaps; hollow for n < 3 and the partial year; period band x-range', () => {
  const m = trendModel(S3, { width: 314, height: 156, mode: 'price', period: { from: '2022-10', to: '2023-09' }, partial: { year: 2023, label: 'Jan–Sep' }, lastYear: 2023 });
  assert.equal(m.x0, 46); assert.equal(m.x1, 304); assert.equal(m.y0, 10); assert.equal(m.y1, 134);
  assert.deepEqual(m.segments.map((s) => s.map((p) => p.year)), [[2019, 2020], [2022, 2023]]);
  assert.deepEqual(m.points.map((p) => p.hollow), [false, true, false, true]);
  assert.equal(LOW_N, 3);
  assert.equal(m.points[3].partialLabel, 'Jan–Sep');
  const px = (304 - 46) / 5;
  assert.ok(Math.abs(m.points[0].x - (46 + 0.5 * px)) < 1e-9);  // year Y sits at Y + 0.5
  assert.ok(Math.abs(m.band.x - (46 + (3 + 9 / 12) * px)) < 1e-9);
  assert.ok(Math.abs(m.band.x + m.band.w - (46 + (4 + 9 / 12) * px)) < 1e-9);
  assert.ok(m.axis.lo <= 400000 && m.axis.hi >= 480000 && m.axis.lo > 0); // a line chart may start above 0
  assert.equal(m.points.length, m.points.filter((p) => p.hit.w === px).length);
  // a block with no recent sales shows the gap up to the data's last year
  assert.equal(trendModel(S3, { width: 314, height: 156, mode: 'price', lastYear: 2026 }).last, 2026);
});

test('trendModel: count = bars from 0; rent hollow = part-year quarter', () => {
  const m = trendModel(S3, { width: 314, height: 156, mode: 'count', lastYear: 2023 });
  assert.equal(m.axis.lo, 0);
  assert.equal(m.bars.length, 4);
  assert.ok(m.bars.every((b) => b.w <= 16 && Math.abs(b.y + b.h - m.y1) < 1e-9));
  assert.ok(m.points.every((p) => !p.hollow)); // n is the value here: no low-n hollow
  const r = trendModel([{ y: '2023', v: 2900, quarter: 'Q4' }, { y: '2024', v: 3100, quarter: 'Q2' }], { width: 314, height: 156, mode: 'rent' });
  assert.deepEqual(r.points.map((p) => p.hollow), [false, true]);
  assert.equal(r.points[1].partialLabel, 'Q2');
});

test('trendSvg / trendTip / trendAria: one hit rect per year, exact money in the tooltip', () => {
  const m = trendModel(S3, { width: 314, height: 156, mode: 'price', partial: { year: 2023, label: 'Jan–Sep' }, lastYear: 2023 });
  const svg = trendSvg(m, 'aria text');
  assert.equal((svg.match(/class="tr-hit"/g) || []).length, 4);
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
  assert.match(svg, /tabindex="0" role="img" aria-label="aria text"/);
  assert.equal(trendTip(m.points[0], 'price'), '<b>2019</b><span>Median price S$400,000</span><span>5 sales · range S$380,000 – S$420,000</span>');
  assert.match(trendTip(m.points[1], 'price'), /Few sales — a rough guide/);
  assert.match(trendTip(m.points[3], 'price'), /^<b>2023 \(Jan–Sep\)<\/b>/);
  assert.equal(trendTip({ year: 2024, v: 612.4, n: 1, lo: 612.4, hi: 612.4 }, 'psf'), '<b>2024</b><span>Median S$612 psf</span><span>1 sale</span><small>Few sales — a rough guide</small>');
  assert.equal(trendTip({ year: 2024, n: 6 }, 'count'), '<b>2024</b><span>6 sales</span>');
  assert.equal(trendTip({ year: 2024, v: 3200, quarter: 'Q4' }, 'rent', { ft: '4-room', town: 'Ang Mo Kio' }), '<b>2024</b><span>Q4 median rent S$3,200</span><small>4-room, Ang Mo Kio (HDB)</small>');
  assert.match(trendTip({ year: 2025, v: 3250, quarter: 'Q2', partialLabel: 'Q2' }, 'rent', {}), /Latest-quarter median rent S\$3,250/);
  assert.equal(trendAria(S3, 'price'), 'Median price by year, 2019 to 2023: from S$400,000 to S$480,000.');
  assert.equal(trendAria(S3, 'count'), 'Sales by year, 2019 to 2023: from 5 to 6.');
});
