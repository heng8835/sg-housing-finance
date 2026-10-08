// Monte-Carlo ranges (Phase 6c, AC 11 / roadmap CPF-12): many simulated futures → P10…P90 per year.
// Pure: randomness only from a seeded PRNG passed in (same seed → same output), every spread from policy
// (montecarlo.* — ASSUMPTION entries, illustrative), draw count / seed / percentiles from the caller (UI
// constants in core/mc.js). The deterministic numbers are untouched: with every spread at zero each draw is
// exactly the deterministic run (rentbuy.simulate / cpfbuy.buyerProjection), so the bands collapse onto it.
import { simulate as rentBuyOnce, resolveAssumptions } from './rentbuy.js';
import { buyerProjection } from './cpfbuy.js';

// ---------------------------------------------------------------- random numbers

/**
 * mulberry32 — small, fast 32-bit seeded PRNG; returns a function giving uniforms in [0, 1).
 * The hex values are the published algorithm's bit constants, not policy values.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 0xF), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 0x7), t | 0x3D);
    return ((t ^ (t >>> 0xE)) >>> 0) / 0x100000000;
  };
}

/** Standard normal (Box–Muller, cosine half). */
export function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Normal draw; sd ≤ 0 → exactly `mean` (no random number used). */
export const gauss = (rng, mean, sd) => (sd > 0 ? mean + sd * normal(rng) : mean);

/**
 * Yearly growth rate with a log-normal factor: E[1 + g] = 1 + mean, never below −100%. `sd` is the spread of
 * ln(1 + g). sd ≤ 0 → exactly `mean`.
 */
export const logGrowth = (rng, mean, sd) => (sd > 0 ? Math.exp(Math.log1p(mean) - (sd * sd) / 2 + sd * normal(rng)) - 1 : mean);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- statistics

/** p-th percentile (0–100) of an ascending array, linear interpolation between ranks; [] → null. */
export function percentile(sorted, p) {
  const n = sorted.length;
  if (!n) return null;
  const r = (clamp(p, 0, 100) / 100) * (n - 1), lo = Math.floor(r), hi = Math.ceil(r);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (r - lo);
}

/**
 * Run `model` n times and summarise every output series by percentile.
 * @param {(inputs:object, draw:object) => Record<string, number[]>} model  one future → named series (e.g. per year)
 * @param {object} inputs
 * @param {(rng:() => number, inputs:object) => object} draws  the random inputs of one future
 * @param {number} n number of futures
 * @param {number} seed PRNG seed
 * @param {{ percentiles:number[] }} opts e.g. [10, 25, 50, 75, 90] (non-finite outputs are left out)
 * @returns {{ n:number, seed:number, percentiles:number[],
 *   bands:Record<string, (Record<string, number>|null)[]>, mean:Record<string, (number|null)[]> }}
 *   bands.buy[t] = { P10, P25, … } for index t; null where no draw gave a finite value.
 */
export function runMany(model, inputs, draws, n, seed, { percentiles }) {
  const runs = Math.max(1, Math.floor(n)), rng = mulberry32(seed), out = [];
  for (let i = 0; i < runs; i++) out.push(model(inputs, draws(rng, inputs)));
  const bands = {}, mean = {};
  for (const k of Object.keys(out[0])) {
    bands[k] = []; mean[k] = [];
    for (let t = 0; t < out[0][k].length; t++) {
      const col = out.map((r) => r[k][t]).filter(Number.isFinite).sort((a, b) => a - b);
      bands[k].push(col.length ? Object.fromEntries(percentiles.map((p) => [`P${p}`, percentile(col, p)])) : null);
      mean[k].push(col.length ? col.reduce((s, v) => s + v, 0) / col.length : null);
    }
  }
  return { n: runs, seed, percentiles: percentiles.slice(), bands, mean };
}

/**
 * Policy wrapper that remembers get() / forYear() results — the CPF projection asks the same ids thousands of
 * times per future. Values are fixed for a resolved policy, so results are identical, only faster.
 */
export function memoPolicy(policy) {
  if (policy.memo) return policy;
  const vals = new Map(), years = new Map();
  return {
    ...policy, memo: true,
    get(id) { if (!vals.has(id)) vals.set(id, policy.get(id)); return vals.get(id); },
    forYear(y) { if (!years.has(y)) years.set(y, memoPolicy(policy.forYear(y))); return years.get(y); },
  };
}

// ---------------------------------------------------------------- rent vs buy

/** Spreads for rent vs buy (policy montecarlo.rentbuy.*); the loan-rate step depends on the loan type. */
export function rentBuySpread(loanType, policy) {
  const step = policy.get('montecarlo.rentbuy.rate_step_sd');
  return {
    priceGrowth: policy.get('montecarlo.rentbuy.price_growth_sd'),
    rentGrowth: policy.get('montecarlo.rentbuy.rent_growth_sd'),
    investReturn: policy.get('montecarlo.rentbuy.invest_return_sd'),
    rateStep: loanType === 'bank' ? step.bank : step.hdb,
  };
}

const years = (x) => Math.max(1, Math.floor(+x.horizonYears || 0));

