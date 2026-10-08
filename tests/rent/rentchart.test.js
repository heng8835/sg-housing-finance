// Rent & Buy trend chart (modules/rent/rentchart.js): window per range, null quarters break the line, quarter
// axis, asking line, tooltip text and the screen-reader summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentChartModel, rentChartSvg, rentTip, rentAria, qLabel, nearestPoint, stepPoint, jumpPoint, rangeSeg, RANGES } from '../../app/modules/rent/rentchart.js';

// 2005-Q2 … 2026-Q2 (85 quarters), a gap in 2020 and an empty last quarter
const quarters = [];
for (let y = 2005; y <= 2026; y++) for (let q = 1; q <= 4; q++) if (!(y === 2005 && q === 1) && !(y === 2026 && q > 2)) quarters.push(`${y}-Q${q}`);
const q = quarters.map((s, i) => (s.startsWith('2020-') ? null : 1500 + i * 20));
q[q.length - 1] = null;                                                   // 2026-Q2 not published yet

test('ranges: 10 y default = the last 40 quarters ending at the last figure; 5 y = 20; All from the first figure', () => {
  assert.deepEqual(RANGES.map((r) => r[0]), ['5', '10', 'all']);
  const m = rentChartModel({ q, quarters, width: 400 });
  assert.equal(m.last, '2026-Q1');
  assert.equal(m.pts.length, 40);
  assert.equal(m.first, '2016-Q2');
  assert.equal(rentChartModel({ q, quarters, range: '5', width: 400 }).pts.length, 20);
  const all = rentChartModel({ q, quarters, range: 'all', width: 400 });
  assert.equal(all.first, '2005-Q2');
  assert.equal(all.pts.length, quarters.length - 1);
  assert.equal(m.H, 180);
  assert.equal(rentChartModel({ q, quarters, width: 320, phone: true }).H, 160);
});

test('null quarters break the line into segments; points keep their x, y = null', () => {
  const m = rentChartModel({ q, quarters, width: 400 });
  assert.equal(m.segs.length, 2);                                          // before and after 2020
  const gap = m.pts.filter((p) => p.v == null);
  assert.equal(gap.length, 4);
  assert.ok(gap.every((p) => p.y === null && Number.isFinite(p.x)));
  assert.equal(m.segs[0].length + m.segs[1].length, 36);
  assert.ok(m.pts[0].x === m.x0 && Math.abs(m.pts.at(-1).x - m.x1) < 1e-9);
});

test('y axis covers the data and the asking rent; axis ticks from quarterTicks', () => {
  const m = rentChartModel({ q, quarters, width: 400, asking: 9000 });
  const vals = m.pts.filter((p) => p.v != null).map((p) => p.v);
  assert.ok(m.yTicks[0].v <= Math.min(...vals) && m.yTicks.at(-1).v >= 9000);
  assert.ok(m.yTicks.length <= 4);
  assert.equal(m.ask.v, 9000);
  assert.ok(m.ticks.major.some((x) => x.label));
  assert.equal(rentChartModel({ q, quarters, width: 400 }).ask, null);
  const svg = rentChartSvg(m, 'aria');
  assert.match(svg, /stroke-dasharray="4 3"/);
  assert.match(svg, /Asking S\$9,000/);
  assert.match(svg, />Q1 2026</);
  assert.match(svg, /tabindex="0" role="img" aria-label="aria"/);
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
});

test('too little data → no chart', () => {
  assert.equal(rentChartModel({ q: [null, 2000], quarters: ['2026-Q1', '2026-Q2'] }), null);
  assert.equal(rentChartModel({ q: [], quarters: [] }), null);
});

test('tooltip: quarter, median, series, and the asking difference', () => {
  const p = { q: '2024-Q3', v: 3150 };
  const html = rentTip(p, { flatType: '4 ROOM', town: 'Ang Mo Kio', asking: 3200 });
  assert.match(html, /<b>Q3 2024<\/b>/);
  assert.match(html, /Median rent S\$3,150/);
  assert.match(html, /4-room, Ang Mo Kio \(HDB\)/);
  assert.match(html, /Asking is S\$50 above/);
  assert.match(rentTip(p, { flatType: '4 ROOM', town: 'X', asking: 3000 }), /Asking is S\$150 below/);
  assert.doesNotMatch(rentTip(p, { flatType: '4 ROOM', town: 'X' }), /Asking/);
  assert.equal(qLabel('2026-Q2'), 'Q2 2026');
});

test('aria summary and keyboard / pointer helpers skip quarters without a figure', () => {
  const m = rentChartModel({ q, quarters, width: 400 });
  assert.match(rentAria(m), /^Town median rent, Q2 2016 to Q1 2026: from S\$\d{1,3}(,\d{3})* to S\$\d{1,3}(,\d{3})*\.$/);
  const gapIdx = m.pts.findIndex((p) => p.v == null);
  assert.notEqual(nearestPoint(m.pts, m.pts[gapIdx].x), gapIdx);
  assert.equal(m.pts[stepPoint(m.pts, gapIdx - 1, 1)].v != null, true);
  assert.ok(stepPoint(m.pts, gapIdx - 1, 1) > gapIdx);
  assert.equal(stepPoint(m.pts, m.pts.length - 1, 1), m.pts.length - 1);    // already at the end
  assert.equal(jumpPoint(m.pts, 0, 4), 4);
  assert.equal(jumpPoint(m.pts, 0, -4), 0);
  assert.ok(m.pts[jumpPoint(m.pts, gapIdx - 1, 2)].v != null);
  assert.match(rangeSeg('10'), /data-rr="10" aria-checked="true"/);
});
