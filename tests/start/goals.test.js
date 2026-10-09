// Phase 7b B5 — Start here asks what each goal needs: ≤ 7 screens per goal, householdFrom / planPatches per goal
// (savings, the home you own, rent now, CPF and cash, a child for P1 dates), income per person ("one of us works",
// "type each"), the language-switch draft (O5) and the B11 "Picked for you" flat types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../../app/core/store.js';
import { summarise } from '../../app/engine/household.js';
import {
  GOAL_IDS, GOAL_QUESTIONS, MAX_SCREENS, questionsFor, answersFrom, householdFrom, planPatches, incomeOf, incomesFor,
  routeFor, flatTypesFor, cleanDraft, touchesHousehold,
} from '../../app/modules/start/answers.js';
import { questionHtml, doneHtml, pickedHint, TAP_SCREENS } from '../../app/modules/start/view.js';

const blank = (o = {}) => ({ ...answersFrom(defaults().household), ...o });
const H0 = () => defaults().household;
const P0 = () => defaults().plan;
const couple = { buyers: 2, ages: [32, 30], residency: ['SC', 'SC'], band: 'i4' };

test('every goal: ≤ 7 screens, starts with goal / who / residency / income, ends with towns', () => {
  for (const g of GOAL_IDS) {
    const qs = questionsFor(blank({ goal: g }));
    assert.ok(qs.length <= MAX_SCREENS, `${g}: ${qs.length}`);
    assert.deepEqual(qs.slice(0, 4), ['goal', 'who', 'residency', 'income'], g);
    assert.equal(qs.at(-1), 'towns', g);
  }
  assert.deepEqual(Object.keys(GOAL_QUESTIONS).sort(), ['btoVsResale', 'buyResale', 'rent', 'retire', 'sellUpgrade']);
  // sell and upgrade: an HDB flat owned now → no first-flat screen (second-timers); private → asked
  assert.ok(!questionsFor(blank({ goal: 'sellUpgrade', home: { type: 'hdb' } })).includes('firstTimer'));
  assert.ok(questionsFor(blank({ goal: 'sellUpgrade', home: { type: 'private' } })).includes('firstTimer'));
  // every screen of every goal renders (no undefined / NaN), with the goal's own count
  for (const g of GOAL_IDS) {
    const a = blank({ goal: g, ...couple });
    questionsFor(a).forEach((q, i) => {
      const html = questionHtml(i, a, { towns: ['BEDOK'], hubs: [{ id: 'h1', name: 'Raffles Place' }], payoutAge: 65 });
      assert.doesNotMatch(html, /undefined|NaN/, `${g} ${q}`);
      assert.match(html, new RegExp(`question ${i + 1} of ${questionsFor(a).length}`), `${g} ${q}`);
    });
  }
  assert.deepEqual(TAP_SCREENS, ['goal', 'firstTimer']);
});

test('buy / BTO: savings (CPF OA split like the income, cash, parents) — summarise has the funds', () => {
  for (const goal of ['buyResale', 'btoVsResale']) {
    const h = householdFrom(blank({ goal, ...couple, cpfOa: 160001, cash: 70000, parents: 'near', firstTimer: true }), H0());
    assert.deepEqual(h.buyers.map((b) => b.cpfOa), [80001, 80000]);
    assert.equal(h.cash, 70000);
    assert.equal(h.parents, 'near');
    assert.equal(h.firstTimer, true);
    const s = summarise(h);
    assert.equal(s.cpfOa, 160001); assert.equal(s.funds, 230001);
  }
  // "one of us works": income and OA all on Buyer 1; a foreign buyer gets no CPF
  const one = householdFrom(blank({ goal: 'buyResale', ...couple, split: 'one', cpfOa: 50000 }), H0());
  assert.deepEqual(one.buyers.map((b) => b.income), [9500, 0]);
  assert.deepEqual(one.buyers.map((b) => b.cpfOa), [50000, 0]);
  const mixed = householdFrom(blank({ goal: 'buyResale', ...couple, residency: ['SC', 'F'], cpfOa: 50000 }), H0());
  assert.deepEqual(mixed.buyers.map((b) => b.cpfOa), [50000, null]);
  // untouched CPF OA (null) keeps the saved per-buyer balances
  const base = { ...H0(), scheme: 'family', buyers: [{ ...H0().buyers[0], age: 30, income: 5000, cpfOa: 70000 }, { ...H0().buyers[0], age: 31, income: 5000, cpfOa: 10000 }] };
  const kept = householdFrom({ ...answersFrom(base), goal: 'buyResale' }, base);
  assert.deepEqual(kept.buyers.map((b) => b.cpfOa), [70000, 10000]);
  assert.equal(touchesHousehold({ ...answersFrom(base), goal: 'buyResale' }, base), false);
});