/** Random inputs of one rent-vs-buy future: per-year paths for every variable with a spread above zero. */
export function rentBuyDraws(rng, { x, assumptions: a, spread: s }) {
  const H = years(x), path = (fn) => Array.from({ length: H }, fn);
  const d = { ...a };
  if (s.priceGrowth > 0) d.priceGrowth = path(() => logGrowth(rng, a.priceGrowth, s.priceGrowth));
  if (s.rentGrowth > 0) d.rentGrowth = path(() => logGrowth(rng, a.rentGrowth, s.rentGrowth));
  if (s.investReturn > 0) d.investReturn = path(() => logGrowth(rng, a.investReturn, s.investReturn));
  const buy = x.buy || {};
  if (s.rateStep > 0 && +buy.loanAmount > 0) {
    // year 1 at today's rate, then a random walk (never below 0)
    let r = +buy.rate || 0;
    d.ratePath = path((_, i) => (i === 0 ? r : (r = Math.max(0, gauss(rng, r, s.rateStep)))));
  }
  return d;
}

/** One rent-vs-buy future → net worth per year (index = year). */
export function rentBuyModel({ x, policy }, d) {
  const S = rentBuyOnce(x, d, policy).series;
  return { buy: S.map((r) => r.buyNetWorth), rent: S.map((r) => r.rentNetWorth), diff: S.map((r) => r.buyNetWorth - r.rentNetWorth) };
}

/**
 * Rent vs buy over many futures. `x` = the rentVsBuy() input (its assumptions are the means).
 * @param {{ x:object, spread?:object }} args spread overrides the policy spreads (tests: zero spread)
 * @param {{ n:number, seed:number, percentiles:number[] }} opts
 * @returns runMany() result + { buyAheadShare } = share of futures where buying ends ahead (diff ≥ 0) at the horizon
 */
export function rentBuyRange({ x, spread }, policy, opts) {
  const pol = memoPolicy(policy);
  const inputs = { x, policy: pol, assumptions: resolveAssumptions(x, pol), spread: spread || rentBuySpread((x.buy || {}).loanType, pol) };
  const model = (inp, d) => { const m = rentBuyModel(inp, d); return { ...m, ahead: [m.diff[m.diff.length - 1] >= 0 ? 1 : 0] }; };
  const { bands: { ahead, ...bands }, mean, ...res } = runMany(model, inputs, rentBuyDraws, opts.n, opts.seed, opts);
  return { ...res, bands, mean: { buy: mean.buy, rent: mean.rent, diff: mean.diff }, horizon: years(x), spread: inputs.spread, buyAheadShare: mean.ahead[0] };
}

// ---------------------------------------------------------------- CPF

/** Spreads for the CPF projection (policy montecarlo.cpf.*). CPF interest and contribution rules are fixed by rule. */
export function cpfSpread(policy) {
  return { wageGrowth: policy.get('montecarlo.cpf.wage_growth'), bonusMonths: policy.get('montecarlo.cpf.bonus_months') };
}

/** Random inputs of one CPF future: one career-average pay rise and one bonus, each within mean ± max_dev. */
export function cpfDraws(rng, { settings = {}, defaults, spread: s }) {
  const g = settings.wageGrowth ?? defaults.wageGrowth, b = settings.bonusMonths ?? defaults.bonusMonths;
  const pick = (mean, p) => (p.sd > 0 ? clamp(gauss(rng, mean, p.sd), mean - p.max_dev, mean + p.max_dev) : mean);
  return { wageGrowth: pick(g, s.wageGrowth), bonusMonths: Math.max(0, pick(b, s.bonusMonths)) };
}

/** One CPF future for one buyer → RA formed at 55 and CPF LIFE monthly, without and with the purchase. */
export function cpfModel({ args, policy }, d) {
  const p = buyerProjection({ ...args, settings: { ...(args.settings || {}), wageGrowth: d.wageGrowth, bonusMonths: d.bonusMonths } }, policy);
  const ra = (r) => (r && r.at55 ? r.at55.raFormed : NaN), life = (r) => (r && r.life ? r.life.monthly : NaN);
  return { ra55: [ra(p.without)], life: [life(p.without)], ra55Buy: [ra(p.withBuy)], lifeBuy: [life(p.withBuy)] };
}

/**
 * CPF projection over many futures for one buyer.
 * @param {{ buyers:object[], i:number, plan:object|null, settings?:object, defaults:object, year:number, spread?:object }} args
 *   same as cpfbuy.buyerProjection (+ spread override)
 */
export function cpfRange({ spread, ...args }, policy, opts) {
  const pol = memoPolicy(policy);
  const inputs = { args, policy: pol, settings: args.settings, defaults: args.defaults, spread: spread || cpfSpread(pol) };
  return { ...runMany(cpfModel, inputs, cpfDraws, opts.n, opts.seed, opts), spread: inputs.spread };
}

/** Named runners for the Web Worker (engine/mc.worker.js) and the main-thread fallback (core/mc.js). */
export const RUNNERS = { rentbuy: rentBuyRange, cpf: cpfRange };
