// Rent vs buy over a horizon (phase 3). Pure: every rule and default comes from policy (rentbuy.*).
//
// Model (annual steps, flows at year end):
// - Both households start with the same resources: the buyer's upfront cash + CPF.
// - Buyer: those go into the home; each year pays instalments (part may be CPF) + owner costs.
//   Net worth = home value × (1 − selling costs) − loan balance + any side investments.
//   On a sale, CPF used + accrued OA interest is refunded to OA (not cash), capped at net proceeds.
// - Renter: invests the upfront cash at investReturn; the upfront CPF (and any CPF the buyer would
//   have used for instalments) stays in OA earning the OA rate — the CPF opportunity cost.
// - Each year whoever pays less in cash invests the difference at investReturn.
// - Monte-Carlo (engine/montecarlo.js): priceGrowth / rentGrowth / investReturn may be per-year arrays (index
//   year − 1) and `ratePath` a per-year loan rate; plain numbers take exactly the deterministic code path.
import { schedule } from './amortisation.js';
import { pmt } from './mortgage.js';

const num = (v) => (Number.isFinite(+v) ? +v : 0);
/** Rate in year t: a constant, or a per-year path (index t − 1). */
const rateAt = (v, t) => (Array.isArray(v) ? v[Math.min(t, v.length) - 1] : v);
/** Growth factor over t years: (1 + g)^t for a constant, the product of the first t years for a path. */
function growthFactor(v, t) {
  if (!Array.isArray(v)) return Math.pow(1 + v, t);
  let f = 1;
  for (let i = 1; i <= t; i++) f *= 1 + rateAt(v, i);
  return f;
}

/** Loan repaid monthly: fixed rate (the amortisation schedule), or a yearly rate path (instalment re-set each year on the balance left). */
function loanOf(loanAmount, rate, tenure, ratePath) {
  if (!Array.isArray(ratePath)) {
    const s = schedule(loanAmount, rate, tenure);
    return { years: s.rows.length, monthlyAt: () => s.monthly, balanceAt: (t) => s.rows[t - 1].balance };
  }
  const rows = [];
  let balance = loanAmount;
  for (let y = 1; y <= tenure; y++) {
    const r = rateAt(ratePath, y), monthly = pmt(balance, r, tenure - y + 1);
    for (let m = 1; m <= 12; m++) balance -= y === tenure && m === 12 ? balance : monthly - balance * (r / 12);
    rows.push({ monthly, balance: Math.max(0, balance) });
  }
  return { years: tenure, monthlyAt: (t) => rows[t - 1].monthly, balanceAt: (t) => rows[t - 1].balance };
}

/**
 * Preset assumption sets, one per price-growth scenario (pessimistic / base / optimistic).
 * @returns {Record<string, {priceGrowth:number, rentGrowth:number, investReturn:number, sellCostRate:number}>}
 */
export function scenarios(policy) {
  const common = {
    rentGrowth: policy.get('rentbuy.default.rent_growth'),
    investReturn: policy.get('rentbuy.default.invest_return'),
    sellCostRate: policy.get('rentbuy.default.sell_cost_rate'),
  };
  const growth = policy.get('rentbuy.default.price_growth');
  return Object.fromEntries(Object.entries(growth).map(([name, priceGrowth]) => [name, { priceGrowth, ...common }]));
}

/** Housing scheme for the MOP lookup: explicit `scheme`, else 'private' for a private flatType, else 'standard'. */
export function schemeOf(buy) {
  if (buy.scheme) return String(buy.scheme).toLowerCase();
  return /^(PRIVATE|CONDO|EC)/i.test(String(buy.flatType || '')) ? 'private' : 'standard';
}

/** Minimum Occupation Period in years for a scheme ('standard' | 'plus' | 'prime' | 'private'). */
export function mopYears(scheme, policy) {
  const table = policy.get('rentbuy.mop.years');
  return scheme in table ? table[scheme] : table.standard;
}

