// Sell-then-buy planner: what the sale releases (loan → CPF refund → cash, CPF/HDB order of
// deductions), what the next purchase needs, the gap, and the deadlines that tie the two together.
// Pure: no DOM, no clock; every rule value comes from `policy.get(id)`.
// Simplifications (surfaced as notes): fees are estimates; the HDB second-loan rule is applied to
// the loan amount only; CPF refunds are treated as returning to OA (55+ sellers: RA first).
import { pmt } from './mortgage.js';
import { affordability } from './affordability.js';
import { funding } from './funding.js';
import { grants as grantsFor, absdRate } from './grants.js';
import { summarise } from './household.js';
import { absd as absdFor } from './stamp-duty.js';
import { accruedInterest as accruedOn } from './cpf.js';

const MODES = ['contra', 'sell-first', 'buy-first'];
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const optNum = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const upper = (t) => String(t || '').toUpperCase().replace(/-/g, ' ').trim();
const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;

/**
 * Accrued interest on the CPF used for the home being sold (Phase 7 A5 — never silently 0). A typed amount (from
 * the CPF statement) always wins. Left blank, it is estimated: the CPF used earning `cpf.housing.accrued_rate`,
 * compounded yearly from the purchase year (as if all of it was used that year — instalments paid later earn
 * less, so the estimate is on the high side). Without the purchase year it is unknown: counted as 0 but flagged.
 * @param {{ cpfPrincipalUsed?:number|null, accruedInterest?:number|null, boughtYear?:number|null, asOfYear?:number|null,
 *   holdingYears?:number|null }} x  asOfYear = this calendar year (engines do not read the clock);
 *   boughtYear blank → asOfYear − holdingYears when the years held are known
 * @returns {{ amount:number, source:'typed'|'estimate'|'unknown'|'none', years:number|null, rate:number|null, fromYear:number|null }}
 *   none = no CPF used (no interest); unknown = blank and no usable purchase year (amount 0, not counted)
 */
export function accruedEstimate(x = {}, policy) {
  const typed = optNum(x.accruedInterest);
  if (typed != null) return { amount: Math.max(0, typed), source: 'typed', years: null, rate: null, fromYear: null };
  const principal = Math.max(0, num(x.cpfPrincipalUsed));
  if (principal === 0) return { amount: 0, source: 'none', years: null, rate: null, fromYear: null };
  const to = optNum(x.asOfYear), held = optNum(x.holdingYears);
  const from = optNum(x.boughtYear) ?? (to != null && held != null && held >= 0 ? to - held : null);
  if (from == null || to == null || Math.trunc(from) > Math.trunc(to)) return { amount: 0, source: 'unknown', years: null, rate: null, fromYear: null };
  const years = Math.trunc(to) - Math.trunc(from);
  const amount = Math.round(accruedOn([{ month: 0, amount: principal }], years * 12, policy).accrued);
  return { amount, source: 'estimate', years, rate: policy.get('cpf.housing.accrued_rate'), fromYear: Math.trunc(from) };
}

/**
 * Sale proceeds in the order HDB/CPF apply them: outstanding loan, then the CPF refund
 * (principal + accrued interest, capped at what is left after the loan — CPF does not ask for the
 * shortfall in cash when sold at market value), then cash. Agent and legal fees come out of cash.
 * Accrued interest: typed, else estimated from `boughtYear` (see accruedEstimate), else unknown (not counted).
 * @param {{ salePrice:number, outstandingLoan?:number, cpfPrincipalUsed?:number, accruedInterest?:number|null,
 *           boughtYear?:number|null, asOfYear?:number|null, agentFeeRate?:number|null, legalFees?:number|null }} x
 * @param {{get:(id:string)=>any}} policy
 * @returns {{ gross:number, loanRedemption:number, cpfOwed:number, cpfRefund:number, cpfShortfall:number,
 *             agentFee:number, legalFees:number, fees:number, cashProceeds:number, cashShortfall:number,
 *             loanShortfall:number, cpfReturnedToOa:number, assumptions:string[], notes:string[],
 *             cpfPrincipal:number, accruedInterest:number, accruedSource:'typed'|'estimate'|'unknown'|'none',
 *             accruedYears:number|null, accruedRate:number|null, cashUncertain:boolean }}
 *   accruedInterest = the interest counted in cpfOwed (0 when unknown); cashUncertain = interest estimated or unknown
 */
