import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingLease, coversToAge } from '../../app/engine/lease.js';
import { AS_OF, close } from '../helpers.js';

test('remaining lease matches the v1.8 fixture (lease from 1987 → 59.3 y on 6 Oct 2026)', () => {
  assert.ok(close(remainingLease(1987, AS_OF, 99), 59.25));
  assert.ok(close(remainingLease(2017, AS_OF, 99), 89.25));
});

test('missing or invalid lease start → null (shown as "unknown"), never NaN or negative', () => {
  for (const bad of [undefined, null, 0, -1, NaN, '1987']) assert.equal(remainingLease(bad, AS_OF, 99), null);
});

test('coverage to 95: exactly enough lease passes, a fraction short fails', () => {
  assert.equal(coversToAge(63, 32, 95), true);
  assert.equal(coversToAge(62.99, 32, 95), false);
});

test('coverage is unknown without a lease or an age', () => {
  assert.equal(coversToAge(null, 32, 95), null);
  assert.equal(coversToAge(60, null, 95), null);
});
