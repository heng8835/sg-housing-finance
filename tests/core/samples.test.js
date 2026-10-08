// Sample households sandbox (Phase 6a AC 2): core/store.js backup / restore helpers + modules/samples data and build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, STORE_KEY, LEGACY_KEY, SAMPLE_KEY, SAMPLE_BLOCKED, snapshotKeys, restoreKeys, readSample, sampleStatus,
  userSnapshot, requestSample, requestSampleExit, applySampleBoot,
} from '../../app/core/store.js';
import { SAMPLES, SAMPLE_IDS, sampleById } from '../../app/modules/samples/data.js';
import { buildSample, samplePayload } from '../../app/modules/samples/build.js';
import { summarise } from '../../app/engine/household.js';
import { grants } from '../../app/engine/grants.js';
import { planPurchase } from '../../app/engine/plan.js';
import { policy } from '../helpers.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
const FLAT_TYPES = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const AS_OF = new Date(2026, 9, 7);
// stand-in for the data.js block list: every sample block resolves to a made-up index
const resolveAll = () => { let n = 100; const seen = new Map(); return (blk, street) => { const k = `${blk}|${street}`; if (!seen.has(k)) seen.set(k, n++); return { bid: seen.get(k), leaseStart: 2005 }; }; };
const build = (sample, base = {}) => buildSample(sample, { base, resolve: resolveAll(), flatTypes: FLAT_TYPES, asOf: AS_OF, leaseTerm: 99 });
const payloadFor = (id, storage) => samplePayload(build(sampleById(id), userSnapshot(storage)));

// the user's own data, written with odd but valid formatting so a re-serialisation would show
const USER_V2 = '{"schemaVersion":1,  "household":{"cash":123456,"buyers":[{"age":35,"income":6100}]},"ui":{"mode":"pro","lang":"zh"}}';
const USER_LEGACY = '{"choices":[{"id":7,"bid":50,"ft":3,"storey":12,"sqm":93,"price":720000,"name":"Mine","url":""}],"nextId":8,"colorBy":"psf","workplaces":[{"name":"Office"}]}';
const userStorage = () => memory({ [STORE_KEY]: USER_V2, [LEGACY_KEY]: USER_LEGACY, other: 'untouched' });
const enter = (storage, id = 'young-couple') => { requestSample(storage, id, payloadFor(id, storage)); return applySampleBoot(storage); };
const exit = (storage) => { requestSampleExit(storage); return applySampleBoot(storage); };

test('snapshot / restore are exact: strings byte for byte, absent keys removed again', () => {
  const s = userStorage();
  const snap = snapshotKeys(s);
  assert.deepEqual(snap, { [STORE_KEY]: USER_V2, [LEGACY_KEY]: USER_LEGACY });
  s.setItem(STORE_KEY, '{}'); s.removeItem(LEGACY_KEY);
  restoreKeys(s, snap);
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.equal(s.getItem(LEGACY_KEY), USER_LEGACY);
  const fresh = memory();
  const none = snapshotKeys(fresh);
  assert.deepEqual(none, { [STORE_KEY]: null, [LEGACY_KEY]: null });
  fresh.setItem(STORE_KEY, 'x'); fresh.setItem(LEGACY_KEY, 'y');
  restoreKeys(fresh, none);
  assert.equal(fresh.map.has(STORE_KEY), false);
  assert.equal(fresh.map.has(LEGACY_KEY), false);
});

test('enter → edit → exit restores the user data byte-identically and clears the sandbox', () => {
  const s = userStorage();
  assert.equal(requestSample(s, 'young-couple', payloadFor('young-couple', s)), undefined);
  assert.equal(s.getItem(STORE_KEY), USER_V2, 'nothing is written into the live keys before the reload');
  assert.deepEqual(applySampleBoot(s), { id: 'young-couple', phase: 'active' });
  const store = createStore({ storage: s });
  assert.equal(store.get('household.buyers.0.age'), 29);
  assert.equal(store.get('ui.lang'), 'zh', 'the user\'s UI preferences carry into the sample');
  store.set('household.cash', 1);                                   // edits in the sample are allowed…
  s.setItem(LEGACY_KEY, '{"choices":[]}');                          // …including the map code's own saves
  assert.deepEqual(exit(s), null);
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.equal(s.getItem(LEGACY_KEY), USER_LEGACY);
  assert.equal(s.getItem('other'), 'untouched');
  assert.equal(s.map.has(SAMPLE_KEY), false);
  assert.equal(createStore({ storage: s }).get('household.cash'), 123456);
});

