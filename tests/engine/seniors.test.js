import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seniorOptions, lbsRetainOptions, lbsTopUp, lbsBonus, shbBonus, flexiLease, isThreeRoomOrSmaller } from '../../app/engine/seniors.js';
import { policy } from '../helpers.js';

const SC = (age, o = {}) => ({ age, citizenship: 'SC', ...o });
const base = (o = {}) => ({ owners: [SC(68), SC(66)], income: 3000, flatType: '4 ROOM', remainingLease: 55, ...o });
const pick = (x, option) => seniorOptions(x, policy).find((r) => r.option === option);
const numbersIn = (v, out = []) => {
  if (typeof v === 'number') out.push(v);
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
};

test('returns all six options, in a stable order', () => {
  assert.deepEqual(seniorOptions(base(), policy).map((r) => r.option), ['stay', 'rent-room', 'lbs', 'shb', 'cca', 'flexi']);
});

test('LBS age edge: every owner must be at least the minimum age', () => {
  const min = policy.get('seniors.lbs.min_age');
  assert.equal(pick(base({ owners: [SC(min), SC(min + 1)] }), 'lbs').eligible, true);
  const young = pick(base({ owners: [SC(min + 2), SC(min - 1)] }), 'lbs');
  assert.equal(young.eligible, false);
  assert.match(young.why[0], /All owners/);
  assert.equal(pick(base({ owners: [SC(70), { citizenship: 'SC' }] }), 'lbs').eligible, false);
});

test('LBS citizenship and income edges', () => {
  assert.equal(pick(base({ owners: [SC(70, { citizenship: 'PR' })] }), 'lbs').eligible, false);
  assert.equal(pick(base({ owners: [SC(70, { citizenship: 'PR' }), SC(68)] }), 'lbs').eligible, true);
  const ceiling = policy.get('seniors.lbs.income_ceiling');
  assert.equal(pick(base({ income: ceiling }), 'lbs').eligible, true);
  assert.equal(pick(base({ income: ceiling + 1 }), 'lbs').eligible, false);
  const noIncome = pick(base({ income: null }), 'lbs');
  assert.equal(noIncome.eligible, true);
  assert.ok(noIncome.notes.some((n) => /Income not entered/.test(n)));
});

test('LBS lease retention options by youngest age, limited by the remaining lease', () => {
  assert.deepEqual(lbsRetainOptions(65, null, policy), [30, 35]);
  assert.deepEqual(lbsRetainOptions(72, null, policy), [25, 30, 35]);
  assert.deepEqual(lbsRetainOptions(80, null, policy), [15, 20, 25, 30, 35]);
  assert.deepEqual(lbsRetainOptions(65, 32, policy), [30]);
  assert.deepEqual(lbsRetainOptions(64, null, policy), []);
  const short = pick(base({ owners: [SC(66)], remainingLease: 30 }), 'lbs');
  assert.equal(short.eligible, false);
  assert.match(short.why[0], /Not enough lease/);
});

test('LBS RA top-up requirement: sole vs joint owners, by age, net of RA balance', () => {
  assert.equal(lbsTopUp([SC(70, { raBalance: 10000 })], policy).total, 210400 - 10000);
  const joint = lbsTopUp([SC(66), SC(81)], policy);
  assert.deepEqual(joint.perOwner, [110200, 100200]);
  assert.equal(joint.raAssumedZero, true);
  assert.equal(lbsTopUp([SC(70, { raBalance: 300000 })], policy).total, 0);
  assert.deepEqual(lbsTopUp([SC(66), SC(68)], policy, 100000).perOwner, [60200, 60200]);
});

test('LBS bonus: full at S$60k of top-ups, pro-rated S$1 per S$2 / S$4 / S$8', () => {
  assert.deepEqual(lbsBonus('3 ROOM', 60000, policy), { max: 30000, amount: 30000 });
  assert.equal(lbsBonus('2 ROOM', 20000, policy).amount, 10000);
  assert.equal(lbsBonus('4 ROOM', 30000, policy).amount, 7500);
  assert.equal(lbsBonus('5 ROOM', 40000, policy).amount, 5000);
  assert.equal(lbsBonus('EXECUTIVE', 200000, policy).amount, 7500);
  const r = pick(base(), 'lbs');
  assert.equal(r.cashNow, null);
  assert.equal(r.bonusMax, 15000);
});

