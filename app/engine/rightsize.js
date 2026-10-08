// "Cash freed now" for a right-sizing move (Phase 7b B6, Plan → Options at 55 and above). Pure; every rule via
// policy.get(id). The sale is counted exactly as Plan → Sell then buy counts it (engine/salefunds.js saleFunds →
// engine/sellbuy.js saleProceeds: loan first, then the CPF refund, then fees; the rest is cash), sold before the
// smaller flat is bought. The smaller flat is assumed paid outright from the sale (no new loan): its price, Buyer's
// Stamp Duty, legal fees and (resale) HDB fees. An RA top-up (Silver Housing Bonus) is met by the CPF refund first —
// CPF housing refunds count towards it (seniors.shb.full_topup note) — then by cash. Money that stays in CPF is never
// called cash. No Lease Buyback proceeds here: HDB does not publish how it values the lease it buys.
import { saleFunds } from './salefunds.js';
import { bsd } from './stamp-duty.js';

const optNum = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

/**
 * @param {{ sale:{ current:object, mode?:string|null }|null, nextPrice:number|null, nextResale?:boolean,
 *   raTopUp?:number|null, bonus?:number|null, household?:object }} x
 *   sale = engine/salefunds.js saleInput() (null = not selling / no sale price); nextPrice = the smaller flat
 * @returns {{ ok:false, reason:'nosale'|'noprice' } | { ok:true, saleCash:number, cpfRefund:number, released:number,
 *   next:{ price:number, bsd:number, legal:number, hdbFees:number, total:number }, topUp:number, topUpFromCpf:number,
 *   topUpCash:number, left:number, keptInCpf:number, bonus:number, cashFreed:number|null, short:number }}
 *   released = sale cash + CPF refund; left = released − next.total − topUp; short > 0 = the sale does not cover the
 *   smaller flat and the top-up (cashFreed null); keptInCpf = CPF refund left over (stays in CPF, not cash);
 *   cashFreed = left − keptInCpf + bonus (the cash bonus is paid in cash)
 */
export function rightSizeCash({ sale, nextPrice, nextResale = true, raTopUp = 0, bonus = 0, household = {} }, policy) {
  if (!sale || !sale.current || !(optNum(sale.current.salePrice) > 0)) return { ok: false, reason: 'nosale' };
  const price = optNum(nextPrice);
  if (!(price > 0)) return { ok: false, reason: 'noprice' };
  const sf = saleFunds({ sale: { current: sale.current, mode: 'sell-first' }, household }, policy);
  const saleCash = sf.cash, cpfRefund = sf.proceeds.cpfRefund;
  const next = { price, bsd: bsd(price, policy.get('stamp.bsd.bands')), legal: policy.get('assumption.fees.legal'), hdbFees: nextResale ? policy.get('fees.resale.hdb_admin') : 0 };
  next.total = next.price + next.bsd + next.legal + next.hdbFees;
  const topUp = Math.max(0, optNum(raTopUp) || 0), cashBonus = Math.max(0, optNum(bonus) || 0);
  const released = saleCash + cpfRefund;
  const left = released - next.total - topUp;
  // the CPF refund goes to the RA top-up first, then to the smaller flat; what is left of it stays in CPF
  const topUpFromCpf = Math.min(topUp, cpfRefund);
  const keptInCpf = Math.max(0, cpfRefund - topUpFromCpf - next.total);
  const short = Math.max(0, -left);
  return {
    ok: true, saleCash, cpfRefund, released, next, topUp, topUpFromCpf, topUpCash: topUp - topUpFromCpf,
    left, keptInCpf, bonus: cashBonus, cashFreed: short > 0 ? null : left - keptInCpf + cashBonus, short,
  };
}
