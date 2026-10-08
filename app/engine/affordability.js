// Loan, instalment, upfront cost and income limits for one flat (BR-L1..L6, BR-T1).
// Pure: every rate and threshold comes from `policy.get(id)`.
import { pmt, pv } from './mortgage.js';
import { bsd } from './stamp-duty.js';

/**
 * Tenure actually allowed and the LTV that goes with it (BR-L1, BR-L6).
 * HDB loan: shortest of the HDB maximum, age cap − average age, remaining lease − buffer.
 * Bank loan: capped at the HDB-flat maximum; beyond the full-LTV tenure, or past the age cap,
 * LTV drops to the lower tier. (MAS uses income-weighted average age; we use the simple average.)
 */
export function loanTerms({ loanType, tenure, averageAge = null, remainingLease = null }, policy) {
  const ageCap = policy.get('tenure.age_cap');
  if (loanType === 'bank') {
    const used = Math.min(tenure, policy.get('tenure.bank.hdb_flat.max'));
    const pastAge = averageAge != null && averageAge + used > ageCap;
    const fullLtv = used <= policy.get('loan.bank.hdb_flat.full_ltv_max_tenure') && !pastAge;
    return { tenure: used, ltv: policy.get(fullLtv ? 'loan.bank.ltv' : 'loan.bank.ltv.lower_tier'), lowerTier: !fullLtv };
  }
  let used = Math.min(tenure, policy.get('tenure.hdb.max'));
  if (averageAge != null) used = Math.min(used, ageCap - averageAge);
  if (remainingLease != null) used = Math.min(used, remainingLease - policy.get('tenure.hdb.lease_buffer'));
  used = Math.max(0, Math.floor(used));
  return { tenure: used, ltv: used > 0 ? policy.get('loan.hdb.ltv') : 0, lowerTier: false };
}

/**
 * @param {{price:number, income?:number|null, grants?:number|null, loanType:'hdb'|'bank', tenure:number,
 *          averageAge?:number|null, remainingLease?:number|null}} input
 * @param {{get:(id:string)=>any}} policy
 */
export function affordability({ price, income, grants, loanType, tenure, averageAge = null, remainingLease = null }, policy) {
  const bank = loanType === 'bank';
  const rate = policy.get(bank ? 'assumption.rate.bank' : 'rate.hdb.concessionary');
  // MSR and the max loan are assessed at the higher of the actual rate and the regulatory floor (BR-L4).
  const assessRate = Math.max(rate, policy.get(bank ? 'rate.floor.bank' : 'rate.floor.hdb'));
  const msrCap = policy.get('ratio.msr.cap');
  const terms = loanTerms({ loanType, tenure, averageAge, remainingLease }, policy), ltv = terms.ltv;

  const loan = price * ltv, down = price - loan;
  const monthly = terms.tenure ? pmt(loan, rate, terms.tenure) : 0;
  const monthlyAssessed = terms.tenure ? pmt(loan, assessRate, terms.tenure) : 0;
  const duty = bsd(price, policy.get('stamp.bsd.bands'));
  const grantsUsed = Math.min(grants || 0, down + duty);
  const upfront = down + duty - grantsUsed;
  const msr = income ? monthly / income : null;
  const msrAssessed = income ? monthlyAssessed / income : null;
  // compared in cents so "exactly at the cap" passes despite floating-point noise
  const msrOk = income ? Math.round(monthlyAssessed * 100) <= Math.round(msrCap * income * 100) : null;
  const maxPrice = income && ltv ? pv(msrCap * income, assessRate, terms.tenure) / ltv : null;

  return {
    rate, assessRate, ltv, msrCap, tenure: terms.tenure, tenureCapped: terms.tenure < tenure, lowerTier: terms.lowerTier,
    loan, down, monthly, monthlyAssessed, duty, grants: grantsUsed, upfront, msr, msrAssessed, msrOk, maxPrice,
  };
}
