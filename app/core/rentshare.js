// One rent figure for the whole app (Phase 7b B7, owner question O9): the rent you pay now, typed once and used by
// Rent & Buy ("Is this rent fair?" / "Rent or buy?"), Plan → BTO or resale? ("Your rent now") and Plan → Key dates
// (the gap cost between a sale and the new keys). Kept in the store slot `plan.rent` = { type, amount, town, bid,
// label } — local only, never in a URL or a request. A room rent is the user's own figure: it is never estimated
// and never judged "fair" (DEC-016 Q3 — there is no public data on room rents).
// `plan.rentNow` (Phase 7 A7, read by modules/plan/btoinputs.js) is kept equal to `plan.rent.amount` both ways by
// bindSharedRent(), so the two names always hold the same figure.

export const RENT_KINDS = ['whole', 'room'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
/** A rent the user typed: a finite number ≥ 0 (0 = pays no rent), else null. */
export const rentAmount = (v) => (v == null || v === '' || !Number.isFinite(+v) || +v < 0 ? null : +v);

/**
 * The shared rent from the plan slice, cleaned: { type 'whole'|'room', amount|null, town|null, bid|null, label|null }.
 * An older save with only `plan.rentNow` gives that amount.
 */
export function sharedRent(plan) {
  const r = isObj(plan) && isObj(plan.rent) ? plan.rent : {};
  const amount = rentAmount(r.amount) ?? (isObj(plan) ? rentAmount(plan.rentNow) : null);
  const bid = Number.isInteger(r.bid) && r.bid >= 0 ? r.bid : null;
  return {
    type: r.type === 'room' ? 'room' : 'whole',
    amount,
    town: typeof r.town === 'string' && r.town ? r.town : null,
    bid,
    label: bid != null && typeof r.label === 'string' ? r.label : null,
  };
}

/** The rent block if it still names the same block in this data.js (labels compared), else null. */
export function rentBlock(rent, hdb, nameOf) {
  if (!rent || rent.bid == null || !hdb || !hdb.blocks || !hdb.blocks[rent.bid]) return null;
  return !rent.label || nameOf(hdb, rent.bid) === rent.label ? rent.bid : null;
}

/**
 * Keep `plan.rent.amount` and `plan.rentNow` equal (whichever was typed last wins). Runs once at mount: an older
 * save's `rentNow` fills the shared figure. Returns an unsubscribe function.
 */
export function bindSharedRent(store) {
  const same = (a, b) => rentAmount(a) === rentAmount(b);
  const fromRent = () => {
    const a = rentAmount(store.get('plan.rent.amount'));
    if (!same(a, store.get('plan.rentNow'))) store.set('plan.rentNow', a);
  };
  const fromNow = () => {
    const now = rentAmount(store.get('plan.rentNow'));
    const cur = isObj(store.get('plan.rent')) ? store.get('plan.rent') : {};
    if (!same(now, cur.amount)) store.set('plan.rent', { ...cur, amount: now });
  };
  // first run: an older save has only rentNow → it becomes the shared figure; otherwise the shared figure wins
  if (rentAmount(store.get('plan.rent.amount')) == null && rentAmount(store.get('plan.rentNow')) != null) fromNow(); else fromRent();
  // the store notifies by string prefix, so 'plan.rent' also fires for 'plan.rentNow' — the equality checks stop loops
  let last = rentAmount(store.get('plan.rentNow'));
  return store.subscribe('plan', () => {
    const now = rentAmount(store.get('plan.rentNow')), amount = rentAmount(store.get('plan.rent.amount'));
    if (now === amount) { last = now; return; }
    if (now !== last) fromNow(); else fromRent();
    last = rentAmount(store.get('plan.rentNow'));
  });
}
