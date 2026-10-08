// Monte-Carlo ranges (Phase 6c, AC 11): seeded PRNG, percentile maths, consistency with the deterministic
// engines (zero spread → bands collapse onto rentVsBuy / buyerProjection exactly), speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, normal, gauss, logGrowth, percentile, runMany, memoPolicy,
  rentBuyRange, rentBuyDraws, rentBuySpread, cpfRange, cpfDraws, cpfSpread, RUNNERS,
} from '../../app/engine/montecarlo.js';
import { rentVsBuy, simulate } from '../../app/engine/rentbuy.js';
import { schedule } from '../../app/engine/amortisation.js';
import { buyerProjection } from '../../app/engine/cpfbuy.js';
import { planPurchase } from '../../app/engine/plan.js';
import { policy, mergedDoc } from '../helpers.js';

const P = [10, 25, 50, 75, 90];
const KEYS = P.map((p) => `P${p}`);
const buy = (over = {}) => ({
  price: 600000, flatType: '4 ROOM', loanType: 'hdb', loanAmount: 450000, rate: 0.026, tenure: 25,
  upfrontCash: 30000, upfrontCpf: 135000, monthlyCpf: 900, monthlyOwnerCosts: 300, ...over,
});
const X = (over = {}, b = {}) => ({ horizonYears: 15, buy: buy(b), rent: { monthlyRent: 3200 }, assumptions: { priceGrowth: 0.02 }, ...over });
const ZERO_RB = { priceGrowth: 0, rentGrowth: 0, investReturn: 0, rateStep: 0 };
const ZERO_CPF = { wageGrowth: { sd: 0, max_dev: 0 }, bonusMonths: { sd: 0, max_dev: 0 } };

test('mulberry32: same seed → same sequence, in [0, 1); another seed differs', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = Array.from({ length: 1000 }, a), sb = Array.from({ length: 1000 }, b), sc = Array.from({ length: 1000 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((u) => u >= 0 && u < 1));
  const mean = sa.reduce((s, v) => s + v, 0) / sa.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `uniform mean ${mean}`);
});

test('normal / gauss / logGrowth: moments, and sd 0 returns the mean exactly without using the PRNG', () => {
  const rng = mulberry32(7), z = Array.from({ length: 20000 }, () => normal(rng));
  const m = z.reduce((s, v) => s + v, 0) / z.length, sd = Math.sqrt(z.reduce((s, v) => s + (v - m) ** 2, 0) / z.length);
  assert.ok(Math.abs(m) < 0.03 && Math.abs(sd - 1) < 0.03, `N(0,1): mean ${m}, sd ${sd}`);
  let calls = 0;
  const counting = () => { calls++; return 0.5; };
  assert.equal(gauss(counting, 0.03, 0), 0.03);
  assert.equal(logGrowth(counting, 0.02, 0), 0.02);
  assert.equal(calls, 0);
  // log-normal growth keeps the arithmetic mean of (1 + g) and never goes below −100%
  const r2 = mulberry32(9), g = Array.from({ length: 40000 }, () => logGrowth(r2, 0.04, 0.1));
  const gm = g.reduce((s, v) => s + v, 0) / g.length;
  assert.ok(Math.abs(gm - 0.04) < 0.003, `mean growth ${gm}`);
  assert.ok(g.every((v) => v > -1));
});

test('percentile: linear interpolation between ranks', () => {
  const s = [1, 2, 3, 4, 5];
  assert.equal(percentile(s, 0), 1);
  assert.equal(percentile(s, 50), 3);
  assert.equal(percentile(s, 25), 2);
  assert.equal(percentile(s, 100), 5);
  assert.ok(Math.abs(percentile(s, 10) - 1.4) < 1e-12);
  assert.ok(Math.abs(percentile(s, 90) - 4.6) < 1e-12);
  assert.equal(percentile([10, 20], 50), 15);
  assert.equal(percentile([7], 90), 7);
  assert.equal(percentile([], 50), null);
});