test('a first-time visitor (no keys at all) gets no keys back after the sample', () => {
  const s = memory();
  enter(s, 'retiree-couple');
  assert.ok(s.getItem(STORE_KEY) && s.getItem(LEGACY_KEY));
  exit(s);
  assert.deepEqual([...s.map.keys()], []);
});

test('the sample never mutates the backup; switching samples keeps the original backup', () => {
  const s = userStorage();
  enter(s);
  const before = JSON.stringify(readSample(s).backup);
  const store = createStore({ storage: s });
  store.set('household.cash', 999); store.set('focus', null); store.set('ui.mode', 'simple');
  assert.equal(JSON.stringify(readSample(s).backup), before);
  enter(s, 'upgrading-family');                                     // switch: the backup is still the user's
  assert.equal(sampleStatus(s).id, 'upgrading-family');
  assert.equal(JSON.stringify(readSample(s).backup), before);
  assert.equal(createStore({ storage: s }).get('household.buyers.1.citizenship'), 'PR');
  exit(s);
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.equal(s.getItem(LEGACY_KEY), USER_LEGACY);
});

test('reload mid-sample: still the sample, banner flag on, Exit still restores', () => {
  const s = userStorage();
  enter(s);
  for (let i = 0; i < 3; i++) {                                     // several reloads
    assert.deepEqual(applySampleBoot(s), { id: 'young-couple', phase: 'active' });
    assert.equal(createStore({ storage: s }).inSample().id, 'young-couple');
  }
  exit(s);
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.equal(createStore({ storage: s }).inSample(), null);
  assert.equal(applySampleBoot(s), null, 'boot without a sample changes nothing');
  assert.equal(s.getItem(STORE_KEY), USER_V2);
});

test('exit requested before the sample was written: nothing to restore, the request is dropped', () => {
  const s = userStorage();
  requestSample(s, 'young-couple', payloadFor('young-couple', s));
  assert.equal(requestSampleExit(s), true);
  assert.equal(applySampleBoot(s), null);
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.equal(s.map.has(SAMPLE_KEY), false);
  assert.equal(requestSampleExit(s), false);
});

test('a failed write (quota) puts the user data back and drops the sample', () => {
  const s = userStorage();
  requestSample(s, 'young-couple', payloadFor('young-couple', s));
  const set = s.setItem;
  s.setItem = (k, v) => { if (k === LEGACY_KEY && v !== USER_LEGACY) throw new Error('QuotaExceededError'); set(k, v); };
  assert.equal(applySampleBoot(s), null);
  s.setItem = set;
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.equal(s.getItem(LEGACY_KEY), USER_LEGACY);
  assert.equal(s.map.has(SAMPLE_KEY), false);
});

test('a corrupt sandbox record is ignored, bad payloads are refused', () => {
  const s = userStorage();
  s.setItem(SAMPLE_KEY, '{nope');
  assert.equal(sampleStatus(s), null);
  assert.equal(applySampleBoot(s), null);
  assert.equal(s.getItem(STORE_KEY), USER_V2);
  assert.throws(() => requestSample(s, 'young-couple', { [STORE_KEY]: 5 }), /payload/);
});

test('export / import / forget are blocked while a sample is on (and work again after exit)', () => {
  const s = userStorage();
  enter(s);
  const store = createStore({ storage: s });
  assert.throws(() => store.export(), new RegExp(SAMPLE_BLOCKED));
  assert.throws(() => store.import({ schemaVersion: 1, household: {} }), new RegExp(SAMPLE_BLOCKED));
  assert.throws(() => store.reset(), new RegExp(SAMPLE_BLOCKED));
  assert.ok(s.getItem(STORE_KEY), 'forget did not remove anything');
  exit(s);
  const after = createStore({ storage: s });
  assert.equal(after.export().household.cash, 123456);
});

test('three samples, unique ids, exposed for guides', () => {
  assert.deepEqual(SAMPLE_IDS, ['young-couple', 'upgrading-family', 'retiree-couple']);
  assert.equal(sampleById('nope'), null);
  for (const s of SAMPLES) {
    assert.ok(s.name && s.blurb && s.tryThis, s.id);
    assert.ok(s.shortlist.length >= 2 && s.shortlist.length <= 3, s.id);
  }
});

