// CPF LIFE at the payout age with vs without a purchase (roadmap CPF-11: "this flat ≈ −S$X/month at 65").
// Sums the buyers' estimated CPF LIFE (Standard) monthly payouts from engine/cpf.js simulate() — the same
// per-buyer projection as the Plan tab's CPF cards (engine/cpfbuy.js buyerProjection), so both show the
// same numbers. OA used upfront and for the monthly instalments no longer reaches the Retirement Account at
// 55, which lowers the payout. Pure: the year and the modelling defaults come in as inputs. An estimate.
// Buyers already at the payout age (Phase 7 A10) are not projected: their payout has started and buying does not
// change it; the monthly payout they entered (buyer.cpfLifeMonthly, optional) is counted on both sides.
import { buyerProjection, atPayoutAge, enteredPayout } from './cpfbuy.js';
import { planPurchase } from './plan.js';

const empty = (v) => v == null || v === '';
const BALANCES = ['cpfOa', 'cpfSa', 'cpfMa', 'cpfRa'];
const hasAny = (b) => !empty(b.age) || !empty(b.income) || BALANCES.some((k) => !empty(b[k]));

/** English messages per reason (UI translates them via zh-engine.json). */
export const PAYOUT_REASONS = Object.freeze({
  noage: "Add each buyer's age to estimate CPF LIFE.",
  nobalances: "Add each buyer's CPF balances to estimate CPF LIFE.",
  foreigner: 'No CPF LIFE: foreigners do not contribute to CPF.',
  noplan: 'Pick a flat with a price to compare CPF LIFE payouts.',
  atpayout: 'Already at the CPF LIFE payout age: payouts may have started, and buying a flat does not change them. Enter the monthly payout you receive in About you (optional).',
});

/**
 * Can the household's CPF LIFE be estimated? Every buyer who is not a foreigner needs an age and at least one
 * CPF balance (OA, SA, MA or RA; 0 counts). Buyers with nothing entered are ignored. With `policy`, buyers already
 * at the payout age need no balances (they are not projected).
 * @returns {{ reason:'noage'|'nobalances'|'foreigner', buyer:number|null, message:string }|null}  null = ready
 */
export function payoutReadiness(household, policy = null) {
  const present = ((household && household.buyers) || []).map((b, i) => ({ b, i })).filter(({ b }) => b && hasAny(b));
  const members = present.filter(({ b }) => b.citizenship !== 'F');
  const out = (reason, buyer = null) => ({ reason, buyer, message: PAYOUT_REASONS[reason] });
  if (!present.length) return out('noage', 0);
  if (!members.length) return out('foreigner');
  const noAge = members.find(({ b }) => !(+b.age > 0));
  if (noAge) return out('noage', noAge.i);
  const noBal = members.find(({ b }) => !(policy && atPayoutAge(b, policy)) && !BALANCES.some((k) => !empty(b[k])));
  if (noBal) return out('nobalances', noBal.i);
  return null;
}

const sumLife = (lives) => ({
  monthly: lives.reduce((s, l) => s + l.monthly, 0),
  low: lives.reduce((s, l) => s + l.monthlyLow, 0),
  high: lives.reduce((s, l) => s + l.monthlyHigh, 0),
});

/**
 * Household CPF LIFE monthly payout at the payout age, with and without buying this flat.
 * Give `plan` (a planPurchase() result — the Plan tab passes its own) or `flat` ({ price, flatType, remainingLease }).
 * @param {{ household:object, plan?:object|null, flat?:{ price:number, flatType?:string, remainingLease?:number|null }|null,
 *   settings?:{ wageGrowth?:number|null, bonusMonths?:number|null, prYear?:object }, defaults:{ wageGrowth:number, bonusMonths:number },
 *   year:number }} x
 * @returns {{ ok:true, estimate:true, atAge:number, without:{ monthly:number, low:number, high:number },
 *   withBuy:{ monthly:number, low:number, high:number }, delta:number,
 *   buyers:{ i:number, without:number, withBuy:number, delta:number, atPayout:boolean, entered:boolean }[],
 *   atPayout:number[], payoutMissing:number[], allAtPayout:boolean }
 *   | { ok:false, reason:'noage'|'nobalances'|'foreigner'|'noplan'|'atpayout', buyer:number|null, message:string }}
 *   delta = withBuy − without (negative: the purchase lowers the payout); foreign buyers are left out of the sums.
 *   atPayout = buyers at the payout age (not projected; delta 0, their entered payout on both sides);
 *   payoutMissing = those of them with no payout entered (left out of the sums); reason 'atpayout' = every member
 *   is at the payout age and none entered a payout (nothing to show).
 */