/** Assumptions for a run: the base scenario, overridden by any finite x.assumptions. */
export function resolveAssumptions(x, policy) {
  const assumptions = { ...scenarios(policy).base };
  for (const [k, v] of Object.entries(x.assumptions || {})) if (Number.isFinite(+v) && v !== null && v !== '') assumptions[k] = +v;
  return assumptions;
}

/**
 * One run for one assumption set (rentVsBuy's main line; engine/montecarlo.js calls it once per draw).
 * `a` = { priceGrowth, rentGrowth, investReturn, sellCostRate, ratePath? }; the first three may be per-year arrays.
 */
export function simulate(x, a, policy) {
  const buy = x.buy || {}, horizon = Math.max(1, Math.floor(num(x.horizonYears)));
  const oaRate = policy.get('rentbuy.cpf.oa_rate');
  const price = num(buy.price), loanAmount = num(buy.loanAmount), tenure = Math.floor(num(buy.tenure));
  const upfrontCash = num(buy.upfrontCash), upfrontCpf = num(buy.upfrontCpf);
  const sched = loanAmount > 0 && tenure > 0 ? loanOf(loanAmount, num(buy.rate), tenure, a.ratePath) : null;
  const instalment = sched ? sched.monthlyAt(1) : 0;
  const ownerCosts = num(buy.monthlyOwnerCosts), rent0 = num((x.rent || {}).monthlyRent);
  const balanceAt = (t) => (!sched ? 0 : t === 0 ? loanAmount : t > sched.years ? 0 : sched.balanceAt(t));

  let rentPot = upfrontCash, rentCpf = upfrontCpf, buyPot = 0, cpfUsed = upfrontCpf, cpfOwed = upfrontCpf;
  const position = (t) => {
    const homeValue = price * growthFactor(a.priceGrowth, t), loanBalance = balanceAt(t);
    const sellCosts = homeValue * a.sellCostRate, equity = homeValue - sellCosts - loanBalance;
    const cpfRefund = Math.min(cpfOwed, Math.max(0, equity));
    return { homeValue, loanBalance, sellCosts, equity, cpfRefund, cashProceeds: equity - cpfRefund };
  };

  const p0 = position(0);
  const series = [{ year: 0, buyNetWorth: p0.equity, rentNetWorth: rentPot + rentCpf, buyCashOut: upfrontCash + upfrontCpf, rentCashOut: 0 }];
  let last = p0;
  for (let t = 1; t <= horizon; t++) {
    const paying = sched && t <= sched.years;
    const monthly = paying ? sched.monthlyAt(t) : 0;
    const buyCpf = paying ? Math.min(num(buy.monthlyCpf), monthly) * 12 : 0;
    const buyCash = ((paying ? monthly : 0) + ownerCosts) * 12 - buyCpf;
    const rentCash = rent0 * growthFactor(a.rentGrowth, t - 1) * 12;

    const inv = rateAt(a.investReturn, t);
    rentPot *= 1 + inv; buyPot *= 1 + inv;
    rentCpf = rentCpf * (1 + oaRate) + buyCpf;           // renter keeps that CPF in OA
    cpfOwed = cpfOwed * (1 + oaRate) + buyCpf;           // buyer's refund liability: principal + accrued interest
    cpfUsed += buyCpf;
    const diff = buyCash - rentCash;
    if (diff > 0) rentPot += diff; else buyPot -= diff;

    last = position(t);
    series.push({ year: t, buyNetWorth: last.equity + buyPot, rentNetWorth: rentPot + rentCpf, buyCashOut: buyCash + buyCpf, rentCashOut: rentCash });
  }
  const end = series[series.length - 1];
  const be = series.find((r) => r.year >= 1 && r.buyNetWorth >= r.rentNetWorth);
  return {
    series, breakEvenYear: be ? be.year : null,
    horizon: {
      year: horizon, buyNetWorth: end.buyNetWorth, rentNetWorth: end.rentNetWorth, advantage: end.buyNetWorth - end.rentNetWorth,
      homeValue: last.homeValue, loanBalance: last.loanBalance, sellCosts: last.sellCosts, buyInvestments: buyPot,
      cpfUsed, cpfRefund: last.cpfRefund, cpfAccruedInterest: cpfOwed - cpfUsed, cashProceeds: last.cashProceeds,
      cpfShortfall: Math.max(0, cpfOwed - last.cpfRefund), renterCpf: rentCpf, renterInvestments: rentPot,
    },
    instalment,
  };
}

