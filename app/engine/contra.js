// Contra / sell-then-buy timeline (AF-11): the HDB resale steps for selling the current flat and buying the next,
// built on engine/sellbuy.js `timeline()` (each coarse step expanded into the HDB steps), where the "contra" sits
// (sell and buy at the same time so the sale pays for the purchase), and — from the two completion dates the user
// expects — the gap or overlap and the cash bridge needed if the purchase completes before the sale.
// Pure: no DOM, no clock; dates are ISO 'YYYY-MM-DD' strings passed in; every rule value via `policy.get(id)`.
// Messages are [English template, values] pairs (UI translates the template via zh-engine.json).
import { timeline } from './sellbuy.js';
import { addMonths, isIsoDate } from './keydates.js';

const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;
const DAY_MS = Date.UTC(0, 0, 2) - Date.UTC(0, 0, 1);
const dayNo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
/** Calendar days from `a` to `b` (negative when b is earlier). */
export const daysBetween = (a, b) => Math.round(dayNo(b) - dayNo(a));

// phase order used to interleave the two sides of a contra (sell before buy inside a phase)
const PHASES = ['prep', 'option', 'exercise', 'application', 'contra', 'complete', 'after'];
const rank = (phase) => PHASES.indexOf(phase);

/** HDB detail for one coarse step of `timeline()`; other steps pass through unchanged. */
function expand(s, policy) {
  const otp = policy.get('sellbuy.otp.exercise_days'), done = policy.get('sellbuy.resale.completion_days');
  const lane = s.step.startsWith('sell') ? 'sell' : s.step.startsWith('buy') ? 'buy' : 'both';
  const at = (id, phase, extra = {}) => ({ id, lane, phase, days: null, maxMonths: null, ruleIds: [], ...extra });
  switch (s.step) {
    case 'sell-otp': return [
      at('sell-intent', 'prep', { days: policy.get('sellbuy.intent_to_sell.days_before_otp'), ruleIds: ['sellbuy.intent_to_sell.days_before_otp'] }),
      at('sell-otp', 'option', { days: otp, ruleIds: ['sellbuy.otp.exercise_days'] }),
      at('sell-exercise', 'exercise'),
    ];
    case 'sell-complete': return [
      at('sell-application', 'application'),
      at('sell-complete', 'complete', { days: done, ruleIds: ['sellbuy.resale.completion_days'] }),
    ];
    case 'buy-otp': return [
      at('buy-hfe', 'prep', { ruleIds: ['sellbuy.intent_to_sell.days_before_otp'] }),
      at('buy-otp', 'option', { days: policy.get('sellbuy.request_for_value.working_days'), ruleIds: ['sellbuy.request_for_value.working_days'] }),
      at('buy-exercise', 'exercise', { days: otp, ruleIds: ['sellbuy.otp.exercise_days'] }),
    ];
    case 'buy-complete': return [
      at('buy-application', 'application'),
      at('buy-complete', 'complete', { days: done, ruleIds: ['sellbuy.resale.completion_days'] }),
    ];
    case 'extension-of-stay': return [at('extension-of-stay', 'after', { lane: 'sell', maxMonths: s.maxMonths, ruleIds: ['sellbuy.extension_of_stay.max_months'] })];
    case 'dispose-old': return [at('dispose-old', 'after', { lane: 'sell', maxMonths: s.maxMonths, ruleIds: s.maxMonths ? ['sellbuy.dispose_existing.months'] : [] })];
    case 'contra': return [];
    default: return [at(s.step, s.step.endsWith('private') || s.step === 'buy-new-flat' ? 'complete' : 'after')];
  }
}

/**
 * Detailed steps of a move, in order.
 * @param {{ mode:'contra'|'sell-first'|'buy-first', fromType:'hdb'|'private', toType:'hdb'|'private', nextSubsidised?:boolean }} x
 * @returns {{ id:string, lane:'sell'|'buy'|'both', phase:string, days:number|null, maxMonths:number|null, ruleIds:string[] }[]}
 *   days: the HDB period that goes with the step (Intent to Sell lead time, option period, completion window…).
 */