export function lifePayoutDelta({ household, plan = null, flat = null, settings = {}, defaults, year }, policy) {
  const notReady = payoutReadiness(household, policy);
  if (notReady) return { ok: false, ...notReady };
  let p = plan;
  if (!p && flat && flat.price > 0) {
    p = planPurchase({ household, flat: { price: flat.price, flatType: flat.flatType || '4 ROOM', remainingLease: flat.remainingLease ?? null } }, policy);
  }
  if (!p) return { ok: false, reason: 'noplan', buyer: null, message: PAYOUT_REASONS.noplan };
  const all = household.buyers;
  const rows = [];
  const started = [], missing = [];
  all.forEach((b, i) => {
    if (!b || !hasAny(b) || b.citizenship === 'F') return;
    if (atPayoutAge(b, policy)) {
      started.push(i);
      const v = enteredPayout(b);
      if (v == null) { missing.push(i); return; }
      const fixed = { monthly: v, monthlyLow: v, monthlyHigh: v };
      rows.push({ i, w: fixed, b: fixed, atPayout: true });
      return;
    }
    const r = buyerProjection({ buyers: all, i, plan: p, settings, defaults, year }, policy);
    if (!r.without.applicable || !r.without.life || !r.withBuy || !r.withBuy.life) return;
    rows.push({ i, w: r.without.life, b: r.withBuy.life, atPayout: false });
  });
  if (!rows.length && missing.length) return { ok: false, reason: 'atpayout', buyer: missing[0], message: PAYOUT_REASONS.atpayout };
  if (!rows.length) return { ok: false, reason: 'foreigner', buyer: null, message: PAYOUT_REASONS.foreigner };
  const without = sumLife(rows.map((r) => r.w)), withBuy = sumLife(rows.map((r) => r.b));
  return {
    ok: true, estimate: true, atAge: policy.get('cpf.age.life_payout'), without, withBuy,
    delta: withBuy.monthly - without.monthly,
    buyers: rows.map((r) => ({ i: r.i, without: r.w.monthly, withBuy: r.b.monthly, delta: r.b.monthly - r.w.monthly, atPayout: r.atPayout, entered: r.atPayout })),
    atPayout: started, payoutMissing: missing, allAtPayout: rows.every((r) => r.atPayout),
  };
}

/**
 * Phase 7b B6 (owner question O8): household CPF LIFE a month at the payout age, before and after a Retirement Account
 * top-up made now (Silver Housing Bonus / Lease Buyback). The same per-buyer projection as above (buyerProjection,
 * no purchase), with the top-up added to the buyer's RA balance today — no payout formula of our own. Estimated only
 * for buyers who already have an RA (age ≥ cpf.age.ra_formation) and are below the payout age. A buyer at the
 * payout age gets no estimate: the payout goes up and CPF works out the new amount (`goesUp`).
 * @param {{ household:object, topUps?:(number|null)[], settings?:object, defaults:{ wageGrowth:number, bonusMonths:number },
 *   year:number }} x  topUps = S$ per buyer index (missing / 0 = no top-up)
 * @returns {{ ok:true, estimate:true, atAge:number, before:{ monthly:number, low:number, high:number },
 *   after:{ monthly:number, low:number, high:number }|null, delta:number|null,
 *   buyers:{ i:number, topUp:number, before:number|null, after:number|null, atPayout:boolean, goesUp:boolean }[],
 *   goesUp:number[], notApplied:number[], payoutMissing:number[] }
 *   | { ok:false, reason:'noage'|'nobalances'|'foreigner'|'atpayout', buyer:number|null, message:string }}
 *   after / delta null when a buyer at the payout age gets a top-up (CPF works it out); notApplied = buyers given a
 *   top-up who have no RA yet (left unchanged); payoutMissing = buyers at the payout age with no payout entered
 *   (left out of `before`).
 */
export function lifePayoutTopUp({ household, topUps = [], settings = {}, defaults, year }, policy) {
  const notReady = payoutReadiness(household, policy);
  if (notReady) return { ok: false, ...notReady };
  const all = household.buyers;
  const raAge = policy.get('cpf.age.ra_formation');
  const rows = [], goesUp = [], notApplied = [], missing = [];
  const lifeOf = (buyers, i) => buyerProjection({ buyers, i, plan: null, settings, defaults, year }, policy).without.life;
  all.forEach((b, i) => {
    if (!b || !hasAny(b) || b.citizenship === 'F') return;
    const topUp = Math.max(0, +topUps[i] || 0);
    if (atPayoutAge(b, policy)) {
      const v = enteredPayout(b);
      if (v == null) missing.push(i);
      if (topUp > 0) goesUp.push(i);
      const fixed = v == null ? null : { monthly: v, monthlyLow: v, monthlyHigh: v };
      rows.push({ i, topUp, w: fixed, b: topUp > 0 ? null : fixed, atPayout: true, goesUp: topUp > 0 });
      return;
    }
    const before = lifeOf(all, i);
    if (!before) return;
    let after = before;
    if (topUp > 0 && +b.age >= raAge) after = lifeOf(all.map((x, j) => (j === i ? { ...x, cpfRa: (+x.cpfRa || 0) + topUp } : x)), i);
    else if (topUp > 0) notApplied.push(i);
    rows.push({ i, topUp, w: before, b: after, atPayout: false, goesUp: false });
  });
  const known = rows.filter((r) => r.w);
  if (!known.length && missing.length) return { ok: false, reason: 'atpayout', buyer: missing[0], message: PAYOUT_REASONS.atpayout };
  if (!rows.length) return { ok: false, reason: 'foreigner', buyer: null, message: PAYOUT_REASONS.foreigner };
  const before = sumLife(known.map((r) => r.w));
  const after = goesUp.length ? null : sumLife(known.map((r) => r.b));
  return {
    ok: true, estimate: true, atAge: policy.get('cpf.age.life_payout'), before, after, delta: after ? after.monthly - before.monthly : null,
    buyers: rows.map((r) => ({ i: r.i, topUp: r.topUp, before: r.w ? r.w.monthly : null, after: r.b ? r.b.monthly : null, atPayout: r.atPayout, goesUp: r.goesUp })),
    goesUp, notApplied, payoutMissing: missing,
  };
}
