// BTO vs resale (Phase 4b): wait for a new flat (renting meanwhile) or buy resale now.
// Pure: dates are ISO 'YYYY-MM' / 'YYYY-MM-DD' strings passed in; no clock. Grants, interest and
// price growth are not modelled — the comparison is cash out by the BTO key date.

const ym = (s) => { const [y, m] = String(s).split('-').map(Number); return y * 12 + (m - 1); };

/** Whole months from `from` to `to` (both ISO dates or year-months); never negative. */
export const monthsBetween = (from, to) => Math.max(0, ym(to) - ym(from));

/**
 * @param {{ asOf:string, keyDate:string|null, waitMonths?:number|null, btoPrice:number|null, resalePrice:number|null,
 *   monthlyRent:number|null }} x keyDate = expected key collection of the BTO flat; waitMonths = the wait the user
 *   set instead (a future launch), used only when keyDate is null. monthlyRent 0 = no rent while waiting (typed);
 *   null = not known.
 * @param {{get:(id:string)=>any, meta:(id:string)=>object}} policy
 * @returns {{ waitMonths:number|null, rentWhileWaiting:number|null, btoTotal:number|null, resaleTotal:number|null,
 *   difference:number|null, cheaper:'bto'|'resale'|null, missing:('wait'|'rent'|'price'|'resale')[],
 *   btoLeaseYears:number, mopYears:number, notes:string[] }}
 *   difference = resaleTotal − btoTotal (positive: BTO costs less by the key date). No BTO total — so no
 *   comparison — while the wait, or the rent paid during a wait, is unknown (Phase 7 A7: never a silent S$0).
 */
export function compareBtoResale({ asOf, keyDate, waitMonths: waitIn = null, btoPrice, resalePrice, monthlyRent }, policy) {
  const notes = [], missing = [];
  const typedWait = waitIn != null && waitIn !== '' && Number.isFinite(+waitIn) && +waitIn >= 0 ? Math.round(+waitIn) : null;
  const waitMonths = keyDate ? monthsBetween(asOf, keyDate) : typedWait;
  const rentKnown = monthlyRent != null && monthlyRent !== '' && Number.isFinite(+monthlyRent) && +monthlyRent >= 0;
  if (waitMonths == null) { missing.push('wait'); notes.push('How long you wait for the keys is not known yet — no comparison until you set it.'); }
  const rentWhileWaiting = waitMonths == null ? null : waitMonths === 0 ? 0 : rentKnown ? waitMonths * +monthlyRent : null;
  if (waitMonths != null && rentWhileWaiting == null) { missing.push('rent'); notes.push('No rent figure — enter your rent now to include the rent paid while waiting.'); }
  if (!(btoPrice > 0)) missing.push('price');
  const btoTotal = btoPrice > 0 && rentWhileWaiting != null ? btoPrice + rentWhileWaiting : null;
  const resaleTotal = resalePrice > 0 ? resalePrice : null;
  if (resaleTotal == null) missing.push('resale');
  const difference = btoTotal != null && resaleTotal != null ? resaleTotal - btoTotal : null;
  const cheaper = difference == null ? null : difference > 0 ? 'bto' : difference < 0 ? 'resale' : null;
  notes.push('Grants differ: resale buyers may get the CPF Housing Grant on top of the EHG; not included here.');
  notes.push('Both start the Minimum Occupation Period at key collection; a BTO also comes with a fresh lease.');
  return {
    waitMonths, rentWhileWaiting, btoTotal, resaleTotal, difference, cheaper, missing,
    btoLeaseYears: policy.get('lease.term.years'), mopYears: policy.get('rentbuy.mop.years').standard, notes,
  };
}