export function saleProceeds(x = {}, policy) {
  const gross = Math.max(0, num(x.salePrice));
  const loan = Math.max(0, num(x.outstandingLoan));
  const principal = Math.max(0, num(x.cpfPrincipalUsed));
  const acc = accruedEstimate(x, policy);
  const cpfOwed = principal + acc.amount;
  const afterLoan = gross - loan;
  const cpfRefund = Math.min(cpfOwed, Math.max(0, afterLoan));
  const assumptions = [];
  const rate = optNum(x.agentFeeRate) == null ? policy.get('sellbuy.assumption.agent_fee_rate') : Math.max(0, num(x.agentFeeRate));
  if (optNum(x.agentFeeRate) == null) assumptions.push(`Agent commission assumed at ${rate * 100}% of the price (negotiable; GST not added).`);
  const legalFees = optNum(x.legalFees) == null ? policy.get('assumption.fees.legal') : Math.max(0, num(x.legalFees));
  if (optNum(x.legalFees) == null) assumptions.push(`Conveyancing assumed at ${money(legalFees)}.`);
  if (acc.source === 'estimate') {
    assumptions.push(`Accrued interest estimated at ${money(acc.amount)}: ${money(principal)} of CPF at ${+(acc.rate * 100).toFixed(2)}% a year, compounded yearly from ${acc.fromYear} as if all of it was used that year (instalments paid later earn less, so this is on the high side). Your CPF statement has the exact amount.`);
  }
  const agentFee = gross * rate;
  const fees = agentFee + legalFees;
  const cashProceeds = afterLoan - cpfRefund - fees;

  const notes = [];
  if (acc.source === 'unknown') notes.push('Accrued interest is not counted: enter it from your CPF statement, or the year you bought to estimate it. The CPF refund is likely higher and the cash lower.');
  const cpfShortfall = cpfOwed - cpfRefund;
  const loanShortfall = Math.max(0, -afterLoan);
  if (loanShortfall > 0) notes.push(`The price does not clear the loan: ${money(loanShortfall)} must be paid in cash to redeem it.`);
  if (cpfShortfall > 0) notes.push(`CPF refund capped at ${money(cpfRefund)} (${money(cpfShortfall)} short). No cash top-up is needed if the flat is sold at market value (CPF).`);
  if (cashProceeds < 0) notes.push(`Fees exceed the cash left after the CPF refund by ${money(-cashProceeds)} — paid from savings.`);
  return {
    gross, loanRedemption: loan, cpfOwed, cpfRefund, cpfShortfall, agentFee, legalFees, fees,
    cashProceeds, cashShortfall: Math.max(0, -cashProceeds), loanShortfall, cpfReturnedToOa: cpfRefund, assumptions, notes,
    cpfPrincipal: principal, accruedInterest: acc.amount, accruedSource: acc.source, accruedYears: acc.years, accruedRate: acc.rate,
    cashUncertain: acc.source === 'estimate' || acc.source === 'unknown',
  };
}

/**
 * Seller's Stamp Duty on a private residential property (HDB flats are sold after the MOP, so none).
 * @param {{ salePrice:number, holdingYears:number|null, acquiredBeforeSsdChange?:boolean }} x
 * @returns {{ rate:number|null, amount:number }} rate null = holding period unknown
 */
export function sellerStampDuty({ salePrice, holdingYears, acquiredBeforeSsdChange = false }, policy) {
  const held = optNum(holdingYears);
  if (held == null) return { rate: null, amount: 0 };
  const bands = policy.get(acquiredBeforeSsdChange ? 'sellbuy.ssd.bands.pre_2025_07_04' : 'sellbuy.ssd.bands');
  for (const [upTo, rate] of bands) if (held <= upTo) return { rate, amount: Math.floor(Math.max(0, num(salePrice)) * rate) };
  return { rate: 0, amount: 0 };
}

