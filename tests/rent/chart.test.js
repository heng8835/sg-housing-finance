import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, sgdShort, xTicks, signedMoney, textWidth, chartModel, chartSvg, chartLabels, nearestIndex, tipHtml } from '../../app/modules/rent/chart.js';

const series = (n, buy, rent) => Array.from({ length: n + 1 }, (_, y) => ({ year: y, buyNetWorth: buy(y), rentNetWorth: rent(y) }));
// buy starts lower (upfront costs) and overtakes in year 4
const RES = { series: series(10, (y) => 100000 + 60000 * y, (y) => 250000 + 20000 * y), breakEvenYear: 4, mop: { years: 5 } };

test('niceTicks: steps from {1, 2, 2.5, 5}×10ⁿ, include 0, at most n ticks, cover the data', () => {
  const a = niceTicks(0, 812345, 5);
  assert.deepEqual(a.ticks, [0, 250000, 500000, 750000, 1000000]);
  const b = niceTicks(-50000, 300000, 5);
  assert.deepEqual(b.ticks, [-100000, 0, 100000, 200000, 300000]);
  for (const [lo, hi] of [[0, 1], [0, 37], [-1234, 98765], [0, 4.2e6], [-3e5, -1e4], [12, 12]]) {
    const r = niceTicks(lo, hi, 5);
    assert.ok(r.ticks.length >= 2 && r.ticks.length <= 5, `${lo}..${hi}: ${r.ticks}`);
    assert.ok(r.lo <= Math.min(lo, hi) && r.hi >= Math.max(lo, hi), `${lo}..${hi} covered`);
    const m = r.step / 10 ** Math.floor(Math.log10(r.step));
    assert.ok([1, 2, 2.5, 5].some((s) => Math.abs(s - m) < 1e-9), `nice step ${r.step}`);
  }
});

test('sgdShort: S$0, k below a million, one-decimal m from a million, minus sign for negatives', () => {
  assert.equal(sgdShort(0), 'S$0');
  assert.equal(sgdShort(250000), 'S$250k');
  assert.equal(sgdShort(12500), 'S$12.5k');
  assert.equal(sgdShort(1200000), 'S$1.2m');
  assert.equal(sgdShort(1000000), 'S$1m');
  assert.equal(sgdShort(2250000), 'S$2.3m');
  assert.equal(sgdShort(-50000), '−S$50k');
  assert.equal(sgdShort(500), 'S$500');
  assert.equal(signedMoney(-5000), '−S$5,000');
  assert.equal(signedMoney(23400), 'S$23,400');
});