test('runMany: per-index percentiles of a known distribution, reproducible, non-finite left out', () => {
  // model: series [u, 2u, NaN] for a uniform u → P10 ≈ 0.1, P90 ≈ 0.9; index 2 has no finite value → null
  const model = (_, d) => ({ s: [d.u, 2 * d.u, NaN] });
  const draws = (rng) => ({ u: rng() });
  const a = runMany(model, {}, draws, 5000, 1, { percentiles: P });
  assert.deepEqual(a, runMany(model, {}, draws, 5000, 1, { percentiles: P }));
  assert.equal(a.n, 5000);
  assert.ok(Math.abs(a.bands.s[0].P10 - 0.1) < 0.02 && Math.abs(a.bands.s[0].P90 - 0.9) < 0.02);
  assert.ok(Math.abs(a.bands.s[1].P50 - 1) < 0.04);
  assert.equal(a.bands.s[2], null);
  assert.ok(Math.abs(a.mean.s[0] - 0.5) < 0.02);
  for (const row of a.bands.s.slice(0, 2)) for (let i = 1; i < KEYS.length; i++) assert.ok(row[KEYS[i - 1]] <= row[KEYS[i]]);
});

test('rent vs buy: same seed → identical output; another seed differs', () => {
  const opts = { n: 300, seed: 11, percentiles: P };
  const a = rentBuyRange({ x: X({}, { loanType: 'bank', rate: 0.035 }) }, policy, opts);
  assert.deepEqual(a, rentBuyRange({ x: X({}, { loanType: 'bank', rate: 0.035 }) }, policy, opts));
  assert.notDeepEqual(a.bands, rentBuyRange({ x: X({}, { loanType: 'bank', rate: 0.035 }) }, policy, { ...opts, seed: 12 }).bands);
});

test('rent vs buy: zero spread → every percentile equals the deterministic rentVsBuy line exactly', () => {
  for (const [b, over] of [[{}, {}], [{ loanType: 'bank', rate: 0.04 }, { horizonYears: 30 }], [{ loanAmount: 0 }, { horizonYears: 5 }]]) {
    for (const scenario of [{ priceGrowth: -0.01 }, { priceGrowth: 0.04, investReturn: 0.06 }]) {
      const x = X({ ...over, assumptions: scenario }, b);
      const det = rentVsBuy(x, policy).series;
      const mc = rentBuyRange({ x, spread: ZERO_RB }, policy, { n: 25, seed: 3, percentiles: P });
      assert.equal(mc.bands.buy.length, det.length);
      det.forEach((r, t) => {
        for (const k of KEYS) {
          assert.equal(mc.bands.buy[t][k], r.buyNetWorth, `buy y${t} ${k}`);
          assert.equal(mc.bands.rent[t][k], r.rentNetWorth, `rent y${t} ${k}`);
          assert.equal(mc.bands.diff[t][k], r.buyNetWorth - r.rentNetWorth, `diff y${t} ${k}`);
        }
      });
      assert.equal(mc.buyAheadShare, det.at(-1).buyNetWorth >= det.at(-1).rentNetWorth ? 1 : 0);
    }
  }
});

test('rent vs buy: per-year paths with constant values match the constant run (path maths)', () => {
  const x = X({ horizonYears: 20 }, { loanType: 'bank', rate: 0.035 });
  const a = { priceGrowth: 0.03, rentGrowth: 0.02, investReturn: 0.05, sellCostRate: 0.02 };
  const flat = simulate(x, a, policy);
  const H = 20, arr = (v) => Array(H).fill(v);
  const path = simulate(x, { ...a, priceGrowth: arr(0.03), rentGrowth: arr(0.02), investReturn: arr(0.05), ratePath: arr(0.035) }, policy);
  flat.series.forEach((r, t) => {
    const p = path.series[t];
    for (const k of ['buyNetWorth', 'rentNetWorth', 'buyCashOut', 'rentCashOut']) assert.ok(Math.abs(p[k] - r[k]) <= 1e-6 * Math.max(1, Math.abs(r[k])), `${k} y${t}: ${p[k]} vs ${r[k]}`);
  });
  // a floating-rate loan whose rate never moves repays like the fixed schedule
  assert.ok(Math.abs(path.horizon.loanBalance - schedule(450000, 0.035, 25).rows[19].balance) < 0.01);
  // a rate that rises after year 1 costs more: higher instalments → less buyer net worth at the horizon
  const up = simulate(x, { ...a, ratePath: [0.035, ...Array(H - 1).fill(0.055)] }, policy);
  assert.ok(up.horizon.advantage < flat.horizon.advantage);
});

