import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestIdx, defaultName, ftShort, compareHtml, cardHtml, ROWS } from '../../app/modules/scenarios/view.js';
import { scenarioResults, snapshotOf } from '../../app/engine/scenario.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const hh = { scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 80000, grantsOverride: null,
  buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 32, income: 4000, citizenship: 'SC', cpfOa: 40000 }] };
const snap = (id, price, rent = 2900) => snapshotOf({ id, name: `${id}: test`, savedAt: '2026-10-07T00:00:00Z', flat: { source: 'price', price, flatType: '4 ROOM', remainingLease: 80 }, household: hh, marketRent: rent });
const results = (list) => list.map((s) => scenarioResults(s, policy, { year: 2026, horizonYears: 10, cpfDefaults: CPF_DEFAULTS }));

test('default name: "A: Bishan 4R S$720k"; a shortlisted flat uses its name; no town → type and price', () => {
  assert.equal(defaultName('A', { price: 720000, flatType: '4 ROOM' }, 'BISHAN'), 'A: Bishan 4R S$720k');
  assert.equal(defaultName('B', { price: 655000, flatType: '5 ROOM', source: 'choice', label: 'Near mum' }), 'B: Near mum 5R S$655k');
  assert.equal(defaultName('C', { price: 600000, flatType: 'EXECUTIVE', source: 'price', label: 'Your own figures' }), 'C: Executive S$600k');
  assert.equal(defaultName('D', { price: 1, source: 'choice', label: 'x'.repeat(100) }).length, 60);
  assert.equal(ftShort('3 ROOM'), '3R');
  assert.equal(ftShort('MULTI-GENERATION'), 'Multi-gen');
});

test('best value: min / max, ties all marked, nothing when fewer than two or all equal', () => {
  assert.deepEqual([...bestIdx([3, 1, 2], 'min')], [1]);
  assert.deepEqual([...bestIdx([3, 1, 3], 'max')], [0, 2]);
  assert.deepEqual([...bestIdx([5, null, 5], 'min')], []);
  assert.deepEqual([...bestIdx([5, null], 'min')], []);
  assert.deepEqual([...bestIdx([null, undefined], 'max')], []);
});

test('compare table: one column per scenario, 6 rows in Simple, all 10 in Pro (B14 "Your sale"), cheapest price marked', () => {
  const list = [snap('A', 720000), snap('B', 600000), snap('C', 650000, null)];
  const html = compareHtml(list, results(list));
  assert.equal((html.match(/<th scope="col">/g) || []).length, 4);
  assert.equal((html.match(/<tr/g) || []).length, 1 + ROWS.length);
  assert.equal(ROWS.length, 10);
  assert.equal(ROWS.filter((r) => r.simple).length, 6);
  assert.equal((html.match(/<tr class="pro-only">/g) || []).length, 4);
  const priceRow = html.split('<tr').find((r) => r.includes('>Price<'));
  assert.match(priceRow, /<td class="best"[^>]*>S\$600,000</);
  assert.equal((priceRow.match(/class="best"/g) || []).length, 1);
  assert.match(html, /No rent figure for this flat/);   // C was saved without a rent
  assert.match(html, /sc-scroll/);
});

test('compare table: a scenario that cannot be calculated shows dashes, not NaN', () => {
  const list = [snap('A', 720000), snap('B', 600000)];
  const html = compareHtml(list, [results(list)[0], null]);
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.match(html, /Could not be calculated/);
});

test('card: Save disabled with the hint when full; list actions per scenario', () => {
  const list = [snap('A', 1), snap('B', 2), snap('C', 3), snap('D', 4)];
  const html = cardHtml({ list, results: results(list), canSave: false, why: 'All four scenarios are used — delete one to save another.', editing: null, max: 4 });
  assert.match(html, /id="scSave" disabled aria-describedby="scWhy"/);
  assert.match(html, /id="scWhy">All four scenarios are used/);
  assert.match(html, /4 of 4 saved/);
  for (const act of ['sc-load', 'sc-rename', 'sc-delete']) assert.equal((html.match(new RegExp(`data-act="${act}"`, 'g')) || []).length, 4);
  const editing = cardHtml({ list: list.slice(0, 1), results: results(list.slice(0, 1)), canSave: true, why: '', editing: 'A', max: 4 });
  assert.match(editing, /id="scName"[^>]*value="A: test"/);
  assert.match(editing, /Save another scenario to compare side by side/);
  assert.doesNotMatch(editing, /id="scSave" disabled/);
});