test('xTicks: every year to 5, every 2 to 10, every 5 beyond', () => {
  assert.deepEqual(xTicks(0, 5), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(xTicks(0, 10), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(xTicks(0, 20), [0, 5, 10, 15, 20]);
});

test('model: plot box from the margins, year 0 labelled "Now", y ticks as short S$', () => {
  const m = chartModel(RES, 354);
  assert.equal(m.W, 354); assert.equal(m.H, 220);
  assert.deepEqual([m.x0, m.x1, m.y0, m.y1], [52, 342, 26, 182]);
  assert.equal(m.xTicks[0].text, 'Now');
  assert.ok(m.yTicks.every((tk) => tk.text.startsWith('S$')));
  assert.equal(chartModel(RES, 321).H, 200);               // phone width → shorter chart
  assert.equal(m.zeroY, null);                             // no negative values → no zero line
});

test('MOP: band to the MOP year, its tick replaces that year (and neighbours it would overlap)', () => {
  const m = chartModel(RES, 354);
  assert.ok(m.mop && m.mop.line);
  assert.equal(m.mop.x, m.x0);
  assert.ok(Math.abs(m.mop.endX - (m.x0 + (5 / 10) * (m.x1 - m.x0))) < 1e-9);
  assert.equal(m.mop.tick.text, 'MOP · yr 5');
  assert.ok(!m.xTicks.some((tk) => tk.year === 5 || tk.year === 4 || tk.year === 6));
  assert.ok(m.xTicks.some((tk) => tk.year === 10));
  // horizon shorter than MOP: band fills the plot, no MOP line or tick
  const short = chartModel({ ...RES, series: RES.series.slice(0, 4), breakEvenYear: null }, 354);
  assert.ok(Math.abs(short.mop.endX - short.x1) < 1e-9);
  assert.equal(short.mop.line, false); assert.equal(short.mop.tick, null);
  // a narrow band hides its label
  const wide20 = chartModel({ ...RES, series: series(20, (y) => 1e5 + 5e4 * y, (y) => 2e5 + 2e4 * y) }, 354);
  assert.equal(wide20.mop.label, null);
  // no MOP info → no band
  assert.equal(chartModel({ ...RES, mop: undefined }, 354).mop, null);
});

test('break-even: marker at that year on the buy line, label at the plot top; MOP label moves down when close', () => {
  const m = chartModel(RES, 354);
  const x4 = m.x0 + (4 / 10) * (m.x1 - m.x0);
  assert.ok(Math.abs(m.be.x - x4) < 1e-9);
  assert.equal(m.be.year, 4);
  assert.equal(m.be.label.text, 'Buying pulls ahead · yr 4');
  assert.ok(m.be.label.y < m.y0);
  assert.ok(m.mop.label && m.mop.label.y > m.y1 - 10);    // pushed to the band's bottom-left
  const far = chartModel({ ...RES, breakEvenYear: 9 }, 600);
  assert.ok(far.mop.label.y < far.y0 + 20);                // stays top-left
  const none = chartModel({ ...RES, breakEvenYear: null }, 354);
  assert.equal(none.be, null);
  const svg = chartSvg(m, chartLabels(), 'summary');
  assert.ok(svg.includes('stroke-dasharray="3 3"') && svg.includes('Buying pulls ahead · yr 4'));
  assert.ok(!chartSvg(none, chartLabels(), '').includes('Buying pulls ahead'));
});

test('end labels: higher line above, lower below, at least 14 px apart; dash pattern on the rent line', () => {
  const m = chartModel(RES, 354);
  const end = RES.series.at(-1);
  assert.ok(end.buyNetWorth > end.rentNetWorth);
  assert.ok(m.ends.buy.y < m.ends.rent.y && m.ends.rent.y - m.ends.buy.y >= 14);
  const close = chartModel({ ...RES, series: series(10, (y) => 1e5 + 1e4 * y, (y) => 1e5 + 1e4 * y + 100) }, 354);
  assert.ok(close.ends.buy.y - close.ends.rent.y >= 14);  // rent higher (by S$100) → rent label on top
  const svg = chartSvg(m, chartLabels(), 'Net worth summary');
  assert.ok(svg.includes('stroke-dasharray="6 4"') && svg.includes('aria-label="Net worth summary"') && svg.includes('tabindex="0"'));
  assert.ok(svg.includes('Net worth (S$)') && svg.includes('Years from now'));
});

test('negative values: zero line and a domain below 0', () => {
  const m = chartModel({ series: series(5, (y) => -40000 + 30000 * y, () => 20000), breakEvenYear: 2, mop: { years: 5 } }, 400);
  assert.ok(m.yAxis.lo < 0 && m.zeroY != null);
  assert.ok(m.yTicks.some((tk) => tk.text.startsWith('−')));
});

test('hover helpers: nearest year and tooltip text', () => {
  assert.equal(nearestIndex([10, 20, 30, 40], 26), 2);
  assert.equal(nearestIndex([10, 20, 30, 40], -5), 0);
  const html = tipHtml({ year: 7, buyNetWorth: 412300, rentNetWorth: 388900 });
  assert.ok(html.includes('Year 7') && html.includes('S$412,300') && html.includes('S$388,900') && html.includes('Buy ahead by S$23,400'));
  assert.ok(tipHtml({ year: 0, buyNetWorth: 1, rentNetWorth: 5001 }).includes('Rent ahead by S$5,000'));
  assert.ok(tipHtml({ year: 0, buyNetWorth: 1, rentNetWorth: 2 }).includes('Now'));
  assert.ok(textWidth('最低居住期') > textWidth('MOP'));
});
