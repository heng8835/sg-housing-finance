import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pmt, pv } from '../../app/engine/mortgage.js';
import { close } from '../helpers.js';

test('pmt matches the v1.8 fixture (S$540k, 2.6 %, 25 y → S$2,450/month)', () => {
  assert.equal(Math.round(pmt(540000, 0.026, 25)), 2450);
});

test('pmt at 0 % is principal / months', () => {
  assert.equal(pmt(1200, 0, 1), 100);
});

test('pv inverts pmt across rates and tenures', () => {
  for (const rate of [0, 0.01, 0.026, 0.03, 0.04, 0.08]) {
    for (const years of [5, 15, 25, 30]) {
      const p = 500000;
      assert.ok(close(pv(pmt(p, rate, years), rate, years), p, 0.001), `rate ${rate} years ${years}`);
    }
  }
});

test('higher rate never lowers the instalment; longer tenure never raises it', () => {
  let prev = 0;
  for (const rate of [0, 0.01, 0.02, 0.026, 0.03, 0.04, 0.06]) {
    const m = pmt(400000, rate, 25);
    assert.ok(m >= prev); prev = m;
  }
  prev = Infinity;
  for (const years of [5, 10, 20, 25, 30]) {
    const m = pmt(400000, 0.03, years);
    assert.ok(m <= prev); prev = m;
  }
});
