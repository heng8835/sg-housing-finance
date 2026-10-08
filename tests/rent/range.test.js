// Rent "Rent or buy?" Monte-Carlo range (Phase 6c): sentence, toggle, chart bands; core/mc.js main-thread
// fallback; Plan CPF range line (modules/plan/cpfrange.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeSentence, rangeNote, rangeToggle, rangeBlock } from '../../app/modules/rent/range.js';
import { chartModel, chartSvg, chartLabels, tipHtml } from '../../app/modules/rent/chart.js';
import { runMc, mcResult, MC_DRAWS_RENTBUY, MC_PERCENTILES, MC_OUTER_SHARE, MC_FLAG } from '../../app/core/mc.js';
import { rentBuyRange } from '../../app/engine/montecarlo.js';
import { rentVsBuy } from '../../app/engine/rentbuy.js';
import { buyerProjection } from '../../app/engine/cpfbuy.js';
import { planPurchase } from '../../app/engine/plan.js';
import { cpfRangeArgs, rangeText, rangeOn, cpfRangeToggle, cpfRangeSlots } from '../../app/modules/plan/cpfrange.js';
import { policy } from '../helpers.js';

const out = (p10, p90, share = 0.6, extra = {}) => ({ n: 2000, horizon: 10, buyAheadShare: share, bands: { diff: [null, { P10: p10, P90: p90 }] }, spread: { rateStep: 0 }, ...extra });

test('sentence: buying ahead, renting ahead, or a range that crosses zero', () => {
  assert.equal(MC_OUTER_SHARE, 80);
  assert.equal(rangeSentence(out(12000, 85000, 0.97)),
    'In 80% of 2,000 simulated futures, buying ends between S$12,000 and S$85,000 ahead of renting after 10 years. Buying comes out ahead in 97% of them.');
  assert.equal(rangeSentence(out(-90000, -5000, 0.02)),
    'In 80% of 2,000 simulated futures, renting ends between S$5,000 and S$90,000 ahead of buying after 10 years. Buying comes out ahead in 2% of them.');
  assert.equal(rangeSentence(out(-40000, 60000, 0.55)),
    'In 80% of 2,000 simulated futures, the result after 10 years ranges from renting S$40,000 ahead to buying S$60,000 ahead. Buying comes out ahead in 55% of them.');
  assert.equal(rangeSentence(null), '');
  assert.match(rangeNote({ spread: { rateStep: 0.005 } }), /bank loan rate drift/);
  assert.doesNotMatch(rangeNote({ spread: { rateStep: 0 } }), /bank loan/);
});

test('toggle and block: Pro-only, off by default, pending / error / done states', () => {
  assert.match(rangeToggle(false), /class="check pro-only rb-mc"/);
  assert.doesNotMatch(rangeToggle(false), /checked/);
  assert.match(rangeToggle(true), / checked/);
  assert.equal(rangeBlock('off', null), '');
  assert.match(rangeBlock('pending', null), /Simulating futures/);
  assert.match(rangeBlock('error', null), /could not be calculated/);
  assert.match(rangeBlock('done', out(1, 2)), /pro-only rb-mc-out/);
  assert.equal(MC_FLAG, 'plan.mcRange');
});

const x = { horizonYears: 10, buy: { price: 600000, flatType: '4 ROOM', loanType: 'bank', loanAmount: 450000, rate: 0.035, tenure: 25, upfrontCash: 30000, upfrontCpf: 135000, monthlyOwnerCosts: 300 }, rent: { monthlyRent: 2800 }, assumptions: { priceGrowth: 0.02 } };

