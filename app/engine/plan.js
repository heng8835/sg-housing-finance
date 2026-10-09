// One flat, one household: everything the Afford tab shows, computed in one pure call.
// Orchestrates the other engines; adds HDB-loan eligibility, TDSR, stress tests and a verdict.
// Phase 7a: the sale of the home you own now (A2, engine/salefunds.js), the smallest loan that fits (A3), short-lease
// "up to" figures (A4 — pro-ration formulas not published, policy *.short_lease_proration null) and no cash
// shortfall before the cash is known (A11).
import { summarise } from './household.js';
import { grants, absdRate } from './grants.js';
import { affordability } from './affordability.js';
import { funding } from './funding.js';
import { budget } from './budget.js';
import { schedule } from './amortisation.js';
import { pmt } from './mortgage.js';
import { absd } from './stamp-duty.js';
import { coversToAge } from './lease.js';
import { pathways } from './eligibility.js';
import { saleFunds, secondLoanCap } from './salefunds.js';

const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;

/**
 * HDB loan: at least one Singapore Citizen buyer (status UNVERIFIED in research — shown as a note)
 * and household income within the ceiling (BR-E1/E2).
 */
export function hdbLoanEligibility(h, policy) {
  const s = summarise(h), why = [];
  if (!s.citizenships.includes('SC')) why.push('An HDB loan needs at least one Singapore Citizen buyer — PR-only and foreign households borrow from a bank.');
  const ceiling = policy.get(h.scheme === 'single' ? 'eligibility.income_ceiling.single' : 'eligibility.income_ceiling.family');
  if (s.income != null && s.income > ceiling) why.push(`Household income is above the S$${ceiling.toLocaleString('en-SG')} ceiling for an HDB loan.`);
  return { ok: why.length === 0, why };
}

/** affordability() result with a smaller loan (HDB second-loan rule): instalments, MSR and upfront recomputed. */
function withLoan(a, loan, { price, income, grantsTotal }) {
  const monthly = loan > 0 && a.tenure ? pmt(loan, a.rate, a.tenure) : 0;
  const monthlyAssessed = loan > 0 && a.tenure ? pmt(loan, a.assessRate, a.tenure) : 0;
  const down = price - loan, grantsUsed = Math.min(grantsTotal || 0, down + a.duty);
  return {
    ...a, loan, down, monthly, monthlyAssessed, grants: grantsUsed, upfront: down + a.duty - grantsUsed,
    msr: income ? monthly / income : null, msrAssessed: income ? monthlyAssessed / income : null,
    msrOk: income ? Math.round(monthlyAssessed * 100) <= Math.round(a.msrCap * income * 100) : null,
  };
}

/**
 * @param {{ household: object, flat: { price:number, flatType?:string|null, remainingLease?:number|null, cov?:number, label?:string, parentsKm?:number|null },
 *           sale?: { current:object, mode?:string|null }|null }} x
 *   sale = Plan's "I own a home now and will sell it" (core/sale.js saleInput); null/absent → no sale, numbers as before
 */