/**
 * Rent vs buy over `horizonYears`.
 * @param {{ horizonYears:number,
 *           buy:{ price:number, flatType?:string, scheme?:'standard'|'plus'|'prime'|'private', loanType?:'hdb'|'bank',
 *                 loanAmount:number, rate:number, tenure:number, upfrontCash:number, upfrontCpf:number,
 *                 monthlyCpf?:number, monthlyOwnerCosts?:number },
 *           rent:{ monthlyRent:number },
 *           assumptions?:{ priceGrowth?:number, rentGrowth?:number, investReturn?:number, sellCostRate?:number } }} x
 *   upfrontCash/upfrontCpf: everything paid at purchase (downpayment, stamp duty, fees) by source.
 *   monthlyCpf: part of the instalment paid from CPF OA (refundable with accrued interest on sale).
 *   monthlyOwnerCosts: property tax, S&CC/maintenance, insurance, repairs (e.g. monthlyCost() total less the instalment).
 * @returns {{ series:{year:number, buyNetWorth:number, rentNetWorth:number, buyCashOut:number, rentCashOut:number}[],
 *             breakEvenYear:number|null, horizon:object, assumptions:object, instalment:number,
 *             mop:{ scheme:string, years:number, horizonBeforeMop:boolean, breakEvenBeforeMop:boolean },
 *             grid:{ priceGrowth:number[], investReturn:number[], cells:{priceGrowth:number, investReturn:number, advantage:number, breakEvenYear:number|null}[][] },
 *             flags:string[] }}
 */
export function rentVsBuy(x, policy) {
  const assumptions = resolveAssumptions(x, policy);
  const run = simulate(x, assumptions, policy);

  const scheme = schemeOf(x.buy || {}), mop = mopYears(scheme, policy);
  const horizonBeforeMop = run.horizon.year < mop;
  const breakEvenBeforeMop = run.breakEvenYear != null && run.breakEvenYear < mop;
  const flags = [];
  if (horizonBeforeMop) flags.push(`The flat cannot be sold on the open market before its ${mop}-year Minimum Occupation Period; a ${run.horizon.year}-year horizon is not a real option for buying.`);
  if (breakEvenBeforeMop) flags.push(`Buying pulls ahead in year ${run.breakEvenYear}, but the flat cannot be sold until year ${mop} (MOP).`);
  if (scheme === 'private') flags.push('Seller\'s Stamp Duty on an early sale of private property is not included.');
  if (run.horizon.cpfShortfall > 0) flags.push('Sale proceeds do not cover the full CPF refund (principal + accrued interest); the shortfall stays unrefunded to CPF.');

  const rows = policy.get('rentbuy.sensitivity.price_growth'), cols = policy.get('rentbuy.sensitivity.invest_return');
  const cells = rows.map((priceGrowth) => cols.map((investReturn) => {
    const r = simulate(x, { ...assumptions, priceGrowth, investReturn }, policy);
    return { priceGrowth, investReturn, advantage: r.horizon.advantage, breakEvenYear: r.breakEvenYear };
  }));

  return {
    series: run.series, breakEvenYear: run.breakEvenYear, horizon: run.horizon, assumptions, instalment: run.instalment,
    mop: { scheme, years: mop, horizonBeforeMop, breakEvenBeforeMop },
    grid: { priceGrowth: rows, investReturn: cols, cells },
    flags,
  };
}