/** Resale levy for the subsidised flat sold, by its type; null when HDB lists no amount for that type. */
export function resaleLevy(flatType, policy) {
  const table = policy.get('sellbuy.resale_levy'), t = upper(flatType);
  const key = Object.keys(table).find((k) => t.startsWith(k));
  return key ? table[key] : null;
}

/** Default order of transactions for a move. */
export function defaultMode(fromType, toType) {
  if (fromType === 'hdb' && toType === 'hdb') return 'contra';
  if (fromType === 'private' && toType === 'hdb') return 'buy-first';
  return 'sell-first';
}

/** Steps and the durations HDB publishes; typicalDays null = set by contract / not published. */
export function timeline({ mode, fromType, toType, nextSubsidised = false }, policy) {
  const otp = policy.get('sellbuy.otp.exercise_days'), done = policy.get('sellbuy.resale.completion_days');
  const stay = policy.get('sellbuy.extension_of_stay.max_months'), dispose = policy.get('sellbuy.dispose_existing.months');
  const sell = fromType === 'hdb'
    ? [{ step: 'sell-otp', typicalDays: otp, note: `Grant the Option to Purchase; your buyer has up to ${otp} calendar days to exercise it.` },
      { step: 'sell-complete', typicalDays: done, note: 'HDB completes the resale within about 8 weeks of accepting the resale application.' }]
    : [{ step: 'sell-private', typicalDays: null, note: 'Private sale: option and completion periods are set in the contract (not modelled).' }];
  let buy;
  if (toType === 'private') buy = [{ step: 'buy-private', typicalDays: null, note: 'Private purchase: option, exercise and completion periods are set by the developer or seller.' }];
  else if (nextSubsidised) buy = [{ step: 'buy-new-flat', typicalDays: null, note: 'New HDB flat: timing follows the sales exercise and construction (not modelled).' }];
  else buy = [{ step: 'buy-otp', typicalDays: otp, note: `Exercise the seller's Option to Purchase within ${otp} calendar days.` },
    { step: 'buy-complete', typicalDays: done, note: 'Resale completion within about 8 weeks of HDB accepting the application.' }];
  const extension = fromType === 'hdb'
    ? [{ step: 'extension-of-stay', typicalDays: null, maxMonths: stay, note: `If your buyer agrees, you may stay up to ${stay} months after completion — only once you have committed to buy a completed home.` }]
    : [];
  if (mode === 'contra') return [{ step: 'contra', typicalDays: null, note: 'Sell and buy at the same time: line up both completions so the sale funds the purchase.' }, ...sell, ...buy, ...extension];
  if (mode === 'buy-first') {
    const rule = toType === 'hdb'
      ? `Sell the old property within ${dispose} months of completing the HDB purchase (HDB condition).`
      : 'Sell the old property later; ABSD paid on the second property is refundable only under IRAS conditions.';
    return [...buy, { step: 'dispose-old', typicalDays: null, maxMonths: toType === 'hdb' ? dispose : null, note: rule }, ...sell, ...extension];
  }
  return [...sell, ...extension, ...buy];
}

/**
 * Plan a move: sell the current home and buy the next one.
 * @param {{ current:{ salePrice:number, outstandingLoan?:number, cpfPrincipalUsed?:number, accruedInterest?:number|null,
 *             boughtYear?:number|null, asOfYear?:number|null,
 *             agentFeeRate?:number, legalFees?:number, flatType?:string, propertyType?:'hdb'|'private',
 *             subsidised?:boolean|null, holdingYears?:number|null, acquiredBeforeSsdChange?:boolean },
 *           next:{ price:number, flatType?:string, propertyType?:'hdb'|'private', loanType?:'hdb'|'bank', tenure?:number,
 *             remainingLease?:number|null, subsidised?:boolean },
 *           household:object, mode?:'contra'|'sell-first'|'buy-first'|null }} x
 * @param {{get:(id:string)=>any}} policy
 */
