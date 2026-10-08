// CPF-11 — CPF LIFE at the payout age with vs without a purchase (engine/cpfpayout.js). Sev-1: the sums must be
// the Plan tab's per-buyer CPF LIFE estimates (buyerProjection), and using more CPF can never raise the payout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifePayoutDelta, payoutReadiness, PAYOUT_REASONS } from '../../app/engine/cpfpayout.js';
import { buyerProjection } from '../../app/engine/cpfbuy.js';
import { planPurchase } from '../../app/engine/plan.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const YEAR = 2026;
const hh = (buyers) => ({ scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 60000, grantsOverride: null, buyers });
const couple = hh([{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 60000, cpfSa: 20000 }, { age: 30, income: 4000, citizenship: 'SC', cpfOa: 40000, cpfSa: 15000 }]);
const flat = { price: 720000, flatType: '4 ROOM', remainingLease: 75 };
const run = (household, x = {}) => lifePayoutDelta({ household, defaults: CPF_DEFAULTS, year: YEAR, ...x }, policy);
// a planPurchase()-shaped stand-in: only what housingShares() reads
const fakePlan = (cpfUsed, monthly = 0, tenure = 25) => ({ chosen: { funding: { cpfUsed }, monthly, tenure } });

test('Sev-1: with / without are the sums of the Plan tab per-buyer CPF LIFE estimates; delta = with − without', () => {
  const plan = planPurchase({ household: couple, flat }, policy);
  const r = run(couple, { plan });
  assert.equal(r.ok, true); assert.equal(r.estimate, true);
  assert.equal(r.atAge, policy.get('cpf.age.life_payout'));
  let w = 0, b = 0, lo = 0, hi = 0;
  couple.buyers.forEach((_, i) => {
    const p = buyerProjection({ buyers: couple.buyers, i, plan, settings: {}, defaults: CPF_DEFAULTS, year: YEAR }, policy);
    w += p.without.life.monthly; b += p.withBuy.life.monthly; lo += p.withBuy.life.monthlyLow; hi += p.withBuy.life.monthlyHigh;
    assert.equal(r.buyers[i].delta, p.withBuy.life.monthly - p.without.life.monthly);
  });
  assert.deepEqual([r.without.monthly, r.withBuy.monthly, r.withBuy.low, r.withBuy.high], [w, b, lo, hi]);
  assert.equal(r.delta, b - w);
  assert.ok(r.delta < 0, 'a 720k flat paid with OA lowers this couple\'s payout');
  // flat input = the same planPurchase() call
  assert.deepEqual(run(couple, { flat }), r);
});

test('monotonic: more CPF used upfront or monthly → payout never higher (and lower once OA reaches the RA)', () => {
  // 50, OA 150k: the OA top-up at 55 matters (with lots of SA the RA reaches the FRS anyway → no change)
  const one = hh([{ age: 50, income: 3000, citizenship: 'SC', cpfOa: 150000, cpfSa: 30000 }]);
  const ups = [0, 30000, 60000, 90000, 120000].map((u) => run(one, { plan: fakePlan(u) }));
  assert.equal(ups[0].delta, 0, 'no CPF used → no change');
  for (let k = 1; k < ups.length; k++) assert.ok(ups[k].withBuy.monthly <= ups[k - 1].withBuy.monthly, `upfront step ${k}`);
  assert.ok(ups.at(-1).withBuy.monthly < ups[0].withBuy.monthly);
  const mons = [0, 500, 1000, 1500].map((m) => run(one, { plan: fakePlan(0, m) }));
  for (let k = 1; k < mons.length; k++) assert.ok(mons[k].withBuy.monthly <= mons[k - 1].withBuy.monthly, `monthly step ${k}`);
  assert.ok(mons.at(-1).delta < 0);
  // without never depends on the flat
  assert.ok(ups.every((r) => r.without.monthly === ups[0].without.monthly));
});

test('foreigners: no CPF LIFE (all-foreign → not ok); a foreign co-buyer is left out of the sums', () => {
  const f = run(hh([{ age: 35, income: 8000, citizenship: 'F', cpfOa: null }]), { flat });
  assert.deepEqual([f.ok, f.reason, f.message], [false, 'foreigner', PAYOUT_REASONS.foreigner]);
  const mixed = hh([{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 31, income: 6000, citizenship: 'F', cpfOa: null }]);
  const r = run(mixed, { flat });
  assert.equal(r.ok, true);
  assert.deepEqual(r.buyers.map((b) => b.i), [0]);
});

test('missing inputs → not ok with a reason and the buyer to fill in', () => {
  const noBal = run(hh([{ age: 32, income: 9000, citizenship: 'SC', cpfOa: null }]), { flat });
  assert.deepEqual([noBal.ok, noBal.reason, noBal.buyer, noBal.message], [false, 'nobalances', 0, PAYOUT_REASONS.nobalances]);
  const second = run(hh([{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 50000 }, { age: 30, income: 4000, citizenship: 'SC', cpfOa: '' }]), { flat });
  assert.deepEqual([second.reason, second.buyer], ['nobalances', 1]);
  assert.equal(run(hh([{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 0 }]), { flat }).ok, true, 'a 0 balance counts as entered');
  assert.deepEqual([run(hh([{ age: null, income: 5000, citizenship: 'SC', cpfOa: 50000 }]), { flat }).reason], ['noage']);
  assert.equal(run(hh([{ age: null, income: null, citizenship: 'SC', cpfOa: null }]), { flat }).reason, 'noage', 'empty household');
  assert.equal(run(couple, {}).reason, 'noplan');
  assert.equal(run(couple, { flat: { price: 0 } }).reason, 'noplan');
  assert.equal(payoutReadiness(couple), null);
  for (const m of Object.values(PAYOUT_REASONS)) assert.equal(typeof m, 'string');
});

test('Plan tab settings (pay rise) flow into both sides', () => {
  const low = hh([{ age: 50, income: 2500, citizenship: 'SC', cpfOa: 20000, cpfSa: 10000 }]), plan = fakePlan(10000, 300);
  const a = run(low, { plan, settings: { wageGrowth: 0.05 } }), b = run(low, { plan, settings: { wageGrowth: 0 } });
  assert.ok(b.without.monthly < a.without.monthly && b.withBuy.monthly < a.withBuy.monthly);
  assert.ok(a.delta < 0 && b.delta < 0);
});
