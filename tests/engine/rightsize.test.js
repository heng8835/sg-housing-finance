// Phase 7b B6 — "Cash freed now" for right-sizing (engine/rightsize.js): the sale counted as Plan → Sell then buy
// counts it, the smaller flat paid outright, the RA top-up met by the CPF refund first, money left in CPF never
// called cash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rightSizeCash } from '../../app/engine/rightsize.js';
import { saleInput, saleFunds } from '../../app/engine/salefunds.js';
import { sellThenBuy } from '../../app/engine/sellbuy.js';
import { policy } from '../helpers.js';

// P4-like: Mr & Mrs Lim sell a 4-room for S$560,000 (no loan left, S$150,000 CPF used + S$60,000 interest typed)
const plan = (o = {}) => ({ current: { owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 560000, outstandingLoan: 0, cpfUsed: 150000, accruedInterest: 60000, ...o } });
const sale = (o) => saleInput(plan(o), 2026);

test('B6: Silver Housing Bonus — S$560k sale, S$300k 2-room, S$60k top-up, S$40k bonus → S$218,400 cash freed', () => {
  const r = rightSizeCash({ sale: sale(), nextPrice: 300000, raTopUp: 60000, bonus: 40000 }, policy);
  assert.equal(r.ok, true);
  // sale: 560,000 − CPF refund 210,000 − agent 2% 11,200 − legal 3,000 = 335,800 cash (same as Plan → Sell then buy)
  assert.equal(r.saleCash, 335800);
  assert.equal(r.cpfRefund, 210000);
  // smaller flat: 300,000 + BSD 4,200 (1% of 180k + 2% of 120k) + legal 3,000 + HDB resale fee 200
  assert.deepEqual(r.next, { price: 300000, bsd: 4200, legal: 3000, hdbFees: 200, total: 307400 });
  assert.equal(r.topUpFromCpf, 60000);
  assert.equal(r.topUpCash, 0);
  assert.equal(r.left, 545800 - 307400 - 60000);
  assert.equal(r.keptInCpf, 0);
  assert.equal(r.cashFreed, 178400 + 40000);
  assert.equal(r.short, 0);
});

test('B6: the sale cash is the same number Plan → Sell then buy shows ("Cash from the sale")', () => {
  const s = sale();
  const plan2 = sellThenBuy({ current: s.current, next: { price: 300000, flatType: '2 ROOM' }, household: {}, mode: 'sell-first' }, policy);
  const r = rightSizeCash({ sale: s, nextPrice: 300000 }, policy);
  assert.equal(r.saleCash, plan2.proceeds.cashAfterTaxes);
  assert.equal(r.cpfRefund, plan2.proceeds.cpfRefund);
  assert.equal(r.saleCash, saleFunds({ sale: { current: s.current, mode: 'sell-first' } }, policy).cash);
});

test('B6: Flexi (new flat, no resale fee, no top-up) → S$238,600', () => {
  const r = rightSizeCash({ sale: sale(), nextPrice: 300000, nextResale: false }, policy);
  assert.equal(r.next.total, 307200);
  assert.equal(r.cashFreed, 545800 - 307200);
});

test('B6: a big CPF refund that is not needed stays in CPF — never shown as cash', () => {
  // S$400k CPF refund; the S$100k flat and the S$60k top-up use S$160k of it → S$240k stays in CPF
  const r = rightSizeCash({ sale: sale({ cpfUsed: 400000, accruedInterest: 0 }), nextPrice: 100000, nextResale: false, raTopUp: 60000, bonus: 0 }, policy);
  assert.equal(r.cpfRefund, 400000);
  const nextTotal = 100000 + 1000 + 3000; // BSD 1% of 100k + legal
  assert.equal(r.next.total, nextTotal);
  assert.equal(r.keptInCpf, 400000 - 60000 - nextTotal);
  assert.equal(r.cashFreed, r.saleCash, 'only the sale cash is cash');
});

test('B6: the sale does not cover the flat and the top-up → short, no cash figure; no sale / no price → reasons', () => {
  const r = rightSizeCash({ sale: sale({ salePrice: 300000 }), nextPrice: 290000, raTopUp: 60000, bonus: 30000 }, policy);
  assert.equal(r.cashFreed, null);
  assert.equal(r.short, -r.left);
  assert.ok(r.short > 0);
  assert.deepEqual(rightSizeCash({ sale: null, nextPrice: 300000 }, policy), { ok: false, reason: 'nosale' });
  assert.deepEqual(rightSizeCash({ sale: sale(), nextPrice: null }, policy), { ok: false, reason: 'noprice' });
  assert.deepEqual(rightSizeCash({ sale: saleInput(plan({ owns: false }), 2026), nextPrice: 1 }, policy), { ok: false, reason: 'nosale' });
});