test('income per person: evenly · one of us works · type each · no income from work', () => {
  assert.deepEqual(incomesFor(blank({ ...couple }), 2), [4750, 4750]);
  assert.deepEqual(incomesFor(blank({ ...couple, split: 'one' }), 2), [9500, 0]);
  assert.deepEqual(incomesFor(blank({ ...couple, split: 'each', each: [7000, 2500] }), 2), [7000, 2500]);
  assert.equal(incomeOf(blank({ ...couple, split: 'each', each: [7000, 2500] })), 9500);
  assert.deepEqual(incomesFor(blank({ ...couple, split: 'each', each: [7000, null] }), 2), [7000, null]);
  assert.equal(incomeOf(blank({ goal: 'retire', noWork: true, band: 'i3' })), 0);
  const h = householdFrom(blank({ goal: 'retire', ...couple, ages: [66, 64], noWork: true }), H0());
  assert.deepEqual(h.buyers.map((b) => b.income), [0, 0]);
  // a saved unequal pair reads back as "type each" (Edit answers does not even it out)
  const base = { ...H0(), buyers: [{ ...H0().buyers[0], age: 30, income: 6000 }, { ...H0().buyers[0], age: 31, income: 3000 }] };
  const a = answersFrom(base);
  assert.equal(a.split, 'each'); assert.deepEqual(a.each, [6000, 3000]);
  assert.deepEqual(householdFrom(a, base).buyers.map((b) => b.income), [6000, 3000]);
  assert.equal(answersFrom({ ...base, buyers: [{ ...base.buyers[0] }, { ...base.buyers[1], income: 0 }] }).split, 'one');
});

test('sell and upgrade: the home you own → plan.current; HDB → second-timers', () => {
  const a = blank({ goal: 'sellUpgrade', ...couple, home: { type: 'hdb', flatType: '4 ROOM', block: { bid: 12, label: '123 Bedok Nth Rd' } }, firstTimer: true });
  const h = householdFrom(a, H0());
  assert.equal(h.firstTimer, false, 'an HDB flat owned now: second-timers');
  const patches = Object.fromEntries(planPatches(a, P0()));
  assert.deepEqual(patches['plan.current'], { ...P0().current, owns: true, propertyType: 'hdb', flatType: '4 ROOM', block: { bid: 12, label: '123 Bedok Nth Rd' } });
  // private property: the first-flat answer is kept; skipping the home screen still ticks "I own a home"
  const priv = blank({ goal: 'sellUpgrade', ...couple, home: { type: 'private' }, firstTimer: true });
  assert.equal(householdFrom(priv, H0()).firstTimer, true);
  assert.equal(Object.fromEntries(planPatches(priv, P0()))['plan.current'].propertyType, 'private');
  assert.deepEqual(planPatches(blank({ goal: 'sellUpgrade' }), P0()), [['plan.current', { ...P0().current, owns: true }]]);
  assert.deepEqual(planPatches(blank({ goal: 'sellUpgrade' }), { ...P0(), current: { ...P0().current, owns: true } }), [], 'nothing to change');
});

test('rent: your rent now → plan.rent (shared, B7); a room is your figure; travel → commute places', () => {
  const a = blank({ goal: 'rent', buyers: 1, ages: [31], residency: ['PR'], rent: { type: 'room', amount: 1100 }, hubs: ['h1', 'h1', 'h2', 'h3'] });
  const patches = Object.fromEntries(planPatches(a, P0()));
  assert.deepEqual(patches['plan.rent'], { ...P0().rent, type: 'room', amount: 1100 });
  assert.deepEqual(routeFor(a).view.hubs, ['h1', 'h2'], 'at most two, no repeats');
  assert.equal(routeFor(a).view.colorBy, 'rent');
  const h = householdFrom(a, H0());
  assert.equal(h.buyers[0].citizenship, 'PR');
  assert.equal(h.cash, null, 'no savings screen for renters');
  assert.match(doneHtml(a, h, routeFor(a)), /Your room rent: S\$1,100 a month \(your figure\)/);
  // a rent answer left over from another goal is not written
  assert.deepEqual(planPatches({ ...a, goal: 'buyResale' }, P0()).filter(([k]) => k === 'plan.rent'), []);
});

