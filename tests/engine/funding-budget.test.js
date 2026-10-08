import { test } from 'node:test';
import assert from 'node:assert/strict';
import { funding } from '../../app/engine/funding.js';
import { budget, incomeLoanLimit } from '../../app/engine/budget.js';
import { schedule } from '../../app/engine/amortisation.js';
import { summarise } from '../../app/engine/household.js';
import { bsd } from '../../app/engine/stamp-duty.js';
import { policy, close } from '../helpers.js';

const bands = policy.get('stamp.bsd.bands');
const base = { price: 500000, loan: 375000, loanType: 'hdb', duty: bsd(500000, bands), fees: 3000, hdbFees: 200, cash: 50000, cpfOa: 100000 };

test('HDB loan: option fees + HDB fees are cash; the rest uses CPF first', () => {
  const f = funding(base, policy);
  // down 125,000 (5,000 cash-only option/exercise) + BSD 9,600 + legal 3,000 + HDB fees 200
  assert.equal(f.total, 137800);
  assert.equal(f.cpfUsed, 100000);
  assert.equal(f.cashNeeded, 37800);
  assert.equal(f.cashShort, 0);
});

test('bank loan: at least 5 % of the price in cash', () => {
  const f = funding({ ...base, loanType: 'bank', cash: 20000, cpfOa: 200000 }, policy);
  assert.equal(f.items.find((i) => i.id === 'down-cash').amount, 25000);
  assert.equal(f.cashShort, 5200); // 25,000 + 200 HDB fees − 20,000
});

test('grants join the CPF pool and reduce the net cost', () => {
  const f = funding({ ...base, grants: 80000 }, policy);
  assert.equal(f.net, 137800 - 80000);
  assert.equal(f.cashNeeded, 5200); // only the cash-only items remain
});

test('COV is cash only', () => {
  const f = funding({ ...base, cov: 20000, cpfOa: 1e6 }, policy);
  assert.equal(f.cashNeeded, 25200);
});

test('household summary adds buyers and ignores empty rows', () => {
  const s = summarise({ cash: 1000, buyers: [{ age: 30, income: 5000, cpfOa: 40000 }, { age: 34, income: 4000, cpfOa: 10000 }, {}] });
  assert.deepEqual([s.income, s.youngestAge, s.averageAge, s.cpfOa, s.funds], [9000, 30, 32, 50000, 51000]);
  assert.equal(summarise({ buyers: [{}] }).income, null);
});

test('amortisation: principal repaid exactly, interest = payments − loan', () => {
  const s = schedule(540000, 0.026, 25);
  assert.equal(s.rows.length, 25);
  assert.ok(close(s.rows.reduce((t, r) => t + r.principal, 0), 540000, 0.01));
  assert.ok(close(s.totalInterest, s.monthly * 300 - 540000, 1));
  assert.ok(close(s.rows.at(-1).balance, 0, 0.01));
  for (let i = 1; i < s.rows.length; i++) assert.ok(s.rows[i].balance < s.rows[i - 1].balance);
});

const hh = { income: 9000, otherDebts: 0, loanType: 'hdb', tenure: 25, averageAge: 32, cash: 50000, cpfOa: 100000, grants: 0, fees: 3000, hdbFees: 200 };

test('budget: max price is feasible and S$1,000 more is not', () => {
  const b = budget(hh, policy);
  const check = (p) => funding({ price: p, loan: Math.min(b.ltv * p, b.loanLimit), loanType: 'hdb', duty: bsd(p, bands), fees: 3000, hdbFees: 200, cash: 50000, cpfOa: 100000 }, policy).cashShort === 0;
  assert.ok(check(b.maxPrice));
  assert.ok(!check(b.maxPrice + 1000));
});

test('budget: names the binding constraint', () => {
  assert.equal(budget({ ...hh, cash: 1e6 }, policy).binding, 'income');
  assert.equal(budget({ ...hh, cash: 10000, cpfOa: 20000 }, policy).binding, 'funds');
});

test('budget: more income or more cash never lowers the max price', () => {
  let prev = 0;
  for (let income = 3000; income <= 20000; income += 1000) { const m = budget({ ...hh, income }, policy).maxPrice; assert.ok(m >= prev); prev = m; }
  prev = 0;
  for (let cash = 0; cash <= 300000; cash += 25000) { const m = budget({ ...hh, cash }, policy).maxPrice; assert.ok(m >= prev); prev = m; }
});

test('bank loan income limit uses TDSR when other debts are large', () => {
  const noDebt = incomeLoanLimit({ income: 10000, otherDebts: 0, loanType: 'bank', tenure: 25 }, policy);
  const heavy = incomeLoanLimit({ income: 10000, otherDebts: 3000, loanType: 'bank', tenure: 25 }, policy);
  assert.ok(heavy < noDebt); // 55 % × 10k − 3k = 2.5k < MSR 3k
});
