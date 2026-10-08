// "Most you can pay": the highest price where (a) the loan stays within the income limits tested at
// the floor rate (MSR; plus TDSR for bank loans) and (b) cash + CPF OA + grants cover everything
// else, respecting cash-only items. Pure; policy passed in.
import { pv } from './mortgage.js';
import { bsd, absd as absdFor } from './stamp-duty.js';
import { loanTerms } from './affordability.js';
import { funding } from './funding.js';

/** Largest loan the income supports, tested at the floor rate. null when income is unknown. */
export function incomeLoanLimit({ income, otherDebts = 0, loanType, tenure }, policy) {
  if (!income || !tenure) return null;
  const bank = loanType === 'bank';
  const rate = policy.get(bank ? 'assumption.rate.bank' : 'rate.hdb.concessionary');
  const assessRate = Math.max(rate, policy.get(bank ? 'rate.floor.bank' : 'rate.floor.hdb'));
  let monthlyCap = policy.get('ratio.msr.cap') * income;
  if (bank) monthlyCap = Math.min(monthlyCap, policy.get('ratio.tdsr.cap') * income - (otherDebts || 0));
  return Math.max(0, pv(Math.max(0, monthlyCap), assessRate, tenure));
}

/**
 * @param {{ income:number|null, otherDebts?:number, loanType:'hdb'|'bank', tenure:number, averageAge?:number|null,
 *           remainingLease?:number|null, cash:number, cpfOa:number, grants?:number, absdRate?:number, fees?:number, hdbFees?:number,
 *           fundsKnown?:boolean, mustUse?:number }} x
 *   mustUse = sale money that must go in before an HDB loan (engine/salefunds.js secondLoanCap): loan ≤ price − mustUse
 * @returns {{ maxPrice:number|null, binding:'income'|'funds'|null, loanLimit:number|null, ltv:number, tenure:number,
 *             incomeOnlyPrice:number|null }}
 */
export function budget(x, policy) {
  const terms = loanTerms(x, policy);
  const loanLimit = terms.ltv ? incomeLoanLimit({ ...x, tenure: terms.tenure }, policy) : 0;
  const incomeOnlyPrice = loanLimit != null && terms.ltv ? loanLimit / terms.ltv : null;
  if (x.fundsKnown === false) return { maxPrice: incomeOnlyPrice, binding: incomeOnlyPrice == null ? null : 'income', loanLimit, ltv: terms.ltv, tenure: terms.tenure, incomeOnlyPrice };

  const bands = policy.get('stamp.bsd.bands');
  const capAt = (p) => (x.mustUse > 0 ? Math.max(0, p - x.mustUse) : Infinity);
  const loanAt = (p) => Math.min(terms.ltv * p, loanLimit == null ? 0 : loanLimit, capAt(p));
  const feasible = (p) => funding({
    price: p, loan: loanAt(p), loanType: x.loanType, lowerTier: terms.lowerTier, duty: bsd(p, bands),
    absd: absdFor(p, x.absdRate || 0), fees: x.fees || 0, hdbFees: x.hdbFees || 0, grants: x.grants || 0, cash: x.cash || 0, cpfOa: x.cpfOa || 0,
  }, policy).cashShort === 0;

  let lo = 0, hi = 1;
  while (feasible(hi) && hi < 1e9) hi *= 2;
  while (hi - lo > 1) { const mid = (lo + hi) / 2; if (feasible(mid)) lo = mid; else hi = mid; }
  const maxPrice = Math.floor(lo);
  const binding = loanLimit != null && Math.min(terms.ltv * maxPrice, capAt(maxPrice)) > loanLimit + 1 ? 'income' : 'funds';
  return { maxPrice, binding, loanLimit, ltv: terms.ltv, tenure: terms.tenure, incomeOnlyPrice };
}