export function sellThenBuy({ current = {}, next = {}, household = {}, mode = null }, policy) {
  const notes = [];
  const fromType = current.propertyType === 'private' ? 'private' : 'hdb';
  const toType = next.propertyType === 'private' ? 'private' : 'hdb';
  const m = MODES.includes(mode) ? mode : defaultMode(fromType, toType);
  const s = summarise(household);
  const price = Math.max(0, num(next.price));
  const proceeds = saleProceeds(current, policy);

  // Seller's Stamp Duty (private only) and resale levy (second subsidised flat)
  const ssd = fromType === 'private'
    ? sellerStampDuty({ salePrice: proceeds.gross, holdingYears: current.holdingYears, acquiredBeforeSsdChange: !!current.acquiredBeforeSsdChange }, policy)
    : { rate: 0, amount: 0 };
  if (fromType === 'private' && ssd.rate == null) notes.push('Enter how long you have held the private property to check Seller\'s Stamp Duty.');
  let levy = 0;
  if (toType === 'hdb' && next.subsidised) {
    const amount = resaleLevy(current.flatType, policy);
    if (current.subsidised === true && amount != null) levy = amount;
    else if (current.subsidised === true) notes.push('HDB lists no fixed resale levy for this flat type — check with HDB.');
    else if (current.subsidised == null && amount != null) notes.push(`If the flat you sell was subsidised, a resale levy of ${money(amount)} applies to this purchase (not included).`);
  }

  // Who still owns what when the next purchase is made (drives ABSD)
  const ownedNow = Math.max(1, num(household.propertiesOwned ?? 1));
  const ownsAtPurchase = m === 'buy-first' || (m === 'contra' && toType === 'private');
  const owned = ownsAtPurchase ? ownedNow : ownedNow - 1;
  const absdInfo = absdRate({ household: { ...household, propertiesOwned: owned } }, policy);
  let rate = absdInfo.rate;
  let absdRefundDeadline = null;
  if (toType === 'hdb' && ownsAtPurchase && rate > 0) {
    rate = 0;
    notes.push(`ABSD is remitted upfront because HDB requires the old property to be sold within ${policy.get('sellbuy.dispose_existing.months')} months.`);
  } else if (absdInfo.note && owned === 0) notes.push(absdInfo.note);
  const absd = absdFor(price, rate);
  if (toType === 'private' && ownsAtPurchase && absd > 0 && household.scheme !== 'single' && s.citizenships.includes('SC')) {
    absdRefundDeadline = {
      amount: absd,
      sellWithinMonths: policy.get('sellbuy.absd_refund.sell_within_months'),
      from: 'purchase date of the new property (TOP/CSC date if bought uncompleted, whichever is earlier)',
      claimWithinMonths: policy.get('sellbuy.absd_refund.claim_within_months'),
      note: 'Married couples (at least one SC) buying jointly; IRAS does not extend the deadline.',
    };
  }
  if (toType === 'private' && m === 'contra') notes.push('The private down payment and ABSD usually fall due before the HDB sale completes — plan bridging funds.');

  // Next purchase: loan terms, grants, and the funds the sale releases
  const loanType = toType === 'private' || next.loanType === 'bank' ? 'bank' : 'hdb';
  if (toType === 'private' && next.loanType === 'hdb') notes.push('HDB loans are for HDB flats only — a bank loan is assumed.');
  if (toType === 'private') notes.push('Private property: tenure capped at the HDB-flat bank maximum (conservative); TDSR not checked here.');
  const tenure = optNum(next.tenure) ?? policy.get(loanType === 'bank' ? 'tenure.bank.hdb_flat.max' : 'tenure.hdb.max');
  const g = toType === 'hdb' && !next.subsidised ? grantsFor({ household, flatType: next.flatType || null }, policy) : { total: 0, items: [], notes: [] };
  if (toType === 'hdb' && next.subsidised) notes.push('Grants for new flats are not modelled here.');
  const aff = affordability({ price, income: s.income, grants: g.total, loanType, tenure, averageAge: s.averageAge, remainingLease: optNum(next.remainingLease) }, policy);

  const proceedsUsable = m !== 'buy-first';
  const cashFromSale = proceedsUsable ? proceeds.cashProceeds - ssd.amount : 0;
  const cpfFromSale = proceedsUsable ? proceeds.cpfReturnedToOa : 0;
  if (!proceedsUsable) notes.push('Buying first: the down payment comes from savings; sale proceeds arrive later.');
  let loan = aff.loan, mustUse = 0;
  if (loanType === 'hdb' && proceedsUsable && loan > 0) {
    const cashP = Math.max(0, proceeds.cashProceeds);
    const retain = Math.max(policy.get('sellbuy.hdb_loan.cash_retain_min'), policy.get('sellbuy.hdb_loan.cash_retain_ratio') * cashP);
    mustUse = proceeds.cpfRefund + Math.max(0, cashP - retain);
    loan = Math.min(loan, Math.max(0, price - mustUse));
    notes.push(`Second HDB loan: the full CPF refund and cash proceeds above ${money(retain)} go into the purchase first.`);
  }
  const cash = s.cash + cashFromSale - levy;
  const cpfOa = s.cpfOa + cpfFromSale;
  const fees = policy.get('assumption.fees.legal');
  const hdbFees = toType === 'hdb' && !next.subsidised ? policy.get('fees.resale.hdb_admin') : 0;
  const fund = funding({ price, loan, loanType, lowerTier: aff.lowerTier, duty: aff.duty, absd, fees, hdbFees, grants: g.total, cash, cpfOa }, policy);
  const monthly = loan > 0 && aff.tenure ? pmt(loan, aff.rate, aff.tenure) : 0;
  const monthlyAssessed = loan > 0 && aff.tenure ? pmt(loan, aff.assessRate, aff.tenure) : 0;
  const msrOk = s.income ? Math.round(monthlyAssessed * 100) <= Math.round(aff.msrCap * s.income * 100) : null;

  if (s.buyers.some((b) => optNum(b.age) != null && +b.age >= policy.get('sellbuy.cpf.ra_first_age'))) {
    notes.push('Owners 55 and above: CPF refunds first top up the Retirement Account to the required sum; only the rest returns to OA.');
  }
  if (fromType === 'private' && toType === 'hdb') {
    const wait = policy.get('sellbuy.ppo.waitout_months');
    notes.push(wait > 0
      ? `Private owners must wait ${wait} months after selling before buying a resale flat.`
      : `No wait-out for a non-subsidised resale flat bought without an HDB loan; sell the private property within ${policy.get('sellbuy.dispose_existing.months')} months.`);
  }

  const shortfall = fund.total - g.total - cash - cpfOa;
  return {
    mode: m,
    proceeds: { ...proceeds, ssd, resaleLevy: levy, cashAfterTaxes: proceeds.cashProceeds - ssd.amount - levy },
    nextFunding: {
      loanType, price, loan, loanReducedBy: aff.loan - loan, mustUseFromSale: mustUse, tenure: aff.tenure, ltv: aff.ltv,
      rate: aff.rate, monthly, monthlyAssessed, msrOk, duty: aff.duty, absd, absdRate: rate, grants: g,
      cashAvailable: cash, cpfOaAvailable: cpfOa, funding: fund,
    },
    gap: { cashShort: fund.cashShort, fundsShort: Math.max(0, shortfall), surplus: Math.max(0, -shortfall) },
    timeline: timeline({ mode: m, fromType, toType, nextSubsidised: !!next.subsidised }, policy),
    absdRefundDeadline,
    assumptions: proceeds.assumptions,
    notes: [...proceeds.notes, ...notes, ...g.notes],
  };
}
