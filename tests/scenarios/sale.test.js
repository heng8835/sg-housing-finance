// Phase 7b B14 — scenarios keep the move: a "Your sale" row, the sale in the default name, the save hint, and Load
// putting back the sale with its order so the numbers equal what Afford / Plan show for those inputs (P2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saleOf, saleText, defaultName, compareHtml, cardHtml, ROWS } from '../../app/modules/scenarios/view.js';
import { applyScenario } from '../../app/modules/scenarios/index.js';
import { scenarioResults, snapshotOf, flatInput } from '../../app/engine/scenario.js';
import { planPurchase } from '../../app/engine/plan.js';
import { saleInput } from '../../app/engine/salefunds.js';
import { createStore } from '../../app/core/store.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
// P2-like: Kok Wee (44, SC) & Rachel (42, PR), second-timers selling their 4-room for S$527,000
const P2 = { scheme: 'family', firstTimer: false, parents: 'none', propertiesOwned: 1, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 80000, grantsOverride: null,
  buyers: [{ age: 44, income: 7000, citizenship: 'SC', cpfOa: 60000 }, { age: 42, income: 5500, citizenship: 'PR', cpfOa: 40000 }] };
const current = (mode = null) => ({ owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 527000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: 38000, boughtYear: 2012, mode, saleCompletion: '2027-03-12' });
const flat = { source: 'price', label: 'Your own figures', price: 800000, flatType: '5 ROOM', remainingLease: 70 };
const snap = (id, cur) => snapshotOf({ id, name: defaultName(id, flat, 'BISHAN', saleOf({ current: cur })), savedAt: '2026-10-07T00:00:00Z', flat, household: P2, plan: { cpf: {}, current: cur }, marketRent: null });
const resultsOf = (s) => scenarioResults(s, policy, { year: 2026, horizonYears: 10, cpfDefaults: CPF_DEFAULTS });

test('B14: sale words — price + order (chosen, else the suggested contra), not selling, no price yet', () => {
  assert.equal(saleText(saleOf({ current: current('sell-first') })), 'S$527k · sell first');
  assert.equal(saleText(saleOf({ current: current() })), 'S$527k · sell and buy together');
  assert.equal(saleText(saleOf({ current: current('buy-first') })), 'S$527k · buy first');
  assert.equal(saleText(saleOf({ current: { owns: false, salePrice: 527000 } })), 'Not selling');
  assert.equal(saleText(saleOf(null)), 'Not selling');
  assert.equal(saleText(saleOf({ current: { owns: true, salePrice: null } })), 'Selling · no sale price yet');
});

test('B14: default name adds the sale and keeps it when the name is cut to 60 characters', () => {
  assert.equal(defaultName('B', { price: 720000, flatType: '4 ROOM' }, 'BISHAN', { price: 540000, mode: 'sell-first' }), 'B: Bishan 4R S$720k · sell S$540k');
  assert.equal(defaultName('A', { price: 720000, flatType: '4 ROOM' }, 'BISHAN', { price: null, mode: 'contra' }), 'A: Bishan 4R S$720k');
  const long = defaultName('C', { price: 1, source: 'choice', label: 'x'.repeat(100) }, null, { price: 540000, mode: 'contra' });
  assert.equal(long.length, 60);
  assert.ok(long.endsWith(' · sell S$540k'));
});

test('B14: "Your sale" row (Simple + Pro, never best) — two scenarios differing only by order side by side', () => {
  assert.equal(ROWS[0].id, 'sale');
  assert.equal(ROWS[0].simple, true);
  const list = [snap('A', current('sell-first')), snap('B', current('buy-first'))];
  const res = list.map(resultsOf);
  const html = compareHtml(list, res);
  const row = html.split('<tr').find((r) => r.includes('>Your sale<'));
  assert.match(row, /<td>S\$527k · sell first<\/td><td>S\$527k · buy first<\/td>/);
  assert.doesNotMatch(row, /best/);
  // buying first, the sale money is not there yet: more upfront cash, a bigger loan
  assert.notEqual(res[0].upfront.cash, res[1].upfront.cash);
  assert.equal(res[1].plan.sale.usable, false);
  assert.equal(res[0].plan.sale.usable, true);
  // a scenario that cannot be calculated still shows its sale
  assert.match(compareHtml(list, [res[0], null]), /<td>S\$527k · buy first<\/td>/);
});

test('B14: save hint names the sale', () => {
  const html = cardHtml({ list: [], results: [], canSave: true, why: '', editing: null, max: 4, sale: saleOf({ current: current('sell-first') }) });
  assert.match(html, /Saves your sale too \(S\$527k, sell first\)\./);
  assert.doesNotMatch(cardHtml({ list: [], results: [], canSave: true, why: '', editing: null, max: 4, sale: null }), /Saves your sale/);
});

test('Sev-1 B14: Load restores the sale inputs + order, and the numbers equal Afford / Plan for those inputs (P2)', () => {
  const store = createStore({ storage: memory() });
  const saved = snap('A', current('sell-first'));
  // the user then changes things: another order, another price, another flat
  store.set('household', { ...P2, cash: 5000 });
  store.set('plan.current', { ...current('buy-first'), salePrice: 480000 });
  store.set('focus', { source: 'price', price: 600000, flatType: '4 ROOM' });
  applyScenario(store, saved);
  const c = store.get('plan.current');
  for (const k of ['owns', 'salePrice', 'outstandingLoan', 'cpfUsed', 'accruedInterest', 'boughtYear', 'mode', 'saleCompletion']) assert.deepEqual(c[k], current('sell-first')[k], k);
  // what Afford computes from the store now = what the scenario column shows
  const afford = planPurchase({ household: store.get('household'), flat: flatInput(store.get('focus')), sale: saleInput(store.get('plan'), 2026) }, policy);
  assert.equal(JSON.stringify(afford), JSON.stringify(resultsOf(saved).plan));
  assert.equal(afford.sale.mode, 'sell-first');
});

test('B14: loading a scenario saved without a sale unticks "I own a home now" (numbers match what was saved)', () => {
  const store = createStore({ storage: memory() });
  store.set('plan.current', current('contra'));
  const noSale = snapshotOf({ id: 'B', name: 'B', savedAt: '2026-10-07T00:00:00Z', flat, household: P2, plan: { cpf: {}, current: { owns: false } } });
  applyScenario(store, noSale);
  assert.equal(store.get('plan.current.owns'), false);
  assert.equal(saleInput(store.get('plan'), 2026), null);
  assert.equal(store.get('plan.current.salePrice'), 527000, 'the other sale inputs are kept for later');
});
