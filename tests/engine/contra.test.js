import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveSteps, completionGap, daysBetween } from '../../app/engine/contra.js';
import { policy } from '../helpers.js';

const ids = (steps) => steps.map((s) => s.id);

test('daysBetween counts calendar days, negative when the second date is earlier', () => {
  assert.equal(daysBetween('2027-01-01', '2027-03-01'), 59);
  assert.equal(daysBetween('2028-03-01', '2028-02-01'), -29);
  assert.equal(daysBetween('2027-05-05', '2027-05-05'), 0);
});

test('contra HDB → HDB: both sides interleaved, contra point before the completions', () => {
  const s = moveSteps({ mode: 'contra', fromType: 'hdb', toType: 'hdb' }, policy);
  assert.deepEqual(ids(s), ['sell-intent', 'buy-hfe', 'sell-otp', 'buy-otp', 'sell-exercise', 'buy-exercise',
    'sell-application', 'buy-application', 'contra', 'sell-complete', 'buy-complete', 'extension-of-stay']);
  const at = (id) => s.find((x) => x.id === id);
  assert.equal(at('sell-intent').days, policy.get('sellbuy.intent_to_sell.days_before_otp'));
  assert.equal(at('sell-otp').days, policy.get('sellbuy.otp.exercise_days'));
  assert.equal(at('buy-exercise').days, policy.get('sellbuy.otp.exercise_days'));
  assert.equal(at('buy-otp').days, policy.get('sellbuy.request_for_value.working_days'));
  assert.equal(at('sell-complete').days, policy.get('sellbuy.resale.completion_days'));
  assert.equal(at('extension-of-stay').maxMonths, policy.get('sellbuy.extension_of_stay.max_months'));
  assert.equal(at('contra').lane, 'both');
});

test('sell first / buy first keep the sides in sequence; buying first adds the disposal deadline', () => {
  assert.deepEqual(ids(moveSteps({ mode: 'sell-first', fromType: 'hdb', toType: 'hdb' }, policy)),
    ['sell-intent', 'sell-otp', 'sell-exercise', 'sell-application', 'sell-complete', 'extension-of-stay', 'buy-hfe', 'buy-otp', 'buy-exercise', 'buy-application', 'buy-complete']);
  const b = moveSteps({ mode: 'buy-first', fromType: 'hdb', toType: 'hdb' }, policy);
  assert.equal(b[0].id, 'buy-hfe');
  assert.equal(b.find((x) => x.id === 'dispose-old').maxMonths, policy.get('sellbuy.dispose_existing.months'));
  assert.ok(ids(b).indexOf('dispose-old') < ids(b).indexOf('sell-intent'));
});

test('private home and new flat steps pass through', () => {
  const s = moveSteps({ mode: 'buy-first', fromType: 'private', toType: 'hdb' }, policy);
  assert.ok(ids(s).includes('sell-private'));
  const n = moveSteps({ mode: 'sell-first', fromType: 'hdb', toType: 'hdb', nextSubsidised: true }, policy);
  assert.ok(ids(n).includes('buy-new-flat'));
});

test('gap: no dates → nothing computed, a hint', () => {
  const g = completionGap({ saleCompletion: null, purchaseCompletion: '2027-03-01', mode: 'contra', toType: 'hdb' }, policy);
  assert.equal(g.order, null);
  assert.equal(g.bridge, null);
  assert.ok(g.notes[0][0].startsWith('Enter both'));
});

test('gap: same day = contra, no bridge', () => {
  const g = completionGap({ saleCompletion: '2027-03-01', purchaseCompletion: '2027-03-01', mode: 'contra', toType: 'hdb' }, policy);
  assert.equal(g.order, 'same-day');
  assert.equal(g.days, 0);
  assert.equal(g.bridge, null);
});

test('gap: sale first → a place to stay; extension of stay covers up to the policy months for a completed home', () => {
  const g = completionGap({ saleCompletion: '2027-03-01', purchaseCompletion: '2027-04-15', mode: 'sell-first', toType: 'hdb' }, policy);
  assert.equal(g.order, 'sale-first');
  assert.equal(g.days, 45);
  assert.equal(g.stayBy, '2027-06-01');
  assert.equal(g.stayCovered, true);
  const long = completionGap({ saleCompletion: '2027-03-01', purchaseCompletion: '2027-08-01', mode: 'sell-first', toType: 'hdb' }, policy);
  assert.equal(long.stayCovered, false);
  const bto = completionGap({ saleCompletion: '2027-03-01', purchaseCompletion: '2027-04-01', mode: 'sell-first', toType: 'hdb', nextSubsidised: true }, policy);
  assert.equal(bto.stayCovered, false); // only for sellers buying a completed home
});

test('gap: purchase first → cash bridge = what the sale was paying, beyond own cash and OA', () => {
  // the next purchase needs 5k cash-only + 95k payable by CPF; own OA 50k, own cash 20k
  const funding = { items: [{ amount: 5000, cpf: false }, { amount: 95000, cpf: true }] };
  const g = completionGap({ saleCompletion: '2027-03-01', purchaseCompletion: '2027-02-01', mode: 'contra', toType: 'hdb', funding, grants: 0, ownCash: 20000, ownCpf: 50000, loanType: 'hdb' }, policy);
  assert.equal(g.order, 'purchase-first');
  assert.equal(g.days, -28);
  assert.equal(g.bridge, 30000); // cash needed 5k + (95k − 50k) = 50k, own cash 20k
  assert.equal(g.disposeBy, '2027-08-01');
  assert.equal(g.disposeOk, true);
  assert.ok(g.notes.some(([n]) => n.includes('second HDB loan')));
  const grants = completionGap({ saleCompletion: '2027-03-01', purchaseCompletion: '2027-02-01', mode: 'contra', toType: 'hdb', funding, grants: 45000, ownCash: 20000, ownCpf: 50000, loanType: 'bank' }, policy);
  assert.equal(grants.bridge, 0);
  const late = completionGap({ saleCompletion: '2027-09-01', purchaseCompletion: '2027-02-01', mode: 'buy-first', toType: 'hdb', funding, ownCash: 0, ownCpf: 0 }, policy);
  assert.equal(late.disposeOk, false);
});
