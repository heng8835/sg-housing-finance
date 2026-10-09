import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMP, quantileScale, fixedScale, roundTick, textOn, dotStyle, glyphScale, chipSize, placeChips, shortValue, chipMetric, legendHtml } from '../../app/modules/explore/blocks.js';
import { t } from '../../app/core/i18n.js';

test('shortValue: rounded box labels per colour mode (display only)', () => {
  const cases = [['price', 612400, '612k'], ['price', 999499, '999k'], ['price', 999600, '1m'], ['price', 1050000, '1.05m'], ['price', 1200000, '1.2m'], ['budget', 612400, '612k'],
    ['psf', 540.4, '$540'], ['psf', 1050, '$1,050'], ['count', 19, '19'], ['count', 3, '3'], ['rent', 2949, '$2.9k'], ['rent', 3000, '$3.0k'], ['commute', 35, '35 min'],
    ['price', null, '–'], ['psf', undefined, '–'], ['commute', NaN, '–']];
  for (const [mode, v, want] of cases) assert.equal(shortValue(mode, v, t), want, `${mode} ${v}`);
});

test('value-label switch: button text per mode; legend reads "–" for grey / new boxes and adds the hint', () => {
  assert.deepEqual(['price', 'budget', 'psf', 'count', 'rent', 'commute'].map(chipMetric), ['Price', 'Price', 'Price per sq ft', 'Sales', 'Rent', 'Minutes']);
  const scale = quantileScale([1, 2, 3, 4, 5]);
  const base = { scale, mode: 'price', label: 'L', fmt: String, t, simple: true, zoomedIn: true };
  const blockMode = legendHtml({ ...base, chipLabel: null });
  assert.match(blockMode, /chipkey none">221</); assert.doesNotMatch(blockMode, /Box labels show/);
  const valueMode = legendHtml({ ...base, chipLabel: 'Price' });
  assert.match(valueMode, /chipkey none">–</); assert.match(valueMode, /chipkey new">–</);
  assert.match(valueMode, /Box labels show Price, rounded\. Hover for the exact value\./);
  assert.doesNotMatch(legendHtml({ ...base, zoomedIn: false, chipLabel: 'Price' }), /Box labels show/); // dots: no boxes, no hint
});

test('quantile scale: 5 equal-count bins, light → dark', () => {
  const s = quantileScale([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, null]);
  assert.equal(s.breaks.length, 4);
  assert.equal(s.color(10), RAMP[0]);
  assert.equal(s.color(100), RAMP[4]);
  assert.equal(s.min, 10); assert.equal(s.max, 100);
  assert.equal(quantileScale([null, undefined]), null);
});

test('fixed scale: inclusive upper edges (commute minutes)', () => {
  const s = fixedScale([20, 30, 45, 60]);
  assert.deepEqual([15, 20, 21, 30, 45, 46, 60, 61, 200].map((m) => RAMP.indexOf(s.color(m))), [0, 0, 1, 1, 2, 3, 3, 4, 4]);
});

test('legend ticks are rounded per measure', () => {
  assert.equal(roundTick(523456, 'price'), 520000);
  assert.equal(roundTick(577.4, 'psf'), 580);
  assert.equal(roundTick(3412, 'rent'), 3400);
  assert.equal(roundTick(7.6, 'count'), 8);
});

test('text colour: dark on the lightest step, white on the four darker ones (RAMP[1] darkened, a11y 5a / D9)', () => {
  assert.deepEqual(RAMP.map(textOn), ['#1b1b19', '#ffffff', '#ffffff', '#ffffff', '#ffffff']);
  assert.equal(textOn('#1f9d6b'), '#1b1b19'); // budget green keeps dark text
});

test('dots grow with zoom; no-sales dots stay smaller than sale dots', () => {
  for (const z of [11, 13, 15, 16]) assert.ok(dotStyle(z, 'none').radius < dotStyle(z, 'sale').radius);
  assert.ok(dotStyle(11, 'sale').radius < dotStyle(16, 'sale').radius);
  assert.ok(dotStyle(15, 'sale').radius < dotStyle(16, 'sale').radius);   // 16 has its own, bigger band
  // map icons scale up monotonically with zoom (owner 2026-10-07)
  for (let z = 11; z < 19; z++) assert.ok(glyphScale(z) <= glyphScale(z + 1));
  assert.ok(glyphScale(14) >= 1);
  assert.ok(glyphScale(17) >= 2);           // owner: "still quite small" → ~2× base when zoomed in
  assert.ok(chipSize(30, 18).h > chipSize(30, 17).h);
  assert.equal(chipSize(5, 17).w, 18); // min width
});

test('placement: overlapping lower-priority boxes become mini squares; forced items always get a box', () => {
  const items = [
    { id: 'a', x: 100, y: 100, w: 30, h: 16 },
    { id: 'b', x: 110, y: 104, w: 30, h: 16 },             // overlaps a
    { id: 'c', x: 200, y: 100, w: 30, h: 16 },             // clear
    { id: 'd', x: 104, y: 98, w: 30, h: 16, force: true }, // overlaps but forced (selected)
  ];
  const r = placeChips(items);
  assert.deepEqual([...r.entries()], [['a', 'chip'], ['b', 'mini'], ['c', 'chip'], ['d', 'chip']]);
});