test('chart: no bands → the deterministic model and SVG are unchanged; bands → polygons under the lines, axis covers them', () => {
  const res = rentVsBuy(x, policy), L = chartLabels();
  const plain = chartModel(res, 480, L);
  assert.deepEqual(chartModel(res, 480, L, null), plain);
  assert.equal(chartSvg(chartModel(res, 480, L, null), L, 'a'), chartSvg(plain, L, 'a'));
  assert.equal(plain.bands, null);
  assert.doesNotMatch(chartSvg(plain, L, 'a'), /rb-band/);

  const mc = rentBuyRange({ x }, policy, { n: 400, seed: 1, percentiles: MC_PERCENTILES });
  const m = chartModel(res, 480, L, mc.bands);
  assert.ok(m.bands.buy && m.bands.rent);
  assert.equal(m.bands.buy.outer.length, 2 * res.series.length);
  // same deterministic line values; only the axis may widen to fit the bands
  const hi = Math.max(...mc.bands.buy.map((r) => r.P90), ...mc.bands.rent.map((r) => r.P90));
  assert.ok(m.yAxis.hi >= hi);
  const svg = chartSvg(m, L, 'a');
  assert.equal((svg.match(/class="rb-band /g) || []).length, 4);
  assert.ok(svg.indexOf('rb-bands') < svg.indexOf('<polyline'), 'bands are drawn under the lines');
  // incomplete band rows are ignored rather than drawn
  assert.equal(chartModel(res, 480, L, { buy: mc.bands.buy.slice(1), rent: null }).bands, null);
});

test('tooltip: an 80% range line per series only when band rows are given', () => {
  const r = { year: 5, buyNetWorth: 300000, rentNetWorth: 250000 };
  assert.doesNotMatch(tipHtml(r), /futures/);
  const h = tipHtml(r, chartLabels(), { buy: { P10: 200000, P90: 400000 }, rent: { P10: 230000, P90: 270000 } });
  assert.match(h, /Buy: 80% of futures S\$200,000 to S\$400,000/);
  assert.match(h, /Rent and invest: 80% of futures S\$230,000 to S\$270,000/);
});

test('core/mc.js: without a Worker (node) runs on the main thread, same result as the engine, cached', async () => {
  const opts = { n: 300 };
  assert.equal(mcResult('rentbuy', { x }, opts), undefined);
  const a = await runMc('rentbuy', { x }, policy, opts);
  assert.deepEqual(a, rentBuyRange({ x }, policy, { n: 300, seed: a.seed, percentiles: MC_PERCENTILES }));
  assert.equal(mcResult('rentbuy', { x }, opts), a);
  assert.equal(runMc('rentbuy', { x }, policy, opts), runMc('rentbuy', { x }, policy, opts));
  assert.equal(MC_DRAWS_RENTBUY, 2000);
});

const household = { buyers: [{ age: 32, income: 4000, cpfOa: 40000, cpfSa: 15000, cpfMa: 10000, citizenship: 'SC', name: 'not sent' }], cash: 60000, loan: 'hdb', tenure: 25, firstTimer: true, propertiesOwned: 0, parents: 'none' };
const plan = planPurchase({ household, flat: { price: 550000, flatType: '4 ROOM', remainingLease: 80 } }, policy);

test('Plan CPF range: slim worker inputs give the same deterministic projection; text and switch', async () => {
  const full = { buyers: household.buyers, i: 0, plan, settings: { wageGrowth: 0.04 }, defaults: { wageGrowth: 0.03, bonusMonths: 1 }, year: 2026 };
  const slim = cpfRangeArgs(full);
  assert.equal(slim.buyers[0].name, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(slim)), slim, 'cloneable plain data');
  const a = buyerProjection(full, policy), b = buyerProjection(slim, policy);
  assert.equal(b.withBuy.at55.raFormed, a.withBuy.at55.raFormed);
  assert.equal(b.withBuy.life.monthly, a.withBuy.life.monthly);
  assert.equal(b.without.at55.raFormed, a.without.at55.raFormed);

  assert.equal(rangeText({ P10: 250000, P90: 310000 }), '80% of simulated futures: S$250,000 to S$310,000');
  assert.equal(rangeText({ P10: 3000.2, P90: 3000.4 }, true), '80% of simulated futures: S$3,000 a month');
  assert.equal(rangeText(null), '');
  assert.equal(rangeOn({ mcRange: true }), true);
  assert.equal(rangeOn({}), false);
  assert.match(cpfRangeToggle(false), /data-p="plan.mcRange" data-k="check"/);

  assert.equal(cpfRangeSlots(false, full, policy).slot('ra55'), '');
  const pending = cpfRangeSlots(true, full, policy).slot('ra55Buy');
  assert.match(pending, /aria-busy="true"/);
  // the job finishes on the main thread in node; the next render shows the range inline
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 200 && /aria-busy/.test(cpfRangeSlots(true, full, policy).slot('ra55Buy')); i++) await new Promise((r) => setTimeout(r, 20));
  assert.match(cpfRangeSlots(true, full, policy).slot('ra55Buy'), /80% of simulated futures: S\$[\d,]+ to S\$[\d,]+/);
});
