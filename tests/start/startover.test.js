// Phase 7a A9 — "Start over" means start over: the household drawer's "Start over with 6 quick questions" clears the
// household (after a confirm) and opens Start here empty; "Edit answers" keeps cash / CPF / grants override (today's
// behaviour). A kept grants override is always visible in Afford's Grants KPI as "your figure".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults } from '../../app/core/store.js';
import { householdEmpty, householdFrom, answersFrom, clearedHousehold, isFirstVisit } from '../../app/modules/start/answers.js';

const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');

// P1-5: S$150k cash and a S$30k HFE override from earlier survived "Start over"
const kept = () => ({
  ...defaults().household, scheme: 'family', cash: 150000, otherDebts: 400, grantsOverride: 30000, parents: 'near', loan: 'bank', tenure: 20, firstTimer: false,
  buyers: [{ ...defaults().household.buyers[0], age: 31, income: 5000, cpfOa: 60000, cpfSa: 20000 }, { ...defaults().household.buyers[0], age: 29, income: 4000, cpfOa: 40000 }],
});

test('start over → householdEmpty() is true; nothing of the old household is kept', () => {
  const h = clearedHousehold();
  assert.equal(householdEmpty(kept()), false);
  assert.equal(householdEmpty(h), true);
  assert.deepEqual(h, defaults().household);
  assert.equal(h.cash, null); assert.equal(h.grantsOverride, null); assert.equal(h.parents, 'none');
  assert.equal(h.buyers.length, 1); assert.equal(h.buyers[0].cpfOa, null);
  // the questions start empty: no buyer count, no first-timer answer
  const a = answersFrom(h);
  assert.equal(a.buyers, null); assert.equal(a.firstTimer, null); assert.equal(a.income, null);
  // the next visit counts as a first visit again (no choices, Start here not yet finished)
  assert.equal(isFirstVisit({ state: { household: h, ui: {} } }), true);
});

test('edit answers keeps CPF, cash and the grants override', () => {
  const base = kept();
  const a = { ...answersFrom(base), goal: 'buyResale', income: 10000, split: 'even' }; // 7b: the saved 5,000 / 4,000 reads back as "Type each"
  const h = householdFrom(a, base);
  assert.equal(h.cash, 150000);
  assert.equal(h.grantsOverride, 30000);
  assert.equal(h.buyers[0].cpfOa, 60000); assert.equal(h.buyers[0].cpfSa, 20000); assert.equal(h.buyers[1].cpfOa, 40000);
  assert.equal(h.buyers[0].income + h.buyers[1].income, 10000);
  assert.equal(householdEmpty(h), false);
});

test('drawer: "Edit answers" keeps, "Start over" confirms then asks Start here for a fresh start', () => {
  const src = read('modules/household/index.js') + read('modules/household/form.js'); // S3: the markup lives in form.js
  assert.match(src, /data-act="edit-answers">\$\{t\('Edit answers'\)\}/);
  assert.match(src, /case 'edit-answers':[^\n]*bus\.emit\('start:open', \{ opener: chip \}\)/);
  assert.match(src, /case 'start': if \(!confirm\(t\('Start over\? This clears your household in this browser\.'\)\)\) return;[^\n]*fresh: true/);
  const start = read('modules/start/index.js');
  assert.match(start, /if \(fresh\) store\.set\('household', clearedHousehold\(\)\)/);
  assert.match(start, /fresh: !!fresh && !store\.inSample\(\)/); // never inside a sample household
});

test('Afford: a kept grants override shows "your figure" on the Grants KPI', () => {
  const src = read('modules/afford/index.js');
  assert.match(src, /h\.grantsOverride != null \? ` <span class="tag neutral">\$\{t\('your figure'\)\}<\/span>`/);
});

test('A9 strings have 中文 entries', () => {
  const zh = JSON.parse(read('i18n/zh.json'));
  for (const k of ['Edit answers', 'Start over? This clears your household in this browser.', 'your figure', 'the amount you entered in About you']) assert.ok(zh[k], k);
});
