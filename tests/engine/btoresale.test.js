import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareBtoResale, monthsBetween } from '../../app/engine/btoresale.js';
import { policy } from '../helpers.js';

test('monthsBetween counts whole months and never goes negative', () => {
  assert.equal(monthsBetween('2026-10-07', '2029-12'), 38);
  assert.equal(monthsBetween('2026-10', '2026-10-31'), 0);
  assert.equal(monthsBetween('2030-01', '2026-10'), 0);
});

test('BTO total = price + rent while waiting; difference vs resale', () => {
  const r = compareBtoResale({ asOf: '2026-10-07', keyDate: '2029-12', btoPrice: 450000, resalePrice: 650000, monthlyRent: 3500 }, policy);
  assert.equal(r.waitMonths, 38);
  assert.equal(r.rentWhileWaiting, 133000);
  assert.equal(r.btoTotal, 583000);
  assert.equal(r.resaleTotal, 650000);
  assert.equal(r.difference, 67000);
  assert.equal(r.cheaper, 'bto');
  assert.equal(r.btoLeaseYears, policy.get('lease.term.years'));
  assert.equal(r.mopYears, policy.get('rentbuy.mop.years').standard);
});

test('missing pieces: no wait → no BTO total (never price + S$0 rent); no rent → no total; no resale price', () => {
  const a = compareBtoResale({ asOf: '2026-10-07', keyDate: null, btoPrice: 450000, resalePrice: 500000, monthlyRent: 3000 }, policy);
  assert.equal(a.waitMonths, null);
  assert.equal(a.rentWhileWaiting, null);
  assert.equal(a.btoTotal, null, 'unknown wait: no total, so no comparison (Phase 7 A7)');
  assert.equal(a.difference, null);
  assert.equal(a.cheaper, null);
  assert.deepEqual(a.missing, ['wait']);
  assert.ok(a.notes.some((n) => n.startsWith('How long you wait for the keys is not known yet')));
  const b = compareBtoResale({ asOf: '2026-10-07', keyDate: '2028-06', btoPrice: 450000, resalePrice: null, monthlyRent: null }, policy);
  assert.equal(b.btoTotal, null, 'a wait with no rent figure is not a S$0 rent');
  assert.equal(b.difference, null);
  assert.equal(b.cheaper, null);
  assert.deepEqual(b.missing, ['rent', 'resale']);
  assert.ok(b.notes.some((n) => n.startsWith('No rent figure')));
});

test('a wait the user set (future launch) and a typed rent of 0 both count', () => {
  const r = compareBtoResale({ asOf: '2026-10-07', keyDate: null, waitMonths: 48, btoPrice: 260000, resalePrice: 420000, monthlyRent: 1200 }, policy);
  assert.equal(r.waitMonths, 48);
  assert.equal(r.rentWhileWaiting, 57600);
  assert.equal(r.btoTotal, 317600);
  assert.equal(r.difference, 102400);
  assert.equal(r.cheaper, 'bto');
  assert.deepEqual(r.missing, []);
  const free = compareBtoResale({ asOf: '2026-10-07', keyDate: '2029-12', btoPrice: 450000, resalePrice: 650000, monthlyRent: 0 }, policy);
  assert.equal(free.rentWhileWaiting, 0);
  assert.equal(free.btoTotal, 450000);
  // a key date wins over a typed wait; blank / negative waits are unknown
  assert.equal(compareBtoResale({ asOf: '2026-10-07', keyDate: '2029-12', waitMonths: 6, btoPrice: 1, resalePrice: 1, monthlyRent: 0 }, policy).waitMonths, 38);
  for (const w of ['', -1, null, 'x']) assert.equal(compareBtoResale({ asOf: '2026-10-07', keyDate: null, waitMonths: w, btoPrice: 1, resalePrice: 1, monthlyRent: 0 }, policy).waitMonths, null);
});
