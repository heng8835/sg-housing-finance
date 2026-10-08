import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saleProceeds, sellThenBuy, sellerStampDuty, resaleLevy, defaultMode } from '../../app/engine/sellbuy.js';
import { policy, close } from '../helpers.js';

const couple = (o = {}) => ({
  scheme: 'family', firstTimer: false, parents: 'none', propertiesOwned: 1, cash: 50000,
  buyers: [{ age: 40, income: 6000, cpfOa: 30000, citizenship: 'SC' }, { age: 38, income: 5000, cpfOa: 20000, citizenship: 'SC' }], ...o,
});
const hdbFlat = (o = {}) => ({ salePrice: 600000, outstandingLoan: 150000, cpfPrincipalUsed: 200000, accruedInterest: 30000, flatType: '4 ROOM', ...o });
const numbersIn = (v, out = []) => {
  if (typeof v === 'number') out.push(v);
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
};

test('proceeds: loan, then CPF refund (principal + interest), then cash net of fees', () => {
  const p = saleProceeds(hdbFlat({ agentFeeRate: 0.01, legalFees: 2000 }), policy);
  assert.equal(p.loanRedemption, 150000);
  assert.equal(p.cpfRefund, 230000);
  assert.equal(p.cpfReturnedToOa, 230000);
  assert.equal(p.fees, 8000);
  assert.equal(p.cashProceeds, 212000);
  assert.equal(p.cpfShortfall, 0);
  assert.deepEqual(p.assumptions, []);
});

test('proceeds: default fees come from the policy assumptions and are flagged', () => {
  const p = saleProceeds(hdbFlat(), policy);
  const rate = policy.get('sellbuy.assumption.agent_fee_rate');
  assert.ok(close(p.agentFee, 600000 * rate));
  assert.equal(p.legalFees, policy.get('assumption.fees.legal'));
  assert.equal(p.assumptions.length, 2);
});

test('CPF refund is capped at what is left after the loan; shortfall flagged, not charged', () => {
  const p = saleProceeds({ salePrice: 400000, outstandingLoan: 300000, cpfPrincipalUsed: 140000, accruedInterest: 10000, agentFeeRate: 0, legalFees: 0 }, policy);
  assert.equal(p.cpfRefund, 100000);
  assert.equal(p.cpfShortfall, 50000);
  assert.equal(p.cashProceeds, 0);
  assert.ok(p.notes.some((n) => /capped/.test(n)));
});

test('fees beyond the remaining cash and negative equity are reported as shortfalls', () => {
  const fees = saleProceeds({ salePrice: 400000, outstandingLoan: 300000, cpfPrincipalUsed: 150000, agentFeeRate: 0.01, legalFees: 1000 }, policy);
  assert.equal(fees.cashShortfall, 5000);
  const underwater = saleProceeds({ salePrice: 300000, outstandingLoan: 350000, cpfPrincipalUsed: 50000, agentFeeRate: 0, legalFees: 0 }, policy);
  assert.equal(underwater.cpfRefund, 0);
  assert.equal(underwater.loanShortfall, 50000);
  assert.equal(underwater.cashShortfall, 50000);
});

test('default modes: HDB→HDB contra, private→HDB buy-first, HDB→private sell-first', () => {
  assert.equal(defaultMode('hdb', 'hdb'), 'contra');
  assert.equal(defaultMode('private', 'hdb'), 'buy-first');
  assert.equal(defaultMode('hdb', 'private'), 'sell-first');
});

test('HDB→HDB contra with an HDB loan: CPF refund + cash above max(S$25k, 50%) reduce the loan', () => {
  const r = sellThenBuy({ current: hdbFlat({ agentFeeRate: 0.02, legalFees: 3000 }), next: { price: 800000, flatType: '5 ROOM', loanType: 'hdb' }, household: couple() }, policy);
  assert.equal(r.mode, 'contra');
  assert.equal(r.proceeds.cashProceeds, 205000);
  assert.equal(r.nextFunding.mustUseFromSale, 230000 + (205000 - 102500));
  assert.equal(r.nextFunding.loan, 800000 - 332500);
  assert.equal(r.nextFunding.absd, 0);
  assert.equal(r.nextFunding.cashAvailable, 50000 + 205000);
  assert.equal(r.nextFunding.cpfOaAvailable, 50000 + 230000);
  assert.equal(r.gap.cashShort, 0);
  assert.equal(r.absdRefundDeadline, null);
});

test('second-loan rule keeps at least S$25,000 of small cash proceeds', () => {
  const r = sellThenBuy({ current: { salePrice: 300000, outstandingLoan: 100000, cpfPrincipalUsed: 157000, agentFeeRate: 0, legalFees: 3000 }, next: { price: 500000, loanType: 'hdb' }, household: couple() }, policy);
  assert.equal(r.proceeds.cashProceeds, 40000);
  assert.equal(r.nextFunding.mustUseFromSale, 157000 + 15000);
});