test('rent vs buy draws: HDB loan keeps a fixed rate, bank loan drifts (never below 0); spreads from policy', () => {
  const sH = rentBuySpread('hdb', policy), sB = rentBuySpread('bank', policy);
  assert.equal(sH.rateStep, 0);
  assert.ok(sB.rateStep > 0 && sH.priceGrowth > 0 && sH.rentGrowth > 0 && sH.investReturn > 0);
  const x = X({}, { loanType: 'bank', rate: 0.001 });
  const rng = mulberry32(5);
  const a = { priceGrowth: 0.02, rentGrowth: 0.02, investReturn: 0.04, sellCostRate: 0.02 };
  assert.equal(rentBuyDraws(rng, { x, assumptions: a, spread: sH }).ratePath, undefined);
  for (let i = 0; i < 200; i++) {
    const d = rentBuyDraws(rng, { x, assumptions: a, spread: { ...sB, rateStep: 0.01 } });
    assert.equal(d.ratePath.length, 15);
    assert.equal(d.ratePath[0], 0.001);
    assert.ok(d.ratePath.every((r) => r >= 0));
    assert.equal(d.priceGrowth.length, 15);
  }
});

test('rent vs buy: with the policy spreads the bands are ordered, widen with time and bracket the deterministic line', () => {
  const x = X({ horizonYears: 20 }, { loanType: 'bank', rate: 0.035 });
  const det = rentVsBuy(x, policy).series;
  const mc = rentBuyRange({ x }, policy, { n: 2000, seed: 20261007, percentiles: P });
  for (const k of ['buy', 'rent', 'diff']) {
    for (const row of mc.bands[k]) for (let i = 1; i < KEYS.length; i++) assert.ok(row[KEYS[i - 1]] <= row[KEYS[i]]);
    const w = (t) => mc.bands[k][t].P90 - mc.bands[k][t].P10;
    assert.ok(w(20) > w(1), `${k} widens`);
  }
  const end = mc.bands.diff[20], d = det[20].buyNetWorth - det[20].rentNetWorth;
  assert.ok(end.P10 < d && d < end.P90, `deterministic ${d} inside ${end.P10}..${end.P90}`);
  assert.ok(mc.buyAheadShare >= 0 && mc.buyAheadShare <= 1);
  assert.equal(mc.horizon, 20);
});

test('rent vs buy: 2,000 draws over 20 years run in under 1 s in node', () => {
  const x = X({ horizonYears: 20 }, { loanType: 'bank', rate: 0.035 });
  const t0 = performance.now();
  RUNNERS.rentbuy({ x }, policy, { n: 2000, seed: 1, percentiles: P });
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});

// ---------------------------------------------------------------- CPF
const household = { buyers: [{ age: 32, income: 4000, cpfOa: 40000, cpfSa: 15000, cpfMa: 10000, citizenship: 'SC' }, { age: 30, income: 3800, cpfOa: 30000, cpfSa: 12000, cpfMa: 9000, citizenship: 'PR' }], cash: 60000, loan: 'hdb', tenure: 25, firstTimer: true, propertiesOwned: 0, parents: 'none' };
const plan = planPurchase({ household, flat: { price: 550000, flatType: '4 ROOM', remainingLease: 80 } }, policy);
const DEF = { wageGrowth: 0.03, bonusMonths: 1 };

