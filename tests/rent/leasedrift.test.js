// 7c C8 Monte-Carlo honesty: lease-decay drift for old leases (a labelled UI assumption in modules/rent/range.js),
// a collapsed range is hidden, and the share is never shown as "100%". The deterministic line is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaseDrift, rangeCollapsed, rangeSentence, rangeNote, rangeBlock, LEASE_DRIFT_FROM, COLLAPSE_SHARE } from '../../app/modules/rent/range.js';
import { rentBuyRange, rentBuyDraws, mulberry32 } from '../../app/engine/montecarlo.js';
import { rentVsBuy, resolveAssumptions } from '../../app/engine/rentbuy.js';
import { MC_PERCENTILES } from '../../app/core/mc.js';
import { policy } from '../helpers.js';

const opts = { n: 600, seed: 7, percentiles: MC_PERCENTILES };
// an old flat bought with an HDB loan vs renting a whole flat: without any lease effect buying wins in every future
const x = { horizonYears: 10, buy: { price: 300000, flatType: '3 ROOM', loanType: 'hdb', loanAmount: 200000, rate: 0.026, tenure: 20, upfrontCash: 20000, upfrontCpf: 80000, monthlyOwnerCosts: 200 }, rent: { monthlyRent: 1400 }, assumptions: { priceGrowth: 0.03 } };

test('leaseDrift: none for a long or unknown lease; about −2% a year at 50 years left; the value reaches 0 with the lease', () => {
  assert.equal(LEASE_DRIFT_FROM, 60);
  assert.equal(leaseDrift(null, 10), null);
  assert.equal(leaseDrift(0, 10), null);
  assert.equal(leaseDrift(95, 10), null);
  assert.equal(leaseDrift(LEASE_DRIFT_FROM + 10, 10), null); // stays at 60+ years over the horizon
  const d = leaseDrift(50, 10);
  assert.equal(d.length, 10);
  assert.ok(Math.abs(d[0] - (49 / 50 - 1)) < 1e-12);
  assert.ok(d.every((v, i) => i === 0 || v < d[i - 1]), 'faster as the lease shortens');
  const kept = leaseDrift(50, 10).reduce((f, v) => f * (1 + v), 1);
  assert.ok(Math.abs(kept - 40 / 50) < 1e-12, 'value ∝ years left');
  const end = leaseDrift(5, 10).reduce((f, v) => f * (1 + v), 1);
  assert.equal(end, 0);
  const crossing = leaseDrift(65, 10); // 65 → 55: drift only after it passes 60
  assert.equal(crossing[4], 0);
  assert.ok(crossing[5] < 0);
});

test('engine: without leaseDrift the draws and the result are exactly as before', () => {
  const a = resolveAssumptions(x, policy), spread = { priceGrowth: 0.05, rentGrowth: 0.04, investReturn: 0.1, rateStep: 0 };
  const d1 = rentBuyDraws(mulberry32(3), { x, assumptions: a, spread });
  const d2 = rentBuyDraws(mulberry32(3), { x, assumptions: a, spread, leaseDrift: null });
  assert.deepEqual(d1, d2);
  assert.deepEqual(rentBuyRange({ x }, policy, opts).bands, rentBuyRange({ x, leaseDrift: null }, policy, opts).bands);
  // zero spread + drift: the price path is exactly mean growth × lease factor
  const zero = { priceGrowth: 0, rentGrowth: 0, investReturn: 0, rateStep: 0 }, drift = leaseDrift(50, 20);
  const dz = rentBuyDraws(mulberry32(3), { x, assumptions: a, spread: zero, leaseDrift: drift });
  assert.ok(Math.abs(dz.priceGrowth[0] - ((1 + a.priceGrowth) * (49 / 50) - 1)) < 1e-12);
});

test('a 50-year lease flat is no longer "100%": the drift lowers buying and the sentence never says 100%', () => {
  const plain = rentBuyRange({ x }, policy, opts);
  assert.equal(plain.buyAheadShare, 1, 'fixture: without the lease effect buying always wins');
  const old = rentBuyRange({ x, leaseDrift: leaseDrift(50, x.horizonYears) }, policy, opts);
  const last = (o) => o.bands.buy[o.bands.buy.length - 1].P50;
  assert.ok(last(old) < last(plain), 'the old lease ends lower');
  assert.ok(old.buyAheadShare < plain.buyAheadShare);
  for (const o of [plain, old]) assert.doesNotMatch(rangeSentence(o), /100%/);
  assert.match(rangeSentence(plain), /almost all of them/);
  assert.match(rangeNote(old), /lose value in step with its lease/);
  assert.doesNotMatch(rangeNote(plain), /lease/);
  // the deterministic answer (verdict, line, table) does not take the drift: same numbers as before
  assert.equal(rentVsBuy(x, policy).series.at(-1).buyNetWorth, rentVsBuy({ ...x }, policy).series.at(-1).buyNetWorth);
});

test('a range that collapses is hidden; edges are said in words', () => {
  const band = (p10, p50, p90) => ({ P10: p10, P25: p50, P50: p50, P75: p50, P90: p90 });
  const flat = { n: 100, horizon: 10, buyAheadShare: 1, spread: { rateStep: 0 }, bands: { buy: [band(5e5, 5e5, 5e5)], rent: [band(3e5, 3e5, 3e5)], diff: [band(2e5, 2e5, 2e5 + 1)] } };
  assert.equal(rangeCollapsed(flat), true);
  assert.match(rangeBlock('done', flat), /barely differ/);
  assert.doesNotMatch(rangeBlock('done', flat), /simulated futures, buying/);
  const wide = { ...flat, bands: { ...flat.bands, diff: [band(1e5, 2e5, 2e5 + COLLAPSE_SHARE * 5e5 * 2)] } };
  assert.equal(rangeCollapsed(wide), false);
  assert.equal(rangeCollapsed(null), false);
  assert.match(rangeSentence({ ...wide, buyAheadShare: 0.001 }), /almost none of them/);
  assert.match(rangeSentence({ ...wide, buyAheadShare: 0.64 }), /in 64% of them/);
});