test('sample households validate: summarise works with no NaN, buyers have the store shape', () => {
  const keys = Object.keys(createStore({ storage: memory() }).get('household.buyers.0')).sort();
  for (const s of SAMPLES) {
    const sum = summarise(s.household);
    assert.equal(sum.buyers.length, 2, s.id);
    for (const v of [sum.income, sum.youngestAge, sum.averageAge, sum.cpfOa, sum.cash, sum.funds]) assert.ok(Number.isFinite(v), `${s.id}: ${v}`);
    for (const b of s.household.buyers) assert.deepEqual(Object.keys(b).sort(), keys, s.id);
    assert.ok(['SC', 'PR'].includes(s.household.buyers[0].citizenship));
    assert.ok(s.shortlist.every((f) => FLAT_TYPES.includes(f.flatType) && f.price > 0 && f.sqm > 0), s.id);
  }
});

test('sample households run through the engines (grants, Afford plan) without NaN', () => {
  for (const s of SAMPLES) {
    const st = build(s).state;
    const g = grants({ household: st.household, flatType: st.focus.flatType }, policy);
    assert.ok(Number.isFinite(g.total), `${s.id} grants`);
    const p = planPurchase({ household: st.household, flat: { price: st.focus.price, flatType: st.focus.flatType, remainingLease: st.focus.remainingLease } }, policy);
    assert.ok(p.verdict && Number.isFinite(p.chosen.monthly), `${s.id} plan`);
    assert.ok(Number.isFinite(p.budget.maxPrice ?? 0), `${s.id} budget`);
  }
});

test('build: full store state, focus = first shortlisted flat, comparer keeps map prefs but not the user\'s flats', () => {
  const s = userStorage();
  const out = build(sampleById('young-couple'), userSnapshot(s));
  assert.deepEqual(out.skipped, []);
  const st = out.state;
  assert.equal(st.schemaVersion, 1);
  assert.deepEqual(st.scenarios, []);
  assert.equal(st.ui.mode, 'pro');
  assert.equal(st.focus.source, 'choice');
  assert.equal(st.focus.choiceId, 1);
  assert.equal(st.focus.price, 600000);
  assert.equal(st.focus.flatType, '4 ROOM');
  assert.ok(Number.isFinite(st.focus.remainingLease) && st.focus.remainingLease > 0 && st.focus.remainingLease < 99);
  const c = out.comparer;
  assert.equal(c.choices.length, 3);
  assert.deepEqual(c.choices.map((x) => x.id), [1, 2, 3]);
  assert.equal(c.nextId, 4);
  assert.equal(c.choices[0].ft, FLAT_TYPES.indexOf('4 ROOM'));
  assert.equal(c.colorBy, 'psf');
  assert.deepEqual(c.workplaces, []);
  assert.ok(!JSON.stringify(c).includes('Mine'));
  // retiree sample shows 2- and 3-room flats on the map
  assert.deepEqual(build(sampleById('retiree-couple')).comparer.ft, [1, 2, 3, 4]);
  // the payload round-trips through createStore
  const p = samplePayload(out);
  const st2 = createStore({ storage: memory(p) });
  assert.equal(st2.get('household.parents'), 'near');
  assert.equal(st2.get('focus.label'), 'Fernvale 4-room');
});

test('build: a block missing from data.js is skipped; the focus falls back to typed figures', () => {
  const out = buildSample(sampleById('upgrading-family'), { resolve: (blk) => (blk === '304B' ? null : { bid: 9, leaseStart: null }), flatTypes: FLAT_TYPES, asOf: AS_OF, leaseTerm: 99 });
  assert.deepEqual(out.skipped, ['Anchorvale 5-room']);
  assert.equal(out.comparer.choices.length, 2);
  assert.equal(out.focus, undefined);
  assert.equal(out.state.focus.source, 'price');
  assert.equal(out.state.focus.price, 700000);
  assert.ok(Number.isFinite(out.state.focus.remainingLease), 'lease from the sample\'s fallback year');
  assert.equal(out.state.plan.current.owns, true);
  assert.deepEqual(out.state.plan.dates.children, ['2016-05-01', '2020-02-01']);
});