test('CPF: zero spread → RA at 55 and CPF LIFE equal buyerProjection exactly (with and without the purchase)', () => {
  for (const i of [0, 1]) {
    for (const settings of [{}, { wageGrowth: 0.045, bonusMonths: 2 }]) {
      const args = { buyers: household.buyers, i, plan, settings, defaults: DEF, year: 2026 };
      const det = buyerProjection(args, policy);
      const mc = cpfRange({ ...args, spread: ZERO_CPF }, policy, { n: 5, seed: 1, percentiles: P });
      for (const k of KEYS) {
        assert.equal(mc.bands.ra55[0][k], det.without.at55.raFormed);
        assert.equal(mc.bands.life[0][k], det.without.life.monthly);
        assert.equal(mc.bands.ra55Buy[0][k], det.withBuy.at55.raFormed);
        assert.equal(mc.bands.lifeBuy[0][k], det.withBuy.life.monthly);
      }
    }
  }
});

test('CPF: same seed → identical; draws stay inside mean ± max_dev, bonus never below 0; past 55 → no RA band', () => {
  const args = { buyers: household.buyers, i: 0, plan, settings: {}, defaults: DEF, year: 2026 };
  const opts = { n: 200, seed: 8, percentiles: P };
  const a = cpfRange(args, policy, opts);
  assert.deepEqual(a, cpfRange(args, policy, opts));
  for (let i = 1; i < KEYS.length; i++) assert.ok(a.bands.ra55Buy[0][KEYS[i - 1]] <= a.bands.ra55Buy[0][KEYS[i]]);
  assert.ok(a.bands.ra55Buy[0].P90 > a.bands.ra55Buy[0].P10, 'pay rise uncertainty spreads RA at 55 when it is below the cap');
  const s = cpfSpread(policy), rng = mulberry32(2);
  for (let i = 0; i < 2000; i++) {
    const d = cpfDraws(rng, { settings: { bonusMonths: 0.2 }, defaults: DEF, spread: s });
    assert.ok(d.wageGrowth >= DEF.wageGrowth - s.wageGrowth.max_dev - 1e-12 && d.wageGrowth <= DEF.wageGrowth + s.wageGrowth.max_dev + 1e-12);
    assert.ok(d.bonusMonths >= 0 && d.bonusMonths <= 0.2 + s.bonusMonths.max_dev + 1e-12);
  }
  const old = cpfRange({ buyers: [{ age: 60, income: 3000, cpfOa: 20000, cpfRa: 150000, citizenship: 'SC' }], i: 0, plan: null, settings: {}, defaults: DEF, year: 2026 }, policy, { n: 20, seed: 1, percentiles: P });
  assert.equal(old.bands.ra55[0], null);
  assert.equal(old.bands.ra55Buy[0], null);
});

test('memoPolicy gives the same values as the policy it wraps', () => {
  const m = memoPolicy(policy);
  for (const id of ['cpf.age.life_payout', 'rentbuy.default.price_growth', 'montecarlo.cpf.wage_growth']) assert.deepEqual(m.get(id), policy.get(id));
  assert.deepEqual(m.forYear(2030).get('cpf.age.life_payout'), policy.forYear(2030).get('cpf.age.life_payout'));
  assert.equal(memoPolicy(m), m);
  assert.throws(() => m.get('no.such.rule'), /no value/);
});

test('Monte-Carlo spreads are policy ASSUMPTION entries (illustrative, source "assumption", with a note)', () => {
  const rows = mergedDoc().params.filter((p) => p.id.startsWith('montecarlo.'));
  assert.deepEqual(rows.map((p) => p.id).sort(), [
    'montecarlo.cpf.bonus_months', 'montecarlo.cpf.wage_growth', 'montecarlo.rentbuy.invest_return_sd',
    'montecarlo.rentbuy.price_growth_sd', 'montecarlo.rentbuy.rate_step_sd', 'montecarlo.rentbuy.rent_growth_sd',
  ]);
  for (const p of rows) {
    assert.equal(p.status, 'ASSUMPTION', p.id);
    assert.equal(p.source_url, 'assumption', p.id);
    assert.match(p.note, /[Ii]llustrative/, p.id);
  }
});
