// Grant notes that fit the household (Phase 7b B11): engine/grants.js returns the grants the household gets plus
// notes; here the general assumption note is shown only when there is a grant it is about, and the grants the
// household does not get are listed with the engine's reason ("Grants you can't get now"). Pure; English keys for t().

export const GRANT_IDS = ['ehg', 'chg', 'phg'];
export const GRANT_ASSUMPTION = 'Assumes the 12-month employment condition is met and no grant was taken before.';
const SHORT_LEASE = 'The lease does not cover the youngest buyer to 95';
export const NO_PHG = 'Only when you live with or near your parents or married child — set it in Your household, or tag a daily place as your parents’ home.';
export const NO_EHG_BAND = 'Household income is above the Enhanced CPF Housing Grant income bands.';
export const NOT_THIS_HOUSEHOLD = 'Not available for this household as entered.';

/** The notes worth showing: the employment / earlier-grant assumption only when some grant is counted. */
export function grantNotesFor(g) {
  const notes = g && Array.isArray(g.notes) ? g.notes : [];
  const any = g && Array.isArray(g.items) && g.items.length > 0;
  return notes.filter((n) => any || n !== GRANT_ASSUMPTION);
}

/**
 * Grants this household does not get, each with a reason from the grants engine's notes (or the household's
 * parents setting for the PHG). [] when a grant override is in use (the user's own figure).
 * @returns {{ id:'ehg'|'chg'|'phg', why:string }[]}
 */
export function grantsMissing(g, h) {
  if (!g || (h && h.grantsOverride != null)) return [];
  const have = new Set((g.items || []).map((i) => i.id));
  const general = (g.notes || []).find((n) => n !== GRANT_ASSUMPTION && !n.startsWith(SHORT_LEASE)) || null;
  const out = [];
  for (const id of GRANT_IDS) {
    if (have.has(id)) continue;
    let why;
    if (id === 'phg') why = h && (h.parents === 'with' || h.parents === 'near') ? general || NOT_THIS_HOUSEHOLD : NO_PHG;
    else if (id === 'ehg' && have.has('chg')) why = NO_EHG_BAND;
    else why = general || NOT_THIS_HOUSEHOLD;
    out.push({ id, why });
  }
  return out;
}