test('HDB→private buying first: ABSD on the 2nd property + refund deadline for an SC married couple', () => {
  const r = sellThenBuy({ current: hdbFlat(), next: { price: 1500000, propertyType: 'private' }, household: couple(), mode: 'buy-first' }, policy);
  const rate = policy.get('stamp.absd.rates').SC[1];
  assert.equal(r.nextFunding.absd, Math.floor(1500000 * rate));
  assert.equal(r.nextFunding.loanType, 'bank');
  assert.equal(r.absdRefundDeadline.amount, r.nextFunding.absd);
  assert.equal(r.absdRefundDeadline.sellWithinMonths, policy.get('sellbuy.absd_refund.sell_within_months'));
  assert.equal(r.absdRefundDeadline.claimWithinMonths, policy.get('sellbuy.absd_refund.claim_within_months'));
  assert.equal(r.nextFunding.cashAvailable, 50000); // proceeds arrive after the purchase
});

test('ABSD refund deadline: none for a single buyer, none when selling first', () => {
  const single = sellThenBuy({ current: hdbFlat(), next: { price: 1500000, propertyType: 'private' }, household: couple({ scheme: 'single', buyers: [{ age: 40, income: 9000, citizenship: 'SC' }] }), mode: 'buy-first' }, policy);
  assert.ok(single.nextFunding.absd > 0);
  assert.equal(single.absdRefundDeadline, null);
  const sellFirst = sellThenBuy({ current: hdbFlat(), next: { price: 1500000, propertyType: 'private' }, household: couple() }, policy);
  assert.equal(sellFirst.mode, 'sell-first');
  assert.equal(sellFirst.nextFunding.absd, 0);
  assert.equal(sellFirst.absdRefundDeadline, null);
});

test('HDB→HDB buying first: ABSD remitted upfront, 6-month disposal step in the timeline', () => {
  const r = sellThenBuy({ current: hdbFlat(), next: { price: 700000, loanType: 'bank' }, household: couple(), mode: 'buy-first' }, policy);
  assert.equal(r.nextFunding.absd, 0);
  const step = r.timeline.find((s) => s.step === 'dispose-old');
  assert.equal(step.maxMonths, policy.get('sellbuy.dispose_existing.months'));
  assert.equal(r.timeline[0].step, 'buy-otp');
});

test('sell-first timeline: HDB option period and completion durations from policy', () => {
  const r = sellThenBuy({ current: hdbFlat(), next: { price: 700000 }, household: couple(), mode: 'sell-first' }, policy);
  assert.deepEqual(r.timeline.map((s) => s.step), ['sell-otp', 'sell-complete', 'extension-of-stay', 'buy-otp', 'buy-complete']);
  assert.equal(r.timeline[0].typicalDays, policy.get('sellbuy.otp.exercise_days'));
  assert.equal(r.timeline[1].typicalDays, policy.get('sellbuy.resale.completion_days'));
  assert.equal(r.timeline[2].maxMonths, policy.get('sellbuy.extension_of_stay.max_months'));
});

test('SSD bands: 16/12/8/4% after 4 Jul 2025, old 12/8/4% before; HDB sale has none', () => {
  const at = (y, pre = false) => sellerStampDuty({ salePrice: 1000000, holdingYears: y, acquiredBeforeSsdChange: pre }, policy);
  assert.equal(at(0.5).amount, 160000);
  assert.equal(at(1).rate, 0.16);
  assert.equal(at(1.5).rate, 0.12);
  assert.equal(at(3.5).rate, 0.04);
  assert.equal(at(4.1).amount, 0);
  assert.equal(at(2.5, true).rate, 0.04);
  assert.equal(at(null).rate, null);
  const priv = sellThenBuy({ current: { ...hdbFlat(), propertyType: 'private', holdingYears: 2.5 }, next: { price: 600000 }, household: couple() }, policy);
  assert.equal(priv.proceeds.ssd.amount, 48000);
  assert.equal(priv.mode, 'buy-first');
  assert.ok(priv.notes.some((n) => /wait-out/.test(n)));
});

test('resale levy: charged on a second subsidised flat when the sold flat was subsidised', () => {
  assert.equal(resaleLevy('4 ROOM', policy), 40000);
  assert.equal(resaleLevy('EXECUTIVE', policy), 50000);
  assert.equal(resaleLevy('MULTI-GENERATION', policy), null);
  const r = sellThenBuy({ current: hdbFlat({ subsidised: true }), next: { price: 400000, subsidised: true }, household: couple(), mode: 'sell-first' }, policy);
  assert.equal(r.proceeds.resaleLevy, 40000);
  assert.equal(r.nextFunding.cashAvailable, 50000 + r.proceeds.cashProceeds - 40000);
  const unknown = sellThenBuy({ current: hdbFlat(), next: { price: 400000, subsidised: true }, household: couple(), mode: 'sell-first' }, policy);
  assert.equal(unknown.proceeds.resaleLevy, 0);
  assert.ok(unknown.notes.some((n) => /resale levy/.test(n)));
});

test('never NaN: empty and junk inputs', () => {
  const cases = [
    saleProceeds({}, policy),
    saleProceeds({ salePrice: 'abc', outstandingLoan: null, cpfPrincipalUsed: undefined }, policy),
    sellThenBuy({}, policy),
    sellThenBuy({ current: { salePrice: '' }, next: { price: 'x', propertyType: 'private' }, household: { buyers: [{}] }, mode: 'buy-first' }, policy),
  ];
  for (const c of cases) for (const n of numbersIn(c)) assert.ok(!Number.isNaN(n), JSON.stringify(c).slice(0, 200));
});