test('SHB eligibility: an SC owner aged 55+, income, next flat size, private Annual Value', () => {
  const min = policy.get('seniors.shb.min_age');
  assert.equal(pick(base({ owners: [SC(min)] }), 'shb').eligible, true);
  assert.equal(pick(base({ owners: [SC(min - 1)] }), 'shb').eligible, false);
  assert.equal(pick(base({ owners: [SC(min - 1), SC(70, { citizenship: 'PR' })] }), 'shb').eligible, false);
  assert.equal(pick(base({ owners: [SC(min - 1), SC(min + 5)] }), 'shb').eligible, true);
  const ceiling = policy.get('seniors.shb.income_ceiling');
  assert.equal(pick(base({ income: ceiling }), 'shb').eligible, true);
  assert.equal(pick(base({ income: ceiling + 1 }), 'shb').eligible, false);
  assert.equal(pick(base({ nextFlatType: '4 ROOM' }), 'shb').eligible, false);
  assert.equal(pick(base({ nextFlatType: '3 ROOM' }), 'shb').eligible, true);
  const av = policy.get('seniors.shb.private_av_max');
  assert.equal(pick(base({ currentIsPrivate: true, annualValue: av }), 'shb').eligible, true);
  assert.equal(pick(base({ currentIsPrivate: true, annualValue: av + 1 }), 'shb').eligible, false);
});

test('SHB bonus: pro-rated to the RA increase, +S$10k for 2-room or smaller, capped at S$40k', () => {
  assert.equal(shbBonus({ raTopUp: 30000, nextFlatType: '3 ROOM' }, policy).amount, 15000);
  assert.equal(shbBonus({ raTopUp: 60000, nextFlatType: '2 ROOM' }, policy).amount, 40000);
  assert.equal(shbBonus({ raTopUp: 200000, nextFlatType: 'CCA' }, policy).amount, 40000);
  assert.equal(shbBonus({ raTopUp: 0, nextFlatType: '2-room flexi' }, policy).amount, 10000);
  const est = pick(base({ marketValue: 500000, nextFlatPrice: 460000, nextFlatType: '3 ROOM' }), 'shb');
  assert.equal(est.raTopUp, 40000);
  assert.equal(est.cashNow, 20000);
  assert.equal(pick(base({ owners: [SC(50)] }), 'shb').cashNow, 0);
});

test('CCA: age 55 from the October 2026 exercise; flexi lease covers the youngest to 95', () => {
  const min = policy.get('seniors.cca.min_age');
  assert.equal(pick(base({ owners: [SC(min), SC(min + 1)] }), 'cca').eligible, true);
  assert.equal(pick(base({ owners: [SC(min - 1), SC(70)] }), 'cca').eligible, false);
  assert.equal(flexiLease(55, policy), 40);
  assert.equal(flexiLease(62, policy), 35);
  assert.equal(flexiLease(80, policy), 15);
  assert.equal(flexiLease(88, policy), 15);
  assert.equal(flexiLease(45, policy), null);
  assert.equal(pick(base({ owners: [SC(60), SC(54)] }), 'flexi').eligible, false);
  assert.equal(pick(base({ owners: [SC(60), SC(58)] }), 'flexi').leaseYears, 40);
});

test('flat-size helper used by SHB', () => {
  assert.equal(isThreeRoomOrSmaller('3 ROOM'), true);
  assert.equal(isThreeRoomOrSmaller('2-ROOM FLEXI'), true);
  assert.equal(isThreeRoomOrSmaller('4 ROOM'), false);
});

test('never NaN: empty and junk inputs; no owners → not eligible for schemes', () => {
  const empty = seniorOptions({}, policy);
  assert.equal(empty.find((r) => r.option === 'lbs').eligible, false);
  assert.equal(empty.find((r) => r.option === 'stay').eligible, true);
  const junk = seniorOptions({ owners: [{ age: 'x' }, null], income: 'abc', remainingLease: '', raBalance: 'n/a', marketValue: 'y' }, policy);
  for (const n of numbersIn([empty, junk])) assert.ok(!Number.isNaN(n));
});
