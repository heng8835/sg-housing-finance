// CPF housing grants for a resale flat (BR-G1..G3) and the ABSD rate (BR-T2). Pure; policy passed in.
// Simplifications (shown to the user as notes): employment condition assumed met; family
// nucleus taken from the listed buyers; EHG pro-ration for short leases not computed (formula
// not published, policy grant.ehg.short_lease_proration) — the full amount is marked `upTo` with a note.
import { summarise } from './household.js';

// flat-type labels as in the HDB data ('4 ROOM', 'EXECUTIVE', 'MULTI-GENERATION' …)
const isType = (flatType, ...names) => names.some((n) => (flatType || '').toUpperCase().startsWith(n));
export const flatSize = (flatType) => (isType(flatType, '5 ROOM', 'EXECUTIVE', 'MULTI') ? 'large' : 'small');

const fromBands = (bands, income) => { for (const [upTo, amount] of bands) if (income <= upTo) return amount; return 0; };

/**
 * @param {{ household: object, flatType?: string|null, coversTo95?: boolean|null, parentsKm?: number|null }} x
 *   parentsKm = straight-line km from this flat to the place tagged "Parents' or child's home" (B12); null = none tagged
 * @returns {{ total:number, items:{id:'ehg'|'chg'|'phg', amount:number, upTo?:true}[], notes:string[] }}  upTo = short-lease EHG, not pro-rated
 */
export function grants({ household: h, flatType = null, coversTo95 = null, parentsKm = null }, policy) {
  const s = summarise(h), items = [], notes = [];
  const done = () => ({ total: items.reduce((t, i) => t + i.amount, 0), items, notes });
  const single = h.scheme === 'single';
  const size = flatSize(flatType);

  if (!s.buyers.length) { notes.push('Add the buyers in Household to estimate grants.'); return done(); }
  if (!s.citizenships.includes('SC')) { notes.push('CPF housing grants need at least one Singapore Citizen buyer.'); return done(); }
  if (isType(flatType, '1 ROOM')) { notes.push('Grants apply to 2-room and bigger flats.'); return done(); }
  if (single && s.youngestAge != null && s.youngestAge < policy.get('eligibility.single.min_age')) {
    notes.push(`The singles scheme starts at age ${policy.get('eligibility.single.min_age')}.`); return done();
  }
  if (single && isType(flatType, 'EXECUTIVE', 'MULTI')) { notes.push('Singles cannot buy this flat type.'); return done(); }

  // CPF Housing Grant (resale) — first-timers (and first + second-timer couples), within the income ceiling
  const ceiling = policy.get(single ? 'eligibility.income_ceiling.single' : 'eligibility.income_ceiling.family');
  if (s.income == null) notes.push('Enter income to check the income ceiling and the EHG band.');
  else if (s.income > ceiling) notes.push('Household income is above the ceiling for the CPF Housing Grant (and the HDB loan).');
  else if (h.firstTimer === false) notes.push('Second-timer households do not get the CPF Housing Grant for resale.');
  else if (single) items.push({ id: 'chg', amount: policy.get('grant.chg.resale.single')[size] });
  else {
    const chg = policy.get('grant.chg.resale.family');
    const pair = s.citizenships.includes('PR') ? 'SC_SPR' : 'SC_SC';
    items.push({ id: 'chg', amount: h.firstTimer === 'mixed' ? chg.mixed[size] : chg.first_timer[size][pair] });
  }

  // Enhanced CPF Housing Grant — first-timers; a mixed couple uses the singles table on half the income
  if (s.income != null && h.firstTimer !== false && items.some((i) => i.id === 'chg')) {
    const mixed = !single && h.firstTimer === 'mixed';
    const table = policy.get(single || mixed ? 'grant.ehg.single' : 'grant.ehg.family');
    const amount = fromBands(table.bands, mixed ? s.income / 2 : s.income);
    if (amount > 0) {
      // short lease: HDB pro-rates the EHG by a formula it does not publish → the full band amount is the most it can be
      items.push(coversTo95 === false ? { id: 'ehg', amount, upTo: true } : { id: 'ehg', amount });
      if (coversTo95 === false) notes.push('The lease does not cover the youngest buyer to 95: the EHG shown is the most you could get. HDB will pro-rate it (formula not published), so the actual amount is lower.');
    }
  }

  // Proximity Housing Grant — no income ceiling; "near" decided per flat from the parents' place once one is tagged (B12)
  const ph = phgNear({ household: h, parentsKm }, policy);
  if (ph.kind) items.push({ id: 'phg', amount: policy.get('grant.phg')[single ? 'single' : 'family'][ph.kind] });
  if (ph.note) notes.push(ph.note);

  notes.push('Assumes the 12-month employment condition is met and no grant was taken before.');
  return done();
}

