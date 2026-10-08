import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentVsBuy, scenarios, mopYears, schemeOf } from '../../app/engine/rentbuy.js';
import { schedule } from '../../app/engine/amortisation.js';
import { policy, close } from '../helpers.js';

const buy = {
  price: 600000, flatType: '4 ROOM', loanType: 'hdb', loanAmount: 450000, rate: 0.026, tenure: 25,
  upfrontCash: 30000, upfrontCpf: 135000, monthlyOwnerCosts: 300,
};
const input = (over = {}) => ({ horizonYears: 15, buy, rent: { monthlyRent: 3200 }, ...over });
const finite = (r) => r.series.every((s) => ['buyNetWorth', 'rentNetWorth', 'buyCashOut', 'rentCashOut'].every((k) => Number.isFinite(s[k])));

test('scenario presets come from policy', () => {
  const s = scenarios(policy);
  assert.deepEqual(Object.keys(s), ['pessimistic', 'base', 'optimistic']);
  assert.equal(s.base.priceGrowth, 0.02);
  assert.equal(s.pessimistic.priceGrowth, -0.01);
  assert.equal(s.optimistic.priceGrowth, 0.04);
  assert.equal(s.base.investReturn, 0.04);
  assert.equal(s.base.rentGrowth, 0.02);
});

test('series shape, year 0 and loan balance from the amortisation schedule', () => {
  const r = rentVsBuy(input(), policy);
  assert.equal(r.series.length, 16);
  assert.ok(finite(r));
  const y0 = r.series[0];
  assert.ok(close(y0.buyNetWorth, 600000 * (1 - 0.02) - 450000));
  assert.ok(close(y0.rentNetWorth, 165000));
  assert.ok(close(y0.buyCashOut, 165000));
  assert.ok(close(r.horizon.loanBalance, schedule(450000, 0.026, 25).rows[14].balance));
  assert.ok(close(r.series[1].rentCashOut, 3200 * 12));
  assert.ok(close(r.series[2].rentCashOut, 3200 * 12 * 1.02));
});

test('zero growth: renting wins when rent is far below interest + owner costs', () => {
  const r = rentVsBuy(input({ rent: { monthlyRent: 500 }, assumptions: { priceGrowth: 0, rentGrowth: 0, investReturn: 0.04 } }), policy);
  assert.ok(r.series.slice(1).every((s) => s.rentNetWorth > s.buyNetWorth));
  assert.equal(r.breakEvenYear, null);
  assert.ok(r.horizon.advantage < 0);
});

test('break-even is detected when rent is high and prices grow', () => {
  const r = rentVsBuy(input({ horizonYears: 20, rent: { monthlyRent: 3500 }, assumptions: { priceGrowth: 0.03, investReturn: 0.03 } }), policy);
  assert.ok(r.breakEvenYear != null && r.breakEvenYear >= 1);
  const row = r.series[r.breakEvenYear];
  assert.ok(row.buyNetWorth >= row.rentNetWorth);
  const prev = r.series[r.breakEvenYear - 1];
  assert.ok(r.breakEvenYear === 1 || prev.buyNetWorth < prev.rentNetWorth);
});

test('monotonic: higher price growth never lowers buy net worth', () => {
  const growths = [-0.03, -0.01, 0, 0.01, 0.02, 0.04, 0.06];
  const runs = growths.map((g) => rentVsBuy(input({ assumptions: { priceGrowth: g } }), policy));
  for (let i = 1; i < runs.length; i++) {
    runs[i].series.forEach((s, t) => assert.ok(s.buyNetWorth >= runs[i - 1].series[t].buyNetWorth - 1e-6, `g=${growths[i]} year ${t}`));
  }
});

test('sensitivity grid is priceGrowth × investReturn and ordered along price growth', () => {
  const r = rentVsBuy(input(), policy);
  assert.deepEqual(r.grid.priceGrowth, [-0.01, 0, 0.02, 0.04]);
  assert.deepEqual(r.grid.investReturn, [0.02, 0.04, 0.06]);
  assert.equal(r.grid.cells.length, 4);
  for (const row of r.grid.cells) assert.equal(row.length, 3);
  for (let j = 0; j < 3; j++) for (let i = 1; i < 4; i++) assert.ok(r.grid.cells[i][j].advantage >= r.grid.cells[i - 1][j].advantage);
  // base cell matches the main run
  assert.ok(close(r.grid.cells[2][1].advantage, r.horizon.advantage));
});

test('CPF: refund = CPF used + accrued OA interest, returned to OA, capped at proceeds', () => {
  const r = rentVsBuy(input({ horizonYears: 10, buy: { ...buy, monthlyCpf: 1000 } }), policy);
  const used = 135000 + 1000 * 12 * 10;
  assert.ok(close(r.horizon.cpfUsed, used));
  assert.ok(r.horizon.cpfAccruedInterest > 0);
  const owed = r.horizon.cpfUsed + r.horizon.cpfAccruedInterest;
  assert.ok(close(r.horizon.cpfRefund, Math.min(owed, r.horizon.homeValue - r.horizon.sellCosts - r.horizon.loanBalance)));
  // year-1 OA growth for the renter's CPF at 2.5%
  const r1 = rentVsBuy(input({ horizonYears: 1, rent: { monthlyRent: 0 }, buy: { ...buy, monthlyOwnerCosts: 0, upfrontCash: 0 } }), policy);
  assert.ok(close(r1.horizon.renterCpf, 135000 * 1.025));
  // underwater sale: refund capped, shortfall flagged
  const down = rentVsBuy(input({ horizonYears: 6, assumptions: { priceGrowth: -0.1 } }), policy);
  assert.ok(down.horizon.cpfShortfall > 0);
  assert.ok(down.flags.some((f) => /CPF refund/.test(f)));
});

test('MOP: 5 years standard, 10 for Plus/Prime, flag when horizon is shorter', () => {
  assert.equal(mopYears('standard', policy), 5);
  assert.equal(mopYears('plus', policy), 10);
  assert.equal(mopYears('prime', policy), 10);
  assert.equal(schemeOf({ flatType: 'PRIVATE' }), 'private');
  const short = rentVsBuy(input({ horizonYears: 3 }), policy);
  assert.equal(short.mop.years, 5);
  assert.equal(short.mop.horizonBeforeMop, true);
  assert.ok(short.flags.some((f) => /Minimum Occupation Period/.test(f)));
  const plus = rentVsBuy(input({ horizonYears: 8, buy: { ...buy, scheme: 'plus' } }), policy);
  assert.equal(plus.mop.horizonBeforeMop, true);
  assert.equal(rentVsBuy(input({ horizonYears: 8 }), policy).mop.horizonBeforeMop, false);
});

test('no NaN on sparse or odd input', () => {
  const r = rentVsBuy({ horizonYears: 5, buy: { price: 500000 }, rent: {} }, policy);
  assert.ok(finite(r));
  assert.ok(r.grid.cells.flat().every((c) => Number.isFinite(c.advantage)));
  const r2 = rentVsBuy({ horizonYears: 30, buy: { ...buy, tenure: 25 }, rent: { monthlyRent: 2800 }, assumptions: { priceGrowth: '', investReturn: null } }, policy);
  assert.ok(finite(r2));
  assert.equal(r2.horizon.loanBalance, 0);
  assert.equal(r2.series[30].buyCashOut, 300 * 12);
});
