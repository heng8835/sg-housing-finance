// S1a: Guides' live numbers and saved scenarios use the per-flat Proximity Housing Grant distance like Afford / Compare
// (core/parents.js parentsKmFor / withParents → planPurchase flat.parentsKm). Sev-1: numbers change only when a place
// is tagged as the parents' home; with none, every input (and so every number) is exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveLive, LIVE } from '../../app/modules/guides/live.js';
import { scenarioResults, snapshotOf, flatInput } from '../../app/engine/scenario.js';
import { withParents } from '../../app/core/parents.js';
import { planPurchase } from '../../app/engine/plan.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const H = (o = {}) => ({ scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 80000, grantsOverride: null,
  buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 32, income: 4000, citizenship: 'SC', cpfOa: 40000 }], ...o });
const flat = { price: 550000, flatType: '4 ROOM', remainingLease: 80, label: 'Blk 1 Test Street' };
const LIMIT = policy.get('grant.phg.near_km'), PHG = policy.get('grant.phg').family;
const KEYS = Object.keys(LIVE);
const OPTS = { year: 2026, horizonYears: 10, cpfDefaults: CPF_DEFAULTS };
const snap = (household) => snapshotOf({ id: 'A', name: 'A: test', savedAt: '2026-10-07T00:00:00Z', flat: { source: 'price', ...flat }, household, marketRent: 2900 });
const strip = (r) => JSON.parse(JSON.stringify({ ...r, plan: { ...r.plan, flat: { ...r.plan.flat } } }));

test('flatInput: parentsKm only when known — the same input as Afford withParents()', () => {
  const base = { price: 550000, flatType: '4 ROOM', remainingLease: 80, cov: 0 };
  assert.deepEqual(flatInput(flat), base);
  assert.deepEqual(flatInput(flat, null), base);
  assert.deepEqual(flatInput(flat, 1.5), withParents(base, 1.5));
  assert.equal(Object.hasOwn(flatInput(flat, null), 'parentsKm'), false);
});

test('Guides live: no tagged place → every value identical; a near place adds the PHG like Afford', () => {
  const h = H(), before = resolveLive(KEYS, { household: h, flat, policy });
  assert.deepEqual(resolveLive(KEYS, { household: h, flat, policy, parentsKm: null }), before, 'null = numbers as before');
  const near = resolveLive(KEYS, { household: h, flat, policy, parentsKm: LIMIT - 1 });
  const far = resolveLive(KEYS, { household: h, flat, policy, parentsKm: LIMIT + 1 });
  assert.deepEqual(far, before, 'beyond the PHG distance: no grant, same numbers');
  const p = planPurchase({ household: h, flat: withParents({ price: flat.price, flatType: flat.flatType, remainingLease: flat.remainingLease, cov: 0 }, LIMIT - 1) }, policy);
  const money = (v) => 'S$' + Math.round(v).toLocaleString('en-SG');
  assert.equal(near.values['afford.upfront'].text, money(p.chosen.funding.net));
  assert.notEqual(near.values['afford.upfront'].text, before.values['afford.upfront'].text, 'the PHG lowers the upfront');
  assert.ok(PHG.near > 0);
});

test('Scenarios: no tagged place → results identical; a near place adds the PHG to the plan', () => {
  const s = snap(H());
  const before = scenarioResults(s, policy, OPTS);
  assert.deepEqual(strip(scenarioResults(s, policy, { ...OPTS, parentsKm: null })), strip(before));
  const near = scenarioResults(s, policy, { ...OPTS, parentsKm: LIMIT - 1 });
  assert.equal(near.plan.grants.total, before.plan.grants.total + PHG.near);
  assert.ok(near.upfront.net < before.upfront.net);
  assert.deepEqual(strip(scenarioResults(s, policy, { ...OPTS, parentsKm: LIMIT + 1 })).upfront, strip(before).upfront);
});

test('wiring: Guides and Scenarios pass parentsKmFor(household, flat) (as Afford)', () => {
  const read = (p) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8');
  assert.match(read('modules/guides/index.js'), /parentsKm: flat \? parentsKmFor\(household, flat\) : null/);
  assert.match(read('modules/scenarios/index.js'), /parentsKm: parentsKmFor\(s\.household, s\.focus\)/);
  assert.match(read('modules/afford/index.js'), /parentsKmFor\(h, tf\)/);
});
