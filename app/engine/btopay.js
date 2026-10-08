// When you pay for a BTO flat (AF-12): the stages of payment for a new HDB flat — option fee at booking,
// downpayment + stamp duty + legal fees at signing of the Agreement for Lease, the rest of the downpayment and
// the loan at key collection — with the cash / CPF split by loan type.
// Pure: no DOM, no clock (dates passed in as ISO strings); every rule value via `policy.get(id)`.
// Messages are [English template, values] pairs so the UI can translate the template (zh-engine.json).
import { bsd } from './stamp-duty.js';
import { loanTerms } from './affordability.js';
import { addMonths, isIsoDate } from './keydates.js';

const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const upper = (s) => String(s || '').toUpperCase().replace(/-/g, ' ').trim();
const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;

/** Option fee for a flat type (2-room Flexi / CCA → the 2-room amount); null when HDB lists none for that type. */
export function btoOptionFee(flatType, policy) {
  const table = policy.get('bto.option_fee'), t = upper(flatType);
  const key = Object.keys(table).find((k) => t.startsWith(k) || t.replace(/\s/g, '').startsWith(k.replace(/\s/g, '')));
  return key ? table[key] : null;
}

/** True when the policy entry exists and carries a value (UNVERIFIED entries are null — get() would throw). */
const hasValue = (policy, id) => { try { return policy.meta(id).value != null; } catch { return false; } };

/**
 * Payment stages for a BTO flat.
 * @param {{ price:number, flatType?:string, loanType?:'hdb'|'bank', tenure?:number|null, averageAge?:number|null,
 *   deferredIncome?:boolean, staggered?:boolean, legalFees?:number|null, bookingDate?:string|null, keyDate?:string|null,
 *   youngestAge?:number|null, firstTimer?:boolean|null, couple?:boolean }} x
 *   keyDate = expected completion ('YYYY-MM' or ISO date), bookingDate = flat booking date (ISO);
 *   deferredIncome = young couple on deferred income assessment; staggered = asked for the Staggered Downpayment Scheme.
 * @param {{get:(id:string)=>any, meta:(id:string)=>object}} policy
 * @returns {{ price:number, loanType:'hdb'|'bank', ltv:number, loan:number, downpayment:number, duty:number, legalFees:number,
 *   total:number, cashTotal:number, cpfTotal:number,
 *   stages:{ id:'booking'|'afl'|'keys', when:string|null, amount:number, cashMin:number, cpfAble:number, loan:number,
 *     items:{ id:string, amount:number, cash:boolean, note:[string, any[]]|null }[], ruleIds:string[] }[],
 *   when = ISO date (booking / sign-by date) or 'YYYY-MM' (key collection); null = not known. amount excludes the loan.
 *   staggeredMayApply:boolean, notes:[string, any[]][] }}
 */
