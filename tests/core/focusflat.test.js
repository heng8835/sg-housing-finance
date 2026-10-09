// Phase 8a (mobile-revamp-ideas.md M-01, M-08): the flat in focus bar (core/focusflat.js + modules/shell/flatbar.js)
// and the "Based on your household" quick edits (core/focusflat.js + modules/household/quickedit.js). Pure parts, the
// small hooks in Afford / Rent / Plan / legacy / index.html, 中文 coverage and the CSS rules (calm, phone floor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barModel, barText, choicePos, stepChoice, navText, showNav, qePaths, basedOnRows, basedOnHtml, uiStrings as ffStrings } from '../../app/core/focusflat.js';
import { qeFields, qeTitle, qeValue, liveText, uiStrings as qeStrings } from '../../app/modules/household/quickedit.js';
import { uiStrings as fbStrings, BAR_TABS } from '../../app/modules/shell/flatbar.js';
import { HOUSEHOLD_FIELD } from '../../app/core/filllink.js';
import { initI18n } from '../../app/core/i18n.js';
import { summarise } from '../../app/engine/household.js';

const read = (p) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8');
const choice = (id, o = {}) => ({ source: 'choice', choiceId: id, bid: 10 + id, label: `Flat ${id}`, price: 500000 + id * 10000, flatType: '4 ROOM', remainingLease: 80, cov: 0, ...o });
const C = [choice(1), choice(2), choice(3)];
const hh = (o = {}) => ({ scheme: 'family', cash: 40000, buyers: [{ age: 29, income: 4200, citizenship: 'SC', cpfOa: 45000 }, { age: 31, income: 3800, citizenship: 'SC', cpfOa: 38000 }], ...o });

test('bar: names the flat the answers use — a choice, a block hand-off, your own price, a typical flat', () => {
  const m = barModel({ focus: C[1], tf: C[1], choices: C });
  assert.deepEqual({ name: m.name, ft: m.ft, price: m.price, pos: m.pos, n: m.n, typical: m.typical }, { name: 'Flat 2', ft: '4-room', price: 'S$520,000', pos: 2, n: 3, typical: false });
  assert.equal(barText(m), 'Flat 2 · 4-room · S$520,000');
  const block = { source: 'block', bid: 7, label: '411A Fernvale Rd — median of recent 4-room sales', price: 600000, flatType: '4 ROOM' };
  assert.equal(barText(barModel({ focus: block, tf: block, blockLabel: '411A Fernvale Rd' })), '411A Fernvale Rd · 4-room · S$600,000', 'the block, not the long hand-off label');
  const own = { source: 'price', label: 'Your own figures', price: 650000, flatType: '5 ROOM' };
  assert.equal(barText(barModel({ focus: own, tf: own })), 'Your own figures · 5-room · S$650,000');
  const nick = choice(4, { label: 'Fernvale 4-room', price: 600000 });
  assert.equal(barText(barModel({ focus: nick, tf: nick })), 'Fernvale 4-room · S$600,000', 'the nickname already names the type');
  const typ = { source: 'typical', isDefault: true, price: 612000, flatType: '4 ROOM', label: 'Typical 4-room in Tampines' };
  const mt = barModel({ focus: null, tf: typ, choices: C });
  assert.equal(barText(mt), 'Typical 4-room in Tampines · S$612,000', 'the typical name already says the type');
  assert.equal(mt.typical, true); assert.equal(mt.pos, 0);
  assert.deepEqual(barModel({ focus: null, tf: null, choices: C }), { empty: true, n: 3 });
  assert.equal(barText(barModel({})), '');
});

test('bar 中文: a choice named in English is not followed by its type again ("Anchorvale 5-room · 5房式"; P8-03)', async () => {
  globalThis.document ??= { documentElement: {} };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(read(String(u))) });
  try {
    await initI18n('zh');
    const f = choice(5, { label: 'Anchorvale 5-room', price: 700000, flatType: '5 ROOM' });
    assert.equal(barModel({ focus: f, tf: f }).ft, '');
    const g = choice(6, { label: 'Flat 6', price: 700000, flatType: '5 ROOM' });
    assert.notEqual(barModel({ focus: g, tf: g }).ft, '', 'a name without the type still gets it');
  } finally { await initI18n('en'); globalThis.fetch = realFetch; }
});

