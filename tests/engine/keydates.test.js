import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, addYears, endOfMonth, isIsoDate, p1Registration, keyDates } from '../../app/engine/keydates.js';
import { policy } from '../helpers.js';

test('addMonths clamps to the end of the month and crosses years', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonths('2026-03-10', -4), '2025-11-10');
  assert.equal(addYears('2024-02-29', 1), '2025-02-28');
  assert.equal(endOfMonth(2026, 8), '2026-08-31');
});

test('isIsoDate rejects impossible dates', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('26-2-1'));
  assert.ok(!isIsoDate(null));
});

test('P1 cohort: born 2 Jan 2020 – 1 Jan 2021 registers in 2026, starts P1 in 2027 (MOE)', () => {
  for (const b of ['2020-01-02', '2020-07-15', '2021-01-01']) {
    const p = p1Registration(b, policy);
    assert.equal(p.registerYear, 2026, b);
    assert.equal(p.entryYear, 2027, b);
  }
  assert.equal(p1Registration('2020-01-01', policy).registerYear, 2025);
  const p = p1Registration('2022-05-05', policy);
  assert.equal(p.windowFrom, '2028-06-01');
  assert.equal(p.windowTo, '2028-08-31');
});

test('MOP end from key collection by flat class', () => {
  const std = keyDates({ asOf: '2026-10-07', keyCollection: '2024-03-15' }, policy);
  assert.deepEqual(std.map((e) => [e.id, e.start]), [['mop', '2029-03-15']]);
  const prime = keyDates({ asOf: '2026-10-07', keyCollection: '2024-03-15', flatClass: 'prime' }, policy);
  assert.equal(prime[0].start, '2034-03-15');
  assert.equal(std[0].status, 'CORROBORATED');
});

test('buy-first deadlines: HDB dispose-by vs private ABSD refund', () => {
  const hdb = keyDates({ asOf: '2026-10-07', nextCompletion: '2027-01-31', mode: 'buy-first', nextPropertyType: 'hdb' }, policy);
  // 7b B9: with a move the purchase completion and the new flat's MOP end are listed too
  const mop = policy.get('rentbuy.mop.years').standard;
  assert.deepEqual(hdb.map((e) => [e.id, e.start]), [['next-complete', '2027-01-31'], ['dispose', '2027-07-31'], ['next-mop', `${2027 + mop}-01-31`]]);
  const pte = keyDates({ asOf: '2026-10-07', nextCompletion: '2027-01-31', mode: 'buy-first', nextPropertyType: 'private' }, policy);
  assert.deepEqual(pte.map((e) => [e.id, e.start]), [['absd-refund', '2027-07-31']]);
  assert.deepEqual(keyDates({ asOf: '2026-10-07', nextCompletion: '2027-01-31', mode: 'contra' }, policy).map((e) => e.id), ['next-complete', 'next-mop'], 'no deadline when selling at the same time');
});

test('lease milestones from remaining lease', () => {
  const ev = keyDates({ asOf: '2026-10-07', remainingLease: 59.25 }, policy);
  const end = ev.find((e) => e.id === 'lease-end');
  assert.equal(end.start, '2086-01-07'); // Oct 2026 + 59 y 3 m
  assert.ok(ev.some((e) => e.id === 'lease-min' && e.start === '2066-01-07'));
  assert.ok(ev.every((e) => !e.past));
});

test('events are sorted, past ones flagged, bad inputs ignored', () => {
  const ev = keyDates({ asOf: '2026-10-07', keyCollection: '2019-01-10', children: ['2023-04-01', 'not-a-date'], remainingLease: 90 }, policy);
  assert.deepEqual(ev.map((e) => e.start), [...ev.map((e) => e.start)].sort());
  assert.ok(ev.find((e) => e.id === 'mop').past);
  assert.equal(ev.filter((e) => e.id.startsWith('p1-')).length, 1);
  const p1 = ev.find((e) => e.id === 'p1-1');
  assert.equal(p1.title, 'Primary 1 registration (child 1, starts P1 in 2030)');
  assert.equal(p1.titleKey, 'Primary 1 registration (child {0}, starts P1 in {1})');
  assert.deepEqual(p1.titleVals, [1, 2030]);
  assert.equal(p1.start, '2029-06-01');
  assert.equal(p1.end, '2029-08-31');
});