export function moveSteps(x, policy) {
  const coarse = timeline(x, policy);
  const steps = coarse.flatMap((s) => expand(s, policy));
  if (x.mode !== 'contra') return steps;
  // contra: both sides run side by side; the contra point sits between the applications and the completions
  steps.push({ id: 'contra', lane: 'both', phase: 'contra', days: null, maxMonths: null, ruleIds: [] });
  return steps.map((s, i) => ({ s, i })).sort((a, b) => (rank(a.s.phase) - rank(b.s.phase)) || (a.i - b.i)).map(({ s }) => s);
}

/**
 * Gap between the two completions and what it means.
 * @param {{ saleCompletion?:string|null, purchaseCompletion?:string|null, mode:string, toType:'hdb'|'private', nextSubsidised?:boolean,
 *   funding?:{ items:{amount:number, cpf:boolean}[] }|null, grants?:number, ownCash?:number, ownCpf?:number, loanType?:'hdb'|'bank' }} x
 *   funding = the next purchase's funding (engine/funding.js) as planned with the sale proceeds;
 *   ownCash / ownCpf = savings and OA without the sale.
 * @returns {{ order:'same-day'|'sale-first'|'purchase-first'|null, days:number|null, stayBy:string|null, stayCovered:boolean|null,
 *   bridge:number|null, disposeBy:string|null, disposeOk:boolean|null, notes:[string, any[]][] }}
 */
export function completionGap(x, policy) {
  const notes = [];
  const sale = isIsoDate(x.saleCompletion) ? x.saleCompletion : null;
  const buy = isIsoDate(x.purchaseCompletion) ? x.purchaseCompletion : null;
  const out = { order: null, days: null, stayBy: null, stayCovered: null, bridge: null, disposeBy: null, disposeOk: null, notes };
  if (!sale || !buy) {
    notes.push(['Enter both expected completion dates to see the gap between the sale and the purchase.', []]);
    return out;
  }
  const days = daysBetween(sale, buy);
  out.days = days;
  if (x.mode === 'buy-first' || days < 0) {
    const months = policy.get('sellbuy.dispose_existing.months');
    if (x.toType === 'hdb') {
      out.disposeBy = addMonths(buy, months);
      out.disposeOk = sale <= out.disposeBy;
      if (!out.disposeOk) notes.push(['The sale completes after {0} — HDB requires the old property to be sold within {1} months of the purchase.', [out.disposeBy, months]]);
    }
  }
  if (days === 0) {
    out.order = 'same-day';
    notes.push(['Both complete on the same day: the CPF refund and cash from the sale go straight into the purchase.', []]);
    return out;
  }
  if (days > 0) {
    out.order = 'sale-first';
    const stay = policy.get('sellbuy.extension_of_stay.max_months');
    out.stayBy = addMonths(sale, stay);
    // extension of stay is only for sellers who have committed to buy a completed home
    const completedHome = !x.nextSubsidised;
    out.stayCovered = completedHome && buy <= out.stayBy;
    notes.push(out.stayCovered
      ? ['You need somewhere to live for {0} days — an extension of stay (up to {1} months, if your buyer agrees) can cover it.', [days, stay]]
      : ['You need somewhere to live for {0} days between the two completions (an extension of stay covers at most {1} months).', [days, stay]]);
    return out;
  }
  // purchase first: what the sale was going to pay must be found elsewhere until it completes
  out.order = 'purchase-first';
  const items = x.funding?.items || [];
  const cashOnly = items.filter((i) => !i.cpf).reduce((s, i) => s + i.amount, 0);
  const cpfAble = items.filter((i) => i.cpf).reduce((s, i) => s + i.amount, 0);
  const cpfPool = Math.max(0, x.ownCpf || 0) + Math.max(0, x.grants || 0);
  const cashNeeded = cashOnly + Math.max(0, cpfAble - cpfPool);
  out.bridge = Math.max(0, cashNeeded - Math.max(0, x.ownCash || 0));
  notes.push(out.bridge > 0
    ? ['The purchase completes {0} days before the sale: about {1} in cash is needed to bridge the gap (the CPF refund only reaches your OA when the sale completes).', [-days, money(out.bridge)]]
    : ['The purchase completes {0} days before the sale; your own savings cover it without the sale proceeds.', [-days]]);
  if (x.loanType === 'hdb' && x.toType === 'hdb') notes.push(['With a second HDB loan the sale proceeds must go into the purchase — ask HDB how this works when the purchase completes first.', []]);
  return out;
}