test('bar: the price is the flat\'s own — never recomputed', () => {
  for (const p of [1, 433333, 1234567]) assert.equal(barModel({ focus: choice(1, { price: p }), tf: choice(1, { price: p }) }).price, `S$${p.toLocaleString('en-SG')}`);
});

test('‹ ›: steps through your choices, stops at the ends; from another flat › = first, ‹ = last', () => {
  assert.equal(choicePos(C[0], C), 1);
  assert.equal(choicePos({ ...C[0], source: 'price' }, C), 0, 'a typed price over a choice is not that choice');
  assert.equal(choicePos(choice(9), C), 0, 'a removed choice');
  assert.equal(stepChoice(C[0], C, 1), C[1]);
  assert.equal(stepChoice(C[1], C, -1), C[0]);
  assert.equal(stepChoice(C[2], C, 1), null);
  assert.equal(stepChoice(C[0], C, -1), null);
  assert.equal(stepChoice(null, C, 1), C[0]);
  assert.equal(stepChoice({ source: 'block', bid: 3, price: 1 }, C, -1), C[2]);
  assert.equal(stepChoice(C[0], [], 1), null);
  assert.equal(navText({ pos: 1, n: 3 }), '1 of 3 in your choices');
  assert.equal(navText({ pos: 0, n: 3 }), '3 flats in your choices');
  assert.equal(navText({ pos: 0, n: 1 }), '1 flat in your choices');
  assert.equal(navText({ pos: 0, n: 0 }), '');
  assert.equal(showNav({ pos: 1, n: 1 }), false, 'the only choice is on screen: nowhere to go');
  assert.equal(showNav({ pos: 0, n: 1 }), true);
  assert.equal(showNav({ pos: 2, n: 2 }), true);
  assert.equal(showNav({ pos: 0, n: 0 }), false);
});

test('Based on: the household\'s own figures (income = the engine\'s sum), "not entered" when empty', () => {
  const h = hh();
  const rows = basedOnRows(h, ['income', 'cash', 'cpfOa', 'age']);
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.value]), [
    ['income', 'Income', 'S$8,000 a month'], ['cash', 'Cash', 'S$40,000'], ['cpfOa', 'CPF Ordinary Account', 'S$83,000'], ['age', 'Ages', '29 and 31']]);
  assert.equal(summarise(h).income, 8000);
  const empty = basedOnRows({ cash: null, buyers: [{ age: null, income: null, citizenship: 'SC', cpfOa: null }] }, ['income', 'cash', 'cpfOa', 'age']);
  assert.deepEqual(empty.map((r) => r.value), ['not entered', 'not entered', 'not entered', 'not entered']);
  assert.equal(empty[3].label, 'Age', 'one buyer: Age');
  // CPF: only buyers with CPF count; a household of foreigners has no CPF row at all
  assert.equal(basedOnRows(hh({ buyers: [{ age: 40, income: 9000, citizenship: 'F', cpfOa: 99999 }, { age: 38, income: 1000, citizenship: 'SC', cpfOa: 20000 }] }), ['cpfOa'])[0].value, 'S$20,000');
  assert.deepEqual(basedOnRows(hh({ buyers: [{ age: 40, income: 9000, citizenship: 'F' }] }), ['cpfOa']), []);
  assert.equal(basedOnRows(hh({ cash: 0 }), ['cash'])[0].value, 'S$0', 'zero is a figure, not "not entered"');
});