test('retire: CPF and cash — RA per buyer, CPF LIFE payout only when typed, cash; the home you own', () => {
  const a = blank({ goal: 'retire', buyers: 2, ages: [67, 62], residency: ['SC', 'SC'], noWork: true, ra: [180000, 150000], life: [1400, null], cash: 90000, home: { type: 'hdb', flatType: '3 ROOM' } });
  const h = householdFrom(a, H0());
  assert.deepEqual(h.buyers.map((b) => b.cpfRa), [180000, 150000]);
  assert.equal(h.buyers[0].cpfLifeMonthly, 1400);
  assert.equal(h.buyers[1].cpfLifeMonthly, undefined, 'not typed → not written');
  assert.equal(h.cash, 90000);
  assert.equal(Object.fromEntries(planPatches(a, P0()))['plan.current'].flatType, '3 ROOM');
  // the payout field shows only for a buyer at the payout age (passed in from policy)
  const html = questionHtml(questionsFor(a).indexOf('cpfCash'), a, { payoutAge: 65 });
  assert.match(html, /data-life="0"/); assert.doesNotMatch(html, /data-life="1"/);
});

test('buy / sell goals: optional child date of birth → plan.dates.children (no duplicates); not for renters', () => {
  const a = blank({ goal: 'buyResale', ...couple, child: '2021-03-04' });
  assert.deepEqual(Object.fromEntries(planPatches(a, P0()))['plan.dates.children'], ['2021-03-04']);
  assert.deepEqual(planPatches(a, { ...P0(), dates: { ...P0().dates, children: ['2021-03-04'] } }).filter(([k]) => k === 'plan.dates.children'), []);
  assert.deepEqual(planPatches({ ...a, goal: 'rent' }, P0()).filter(([k]) => k === 'plan.dates.children'), []);
  assert.deepEqual(planPatches({ ...a, child: 'not a date' }, P0()).filter(([k]) => k === 'plan.dates.children'), []);
  assert.match(questionHtml(1, { ...a, child: null, childOpen: false }), /data-st="child"/);
  assert.match(questionHtml(1, { ...a, childOpen: true }), /type="date" data-child/);
  assert.doesNotMatch(questionHtml(1, { ...a, goal: 'rent' }), /data-st="child"/);
});

test('every goal: householdFrom keeps the drawer shape and summarise has no NaN', () => {
  const keys = Object.keys(H0().buyers[0]).sort();
  for (const goal of GOAL_IDS) {
    const a = blank({ goal, ...couple, cpfOa: 1000, cash: 2000, ra: [1, 2], life: [3, 4], rent: { type: 'whole', amount: 2500 }, home: { type: 'hdb' } });
    const h = householdFrom(a, H0());
    h.buyers.forEach((b) => Object.keys(b).forEach((k) => assert.ok(keys.includes(k) || k === 'cpfLifeMonthly', `${goal}: ${k}`)));
    JSON.stringify(summarise(h), (k, v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v), `${goal}.${k}`); return v; });
  }
});

test('language switch draft (O5): kept only when well formed', () => {
  const a = blank({ goal: 'rent', ...couple });
  assert.deepEqual(cleanDraft({ i: 4, a }), { i: 4, a });
  assert.equal(cleanDraft({ i: 4, a: { ...a, goal: 'nope' } }), null);
  assert.equal(cleanDraft({ i: 9, a }), null);
  assert.equal(cleanDraft(null), null);
  assert.equal(cleanDraft({ i: 6, a: blank({ goal: 'explore' }) }).i, 5, 'clamped to the goal\'s last screen');
  // the draft survives JSON (it lives in the store)
  assert.deepEqual(cleanDraft(JSON.parse(JSON.stringify({ i: 2, a }))).a, JSON.parse(JSON.stringify(a)));
});

test('B11 flat-type hint: one person or two at the senior hint age → 2- and 3-room, said as "Picked for you"', () => {
  assert.deepEqual(flatTypesFor('buyResale', 1), ['2 ROOM', '3 ROOM']);
  assert.deepEqual(flatTypesFor('buyResale', 2, { ages: [58, 60] }), ['2 ROOM', '3 ROOM']);
  assert.deepEqual(flatTypesFor('buyResale', 2, { ages: [58, 40] }), ['4 ROOM', '5 ROOM', 'EXECUTIVE']);
  assert.deepEqual(flatTypesFor('buyResale', 2, { ages: [58, null] }), ['4 ROOM', '5 ROOM', 'EXECUTIVE']);
  const r = routeFor(blank({ goal: 'buyResale', buyers: 2, ages: [60, 57] }));
  assert.equal(r.picked, 'seniors');
  assert.equal(pickedHint(r.picked, r.view.ft, 55), 'Picked for you (two of you, both 55 or older): 2-room, 3-room. Change any time.');
  assert.equal(pickedHint(null, null, 55), '');
  assert.equal(routeFor(blank({ goal: 'retire' })).picked, null, 'retire leaves the map alone');
});
