// First-run "Start here" (X-09): first-visit detection, answers → household (drawer shape, summarise without NaN),
// routing per goal (tab, Plan section, tour, guide, map hand-off), markup + 中文 coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createStore, defaults, STORE_KEY, LEGACY_KEY } from '../../app/core/store.js';
import { summarise } from '../../app/engine/household.js';
import { grants } from '../../app/engine/grants.js';
import { USE_CASES } from '../../app/modules/guide/steps.js';
import {
  QUESTIONS, GOALS, GOAL_IDS, INCOME_BANDS, isFirstVisit, householdEmpty, choicesCount, answersFrom, householdFrom,
  touchesHousehold, incomeOf, splitIncome, routeFor, guideFor, flatTypesFor, startRecord,
} from '../../app/modules/start/answers.js';
import { questionHtml, doneHtml, summaryLines, uiStrings, bandLabel } from '../../app/modules/start/view.js';
import { policy } from '../helpers.js';

const lsStaging = (u) => (existsSync(u) ? readdirSync(u) : []); // staging is empty once the integrator merged it
const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const GUIDES = Object.values(JSON.parse(read('content/guides.json')).guides);
const FLAT_TYPES = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const blank = (o = {}) => ({ ...answersFrom(defaults().household), ...o });
const noNaN = (obj) => JSON.stringify(obj, (k, v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is not a finite number`); return v; });

test('"Just explore" keeps the 6 questions; every goal has a tab, a known tour and a label', () => {
  assert.deepEqual(QUESTIONS, ['goal', 'who', 'residency', 'income', 'firstTimer', 'towns']);
  const tours = new Set(USE_CASES.map((u) => u.id));
  for (const g of GOALS) {
    assert.ok(['explore', 'afford', 'rent', 'plan', 'choices'].includes(g.tab), g.id);
    assert.ok(tours.has(g.tour), `${g.id}: tour ${g.tour} is not in modules/guide/steps.js`);
  }
});

test('first visit: defaults → yes; a household, a shortlist, done / skipped, or a sample → no', () => {
  const st = createStore({ storage: memory() });
  const state = () => ({ household: st.get('household'), ui: st.get('ui') });
  assert.equal(isFirstVisit({ state: state() }), true);
  assert.equal(isFirstVisit({ state: state(), inSample: true }), false);
  assert.equal(isFirstVisit({ state: state(), legacyRaw: '{"choices":[{"id":1}]}' }), false);
  assert.equal(isFirstVisit({ state: state(), legacyRaw: '{"choices":[],"colorBy":"psf"}' }), true); // map settings alone are not a visit
  assert.equal(isFirstVisit({ state: state(), legacyRaw: 'not json' }), true);
  st.set('ui.start', startRecord('skipped', '2026-10-07'));
  assert.equal(isFirstVisit({ state: state() }), false);
  st.set('ui.start', startRecord('done', '2026-10-07', 'rent'));
  assert.equal(isFirstVisit({ state: state() }), false);
  const st2 = createStore({ storage: memory() });
  st2.set('household.buyers.0.income', 5000);
  assert.equal(isFirstVisit({ state: { household: st2.get('household'), ui: st2.get('ui') } }), false);
  st2.set('household.buyers.0.income', null); st2.set('household.cash', 20000);
  assert.equal(isFirstVisit({ state: { household: st2.get('household'), ui: st2.get('ui') } }), false);
  // a v1.8 user (profile migrated from hdb-comparer) is not new
  const old = createStore({ storage: memory({ [LEGACY_KEY]: '{"profile":{"income":6000,"age":30}}' }) });
  assert.equal(isFirstVisit({ state: { household: old.get('household'), ui: old.get('ui') } }), false);
  assert.equal(choicesCount(null), 0);
  assert.equal(householdEmpty(defaults().household), true);
});

test('answers → household in the drawer shape; summarise works without NaN for every goal', () => {
  const keys = Object.keys(defaults().household.buyers[0]).sort();
  for (const goal of GOAL_IDS) {
    for (const [buyers, ages, residency, income, firstTimer] of [[1, [34], ['SC'], 4200, true], [2, [31, 29], ['SC', 'PR'], null, 'mixed'], [2, [null, 40], ['F', 'SC'], 9001, false]]) {
      const a = blank({ goal, buyers, ages, residency, income, band: income == null ? 'i4' : null, firstTimer });
      const h = householdFrom(a, defaults().household);
      assert.equal(h.buyers.length, buyers);
      h.buyers.forEach((b) => assert.deepEqual(Object.keys(b).sort(), keys));
      assert.equal(h.scheme, buyers === 1 ? 'single' : 'family');
      const s = summarise(h);
      noNaN(s);
      assert.equal(s.income, income ?? INCOME_BANDS.find((x) => x.id === 'i4').value);
      assert.deepEqual(h.buyers.map((b) => b.citizenship), residency);
      noNaN(grants({ household: h, flatType: '4 ROOM' }, policy));
      // the store takes it as the drawer would write it
      const st = createStore({ storage: memory() });
      st.set('household', h);
      assert.deepEqual(createStore({ storage: memory({ [STORE_KEY]: JSON.stringify(st.export()) }) }).get('household'), h);
    }
  }
});

test('income: typed number wins over a band; split across two buyers adds up exactly', () => {
  assert.equal(incomeOf({ income: 7000, band: 'i1' }), 7000);
  assert.equal(incomeOf({ income: null, band: 'i2' }), 4000);
  assert.equal(incomeOf({ income: null, band: 'nope' }), null);
  assert.deepEqual(splitIncome(9001, 2), [4501, 4500]);
  assert.deepEqual(splitIncome(5000, 1), [5000]);
  assert.deepEqual(splitIncome(null, 2), [null, null]);
  const h = householdFrom(blank({ buyers: 2, income: 9001 }), defaults().household);
  assert.equal(h.buyers[0].income + h.buyers[1].income, 9001);
  for (const b of INCOME_BANDS) assert.ok(bandLabel(b).includes('S$'));
});

test('only answered questions change the household; CPF, cash and loan are kept', () => {
  const base = { ...defaults().household, cash: 50000, loan: 'bank', tenure: 30, buyers: [{ ...defaults().household.buyers[0], age: 40, income: 6000, cpfOa: 80000, citizenship: 'PR', prYears3Plus: true }] };
  const untouched = answersFrom(base);
  assert.equal(touchesHousehold(untouched, base), false);
  assert.deepEqual(householdFrom(untouched, base), base);
  const h = householdFrom({ ...untouched, ages: [41] }, base);
  assert.equal(h.buyers[0].age, 41);
  assert.equal(h.buyers[0].cpfOa, 80000);
  assert.equal(h.buyers[0].citizenship, 'PR');
  assert.equal(h.cash, 50000); assert.equal(h.loan, 'bank'); assert.equal(h.tenure, 30);
  // ages are kept in the drawer's input range; "one of us" with a single buyer falls back to first-timer
  assert.equal(householdFrom(blank({ buyers: 1, ages: [12] }), base).buyers[0].age, 21);
  assert.equal(householdFrom(blank({ buyers: 1, firstTimer: 'mixed' }), { ...base, firstTimer: 'mixed' }).firstTimer, true);
  assert.equal(touchesHousehold(blank({ goal: 'rent', towns: ['BEDOK'] }), defaults().household), false); // goal / towns only
  assert.equal(touchesHousehold(blank({ residency: ['F'] }), defaults().household), true);
});

test('routing per goal: tab, Plan section, tour, guide and the map hand-off', () => {
  const r = (goal, o = {}) => routeFor(blank({ goal, ...o }), GUIDES);
  assert.deepEqual([r('buyResale').tab, r('buyResale').tour, r('buyResale').guide?.id], ['afford', 'firstResale', 'buying-resale']);
  assert.deepEqual([r('btoVsResale').tab, r('btoVsResale').section, r('btoVsResale').guide?.id, r('btoVsResale').tour], ['plan', 'planBto', 'bto-vs-resale', 'btoVsResale']);
  assert.equal(r('rent').guide?.id, 'renting-singles-prs');
  assert.deepEqual([r('sellUpgrade').tab, r('sellUpgrade').section, r('sellUpgrade').tour], ['plan', 'planSellBuy', 'sellBuy']);
  assert.deepEqual([r('rent').tab, r('rent').tour, r('rent').view.colorBy], ['rent', 'renting', 'rent']);
  assert.deepEqual([r('retire').tab, r('retire').section, r('retire').tour, r('retire').view], ['plan', 'planCpf', 'retire', null]);
  assert.deepEqual([r('explore').tab, r('explore').tour, r('explore').view], ['explore', 'map', null]);
  assert.equal(routeFor(blank({ goal: null }), GUIDES).goal, 'explore'); // skipped the goal → just explore
  assert.deepEqual(r('buyResale', { buyers: 1 }).view.ft, ['2 ROOM', '3 ROOM']); // B11: one person → the smaller types
  assert.equal(r('buyResale', { buyers: 1 }).picked, 'one');
  assert.deepEqual(r('buyResale', { buyers: 2, towns: ['BEDOK', 'TAMPINES'] }).view, { ft: ['4 ROOM', '5 ROOM', 'EXECUTIVE'], towns: ['BEDOK', 'TAMPINES'] });
  for (const g of GOAL_IDS) for (const n of [1, 2, null]) (flatTypesFor(g, n) || []).forEach((f) => assert.ok(FLAT_TYPES.includes(f), f));
  // guides: preferred id, else the same tour use case, else none; every guide named in GOALS exists
  assert.equal(guideFor('rent', [{ id: 'x', use_case: 'renting', title: 'X' }]).id, 'x');
  assert.equal(guideFor('rent', []), null);
  for (const g of GOALS) for (const id of g.guides) assert.ok(GUIDES.some((x) => x.id === id), `guide ${id} missing from content/guides.json`);
});

test('markup: every question renders, with Skip / Next and the sample link; the last screen offers tour + guide', () => {
  const a = blank({ goal: 'explore', buyers: 2, ages: [30, null] });
  QUESTIONS.forEach((q, i) => {
    const html = questionHtml(i, a, { towns: ['BEDOK', 'ANG MO KIO'] });
    assert.match(html, /id="startTitle"/);
    assert.match(html, /data-st="skip"/);
    assert.match(html, /data-st-lang="zh"/, 'EN · 中文 inside the dialog');
    if (['goal', 'firstTimer'].includes(q)) assert.doesNotMatch(html, /data-st="next"/, `${q}: a tap moves on`); else assert.match(html, /data-st="next"/);
    assert.match(html, /data-st="sample"/);
    assert.match(html, new RegExp(`question ${i + 1} of ${QUESTIONS.length}`));
    assert.doesNotMatch(html, /undefined|NaN/);
  });
  assert.match(questionHtml(1, a), /data-age="1"/);
  assert.match(questionHtml(0, blank()), /Start here · question 1</, 'no goal yet: no "of n"');
  assert.match(questionHtml(5, a, { towns: ['ANG MO KIO'] }), /Ang Mo Kio/);
  const ans = blank({ goal: 'buyResale', buyers: 2, ages: [31, 29], residency: ['SC', 'SC'], band: 'i4', firstTimer: true, towns: ['BEDOK'] });
  const h = householdFrom(ans, defaults().household), route = routeFor(ans, GUIDES);
  const lines = summaryLines(ans, h, route);
  assert.match(lines[0], /2 buyers \(31, 29\) · Singapore Citizen · S\$9,500 a month · first-timers/);
  assert.match(lines[1], /4 ROOM, 5 ROOM, EXECUTIVE in Bedok/);
  const done = doneHtml(ans, h, route, { tourTitle: 'x' });
  assert.match(done, /data-st="tour"/);
  assert.match(done, /data-st="guide"/);
  assert.doesNotMatch(doneHtml(blank({ goal: 'retire' }), null, routeFor(blank({ goal: 'retire' }), [])), /data-st="guide"|data-st="household"/);
});

test('中文: every Start here string is translated; new keys appear once in zh.json', () => {
  // 7b: new strings are staged in i18n/staging/<AGENT>.<target>.json until the integrator merges them
  const staged = lsStaging(new URL('i18n/staging/', APP)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read(`i18n/staging/${f}`)));
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))), ...staged);
  const extra = ['Answer a few quick questions to set things up →', 'Start over with a few quick questions', ...GOALS.map((g) => g.label)];
  const missing = [...new Set([...uiStrings(), ...extra])].filter((s) => dict[s] == null);
  assert.deepEqual(missing, []);
  const raw = read('i18n/zh.json');
  for (const s of ['Who is buying?', 'Start here', 'Skip for now']) {
    assert.equal(raw.split(`\n "${s}":`).length - 1, 1, `"${s}" appears more than once in zh.json`);
  }
  assert.doesNotThrow(() => JSON.parse(raw));
});