export function planPurchase({ household: h, flat, sale = null }, policy) {
  const s = summarise(h);
  const price = flat.price, remainingLease = flat.remainingLease ?? null, cov = flat.cov || 0;
  const coversTo95 = coversToAge(remainingLease, s.youngestAge, policy.get('cpf.lease.cover_to_age'));
  const g = h.grantsOverride != null
    ? { total: h.grantsOverride, items: [{ id: 'manual', amount: h.grantsOverride }], notes: ['Using the grant amount you entered.'] }
    : grants({ household: h, flatType: flat.flatType, coversTo95, parentsKm: flat.parentsKm ?? null }, policy); // parentsKm: B12
  const sf = sale ? saleFunds({ sale, household: h }, policy) : null;
  const ab = sf ? { rate: sf.absd.rate, note: sf.absd.note, remitted: sf.absd.remitted, remittedAmount: absd(price, sf.absd.remittedRate) } : absdRate({ household: h }, policy);
  const hdbElig = hdbLoanEligibility(h, policy);
  const fees = policy.get('assumption.fees.legal'), hdbFees = policy.get('fees.resale.hdb_admin');
  const steps = policy.get('assumption.stress.rate_steps');
  // money the purchase can use: own cash + CPF OA, plus what the sale releases before this purchase
  const funds = sf ? { cash: s.cash + sf.cash, cpfOa: s.cpfOa + sf.cpf } : { cash: s.cash, cpfOa: s.cpfOa };
  const fundsKnown = h.cash != null || s.cpfOa > 0 || !!(sf && sf.usable);
  const cashKnown = h.cash != null && h.cash !== '';

  const options = ['hdb', 'bank'].map((loanType) => {
    let a = affordability({ price, income: s.income, grants: g.total, loanType, tenure: h.tenure || policy.get('tenure.hdb.max'), averageAge: s.averageAge, remainingLease }, policy);
    const cap = loanType === 'hdb' ? secondLoanCap({ price, loan: a.loan, sf }, policy) : null;
    const fullLoan = a.loan;
    if (cap && cap.loan < a.loan) a = withLoan(a, cap.loan, { price, income: s.income, grantsTotal: g.total });
    const debts = h.otherDebts || 0;
    const tdsr = loanType === 'bank' && s.income ? (a.monthlyAssessed + debts) / s.income : null;
    const tdsrOk = tdsr == null ? null : tdsr <= policy.get('ratio.tdsr.cap');
    const f = funding({ price, loan: a.loan, loanType, lowerTier: a.lowerTier, duty: a.duty, absd: absd(price, ab.rate), fees, hdbFees, cov, grants: g.total, cash: funds.cash, cpfOa: funds.cpfOa }, policy);
    const stress = steps.map((d) => { const m = a.tenure ? pmt(a.loan, a.rate + d, a.tenure) : 0; return { add: d, monthly: m, share: s.income ? m / s.income : null }; });
    return {
      loanType, eligible: loanType === 'hdb' ? hdbElig.ok : true, ...a, tdsr, tdsrOk, funding: f, stress,
      schedule: a.tenure ? schedule(a.loan, a.rate, a.tenure) : { monthly: 0, totalInterest: 0, rows: [] },
      ...(cap && cap.retain != null ? { saleCap: { mustUse: cap.mustUse, retain: cap.retain, reducedBy: fullLoan - a.loan, note: cap.note } } : {}),
    };
  });

  const wanted = h.loan === 'bank' ? 'bank' : 'hdb';
  const chosen = options.find((o) => o.loanType === (wanted === 'hdb' && !hdbElig.ok ? 'bank' : wanted));
  const b = budget({
    income: s.income, otherDebts: h.otherDebts || 0, loanType: chosen.loanType, tenure: h.tenure || policy.get('tenure.hdb.max'), averageAge: s.averageAge,
    remainingLease, cash: funds.cash, cpfOa: funds.cpfOa, grants: g.total, absdRate: ab.rate, fees, hdbFees, fundsKnown,
    ...(chosen.saleCap ? { mustUse: chosen.saleCap.mustUse } : {}),
  }, policy);
  const smallerLoan = smallerLoanFor({ chosen, budget: b, s, price, ab, fees, hdbFees, cov, grantsTotal: g.total, funds, fundsKnown, cashKnown }, policy);
  const shortLease = coversTo95 === false && !(remainingLease < policy.get('cpf.lease.min_years'))
    ? { loanUpTo: true, cpfUpTo: true, ehgUpTo: (g.items.find((i) => i.id === 'ehg' && i.upTo) || {}).amount ?? null }
    : null;
  // the cash shortfall only means something once the cash is known (A11); null = not known → "add your savings"
  const cashShort = fundsKnown && cashKnown ? chosen.funding.cashShort : null;

  const paths = pathways(h, policy);
  const verdict = verdictFor({ chosen, s, fundsKnown, cashKnown, coversTo95, remainingLease, resale: paths.buy.resale, smallerLoan }, policy);
  const out = {
    price, flat, coversTo95, grants: g, absd: { ...ab, amount: absd(price, ab.rate) }, hdbLoan: hdbElig, options, chosen, switchedToBank: chosen.loanType !== wanted,
    budget: b, fundsKnown, summary: s, pathways: paths, verdict,
  };
  // Phase 7a fields (added after the old ones so a plan without a sale serialises as before, plus these)
  out.cashKnown = cashKnown;
  out.cashShort = cashShort;
  out.funds = funds;
  out.smallerLoan = smallerLoan;
  out.shortLease = shortLease;
  out.sale = sf ? {
    mode: sf.mode, usable: sf.usable, fromType: sf.fromType, proceeds: sf.proceeds, ssd: sf.ssd, cash: sf.cash, cpf: sf.cpf,
    cashUncertain: !!sf.proceeds.cashUncertain, accruedSource: sf.proceeds.accruedSource || null,
    absdRemitted: sf.absd.remitted, notes: [...sf.proceeds.notes, ...sf.notes, ...(chosen.saleCap ? [chosen.saleCap.note] : []), ...(sf.absd.remitted ? [sf.absd.note] : [])],
    assumptions: sf.proceeds.assumptions,
  } : null;
  return out;
}

/**
 * A3: when the full-LTV loan fails the income tests (MSR, TDSR), the smallest loan that still passes them is
 * the loan the income supports (budget().loanLimit, same tenure). Does the purchase fit with it?
 * @returns {null|{ loan:number, fullLoan:number, extra:number, monthly:number, funding:object, fits:boolean|null }}
 *   fits null = cash not known yet
 */
