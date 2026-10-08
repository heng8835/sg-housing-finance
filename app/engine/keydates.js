// Key dates for a move (Phase 4): dates that follow from what the household enters (key collection,
// completion of the next purchase, children's birth dates, remaining lease) and the sourced rules.
// Pure: no clock — `asOf` is passed in. Dates are ISO 'YYYY-MM-DD' strings (calendar days, UTC maths).

const STATUS_RANK = { VERIFIED: 0, CORROBORATED: 1, ASSUMPTION: 2, UNVERIFIED: 2 };
const pad = (n) => String(n).padStart(2, '0');
const parse = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return { y, m, d }; };
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const isIsoDate = (v) => typeof v === 'string' && /^\d\d\d\d-\d\d-\d\d$/.test(v) && parse(v).m >= 1 && parse(v).m <= 12 && parse(v).d >= 1 && parse(v).d <= daysIn(parse(v).y, parse(v).m);

/** Add calendar months; the day is clamped to the end of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date, months) {
  const { y, m, d } = parse(date);
  const idx = y * 12 + (m - 1) + Math.round(months);
  const ny = Math.floor(idx / 12), nm = idx - ny * 12 + 1;
  return iso(ny, nm, Math.min(d, daysIn(ny, nm)));
}
export const addYears = (date, years) => addMonths(date, years * 12);
/** Last day of a month. */
export const endOfMonth = (y, m) => iso(y, m, daysIn(y, m));

// weakest status of the rules an event depends on
function statusOf(ids, policy) {
  let worst = 'VERIFIED';
  for (const id of ids) { const s = policy.meta(id).status; if ((STATUS_RANK[s] ?? 2) > STATUS_RANK[worst]) worst = s; }
  return worst;
}

/**
 * P1 registration for a child: the year of the exercise and its usual window (MOE).
 * Children born 2 Jan Y – 1 Jan Y+1 register in Y+6 (so a 1 Jan birthday belongs to the previous cohort).
 * @returns {{ registerYear:number, entryYear:number, windowFrom:string, windowTo:string }}
 */
export function p1Registration(birthDate, policy) {
  const c = policy.get('p1.registration.cohort'), w = policy.get('p1.registration.window_months');
  const { y, m, d } = parse(birthDate);
  const [toM, toD] = c.born_to_mmdd_next_year.split('-').map(Number);
  const cohort = m < toM || (m === toM && d <= toD) ? y - 1 : y;
  const registerYear = cohort + c.register_year_offset;
  return { registerYear, entryYear: cohort + c.entry_year_offset, windowFrom: iso(registerYear, w.from, 1), windowTo: endOfMonth(registerYear, w.to) };
}

// What a past date means now (B9): English templates, translated by the UI.
const PAST = {
  mop: 'The minimum occupation period is over: you may sell or rent out the whole flat (subject to the rules then).',
  'absd-refund': 'This deadline has passed. Check with IRAS what applies to you.',
  dispose: 'This deadline has passed. Contact HDB if the old home is not sold yet.',
  'lease-min': 'Buyers can no longer use CPF or an HDB loan for this flat.',
  'lease-cpf': 'Buyers can no longer use CPF for this flat.',
  'lease-hdb-loan': 'Buyers can no longer take an HDB loan for this flat.',
  'lease-end': 'The lease has ended.',
  'sale-complete': 'The sale date you entered has passed. Update it if the sale moved.',
  'next-complete': 'The purchase date you entered has passed. Update it if completion moved.',
  'next-mop': 'The minimum occupation period of the new flat is over.',
  p1: "Registration for this child's Primary 1 year is over.",
};
export const pastKeyOf = (id) => PAST[id] || PAST[String(id).replace(/-\d+$/, '')] || null;

