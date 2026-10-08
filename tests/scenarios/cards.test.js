// Phone overhaul §3.5: Scenarios on a phone — 3–4 scenarios as swipe cards with the same cells and "best" marks as
// the desktop table (money is Sev-1: the cards may only re-lay out the table's cells, never compute their own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { compareHtml, cardHtml, ROWS } from '../../app/modules/scenarios/view.js';
import { cardsHtml, CARDS_FROM, cardStrings } from '../../app/modules/scenarios/cards.js';
import { scenarioResults, snapshotOf } from '../../app/engine/scenario.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { policy } from '../helpers.js';

const hh = { scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0, loan: 'hdb', tenure: 25, otherDebts: 0, cash: 80000, grantsOverride: null,
  buyers: [{ age: 30, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 32, income: 4000, citizenship: 'SC', cpfOa: 40000 }] };
const snap = (id, price, rent = 2900) => snapshotOf({ id, name: `${id}: test`, savedAt: '2026-10-07T00:00:00Z', flat: { source: 'price', price, flatType: '4 ROOM', remainingLease: 80 }, household: hh, marketRent: rent });
const results = (list) => list.map((s) => scenarioResults(s, policy, { year: 2026, horizonYears: 10, cpfDefaults: CPF_DEFAULTS }));

// table cell (td inner HTML, best title stripped) per [row][scenario]
const tableCells = (html) => html.split('<tr').slice(2).map((tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]));
const cardCells = (html) => html.split('<li class="sc-card"').slice(1).map((li) => [...li.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map((m) => m[1].replace(/ <span class="tag good">best<\/span>$/, '')));

test('cards: one per scenario, every row of the table, the same cells and the same best marks', () => {
  const list = [snap('A', 720000), snap('B', 600000), snap('C', 650000, null)];
  const res = results(list);
  const table = tableCells(compareHtml(list, res)), cards = cardCells(cardsHtml(list, res));
  assert.equal(cards.length, 3);
  assert.equal(table.length, ROWS.length);
  for (let i = 0; i < list.length; i++) for (let k = 0; k < ROWS.length; k++) assert.equal(cards[i][k], table[k][i], `scenario ${i} row ${ROWS[k].id}`);
  const html = cardsHtml(list, res);
  const tableBest = (compareHtml(list, res).match(/class="best"/g) || []).length;
  assert.equal((html.match(/sc-cr[^"]* best"/g) || []).length, tableBest);
  assert.equal((html.match(/class="sc-cr pro-only/g) || []).length, 3 * ROWS.filter((r) => !r.simple).length);
  assert.match(html, /Scenario 1 of 3/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('cards from 3 scenarios; the card body takes a layout; phone wording for Save', () => {
  assert.equal(CARDS_FROM, 3);
  const list = [snap('A', 720000), snap('B', 600000), snap('C', 650000)];
  const res = results(list);
  const phone = cardHtml({ list, results: res, canSave: true, why: '', editing: null, max: 4, phone: true, layout: cardsHtml });
  assert.match(phone, /sc-cards/);
  assert.doesNotMatch(phone, /sc-table/);
  assert.match(phone, /Save this flat as a scenario/);
  const desk = cardHtml({ list, results: res, canSave: true, why: '', editing: null, max: 4 });
  assert.match(desk, /sc-table/);
  assert.match(desk, /Save current as scenario/);
});

test('中文: the new Scenarios strings have an entry (i18n or staging)', () => {
  const app = new URL('../../app/', import.meta.url);
  const read = (p) => JSON.parse(readFileSync(new URL(p, app), 'utf8'));
  const staged = (existsSync(new URL('i18n/staging/', app)) ? readdirSync(new URL('i18n/staging/', app)) : []).filter((f) => f.endsWith('.json')).map((f) => read(`i18n/staging/${f}`));
  const dict = Object.assign({}, ...['zh', 'zh-explore', 'zh-engine', 'zh-guide'].map((n) => read(`i18n/${n}.json`)), ...staged);
  assert.deepEqual(cardStrings().filter((k) => !dict[k]), []);
});
