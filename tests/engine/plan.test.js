import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPurchase, hdbLoanEligibility } from '../../app/engine/plan.js';
import { policy } from '../helpers.js';

const hh = (o = {}) => ({
  scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0,
  cash: 60000, grantsOverride: null,
  buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 30, income: 4000, citizenship: 'SC', cpfOa: 40000 }], ...o,
});
const flat = { price: 600000, flatType: '4 ROOM', remainingLease: 80 };

test('typical SC couple: plan returns both loans, a budget and a verdict', () => {
  const p = planPurchase({ household: hh(), flat }, policy);
  assert.equal(p.options.length, 2);
  assert.equal(p.chosen.loanType, 'hdb');
  assert.ok(['ok', 'tight'].includes(p.verdict.status), p.verdict.reasons.join(' / '));
  assert.ok(p.budget.maxPrice > 0);
  assert.equal(p.grants.items.find((i) => i.id === 'chg').amount, 80000);
  assert.equal(p.chosen.stress.length, 2);
  assert.ok(p.chosen.stress[1].monthly > p.chosen.stress[0].monthly);
});

test('PR + PR household: no HDB loan → switched to bank, no grants, PR ABSD', () => {
  const pr = hh({ buyers: [{ age: 35, income: 6000, citizenship: 'PR', cpfOa: 50000 }, { age: 35, income: 6000, citizenship: 'PR', cpfOa: 50000 }] });
  const p = planPurchase({ household: pr, flat }, policy);
  assert.equal(hdbLoanEligibility(pr, policy).ok, false);
  assert.equal(p.chosen.loanType, 'bank');
  assert.equal(p.switchedToBank, true);
  assert.equal(p.grants.total, 0);
  assert.equal(p.absd.rate, 0.05);
});

test('income above the ceiling → HDB loan not eligible', () => {
  assert.equal(hdbLoanEligibility(hh({ buyers: [{ age: 30, income: 17000, citizenship: 'SC' }] }), policy).ok, false);
});

test('unknown income or funds → verdict unknown, never NaN', () => {
  const p = planPurchase({ household: hh({ cash: null, buyers: [{ age: 30, citizenship: 'SC' }] }), flat }, policy);
  assert.equal(p.verdict.status, 'unknown');
  assert.ok(Number.isFinite(p.chosen.loan));
});

test('not enough cash → verdict no with the shortfall', () => {
  const p = planPurchase({ household: hh({ cash: 0, buyers: [{ age: 30, income: 9000, citizenship: 'SC', cpfOa: 10000 }] }), flat }, policy);
  assert.equal(p.verdict.status, 'no');
  assert.match(p.verdict.reasons.join(' '), /Short of/);
});

test('lease below the CPF minimum → no', () => {
  const p = planPurchase({ household: hh(), flat: { ...flat, remainingLease: 15 } }, policy);
  assert.equal(p.verdict.status, 'no');
});

test('foreigners cannot buy HDB resale → verdict no, eligibility reason first', () => {
  const f = hh({ buyers: [{ age: 30, income: 9000, citizenship: 'F', nationality: 'other', pass: 'EP' }] });
  const p = planPurchase({ household: f, flat }, policy);
  assert.equal(p.verdict.status, 'no');
  assert.match(p.verdict.reasons[0], /can't buy an HDB resale flat/);
});
