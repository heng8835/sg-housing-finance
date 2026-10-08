import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsd } from '../../app/engine/stamp-duty.js';
import { policy, close } from '../helpers.js';

const bands = policy.get('stamp.bsd.bands');

// Hand-computed from the IRAS residential bands in force from 15 Feb 2023 (BR-T1).
const GOLDEN = [
  [0, 0], [-5, 0],
  [180000, 1800],
  [360000, 5400],
  [720000, 16200],    // v1.8 fixture: BSD S$16k on a S$720k flat
  [1000000, 24600],
  [1500000, 44600],
  [3000000, 119600],
  [4000000, 179600],
];

test('BSD golden values at every band edge', () => {
  for (const [price, expect] of GOLDEN) assert.ok(close(bsd(price, bands), expect), `price ${price}`);
});

test('BSD is monotone and continuous across band edges', () => {
  for (const edge of [180000, 360000, 1000000, 1500000, 3000000]) {
    const lo = bsd(edge - 1, bands), at = bsd(edge, bands), hi = bsd(edge + 1, bands);
    assert.ok(lo <= at && at <= hi, `edge ${edge}`);
    assert.ok(hi - lo <= 1, `no jump at ${edge}`); // whole dollars after rounding down
  }
});

test('BSD is rounded down to the dollar with a $1 minimum (IRAS)', () => {
  assert.equal(bsd(180001, bands), 1800);
  assert.equal(bsd(50, bands), 1);
});
