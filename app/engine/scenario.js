// Named scenarios (Phase 6b): a scenario is a snapshot of the INPUTS behind the Afford numbers — the flat,
// the whole household (incl. loan type and tenure), the Plan tab's CPF settings and the market rent behind the
// Annual Value estimate. Every number is recomputed here with the same engine calls as the Afford, Rent & Buy
// and Plan tabs; nothing computed is stored. Pure: the year, the rent-vs-buy horizon and the CPF modelling
// defaults come in as inputs. Also home of the Afford tab's monthly-cost input (shared, so both match).
import { planPurchase } from './plan.js';
import { monthlyCost } from './monthly-cost.js';
import { rentVsBuy, scenarios as rentBuyPresets } from './rentbuy.js';
import { raAt55WithPurchase } from './cpfbuy.js';
import { saleInput } from './salefunds.js';

/**
 * S&CC rate band. Town councils charge the reduced rate to a citizen household (policy
 * cost.scc.reduced_eligibility, read on a town council page); with no Singapore Citizen buyer the normal rate
 * applies. Buyers default to SC like engine/household. Private / commercial property interests (also -> normal)
 * have no household input, so they are explained in the S&CC text, not modelled.
 * @param {object} household
 * @param {{get:(id:string)=>any}} [policy]  without it the citizen condition is assumed (same rule)
 * @returns {'reduced'|'normal'}
 */
export function sccRateFor(household, policy = null) {
  const rule = policy ? policy.get('cost.scc.reduced_eligibility') : { citizen_household: true };
  if (!rule.citizen_household) return 'reduced';
  const cits = (household?.buyers || []).filter(Boolean).map((b) => b.citizenship || 'SC');
  return !cits.length || cits.includes('SC') ? 'reduced' : 'normal';
}

/**
 * engine/monthly-cost input for the chosen loan of a planPurchase() result. Annual Value only if the user typed
 * one; `market` = { rent } (typical monthly rent for this flat) lets the engine estimate it otherwise.
 */
export function costInput({ plan, focus, household, market = null, policy = null }) {
  const c = plan.chosen, hasLoan = c.tenure > 0 && c.loan > 0;
  const av = focus && Number.isFinite(focus.annualValue) && focus.annualValue > 0 ? focus.annualValue : null;
  const rent = market && Number.isFinite(market.rent) && market.rent > 0 ? market.rent : null;
  return {
    flatType: (focus && focus.flatType) || (plan.flat && plan.flat.flatType) || '4 ROOM', price: plan.price,
    loan: hasLoan ? { amount: c.loan, rate: c.rate, years: c.tenure } : { amount: 0, rate: 0, years: 0 },
    annualValue: av, ...(rent != null ? { marketMonthlyRent: rent } : {}), ownerOccupied: true, sccRate: sccRateFor(household, policy),
  };
}

/** planPurchase() flat input exactly as the Afford tab builds it from the focus / typical flat. parentsKm (S1a, B12):
 *  straight-line km to the tagged parents' place (core/parents.js parentsKmFor) — added only when known, like Afford's
 *  withParents, so without a tagged place the input is identical. */
export const flatInput = (f, parentsKm = null) => {
  const x = { price: f.price, flatType: f.flatType || '4 ROOM', remainingLease: f.remainingLease ?? null, cov: f.cov || 0 };
  return parentsKm == null ? x : { ...x, parentsKm };
};

// scope (typical flat: what the map showed) is kept so a loaded typical flat finds the same market rent again
const FOCUS_KEYS = ['source', 'bid', 'choiceId', 'label', 'price', 'flatType', 'sqm', 'remainingLease', 'cov', 'annualValue', 'scope'];
const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * Snapshot of the inputs behind the current Afford numbers (deep copies — later edits never change it).
 * @param {{ id:string, name:string, savedAt:string, flat:object, town?:string|null, household:object,
 *   plan?:{ cpf?:object, current?:object }|null, marketRent?:number|null }} x  flat = the focus flat, or the typical flat on screen;
 *   plan.current (the home you will sell, Phase 7a A2) is kept only while "I own a home now and will sell it" is ticked
 */
export function snapshotOf({ id, name, savedAt, flat, town = null, household, plan = null, marketRent = null }) {
  const focus = {};
  for (const k of FOCUS_KEYS) if (flat[k] !== undefined) focus[k] = copy(flat[k]);
  focus.isDefault = !!flat.isDefault;
  if (town) focus.town = town;
  return {
    id, name, savedAt, focus, household: copy(household),
    plan: { cpf: copy((plan && plan.cpf) || {}), ...(plan && plan.current && plan.current.owns ? { current: copy(plan.current) } : {}) },
    market: { rent: Number.isFinite(marketRent) && marketRent > 0 ? marketRent : null },
  };
}

