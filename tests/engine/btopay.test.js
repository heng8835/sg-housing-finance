import { test } from 'node:test';
import assert from 'node:assert/strict';
import { btoPaymentStages, btoOptionFee } from '../../app/engine/btopay.js';
import { bsd } from '../../app/engine/stamp-duty.js';
import { policy } from '../helpers.js';

const byId = (r, id) => r.stages.find((s) => s.id === id);
const item = (s, id) => s.items.find((i) => i.id === id)?.amount ?? 0;

test('option fee by flat type from policy (2-room Flexi, 3-room, 4-room and bigger, 3Gen)', () => {
  const fee = policy.get('bto.option_fee');
  assert.equal(btoOptionFee('2-room Flexi', policy), fee['2 ROOM']);
  assert.equal(btoOptionFee('3 ROOM', policy), fee['3 ROOM']);
  assert.equal(btoOptionFee('4 ROOM', policy), fee['4 ROOM']);
  assert.equal(btoOptionFee('3Gen', policy), fee['3GEN']);
  assert.equal(btoOptionFee('EXECUTIVE', policy), null);
});

test('HDB loan: option fee at booking, 10% at the Agreement for Lease (less the option fee) + BSD + legal, rest at keys', () => {
  const r = btoPaymentStages({ price: 400000, flatType: '4 ROOM', loanType: 'hdb', tenure: 25, averageAge: 30, bookingDate: '2026-10-07', keyDate: '2030-03' }, policy);
  assert.equal(r.ltv, policy.get('loan.hdb.ltv'));
  assert.equal(r.loan, 300000);
  assert.equal(r.downpayment, 100000);
  const book = byId(r, 'booking'), afl = byId(r, 'afl'), keys = byId(r, 'keys');
  assert.equal(book.amount, 2000);
  assert.equal(book.cashMin, 2000); // option fee: NETS / debit card, not CPF
  assert.equal(book.when, '2026-10-07');
  assert.equal(afl.when, '2027-07-07'); // within 9 months of booking
  assert.equal(item(afl, 'down'), 38000); // 10% of 400k minus the 2k option fee
  assert.equal(item(afl, 'bsd'), bsd(400000, policy.get('stamp.bsd.bands')));
  assert.equal(item(afl, 'bsd'), 6600);
  assert.equal(item(afl, 'legal'), policy.get('assumption.fees.legal'));
  assert.equal(afl.amount, 47600);
  assert.equal(afl.cashMin, 0); // CPF may pay downpayment, BSD and legal fees
  assert.equal(keys.when, '2030-03');
  assert.equal(item(keys, 'down'), 60000);
  assert.equal(keys.loan, 300000);
  assert.equal(keys.amount, 60000); // loan kept out of what you pay
  assert.equal(r.total, 109600);
  assert.equal(r.cashTotal, 2000);
  assert.equal(r.cpfTotal, 107600);
  // downpayment adds up across the stages
  assert.equal(item(book, 'option-fee') + item(afl, 'down') + item(afl, 'down-cash') + item(keys, 'down') + item(keys, 'down-cash'), r.downpayment);
});

test('bank loan: 20% at signing, the 5% cash minimum met by the option fee + cash at signing', () => {
  const r = btoPaymentStages({ price: 400000, flatType: '4 ROOM', loanType: 'bank', tenure: 25, averageAge: 30 }, policy);
  assert.equal(r.loan, 300000);
  const afl = byId(r, 'afl'), keys = byId(r, 'keys');
  assert.equal(item(afl, 'down-cash') + item(afl, 'down'), 78000); // 20% of 400k minus the option fee
  assert.equal(item(afl, 'down-cash'), 18000); // 5% of 400k = 20k cash, 2k already paid as the option fee
  assert.equal(item(keys, 'down'), 20000);
  assert.equal(item(keys, 'down-cash'), 0);
  assert.equal(r.cashTotal, 20000);
  assert.equal(byId(r, 'booking').when, null);
  assert.equal(afl.when, null);
  assert.equal(keys.when, null);
  assert.ok(r.notes.some(([n]) => n.startsWith('Expected completion unknown')));
  assert.ok(r.notes.some(([n]) => n.includes('Letter of Offer')));
});

test('bank loan beyond 25 years: lower LTV tier, 10% cash minimum', () => {
  const r = btoPaymentStages({ price: 400000, flatType: '4 ROOM', loanType: 'bank', tenure: 30, averageAge: 30 }, policy);
  assert.equal(r.ltv, policy.get('loan.bank.ltv.lower_tier'));
  assert.equal(r.loan, 220000);
  const afl = byId(r, 'afl'), keys = byId(r, 'keys');
  assert.equal(item(afl, 'down-cash'), 38000); // 10% cash = 40k, less the 2k option fee
  assert.equal(item(afl, 'down'), 40000);
  assert.equal(item(keys, 'down'), 100000);
  assert.equal(r.cashTotal, 40000);
});

test('deferred income assessment: 2.5% at signing, the balance at key collection', () => {
  const r = btoPaymentStages({ price: 400000, flatType: '4 ROOM', loanType: 'hdb', tenure: 25, averageAge: 28, deferredIncome: true }, policy);
  const afl = byId(r, 'afl'), keys = byId(r, 'keys');
  assert.equal(item(afl, 'down'), 8000); // 2.5% of 400k minus the option fee
  assert.equal(item(keys, 'down'), 90000);
  assert.ok(afl.ruleIds.includes('bto.downpayment.afl.deferred_income'));
});

test('staggered downpayment: split not verified yet → standard schedule + a note; eligibility hint for young couples', () => {
  const r = btoPaymentStages({ price: 400000, flatType: '4 ROOM', loanType: 'hdb', tenure: 25, averageAge: 28, staggered: true, couple: true, youngestAge: 28 }, policy);
  assert.equal(item(byId(r, 'afl'), 'down'), 38000);
  assert.ok(r.notes.some(([n]) => n.startsWith('Staggered Downpayment Scheme: HDB')));
  assert.equal(r.staggeredMayApply, true);
  const old = btoPaymentStages({ price: 400000, flatType: '4 ROOM', couple: true, youngestAge: 35 }, policy);
  assert.equal(old.staggeredMayApply, false);
  const big = btoPaymentStages({ price: 400000, flatType: '3GEN', couple: true, youngestAge: 28 }, policy);
  assert.equal(big.staggeredMayApply, false);
  const single = btoPaymentStages({ price: 400000, flatType: '3 ROOM', couple: false, youngestAge: 28 }, policy);
  assert.equal(single.staggeredMayApply, false);
});

test('typed price only (no BTO dataset): works without dates or flat data; zero price pays nothing', () => {
  const r = btoPaymentStages({ price: 350000, flatType: '3 ROOM' }, policy);
  assert.equal(byId(r, 'booking').amount, policy.get('bto.option_fee')['3 ROOM']);
  assert.ok(r.total > 0);
  const z = btoPaymentStages({ price: 0, flatType: '4 ROOM' }, policy);
  assert.equal(z.total, z.legalFees); // only the (estimated) legal fees remain
  assert.equal(z.loan, 0);
});
