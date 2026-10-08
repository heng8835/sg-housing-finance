// Phase 7b B12: the Proximity Housing Grant "near" decided per flat from the place tagged "Parents' or child's home"
// (engine/grants.js phgNear + planPurchase flat.parentsKm), with the sourced distance grant.phg.near_km.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grants, phgNear, phgLimitKm, PHG_NOTES } from '../../app/engine/grants.js';
import { planPurchase } from '../../app/engine/plan.js';
import { createPolicy } from '../../app/core/policy.js';
import { policy, mergedDoc, AS_OF } from '../helpers.js';

const H = (o = {}) => ({ scheme: 'family', buyers: [{ age: 32, income: 5000, citizenship: 'SC' }, { age: 31, income: 4000, citizenship: 'SC' }], cash: 80000, firstTimer: true, parents: 'none', loan: 'hdb', tenure: 25, grantsOverride: null, ...o });
const phgOf = (g) => (g.items.find((i) => i.id === 'phg') || {}).amount ?? 0;
const PHG = policy.get('grant.phg').family;
const LIMIT = policy.get('grant.phg.near_km');
// the same document without the new entry: what the browser sees before the integrator merges the fragment
const noLimit = createPolicy({ ...mergedDoc(), params: mergedDoc().params.filter((p) => p.id !== 'grant.phg.near_km') }, AS_OF);

test('policy: grant.phg.near_km is sourced (VERIFIED, official page, retrieved 2026-10-07)', () => {
  const m = policy.meta('grant.phg.near_km');
  assert.equal(m.status, 'VERIFIED');
  assert.match(m.source_url, /^https:\/\/www\.(mynicehome\.gov\.sg|hdb\.gov\.sg)\//);
  assert.equal(m.retrieved, '2026-10-07');
  assert.equal(phgLimitKm(policy), LIMIT);
  assert.equal(phgLimitKm(noLimit), null);
});

test('phgNear: "living with" wins; tagged place decides near per flat; none tagged = household setting', () => {
  assert.equal(phgNear({ household: H({ parents: 'with' }), parentsKm: LIMIT + 5 }, policy).kind, 'with');
  const near = phgNear({ household: H(), parentsKm: LIMIT - 0.5 }, policy);
  assert.deepEqual([near.kind, near.basis, near.within, near.note], ['near', 'distance', true, PHG_NOTES.near]);
  const far = phgNear({ household: H({ parents: 'near' }), parentsKm: LIMIT + 0.5 }, policy);
  assert.deepEqual([far.kind, far.basis, far.within, far.note], [null, 'distance', false, PHG_NOTES.far], 'household "near" does not override the distance');
  assert.equal(phgNear({ household: H(), parentsKm: LIMIT }, policy).kind, 'near', 'exactly at the limit counts as within');
  assert.deepEqual(phgNear({ household: H({ parents: 'near' }) }, policy), { kind: 'near', basis: 'household', km: null, limitKm: null, within: null, note: null });
  assert.equal(phgNear({ household: H() }, policy).kind, null);
});

test('no sourced distance (UNVERIFIED / not merged): nothing decided — household setting + a note', () => {
  const r = phgNear({ household: H({ parents: 'near' }), parentsKm: 9 }, noLimit);
  assert.deepEqual([r.kind, r.basis, r.within, r.note], ['near', 'household', null, PHG_NOTES.unknown]);
  const g = grants({ household: H(), flatType: '4 ROOM', parentsKm: 1 }, noLimit);
  assert.equal(phgOf(g), 0);
  assert.ok(g.notes.includes(PHG_NOTES.unknown));
});

test('planPurchase: flat.parentsKm changes the grant per flat; absent = the numbers as before', () => {
  const flat = { price: 550000, flatType: '4 ROOM', remainingLease: 80, cov: 0 };
  const base = planPurchase({ household: H(), flat }, policy);
  assert.deepEqual(planPurchase({ household: H(), flat: { ...flat, parentsKm: null } }, policy).grants, base.grants, 'null = no tagged place');
  const near = planPurchase({ household: H(), flat: { ...flat, parentsKm: 1.9 } }, policy);
  const far = planPurchase({ household: H(), flat: { ...flat, parentsKm: 5.2 } }, policy);
  assert.equal(phgOf(near.grants), PHG.near);
  assert.equal(near.grants.total, base.grants.total + PHG.near);
  assert.equal(phgOf(far.grants), 0);
  assert.equal(far.grants.total, base.grants.total);
  assert.ok(near.chosen.funding.net < base.chosen.funding.net, 'the grant lowers the upfront');
  // a typed grant amount wins over everything
  const own = planPurchase({ household: H({ grantsOverride: 12345 }), flat: { ...flat, parentsKm: 1 } }, policy);
  assert.equal(own.grants.total, 12345);
});
