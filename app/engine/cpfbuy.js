// CPF with and without a purchase, per buyer — the Plan tab's "CPF & retirement" cards and the scenario
// compare table both use these calls, so they always show the same numbers. Pure: the year and the
// modelling defaults (pay rise, bonus) come in as inputs.
import { simulate } from './cpf.js';

/** CPF residency of a buyer: 'SC', 'PR1' | 'PR2' | 'PR3+' (Plan tab "Year as PR", else from prYears3Plus), 'F'. */
export const residencyOf = (b, prYear) => (b.citizenship === 'F' ? 'F' : b.citizenship === 'PR' ? (prYear || (b.prYears3Plus === false ? 'PR2' : 'PR3+')) : 'SC');

/** Share of the purchase each buyer's OA carries: upfront by OA balance, instalments by income. */
export function housingShares(buyers, i, plan) {
  if (!plan) return null;
  const o = plan.chosen;
  const oaTotal = buyers.reduce((s, b) => s + (+b.cpfOa || 0), 0);
  const incTotal = buyers.reduce((s, b) => s + (+b.income || 0), 0);
  const b = buyers[i];
  const upShare = oaTotal > 0 ? (+b.cpfOa || 0) / oaTotal : 1 / buyers.length;
  const mShare = incTotal > 0 ? (+b.income || 0) / incTotal : 1 / buyers.length;
  return { oaUpfront: o.funding.cpfUsed * upShare, monthlyFromOa: (o.monthly || 0) * mShare, tenure: o.tenure || 0 };
}

/**
 * Already at the CPF LIFE payout age (Phase 7 A10)? Then payouts may have started: no work / RA-at-55 projection —
 * the buyer may enter the monthly payout received (`buyer.cpfLifeMonthly`, optional).
 */
export const atPayoutAge = (b, policy) => !!b && +b.age > 0 && +b.age >= policy.get('cpf.age.life_payout');

/** The CPF LIFE monthly payout a buyer entered (S$, ≥ 0), or null when blank. */
export const enteredPayout = (b) => (b && b.cpfLifeMonthly != null && b.cpfLifeMonthly !== '' && Number.isFinite(+b.cpfLifeMonthly) ? Math.max(0, +b.cpfLifeMonthly) : null);

/** Buyers the Plan tab projects (age above 0), with their index in household.buyers. */
export const projectedBuyers = (h) => ((h && h.buyers) || []).map((b, i) => ({ b, i })).filter(({ b }) => b && +b.age > 0);

/**
 * One buyer's projection to the CPF LIFE payout age, without and (with a plan) with the purchase.
 * @param {{ buyers:object[], i:number, plan:object|null, settings?:{ wageGrowth?:number|null, bonusMonths?:number|null, prYear?:object },
 *   defaults:{ wageGrowth:number, bonusMonths:number }, year:number }} x
 * @returns {{ residency:string, without:object, withBuy:object|null, share:object|null }}
 */
export function buyerProjection({ buyers, i, plan, settings = {}, defaults, year }, policy) {
  const b = buyers[i], age = +b.age;
  const residency = residencyOf(b, (settings.prYear && settings.prYear[i]) ?? null);
  const A65 = policy.get('cpf.age.life_payout');
  const base = {
    startAge: age, endAge: Math.max(age, A65), startYear: year, residency,
    balances: { oa: +b.cpfOa || 0, sa: +b.cpfSa || 0, ma: +b.cpfMa || 0, ra: +b.cpfRa || 0 },
    wage: { monthly: +b.income || 0, growth: settings.wageGrowth ?? defaults.wageGrowth, bonusMonths: settings.bonusMonths ?? defaults.bonusMonths, untilAge: A65 },
  };
  // this year: today's rules; later years: the rules in force on 1 Jan of that year
  const perYear = (y) => (y <= year ? policy : policy.forYear(y));
  const without = simulate(base, perYear);
  if (!without.applicable) return { residency, without, withBuy: null, share: null };
  const share = housingShares(buyers, i, plan);
  const withBuy = share ? simulate({ ...base, housing: { oaUpfront: share.oaUpfront, monthlyFromOa: share.monthlyFromOa, untilAge: age + share.tenure } }, perYear) : null;
  return { residency, without, withBuy, share };
}

/**
 * Retirement Account formed at 55 if the household buys: the sum over buyers who reach 55 in the projection.
 * @returns {{ total:number|null, buyers:{ i:number, ra:number|null, reason:'foreigner'|'past55'|'noplan'|null }[] }}
 */
export function raAt55WithPurchase({ household, plan, settings = {}, defaults, year }, policy) {
  const all = household.buyers || [];
  const rows = projectedBuyers(household).map(({ i }) => {
    const p = buyerProjection({ buyers: all, i, plan, settings, defaults, year }, policy);
    if (!p.without.applicable) return { i, ra: null, reason: 'foreigner' };
    if (!p.withBuy) return { i, ra: null, reason: 'noplan' };
    const r = p.withBuy.at55;
    return { i, ra: r ? r.raFormed : null, reason: r ? null : 'past55' };
  });
  const vals = rows.map((r) => r.ra).filter((v) => v != null);
  return { total: vals.length ? vals.reduce((s, v) => s + v, 0) : null, buyers: rows };
}