/** Whole days from ISO date a to ISO date b (b − a). */
export function daysFrom(a, b) {
  const p = parse(a), q = parse(b);
  return Math.round((Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / (Date.UTC(0, 0, 2) - Date.UTC(0, 0, 1)));
}

/**
 * Do the two completion dates fit the chosen order (B9)? Sell first: the sale must not complete after the purchase;
 * buy first: the purchase must not complete after the sale. Contra / missing dates: no check.
 * @returns {{ mode:'sell-first'|'buy-first', sale:string, purchase:string }|null}  null = fine or not checkable
 */
export function orderCheck({ mode, saleCompletion, purchaseCompletion }) {
  if (!isIsoDate(saleCompletion) || !isIsoDate(purchaseCompletion)) return null;
  if (mode === 'sell-first' && purchaseCompletion < saleCompletion) return { mode, sale: saleCompletion, purchase: purchaseCompletion };
  if (mode === 'buy-first' && saleCompletion < purchaseCompletion) return { mode, sale: saleCompletion, purchase: purchaseCompletion };
  return null;
}

/**
 * Selling first: rent between the sale completion and the new keys (B9). Months = whole calendar months that cover
 * the gap (a part month counts as a month of rent); cost = months × the household's rent.
 * @param {{ mode:string, saleCompletion:string|null, purchaseCompletion:string|null, rent:number|null }} x
 * @returns {{ days:number, months:number, rent:number|null, cost:number|null }|null}  null = not selling first, dates
 *   missing, or no gap; rent / cost null = no rent figure yet
 */
export function gapCost({ mode, saleCompletion, purchaseCompletion, rent }) {
  if (mode !== 'sell-first' || !isIsoDate(saleCompletion) || !isIsoDate(purchaseCompletion)) return null;
  const days = daysFrom(saleCompletion, purchaseCompletion);
  if (!(days > 0)) return null;
  let months = 1;
  while (addMonths(saleCompletion, months) < purchaseCompletion) months += 1;
  const r = rent != null && rent !== '' && Number.isFinite(+rent) && +rent >= 0 ? +rent : null;
  return { days, months, rent: r, cost: r == null ? null : months * r };
}

/**
 * Derive the key dates of a move.
 * @param {{ asOf:string, keyCollection?:string|null, flatClass?:'standard'|'plus'|'prime',
 *   nextCompletion?:string|null, saleCompletion?:string|null, nextFlatClass?:'standard'|'plus'|'prime',
 *   mode?:'contra'|'sell-first'|'buy-first', nextPropertyType?:'hdb'|'private',
 *   remainingLease?:number|null, children?:string[] }} x
 *   keyCollection = keys of the HDB flat you live in / will live in (MOP); nextCompletion = completion of
 *   the next purchase (dispose-by and ABSD-refund deadlines; with a move: "New flat: keys" + its MOP end, 7b B9);
 *   saleCompletion = expected completion of the sale (with a move); remainingLease (years, as of asOf) of the flat.
 * @returns {{ id:string, start:string, end:string|null, title:string, note:string, status:string, past:boolean,
 *   pastKey:string|null }[]}  sorted by date; `past` = before asOf; pastKey = what happens next once it has passed
 *   (English template, 7b B9)
 */
export function keyDates(x, policy) {
  const out = [];
  // title / note: English text, or [template, values] so the UI can translate the template ({0}, {1}…)
  const fill = (s, v = []) => s.replace(/\{(\d)\}/g, (m, i) => String(v[+i] ?? m));
  const parts = (s) => (Array.isArray(s) ? s : [s, []]);
  const add = (id, start, end, title, note, ids) => {
    const [titleKey, titleVals] = parts(title), [noteKey, noteVals] = parts(note);
    out.push({ id, start, end, title: fill(titleKey, titleVals), note: fill(noteKey, noteVals), titleKey, titleVals, noteKey, noteVals, status: statusOf(ids, policy), past: (end || start) < x.asOf, pastKey: pastKeyOf(id) });
  };

  if (isIsoDate(x.keyCollection)) {
    const years = policy.get('rentbuy.mop.years')[x.flatClass || 'standard'];
    if (years > 0) add('mop', addYears(x.keyCollection, years), null, ['Minimum Occupation Period ends ({0} years)', [years]], 'From now you may sell the flat on the open market, rent out the whole flat or buy private property (subject to the rules then).', ['rentbuy.mop.years']);
  }

  if (isIsoDate(x.nextCompletion) && x.mode === 'buy-first') {
    if (x.nextPropertyType === 'private') {
      const n = policy.get('sellbuy.absd_refund.sell_within_months');
      add('absd-refund', addMonths(x.nextCompletion, n), null, ['Sell your first home within {0} months to claim the ABSD refund', [n]], ['Counted from the purchase date of the new home (TOP/CSC if bought uncompleted). Claim within {0} months after that sale; IRAS does not extend the deadline.', [policy.get('sellbuy.absd_refund.claim_within_months')]], ['sellbuy.absd_refund.sell_within_months', 'sellbuy.absd_refund.claim_within_months']);
    } else {
      const n = policy.get('sellbuy.dispose_existing.months');
      add('dispose', addMonths(x.nextCompletion, n), null, ['Sell your previous home within {0} months', [n]], 'HDB condition when you buy before selling: dispose of the old property within this period of completing the purchase.', ['sellbuy.dispose_existing.months']);
    }
  }

  if (isIsoDate(x.asOf) && Number.isFinite(x.remainingLease) && x.remainingLease > 0) {
    const leaseEnd = addMonths(x.asOf, x.remainingLease * 12);
    const cpfMin = policy.get('cpf.lease.min_years'), buffer = policy.get('tenure.hdb.lease_buffer');
    if (cpfMin === buffer) {
      add('lease-min', addYears(leaseEnd, -cpfMin), null, ['Remaining lease reaches {0} years', [cpfMin]], 'Buyers after this date cannot use CPF or an HDB loan for this flat — mostly cash buyers, so a smaller resale market.', ['cpf.lease.min_years', 'tenure.hdb.lease_buffer']);
    } else {
      add('lease-cpf', addYears(leaseEnd, -cpfMin), null, ['Remaining lease reaches {0} years', [cpfMin]], 'Buyers after this date cannot use CPF for this flat.', ['cpf.lease.min_years']);
      add('lease-hdb-loan', addYears(leaseEnd, -buffer), null, ['Remaining lease reaches {0} years', [buffer]], 'An HDB loan is no longer available to buyers of this flat.', ['tenure.hdb.lease_buffer']);
    }
    add('lease-end', leaseEnd, null, 'Lease ends — the flat returns to HDB', 'Approximate: from the remaining lease shown for this block (HDB data, not a rule).', []);
  }

  // the move (7b B9): when the sale and the purchase complete, and when the new flat's MOP ends
  if (x.mode && isIsoDate(x.saleCompletion)) {
    add('sale-complete', x.saleCompletion, null, 'Sale completes', 'From the sale completion date you expect (Sell then buy).', []);
  }
  if (x.mode && isIsoDate(x.nextCompletion) && x.nextPropertyType !== 'private') {
    add('next-complete', x.nextCompletion, null, 'New flat: purchase completes (keys)', 'From the purchase completion date you expect.', []);
    const years = policy.get('rentbuy.mop.years')[x.nextFlatClass || 'standard'];
    if (years > 0) add('next-mop', addYears(x.nextCompletion, years), null, ['New flat: minimum occupation ends ({0} years)', [years]], 'Counted from the purchase completion; Plus and Prime flats have a longer period.', ['rentbuy.mop.years']);
  }

  for (const [i, b] of (x.children || []).entries()) {
    if (!isIsoDate(b)) continue;
    const p = p1Registration(b, policy);
    add(`p1-${i + 1}`, p.windowFrom, p.windowTo, ['Primary 1 registration (child {0}, starts P1 in {1})', [i + 1, p.entryYear]], 'MOE runs the exercise in phases between June and August; check the exact phase dates when MOE announces them. MOE is changing the registration framework — check the rules for your child\'s year.', ['p1.registration.cohort', 'p1.registration.window_months']);
  }

  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