test('Based on: one 44 px button per row with data-qe; the label and value are escaped', () => {
  const html = basedOnHtml(hh(), ['income', 'cash'], { id: 'afBased' });
  assert.match(html, /^<div class="based-on" id="afBased" role="group" aria-label="Based on your household"><p class="bo-h">Based on your household<\/p>/);
  assert.equal((html.match(/<button type="button" class="bo-row" data-qe="/g) || []).length, 2);
  assert.match(html, /data-qe="income" aria-label="Edit Income: S\$8,000 a month"><span class="bo-t">Income<\/span><span class="bo-v">S\$8,000 a month<\/span><span class="bo-e" aria-hidden="true">Edit<\/span>/);
  assert.equal(basedOnHtml(hh({ buyers: [{ citizenship: 'F' }] }), ['cpfOa']), '', 'no rows → nothing');
  assert.match(basedOnHtml(hh(), ['cash'], { id: 'afBased', live: '.verdict .tag|.kpi b' }), /^<div class="based-on" id="afBased" data-live="\.verdict \.tag\|\.kpi b" role="group"/);
});

test('quick edit live line (P8-04): the answer card\'s verdict + first figure, data-qe-live first, joined by " · "', () => {
  const el = (text, live) => ({ textContent: text, dataset: live ? { qeLive: live } : {} });
  const card = { querySelector: (sel) => ({ '.verdict .tag': el('  !  Possible,\n but tight '), '.kpi b': el('S$2,042', 'S$2,042 a month') })[sel] || null };
  assert.equal(liveText(card, '.verdict .tag|.kpi b'), '! Possible, but tight · S$2,042 a month');
  assert.equal(liveText(card, '.verdict .tag|.nothing'), '! Possible, but tight', 'a missing part is left out');
  assert.equal(liveText(card, '.nothing'), '');
  assert.equal(liveText(null, '.verdict .tag'), '');
});

test('quick edit: the same household paths as the About you page (one source of truth, Q3)', () => {
  const h = hh();
  assert.deepEqual(qePaths(h, 'income'), ['buyers.0.income', 'buyers.1.income']);
  assert.deepEqual(qePaths(h, 'cash'), ['cash']);
  assert.deepEqual(qePaths(hh({ buyers: [{ citizenship: 'F' }, { citizenship: 'PR' }] }), 'cpfOa'), ['buyers.1.cpfOa']);
  assert.deepEqual(qePaths(h, 'age'), ['buyers.0.age', 'buyers.1.age']);
  assert.deepEqual(qePaths(h, 'loan'), []);
  for (const k of ['income', 'cash', 'cpfOa', 'age']) for (const p of qePaths(h, k)) assert.match(p, HOUSEHOLD_FIELD, `${p} is an About you data-path`);
  // the page writes these same paths (household/form.js data-path)
  const form = read('modules/household/form.js');
  for (const k of ['age', 'income', 'cpfOa']) assert.match(form, new RegExp(`\\$\\{i\\}\\.${k}\``));
  assert.match(form, /amt\('cash', x\.cash/);
});

test('quick edit: fields per buyer with the About you labels; values parse like the page', () => {
  const f = qeFields(hh(), 'income');
  assert.deepEqual(f, [
    { path: 'buyers.0.income', label: 'Buyer 1 · Income a month', kind: 'money', value: 4200 },
    { path: 'buyers.1.income', label: 'Buyer 2 · Income a month', kind: 'money', value: 3800 }]);
  assert.deepEqual(qeFields(hh({ buyers: [{ age: 30, citizenship: 'SC' }] }), 'age'), [{ path: 'buyers.0.age', label: 'Age', kind: 'age', value: 30 }]);
  assert.deepEqual(qeFields(hh({ cash: null }), 'cash'), [{ path: 'cash', label: 'Cash savings for the home', kind: 'money', value: null }]);
  assert.equal(qeTitle(hh(), 'age'), 'Ages');
  assert.equal(qeTitle(hh({ buyers: [{}] }), 'age'), 'Age');
  assert.equal(qeTitle(hh(), 'cpfOa'), 'CPF Ordinary Account');
  assert.equal(qeValue('money', '8,000'), 8000);
  assert.equal(qeValue('money', ''), null);
  assert.ok(Number.isNaN(qeValue('money', '12.5x')));
  assert.equal(qeValue('age', ' 30 '), 30);
  assert.equal(qeValue('age', ''), null);
  assert.ok(Number.isNaN(qeValue('age', 'abc')));
});

test('hooks: Afford / Rent / Plan CPF show the rows; phones move Afford\'s fields into the sheet; legacy shares the choices', () => {
  const afford = read('modules/afford/index.js');
  assert.match(afford, /let html = isPhone\(\) \? '' : flatForm\(f, tf\);/, 'phones: no flat card on the page');
  assert.match(afford, /basedOnHtml\(h, BASED_ON, \{ id: 'afBased', live: '\.verdict \.tag\|\.kpi b' \}\)/);
  assert.match(afford, /bus\.on\('flatbar:inputs'/);
  assert.match(read('modules/rent/index.js'), /basedOnHtml\(h, BASED_ON, \{ id: 'rbBased', live: '\.verdict \.tag' \}\)/);
  assert.match(read('modules/rent/index.js'), /const ctx = isPhone\(\) && c\.basis === 'block' && !local\.placeOpen && !local\.basisOpen/, 'phones: the bar names the block — one line, the list on request');
  assert.match(read('modules/plan/cpf.js'), /\.join\(''\)\}\n    \$\{basedOnHtml\(h, BASED_ON, \{ id: 'cpfBased', live: '\.kpis \.kpi b' \}\)\}/, 'P8-11: the rows come after the buyers\' figures');
  const legacy = read('modules/explore/legacy.js');
  assert.match(legacy, /if \(btn\.dataset\.a === 'afford'\) \{ store\.set\('focus', choiceFocus\(c\)\); showTab\('afford'\); return; \}/, 'Afford button: the same focus object');
  assert.match(legacy, /bus\.emit\('choices:list', \{ list: S\.choices\.map\(choiceFocus\) \}\)/);
  assert.match(legacy, /function choiceFocus\(c\) \{ const m = metrics\(c\); return \{ source: 'choice', choiceId: c\.id, bid: c\.bid, label: c\.name, price: c\.price, flatType: D\.flat_types\[c\.ft\], remainingLease: m\.leaseNow, cov: m\.cov \|\| 0 \}; \}/);
  const html = read('index.html');
  for (const id of BAR_TABS) assert.match(html, new RegExp(`id="tab-${id}"[^\\n]*<div class="page-ctx" hidden></div>`), `${id}: the slot`);
  assert.match(html, /<link rel="stylesheet" href="styles\/flatbar\.css">/);
  const main = read('main.js');
  assert.match(main, /mountFlatBar\(\{ store, bus \}\);/);
  assert.match(main, /mountQuickEdit\(\{ store, bus \}\);/);
});

test('中文: every string of the bar, the rows and the quick edit has an entry with the same placeholders', () => {
  const zh = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))));
  const all = [...new Set([...ffStrings(), ...fbStrings(), ...qeStrings(), 'Rents around the flat above', 'Other places'])]; // + rent/index.js
  assert.deepEqual(all.filter((s) => !zh[s]), []);
  for (const s of all) for (const m of s.match(/\{\d\}/g) || []) assert.ok(zh[s].includes(m), `${s}: ${m}`);
  for (const s of all) assert.doesNotMatch(s, /click|hover/i, 'phones say tap');
});

test('CSS (styles/flatbar.css): calm (no transitions / animations / new colours), phone rules with rem ≥ .875 and 44 px targets', () => {
  const css = read('styles/flatbar.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /transition|animation/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, 'tokens only');
  const i = css.indexOf('@media screen and (max-width: 767px)');
  assert.ok(i > 0);
  const phone = css.slice(i);
  for (const m of phone.matchAll(/font-size:\s*([^;}]+)/g)) {
    assert.doesNotMatch(m[1], /px/, m[1]);
    assert.ok(parseFloat(m[1]) >= 0.875, m[1]);
  }
  for (const sel of ['.fb-change', '.fb-step', '.bo-row', '.wf-row', '.bs-head .btn', '.bs-foot .btn', '.wf-map']) {
    const r = new RegExp(`${sel.replace(/\./g, '\\.')}[^{]*\\{[^}]*min-height:\\s*(\\d+)px`).exec(phone);
    assert.ok(r && +r[1] >= 44, `${sel} ≥ 44 px`);
  }
});
