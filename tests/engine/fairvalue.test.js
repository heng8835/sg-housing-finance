import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantile, percentileOf, verdictBand, fairValue, VERDICT } from '../../app/engine/fairvalue.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('quantile: linear interpolation between order statistics', () => {
  const a = [1, 2, 3, 4];
  near(quantile(a, 25), 1.75);
  near(quantile(a, 50), 2.5);
  near(quantile(a, 75), 3.25);
  assert.equal(quantile(a, 0), 1);
  assert.equal(quantile(a, 100), 4);
  assert.equal(quantile([5], 25), 5);
  assert.equal(quantile([], 50), null);
  assert.equal(quantile([10, 20, 30, 40, 50], 25), 20);
});

test('quantile p50 equals the usual median (odd and even n)', () => {
  assert.equal(quantile([3, 5, 9], 50), 5);
  assert.equal(quantile([3, 5, 9, 11], 50), 7);
});

test('percentileOf: below / above every sale, interpolation, order independent', () => {
  const v = [50, 10, 40, 20, 30];
  assert.equal(percentileOf(v, 5), 0);
  assert.equal(percentileOf(v, 10), 0);
  assert.equal(percentileOf(v, 30), 50);
  assert.equal(percentileOf(v, 25), 37.5);
  assert.equal(percentileOf(v, 50), 100);
  assert.equal(percentileOf(v, 60), 100);
  assert.equal(percentileOf([1, 2], 1.5), 50);
});

test('percentileOf: ties → middle of the tied run', () => {
  assert.equal(percentileOf([10, 20, 20, 20, 30], 20), 50);
  assert.equal(percentileOf([5, 5, 5], 5), 50);
  assert.equal(percentileOf([5, 5, 5, 5, 9], 5), 37.5);
  assert.equal(percentileOf([1, 9, 9, 9, 9], 9), 62.5);
});

test('percentileOf: fewer than 2 values or no number → null; non-numbers ignored', () => {
  assert.equal(percentileOf([10], 10), null);
  assert.equal(percentileOf([], 10), null);
  assert.equal(percentileOf([10, 20], null), null);
  assert.equal(percentileOf([10, NaN, 20, null, undefined], 15), 50);
});

test('verdictBand: P25 and P75 themselves are in the usual range', () => {
  assert.equal(verdictBand(99, 100, 200), 'below');
  assert.equal(verdictBand(100, 100, 200), 'usual');
  assert.equal(verdictBand(150, 100, 200), 'usual');
  assert.equal(verdictBand(200, 100, 200), 'usual');
  assert.equal(verdictBand(201, 100, 200), 'above');
  assert.equal(verdictBand(null, 100, 200), null);
});

test('fairValue: quartiles in $psf and S$ for the area, percentile, verdict', () => {
  const psfs = [500, 520, 540, 560, 580, 600, 620, 640, 660];
  const fv = fairValue({ psfs, sqft: 1000, askingPsf: 610, minN: 5, tier: 3, window: { months: 12 } });
  assert.equal(fv.n, 9);
  assert.equal(fv.enough, true);
  assert.deepEqual([fv.p25, fv.p50, fv.p75], [540, 580, 620]);
  assert.deepEqual(fv.price, { p25: 540000, p50: 580000, p75: 620000 });
  near(fv.percentile, 68.75);
  assert.equal(fv.band, 'usual');
  assert.equal(fv.verdict, 'in the usual range');
  assert.equal(fv.tier, 3);
  assert.deepEqual(fv.window, { months: 12 });
  assert.equal(fairValue({ psfs, sqft: 1000, askingPsf: 530, minN: 5 }).verdict, VERDICT.below);
  assert.equal(fairValue({ psfs, sqft: 1000, askingPsf: 700, minN: 5 }).verdict, 'above most comparable sales');
  assert.equal(fairValue({ psfs, sqft: 1000, askingPsf: 700, minN: 5 }).percentile, 100);
});

test('fairValue: n < minN → "not enough sales", no percentile; quartiles still given', () => {
  const fv = fairValue({ psfs: [600, 620, 640, 660], sqft: 900, askingPsf: 610, minN: 5 });
  assert.equal(fv.n, 4);
  assert.equal(fv.enough, false);
  assert.equal(fv.band, 'thin');
  assert.equal(fv.verdict, 'not enough sales');
  assert.equal(fv.percentile, null);
  assert.equal(fv.p50, 630);
  near(fv.price.p50, 630 * 900);
  // exactly minN sales is enough
  assert.equal(fairValue({ psfs: [600, 620, 640, 660, 680], sqft: 900, askingPsf: 610, minN: 5 }).enough, true);
  // nothing at all
  const none = fairValue({ psfs: [], sqft: 900, askingPsf: 610, minN: 5 });
  assert.deepEqual([none.n, none.p50, none.price.p50, none.band], [0, null, null, 'thin']);
});

test('fairValue: missing area → no S$ figures; missing asking → thin', () => {
  const psfs = [500, 520, 540, 560, 580];
  assert.equal(fairValue({ psfs, sqft: 0, askingPsf: 530, minN: 5 }).price.p25, null);
  assert.equal(fairValue({ psfs, sqft: 1000, askingPsf: null, minN: 5 }).band, 'thin');
});

test('fairValue: the band always agrees with the percentile (random sets, ties included)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 400; k++) {
    const n = 5 + Math.floor(rnd() * 40);
    const psfs = Array.from({ length: n }, () => Math.round(400 + rnd() * 400) - (Math.round(400 + rnd() * 400) % 10));
    const ask = Math.round(350 + rnd() * 500);
    const fv = fairValue({ psfs, sqft: 1000, askingPsf: ask, minN: 5 });
    if (fv.band === 'below') assert.ok(fv.percentile < 25, `${fv.percentile} below`);
    if (fv.band === 'above') assert.ok(fv.percentile > 75, `${fv.percentile} above`);
    if (fv.band === 'usual') assert.ok(ask >= fv.p25 && ask <= fv.p75);
    assert.ok(fv.percentile >= 0 && fv.percentile <= 100);
  }
});