export function btoPaymentStages(x = {}, policy) {
  const price = Math.max(0, num(x.price));
  const loanType = x.loanType === 'bank' ? 'bank' : 'hdb';
  const notes = [];
  const lease = policy.get('lease.term.years');
  const terms = loanTerms({
    loanType,
    tenure: num(x.tenure) || policy.get(loanType === 'bank' ? 'tenure.bank.hdb_flat.max' : 'tenure.hdb.max'),
    averageAge: x.averageAge == null || x.averageAge === '' ? null : +x.averageAge,
    remainingLease: lease,
  }, policy);
  const loan = Math.round(price * terms.ltv); // whole dollars (0.55 × price is not exact in binary)
  const downpayment = price - loan;
  const cashMinTotal = loanType === 'bank'
    ? price * policy.get(terms.lowerTier ? 'downpayment.bank.cash_min.lower_tier' : 'downpayment.bank.cash_min') : 0;

  // 1. booking: option fee (part of the downpayment; cash only)
  let optionFee = btoOptionFee(x.flatType, policy);
  if (optionFee == null) { optionFee = 0; notes.push(['HDB lists no option fee for this flat type — check the sales brochure.', []]); }
  optionFee = Math.min(optionFee, downpayment);
  const optionCash = !policy.get('cpf.usage.bto_option_fee');

  // 2. Agreement for Lease: downpayment share (deferred income assessment: lower first payment)
  let aflRatio = policy.get('bto.downpayment.afl')[loanType];
  const aflIds = ['bto.afl.within_months', 'bto.downpayment.afl', 'stamp.bsd.bands'];
  if (x.deferredIncome) {
    aflRatio = Math.min(aflRatio, policy.get('bto.downpayment.afl.deferred_income'));
    aflIds.push('bto.downpayment.afl.deferred_income');
  }
  if (x.staggered) {
    if (hasValue(policy, 'bto.staggered_downpayment.instalments')) {
      const s = policy.get('bto.staggered_downpayment.instalments');
      if (s && s[loanType] && s[loanType].afl != null) { aflRatio = Math.min(aflRatio, s[loanType].afl); aflIds.push('bto.staggered_downpayment.instalments'); }
    } else {
      notes.push(['Staggered Downpayment Scheme: HDB\'s current split between signing and key collection is not verified yet — the standard schedule is shown.', []]);
    }
  }
  const aflDown = Math.max(0, Math.min(downpayment, price * aflRatio) - optionFee);
  const duty = bsd(price, policy.get('stamp.bsd.bands'));
  const legalFees = x.legalFees == null || x.legalFees === '' ? policy.get('assumption.fees.legal') : Math.max(0, num(x.legalFees));
  if (x.legalFees == null || x.legalFees === '') notes.push(['Legal fees are an estimate of {0} (HDB charges its own conveyancing fees; the exact amount is in HDB\'s letter).', [money(legalFees)]]);
  // the bank cash minimum is met first with the option fee, then at signing, then (if still short) at key collection
  const cashAfterOption = Math.max(0, cashMinTotal - (optionCash ? optionFee : 0));
  const aflCashMin = Math.min(aflDown, cashAfterOption);
  const cpfDown = policy.get('cpf.usage.bto_downpayment');

  // 3. key collection: rest of the downpayment + the loan
  const keysDown = Math.max(0, downpayment - optionFee - aflDown);
  const keysCashMin = Math.min(keysDown, Math.max(0, cashAfterOption - aflCashMin));

  // timing
  const booked = isIsoDate(x.bookingDate) ? x.bookingDate : null;
  const aflBy = booked ? addMonths(booked, policy.get('bto.afl.within_months')) : null;
  const key = typeof x.keyDate === 'string' ? (/^\d\d\d\d-\d\d/.exec(x.keyDate) || [null])[0] : null;
  if (!key) notes.push(['Expected completion unknown — key collection is shown without a date.', []]);

  const item = (id, amount, cash, note = null) => ({ id, amount, cash, note });
  // the loan is not your money: it is listed in the stage but kept out of the cash / CPF amounts
  const stage = (id, when, items, ruleIds) => {
    const live = items.filter((i) => i.amount > 0), own = live.filter((i) => i.id !== 'loan');
    const amount = own.reduce((s, i) => s + i.amount, 0);
    const cashMin = own.filter((i) => i.cash).reduce((s, i) => s + i.amount, 0);
    const loanPaid = live.filter((i) => i.id === 'loan').reduce((s, i) => s + i.amount, 0);
    return { id, when, amount, cashMin, cpfAble: amount - cashMin, loan: loanPaid, items: live, ruleIds };
  };
  const cpfBsd = policy.get('cpf.usage.bsd'), cpfLegal = policy.get('cpf.usage.legal_fees');
  const stages = [
    stage('booking', booked, [item('option-fee', optionFee, optionCash, ['Part of the downpayment; paid by NETS / debit card (not CPF).', []])], ['bto.option_fee', 'cpf.usage.bto_option_fee']),
    stage('afl', aflBy, [
      item('down-cash', aflCashMin, true, loanType === 'bank' ? ['Bank loan: part of the downpayment must be cash.', []] : null),
      item('down', aflDown - aflCashMin, !cpfDown),
      item('bsd', duty, !cpfBsd),
      item('legal', legalFees, !cpfLegal),
    ], aflIds),
    stage('keys', key, [
      item('down-cash', keysCashMin, true),
      item('down', keysDown - keysCashMin, !cpfDown),
      item('loan', loan, false, [loanType === 'hdb' ? 'HDB loan of {0}% of the price, paid out to HDB at key collection.' : 'Bank loan of {0}% of the price, paid out at key collection.', [Math.round(terms.ltv * 100)]]),
    ], [loanType === 'hdb' ? 'loan.hdb.ltv' : (terms.lowerTier ? 'loan.bank.ltv.lower_tier' : 'loan.bank.ltv')]),
  ];

  notes.push(['At key collection HDB also collects a survey fee, and may collect registration fees and stamp duty on the Deed of Assignment; HDB-loan buyers must buy fire insurance from HDB\'s appointed insurer (amounts not included).', []]);
  notes.push(['Housing grants for new flats are not included — they reduce what you pay.', []]);
  if (x.firstTimer === false) notes.push(['Second-timers pay any resale levy before key collection.', []]);
  if (loanType === 'bank') notes.push(['A bank loan needs a Letter of Offer before you sign the Agreement for Lease.', []]);

  // Staggered Downpayment Scheme: may apply (couples, younger applicant ≤ 30 at HFE, 5-room or smaller, uncompleted)
  const e = policy.get('bto.staggered_downpayment.eligibility');
  const ft = upper(x.flatType), rooms = /^\d ROOM/.test(ft) ? Number(ft[0]) : null;
  const sizeOk = rooms != null && rooms <= Number(e.largest_flat[0]);
  const staggeredMayApply = !!x.couple && x.youngestAge != null && +x.youngestAge <= e.younger_applicant_max_age_at_hfe && sizeOk;
  if (staggeredMayApply && !x.staggered) notes.push(['You may qualify for the Staggered Downpayment Scheme (pay the downpayment in two instalments) if you applied for the HFE letter on or before the younger applicant\'s {0}th birthday.', [e.younger_applicant_max_age_at_hfe]]);

  const total = stages.reduce((s, st) => s + st.amount, 0);
  const cashTotal = stages.reduce((s, st) => s + st.cashMin, 0);
  return {
    price, loanType, ltv: terms.ltv, loan, downpayment, duty, legalFees, optionFee,
    total, cashTotal, cpfTotal: total - cashTotal, stages, staggeredMayApply, notes,
  };
}
