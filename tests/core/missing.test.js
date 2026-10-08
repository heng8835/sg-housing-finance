// core/missing.js + the pure parts of core/quickfill.js (H4): per-buyer expansion, no CPF fields for foreigners,
// the prompt markup, merging quick-fill values, popover placement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEEDS, missingFields, needPrompt, describe, needWords } from '../../app/core/missing.js';
import { mergeValues, placeQuickFill } from '../../app/core/quickfill.js';

const hh = (buyers, o = {}) => ({ cash: null, buyers, ...o });

test('"*" expands per buyer with an empty value; drawer paths and labels', () => {
  const list = missingFields(hh([{ age: 30, income: null }, { age: null, income: 4000 }]), ['income', 'age']);
  assert.deepEqual(list.map((f) => f.path), ['buyers.0.income', 'buyers.1.age']);
  assert.equal(list[0].label, 'Buyer 1 income (S$ a month)');
  assert.equal(list[1].label, 'Buyer 2 age');
  assert.ok(list.every((f) => f.type === 'number'));
  assert.deepEqual(missingFields(hh([{ age: 30, income: 5000 }], { cash: 20000 }), ['income', 'age', 'cash']), []);
  assert.deepEqual(missingFields(hh([{ age: 30, income: 5000 }]), ['cash']).map((f) => f.path), ['cash']);
  assert.equal(describe('cash').label, 'Cash savings you can put in (S$)');
  assert.equal(describe('buyers.0.cpfSa'), null);                 // Pro-only fields are never asked for
});

test('no CPF field for a foreigner; only the ids in NEEDS', () => {
  const list = missingFields(hh([{ citizenship: 'F', cpfOa: null }, { citizenship: 'PR', cpfOa: null }]), ['cpfOa']);
  assert.deepEqual(list.map((f) => f.path), ['buyers.1.cpfOa']);
  assert.deepEqual(Object.keys(NEEDS), ['income', 'age', 'cpfOa', 'cash']);
  assert.deepEqual(missingFields(hh([{}]), ['cpfSa', 'nonsense']), []);
  assert.deepEqual(missingFields(null, ['income']), []);
});

test('prompt: words, quick-fill + deep-link buttons, the first missing field, a stable key', () => {
  const list = missingFields(hh([{ age: null, income: null }]), ['income', 'age']);
  assert.equal(needWords(list), '<b>income</b> and <b>age</b>');
  assert.equal(needWords(missingFields(hh([{}], { cash: null }), ['income', 'age', 'cash'])), '<b>income</b>, <b>age</b> and <b>cash savings</b>');
  const html = needPrompt(list, 'afVerdict');
  assert.match(html, /data-need-key="afVerdict"/);
  assert.match(html, /Add <b>income<\/b> and <b>age<\/b> to see this\./);
  assert.match(html, /data-need="quick"[^>]*>Fill in here</);
  assert.match(html, /data-need="open" data-field="buyers\.0\.income">Set in household →</);
  assert.match(html, /data-fields="buyers\.0\.income,buyers\.0\.age"/);
  assert.match(needPrompt(list, 'k', { compact: true }), /class="need compact"/);
  assert.equal(needPrompt([], 'k'), '');
});

test('quick-fill merges into a copy of the household (one write, input untouched)', () => {
  const h = { cash: null, buyers: [{ age: 30, income: null }] };
  const out = mergeValues(h, { 'buyers.0.income': 5200, cash: 30000 });
  assert.deepEqual(out, { cash: 30000, buyers: [{ age: 30, income: 5200 }] });
  assert.equal(h.buyers[0].income, null);
  assert.deepEqual(mergeValues({ buyers: [] }, { 'buyers.1.age': 40 }).buyers[1], { age: 40 });
});

test('popover sits under its button, flips above near the bottom, stays 12 px from the edges', () => {
  const r = { left: 100, top: 200, right: 180, bottom: 230 };
  assert.deepEqual(placeQuickFill(r, 280, 240, 1280, 800), { left: 100, top: 236 });
  assert.deepEqual(placeQuickFill({ ...r, top: 700, bottom: 730 }, 280, 240, 1280, 800), { left: 100, top: 454 });
  assert.equal(placeQuickFill({ ...r, left: 1200 }, 280, 240, 1280, 800).left, 1280 - 280 - 12);
  assert.equal(placeQuickFill({ ...r, left: 0 }, 280, 240, 1280, 800).left, 12);
});