function smallerLoanFor({ chosen, budget: b, s, price, ab, fees, hdbFees, cov, grantsTotal, funds, fundsKnown, cashKnown }, policy) {
  const incomeFails = chosen.msrOk === false || chosen.tdsrOk === false;
  if (s.income == null || !incomeFails || !chosen.tenure || b.loanLimit == null) return null;
  const loan = Math.max(0, Math.min(chosen.loan, b.loanLimit));
  const f = funding({ price, loan, loanType: chosen.loanType, lowerTier: chosen.lowerTier, duty: chosen.duty, absd: absd(price, ab.rate), fees, hdbFees, cov, grants: grantsTotal, cash: funds.cash, cpfOa: funds.cpfOa }, policy);
  const fits = f.cashShort === 0 ? true : fundsKnown && cashKnown ? false : null;
  return { loan, fullLoan: chosen.loan, extra: chosen.loan - loan, monthly: loan > 0 ? pmt(loan, chosen.rate, chosen.tenure) : 0, funding: f, fits };
}

/**
 * Plain-language verdict: status 'ok' | 'tight' | 'no' | 'unknown' plus reasons (worst first) and `codes`
 * (one per reason, for tests and the UI: eligibility, eligibility-check, income-unknown, msr, tdsr, smaller-loan,
 * smaller-loan-unknown, near-limit, funds-unknown, cash-unknown, cash-short, lease-cpf, short-lease, no-loan).
 */
export function verdictFor({ chosen, s, fundsKnown, cashKnown = true, coversTo95, remainingLease, resale = null, smallerLoan = null }, policy) {
  const reasons = [], codes = [];
  let status = 'ok';
  const worse = (st) => { const order = ['ok', 'tight', 'unknown', 'no']; if (order.indexOf(st) > order.indexOf(status)) status = st; };
  const say = (code, text) => { codes.push(code); reasons.push(text); };
  // eligibility first: can this household buy an HDB resale flat at all?
  if (resale && resale.ok === false) { worse('no'); say('eligibility', `Your household can't buy an HDB resale flat: ${resale.why.join(' ')}`); }
  else if (resale && resale.ok === 'conditional') { worse('tight'); say('eligibility-check', `Check eligibility: ${resale.why.join(' ')}`); }
  if (s.income == null) { worse('unknown'); say('income-unknown', 'Add your income in About you to check the loan limits.'); }
  else if (smallerLoan && smallerLoan.fits === true) {
    worse('tight');
    say('smaller-loan', `Possible with a smaller loan: borrow ${money(smallerLoan.loan)} (not ${money(smallerLoan.fullLoan)}) and pay ${money(smallerLoan.extra)} more from cash or CPF — your income limits the loan at the test rate.`);
  } else {
    if (!chosen.msrOk) { worse('no'); say('msr', 'The instalment is over the Mortgage Servicing Ratio limit at the test rate — the loan would be smaller.'); }
    if (chosen.tdsrOk === false) { worse('no'); say('tdsr', 'Total debt repayments would be over the TDSR limit at the test rate.'); }
    if (smallerLoan && smallerLoan.fits === null) {
      worse('unknown');
      say('smaller-loan-unknown', `A smaller loan of ${money(smallerLoan.loan)} could work if you can pay ${money(smallerLoan.extra)} more from cash or CPF — add your savings to check.`);
    }
    if (chosen.msrAssessed > policy.get('assumption.msr.comfortable') && chosen.msrOk) { worse('tight'); say('near-limit', 'The instalment is near the limit — little room if income drops.'); }
  }
  if (!fundsKnown) { worse('unknown'); say('funds-unknown', 'Add your cash and CPF OA balance to check the upfront payment.'); }
  else if (chosen.funding.cashShort > 0 && !cashKnown) { worse('unknown'); say('cash-unknown', 'Add your savings to check the cash part.'); }
  else if (chosen.funding.cashShort > 0) { worse('no'); say('cash-short', `Short of S$${Math.round(chosen.funding.cashShort).toLocaleString('en-SG')} for the upfront payment (some items must be paid in cash).`); }
  if (remainingLease != null && remainingLease < policy.get('cpf.lease.min_years')) { worse('no'); say('lease-cpf', 'Too little lease left to use CPF at all.'); }
  else if (coversTo95 === false) {
    worse('tight');
    say('short-lease', 'The lease does not cover the youngest buyer to 95. HDB and CPF will lower the loan and the CPF you can use (formulas not published), so the loan and CPF figures here are the most they could be.');
  }
  if (!chosen.tenure) { worse('no'); say('no-loan', 'No loan is possible with these ages and this lease.'); }
  return { status, reasons, codes };
}