/** The focus flat to put back on Load: a typical-flat snapshot becomes "your own figures" at the same price and type. */
export function focusFromSnapshot(s) {
  const { isDefault, town, ...f } = copy(s.focus) || {};
  return isDefault ? { ...f, source: 'price' } : f;
}

/** Rent vs buy exactly as the Rent & Buy tab runs it: base assumptions, the flat without COV, owner costs from monthlyCost(). */
export function rentBuyFor({ household, flat, rent, horizonYears }, policy) {
  if (!(flat && flat.price > 0) || !(rent > 0)) return null;
  const ft = flat.flatType || '4 ROOM';
  const plan = planPurchase({ household, flat: { price: flat.price, flatType: ft, remainingLease: flat.remainingLease ?? null } }, policy);
  const o = plan.chosen;
  const mc = monthlyCost({ flatType: ft, price: flat.price, loan: { amount: o.loan, rate: o.rate, years: o.tenure || 1 }, marketMonthlyRent: rent }, policy);
  const owner = mc.total - (mc.items.find((i) => i.id === 'mortgage')?.monthly || 0);
  return rentVsBuy({
    horizonYears,
    buy: { price: flat.price, flatType: ft, loanType: o.loanType, loanAmount: o.loan, rate: o.rate, tenure: o.tenure || 1, upfrontCash: o.funding.cashNeeded, upfrontCpf: o.funding.cpfUsed, monthlyOwnerCosts: owner },
    rent: { monthlyRent: rent }, assumptions: rentBuyPresets(policy).base,
  }, policy);
}

const oaKnown = (h) => ((h && h.buyers) || []).some((b) => b && b.cpfOa != null && b.cpfOa !== '');

/**
 * Every compare-table number for one scenario.
 * @param {object} s  a snapshotOf() result (or one read back from storage)
 * @param {{ year:number, horizonYears:number, cpfDefaults:{ wageGrowth:number, bonusMonths:number }, parentsKm?:number|null }} opts
 *   parentsKm = this flat's km to the parents' place (PHG per flat, as Afford); null / absent = no place tagged
 * @returns {{ price:number, loanType:string, upfront:{ net:number, cash:number, cpf:number }, monthly:number,
 *   msr:number|null, tdsr:number|null, verdict:string, monthlyCost:{ total:number, noTax:boolean }|null,
 *   oaLeft:number|null, cpf55:object|null, rentBuy:{ advantage:number, breakEvenYear:number|null, year:number }|null, plan:object }}
 */
export function scenarioResults(s, policy, { year, horizonYears, cpfDefaults, parentsKm = null }) {
  const h = s.household, f = s.focus;
  // the sale saved with the scenario (Plan → Sell then buy), counted exactly as Afford counts it (A2)
  const plan = planPurchase({ household: h, flat: flatInput(f, parentsKm), sale: saleInput(s.plan, year) }, policy);
  const c = plan.chosen, fund = c.funding;
  const rent = s.market && s.market.rent > 0 ? s.market.rent : null;
  let cost = null;
  try { cost = monthlyCost(costInput({ plan, focus: f, household: h, market: rent ? { rent } : null, policy }), policy); } catch { cost = null; }
  let rb = null;
  try { rb = rent ? rentBuyFor({ household: h, flat: f, rent, horizonYears }, policy) : null; } catch { rb = null; }
  let cpf = null;
  try { cpf = raAt55WithPurchase({ household: h, plan, settings: (s.plan && s.plan.cpf) || {}, defaults: cpfDefaults, year }, policy); } catch { cpf = null; }
  return {
    price: plan.price, loanType: c.loanType,
    upfront: { net: fund.net, cash: fund.cashNeeded, cpf: fund.cpfUsed },
    monthly: c.monthly,
    msr: plan.summary.income != null ? c.msrAssessed : null, tdsr: c.tdsr,
    verdict: plan.verdict.status,
    monthlyCost: cost ? { total: cost.total, noTax: cost.items.some((i) => i.id === 'property-tax' && i.monthly == null) } : null,
    // CPF OA + grants left after the upfront payment (grants unused at purchase stay in the OA)
    oaLeft: oaKnown(h) ? Math.max(0, plan.funds.cpfOa + plan.grants.total - fund.cpfUsed) : null,
    cpf55: cpf && cpf.total != null ? cpf : null,
    rentBuy: rb ? { advantage: rb.horizon.advantage, breakEvenYear: rb.breakEvenYear, year: rb.horizon.year } : null,
    plan,
  };
}
