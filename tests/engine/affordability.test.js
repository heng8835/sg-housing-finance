import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affordability } from '../../app/engine/affordability.js';
import { policy } from '../helpers.js';

const household = { income: 9000, grants: 30000, loanType: 'hdb', tenure: 25 };

test('v1.8 fixture: Bishan 4R at S$720k', () => {
  const a = affordability({ ...household, price: 720000 }, policy);
  assert.equal(a.loan, 540000);
  assert.equal(a.down, 180000);
  assert.equal(Math.round(a.duty), 16200);
  assert.equal(Math.round(a.upfront), 166200);
  assert.equal(Math.round(a.msr * 100), 27);
});

test('v1.8 fixture: Punggol 5R at S$650k', () => {
  const a = affordability({ ...household, price: 650000 }, policy);
  assert.equal(Math.round(a.upfront), 146600);
  assert.equal(Math.round(a.msr * 100), 25);
});

test('grants are capped at downpayment + stamp duty', () => {
  const a = affordability({ ...household, price: 100000, grants: 999999 }, policy);
  assert.equal(a.upfront, 0);
});

test('without income there is no MSR and no max price', () => {
  const a = affordability({ ...household, income: null, price: 500000 }, policy);
  assert.equal(a.msr, null);
  assert.equal(a.maxPrice, null);
});

test('higher income never lowers the max price', () => {
  let prev = 0;
  for (let income = 2000; income <= 30000; income += 1000) {
    const { maxPrice } = affordability({ ...household, income, price: 500000 }, policy);
    assert.ok(maxPrice >= prev); prev = maxPrice;
  }
});

test('no NaN, Infinity or negative money values', () => {
  for (const price of [1, 150000, 500000, 1500000]) {
    for (const loanType of ['hdb', 'bank']) {
      const a = affordability({ ...household, price, loanType }, policy);
      for (const k of ['loan', 'down', 'monthly', 'duty', 'upfront', 'maxPrice']) {
        assert.ok(Number.isFinite(a[k]) && a[k] >= 0, `${k} for ${price}/${loanType}`);
      }
    }
  }
});

test('F1: MSR and max price are assessed at the HDB 3 % floor, not the 2.6 % loan rate', () => {
  const a = affordability({ ...household, price: 720000 }, policy);
  assert.equal(a.assessRate, 0.03);
  assert.equal(Math.round(a.monthly), 2450);          // what you actually pay
  assert.equal(Math.round(a.monthlyAssessed), 2561);  // what HDB tests against the cap
  assert.equal(Math.round(a.msrAssessed * 1000), 285);
  assert.equal(Math.round(a.maxPrice), 759155);       // v1.8 said S$793,529 (overstated ~4.3 %)
});

test('F1: bank loans are assessed at the 4 % floor', () => {
  const a = affordability({ ...household, price: 720000, loanType: 'bank' }, policy);
  assert.equal(a.assessRate, 0.04);
});

test('MSR exactly at the cap passes; a dollar less income fails', () => {
  const base = affordability({ ...household, price: 720000 }, policy);
  const atCap = base.monthlyAssessed / base.msrCap;
  assert.equal(affordability({ ...household, price: 720000, income: atCap }, policy).msrOk, true);
  assert.equal(affordability({ ...household, price: 720000, income: atCap - 1 }, policy).msrOk, false);
});

test('F7: HDB loan tenure is capped at 25 y', () => {
  const a = affordability({ ...household, price: 500000, tenure: 30 }, policy);
  assert.equal(a.tenure, 25);
  assert.equal(a.tenureCapped, true);
});

test('F7: bank loan on an HDB flat over 25 y drops to the 55 % LTV tier', () => {
  assert.equal(affordability({ ...household, price: 500000, loanType: 'bank', tenure: 25 }, policy).ltv, 0.75);
  const a = affordability({ ...household, price: 500000, loanType: 'bank', tenure: 30 }, policy);
  assert.equal(a.ltv, 0.55);
  assert.equal(a.tenureCapped, false);
});
