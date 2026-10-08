// Phase 7b B6 / O8 — CPF LIFE before / after an RA top-up (engine/cpfpayout.js lifePayoutTopUp): estimated only for
// buyers with an RA who are below the payout age, with the same projection as the Plan CPF cards; at the payout age
// the payout "goes up" and CPF works out the amount (no formula of our own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifePayoutTopUp } from '../../app/engine/cpfpayout.js';
import { buyerProjection } from '../../app/engine/cpfbuy.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const YEAR = 2026;
const A65 = policy.get('cpf.age.life_payout'), A55 = policy.get('cpf.age.ra_formation');
const hh = (buyers) => ({ scheme: 'family', firstTimer: false, propertiesOwned: 1, loan: 'hdb', tenure: 10, cash: 150000, buyers });
const sixty = { age: 60, income: 2000, citizenship: 'SC', cpfOa: 30000, cpfRa: 150000 };
const run = (h, topUps) => lifePayoutTopUp({ household: h, topUps, defaults: CPF_DEFAULTS, year: YEAR }, policy);
const life = (buyers, i) => buyerProjection({ buyers, i, plan: null, settings: {}, defaults: CPF_DEFAULTS, year: YEAR }, policy).without.life.monthly;

test('O8: below the payout age, the top-up is added to the RA today and projected like the Plan card', () => {
  const r = run(hh([sixty]), [60000]);
  assert.equal(r.ok, true);
  assert.equal(r.before.monthly, life([sixty], 0));
  assert.equal(r.after.monthly, life([{ ...sixty, cpfRa: 210000 }], 0));
  assert.ok(r.after.monthly > r.before.monthly, 'a bigger RA pays more');
  assert.equal(r.delta, r.after.monthly - r.before.monthly);
  assert.equal(r.atAge, A65);
  assert.deepEqual(r.goesUp, []);
});

test('O8: no top-up → before = after (no change), same number as the projection', () => {
  const r = run(hh([sixty]), []);
  assert.equal(r.before.monthly, r.after.monthly);
  assert.equal(r.delta, 0);
});

test('O8: at the payout age — no estimate after a top-up: goesUp, after/delta null; their own figure before', () => {
  const lim = { age: A65 + 1, income: 0, citizenship: 'SC', cpfOa: 30000, cpfRa: 190000, cpfLifeMonthly: 1050 };
  const r = run(hh([lim]), [60000]);
  assert.equal(r.ok, true);
  assert.equal(r.before.monthly, 1050);
  assert.equal(r.after, null);
  assert.equal(r.delta, null);
  assert.deepEqual(r.goesUp, [0]);
  const same = run(hh([lim]), [0]);
  assert.deepEqual([same.before.monthly, same.after.monthly, same.delta], [1050, 1050, 0]);
});

test('O8: mixed couple — the younger buyer is estimated, the older one goes up; a buyer with no RA yet is left unchanged', () => {
  const lim = { age: A65 + 1, income: 0, citizenship: 'SC', cpfOa: 30000, cpfRa: 190000, cpfLifeMonthly: 1050 };
  const r = run(hh([lim, sixty]), [30000, 30000]);
  assert.deepEqual(r.goesUp, [0]);
  const b2 = r.buyers.find((b) => b.i === 1);
  assert.equal(b2.before, life([lim, sixty], 1));
  assert.equal(b2.after, life([lim, { ...sixty, cpfRa: 180000 }], 1));
  const young = { age: A55 - 3, income: 4000, citizenship: 'SC', cpfOa: 50000, cpfSa: 90000 };
  const n = run(hh([young]), [60000]);
  assert.deepEqual(n.notApplied, [0]);
  assert.equal(n.delta, 0);
});

test('O8: not ready → the same reasons as the CPF LIFE compare row', () => {
  assert.equal(run(hh([{ age: 60, citizenship: 'SC' }]), [1]).reason, 'nobalances');
  assert.equal(run(hh([{ age: A65 + 2, citizenship: 'SC', cpfRa: 1 }]), [1]).reason, 'atpayout');
  assert.equal(run(hh([{ age: 60, citizenship: 'F', cpfOa: 1 }]), [1]).reason, 'foreigner');
});