/** The PHG "near" distance (km, policy grant.phg.near_km), or null while it is missing / unsourced — then nothing is decided. */
export function phgLimitKm(policy) {
  try { const v = policy.get('grant.phg.near_km'); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}

/** Notes (English keys, translated by the caller) for the per-flat PHG decision. */
export const PHG_NOTES = {
  near: "PHG for living near: decided from the straight-line distance to your parents' place. HDB checks the exact distance.",
  far: "No PHG for living near: your parents' place is farther than the PHG distance from this flat (straight line). HDB checks the exact distance.",
  unknown: "The PHG distance is not in this app's rules yet, so your household setting is used for the PHG.",
};

/**
 * Which PHG applies for one flat (B12). "Living with" (household setting) always wins; otherwise, once a place is
 * tagged "Parents' or child's home" (parentsKm is a number), "near" = within the policy distance — decided per flat,
 * the household's "near" setting is then not used. No tagged place (or no sourced distance) → the household setting.
 * @param {{ household: object, parentsKm?: number|null }} x
 * @returns {{ kind:'with'|'near'|null, basis:'with'|'distance'|'household', km:number|null, limitKm:number|null, within:boolean|null, note:string|null }}
 */
export function phgNear({ household: h, parentsKm = null }, policy) {
  const km = Number.isFinite(parentsKm) ? parentsKm : null, limitKm = km == null ? null : phgLimitKm(policy);
  const fromHousehold = h.parents === 'near' ? 'near' : null;
  if (h.parents === 'with') return { kind: 'with', basis: 'with', km, limitKm, within: null, note: null };
  if (km == null) return { kind: fromHousehold, basis: 'household', km: null, limitKm: null, within: null, note: null };
  if (limitKm == null) return { kind: fromHousehold, basis: 'household', km, limitKm: null, within: null, note: PHG_NOTES.unknown };
  const within = km <= limitKm;
  return { kind: within ? 'near' : null, basis: 'distance', km, limitKm, within, note: within ? PHG_NOTES.near : PHG_NOTES.far };
}

/**
 * Additional Buyer's Stamp Duty rate for this household's next purchase. Joint buyers pay the
 * highest applicable rate. Remissions are reported, not applied — except the married-couple
 * first-home remission when a family with an SC buyer owns nothing yet.
 */
export function absdRate({ household: h }, policy) {
  const s = summarise(h), rates = policy.get('stamp.absd.rates');
  const nth = Math.min(Math.max(0, +h.propertiesOwned || 0), rates.SC.length - 1);
  const cits = s.citizenships.length ? s.citizenships : ['SC'];
  // free-trade-agreement nationals (US, Iceland, Liechtenstein, Norway, Switzerland) pay SC rates (IRAS)
  const table = (b) => (b.citizenship === 'F' && (b.nationality === 'US' || b.nationality === 'EFTA') ? rates.SC : rates[b.citizenship || 'SC'] || rates.F);
  const buyers = s.buyers.length ? s.buyers : [{ citizenship: 'SC' }];
  let rate = Math.max(...buyers.map((b) => table(b)[nth]));
  let note = null;
  if (rate > 0 && h.scheme !== 'single' && nth === 0 && cits.includes('SC') && cits.every((c) => c === 'SC' || c === 'PR')) {
    rate = 0; note = 'Married SC + PR couples buying their first home can get ABSD remitted (IRAS).';
  } else if (rate > 0 && nth > 0) {
    note = 'HDB owners upgrading to another HDB flat must sell the old one within 6 months and may get ABSD remitted upfront.';
  }
  return { rate, note };
}
