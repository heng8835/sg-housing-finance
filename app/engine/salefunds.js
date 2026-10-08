// The sale of the home you own now, as the purchase engine (engine/plan.js planPurchase) counts it: cash and the
// CPF refund it releases, the HDB second-loan rule and ABSD at the purchase. Same rules and order as
// engine/sellbuy.js sellThenBuy() for an HDB resale next flat, so Afford, Scenarios and the guides agree with
// Plan → Sell then buy (tests/engine/salefunds.test.js checks the two side by side). Pure; policy passed in; the year
// for the accrued-interest estimate comes in (saleInput).
import { saleProceeds, sellerStampDuty, defaultMode } from './sellbuy.js';
import { absdRate } from './grants.js';

const MODES = ['contra', 'sell-first', 'buy-first'];
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? 0 : +v);
const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;

// ---- the sale input: Plan's "I own a home now and will sell it" (store plan.current), mapped exactly as
// modules/plan/sellbuy.js maps it for sellThenBuy(), so every screen counts the same sale

/**
 * @param {object|null} plan  the store's `plan` slice (or a scenario snapshot's plan)
 * @param {number} year       this calendar year (the accrued-interest estimate runs to it; blank purchase year →
 *   engine/sellbuy.js uses year − years held)
 * @returns {{ current:object, mode:string|null }|null}  null = no sale ticked, or no sale price yet
 */
export function saleInput(plan, year) {
  const c = plan && plan.current;
  if (!c || !c.owns || !(+c.salePrice > 0)) return null;
  return {
    current: {
      salePrice: +c.salePrice, outstandingLoan: c.outstandingLoan, cpfPrincipalUsed: c.cpfUsed, accruedInterest: c.accruedInterest,
      boughtYear: c.boughtYear ?? null, asOfYear: year, flatType: c.flatType, propertyType: c.propertyType, subsidised: c.subsidised, holdingYears: c.yearsHeld,
    },
    mode: c.mode || null,
  };
}

/**
 * @param {{ sale:{ current:object, mode?:'contra'|'sell-first'|'buy-first'|null }, household:object }} x
 *   current = sellThenBuy()'s `current` (salePrice, outstandingLoan, cpfPrincipalUsed, accruedInterest, boughtYear,
 *   asOfYear, flatType, propertyType, subsidised, holdingYears …)
 * @returns {{ mode:string, fromType:'hdb'|'private', usable:boolean, proceeds:object, ssd:{rate:number|null, amount:number},
 *   cash:number, cpf:number, absd:{ rate:number, note:string|null, remitted:boolean, remittedRate:number },
 *   current:object, notes:string[] }}  cash / cpf = what the purchase can use now (0 when buying first)
 */
export function saleFunds({ sale, household = {} }, policy) {
  const current = (sale && sale.current) || {};
  const fromType = current.propertyType === 'private' ? 'private' : 'hdb';
  const mode = MODES.includes(sale && sale.mode) ? sale.mode : defaultMode(fromType, 'hdb');
  const proceeds = saleProceeds(current, policy);
  const ssd = fromType === 'private'
    ? sellerStampDuty({ salePrice: proceeds.gross, holdingYears: current.holdingYears, acquiredBeforeSsdChange: !!current.acquiredBeforeSsdChange }, policy)
    : { rate: 0, amount: 0 };
  const usable = mode !== 'buy-first';
  const notes = [];

  // ABSD: buying first, the old home is still owned at the purchase; HDB's sell-within-N-months condition means
  // IRAS remits it upfront (as sellThenBuy)
  const ownedNow = Math.max(1, num(household.propertiesOwned ?? 1));
  const owned = usable ? ownedNow - 1 : ownedNow;
  const info = absdRate({ household: { ...household, propertiesOwned: owned } }, policy);
  let rate = info.rate, note = owned === 0 ? info.note : null, remitted = false, remittedRate = 0;
  if (!usable && rate > 0) {
    remitted = true; remittedRate = rate; rate = 0;
    note = `ABSD is remitted upfront because HDB requires the old property to be sold within ${policy.get('sellbuy.dispose_existing.months')} months.`;
  }
  if (!usable) notes.push('Buying first: the down payment comes from savings; sale proceeds arrive later.');

  return {
    mode, fromType, usable, proceeds, ssd,
    cash: usable ? proceeds.cashProceeds - ssd.amount : 0,
    cpf: usable ? proceeds.cpfReturnedToOa : 0,
    absd: { rate, note, remitted, remittedRate }, current, notes,
  };
}

/**
 * HDB second-loan rule (sellbuy.hdb_loan.cash_retain_*): the full CPF refund and the cash proceeds above the greater
 * of S$min or ratio × cash go into the purchase first, so the HDB loan is at most price − that amount.
 * @returns {{ loan:number, mustUse:number, retain:number|null, note:string|null }}
 */
export function secondLoanCap({ price, loan, sf }, policy) {
  if (!sf || !sf.usable || !(loan > 0)) return { loan, mustUse: 0, retain: null, note: null };
  const cashP = Math.max(0, sf.proceeds.cashProceeds);
  const retain = Math.max(policy.get('sellbuy.hdb_loan.cash_retain_min'), policy.get('sellbuy.hdb_loan.cash_retain_ratio') * cashP);
  const mustUse = sf.proceeds.cpfRefund + Math.max(0, cashP - retain);
  return {
    loan: Math.min(loan, Math.max(0, price - mustUse)), mustUse, retain,
    note: `Second HDB loan: the full CPF refund and cash proceeds above ${money(retain)} go into the purchase first.`,
  };
}
