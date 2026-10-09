// Phase 8 M-05 quick add from a block (app/modules/explore/quickadd.js): the types sold here with their counts, the
// prefills = the direct add's (./handoff.js createHandoff().add) for any type, the saved choice has the direct add's
// shape, and the "Added" line offers Compare only with 2+ flats. Sev-1: no new numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickTypes, quickRow, firstType, quickChoice, formHtml, doneHtml, quickAddStrings } from '../../app/modules/explore/quickadd.js';
import { createHandoff, RECENT_M } from '../../app/modules/explore/handoff.js';

const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const I = Object.fromEntries(FT.map((f, i) => [f, i]));
const STOREY_MID = [2, 5, 8, 11, 14];
const STOREY_CHOICES = STOREY_MID.map((_, i) => ({ i }));
const LAST = 120;

/** sales = [[block, type name, month, price, sqm, storey]] → a legacy-shaped world (same as handoff.test.js). */
function world(sales, S) {
  const TX = { b: [], ft: [], m: [], p: [], a: [], s: [] };
  const nb = Math.max(...sales.map((x) => x[0])) + 1;
  const blockTx = Array.from({ length: nb }, () => []);
  sales.forEach(([b, ft, m, p, a, s], i) => { TX.b.push(b); TX.ft.push(I[ft]); TX.m.push(m); TX.p.push(p); TX.a.push(a); TX.s.push(s); blockTx[b].push(i); });
  const D = { flat_types: FT, blocks: Array.from({ length: nb }, (_, k) => ({ label: `Blk ${k}` })) };
  const ho = createHandoff({ D, TX, blockTx, getS: () => S, getAgg: () => [], txOk: () => true, median, lastMonthIdx: LAST, storeyMid: STOREY_MID, storeyChoices: STOREY_CHOICES });
  const lists = (bi) => ({ all: blockTx[bi], recent: blockTx[bi].filter((i) => TX.m[i] >= LAST - (RECENT_M - 1)) });
  const row = (bi, ft) => quickRow({ ft, ...lists(bi), ftOf: (i) => TX.ft[i], storeyOf: (i) => TX.s[i], sqmOf: (i) => TX.a[i], priceOf: (i) => TX.p[i], median, storeyMid: STOREY_MID, storeyChoices: STOREY_CHOICES });
  return { TX, D, ho, lists, row, ftOf: (i) => TX.ft[i] };
}

// block 0: 4-room (3 recent + 1 old), 5-room (2 recent), executive (1 old only)
const SALES = [
  [0, '4 ROOM', 118, 601400, 92, 2], [0, '4 ROOM', 117, 640000, 93, 3], [0, '4 ROOM', 110, 580000, 90, 1], [0, '4 ROOM', 20, 300000, 91, 0],
  [0, '5 ROOM', 119, 720000, 110, 4], [0, '5 ROOM', 105, 700000, 112, 3],
  [0, 'EXECUTIVE', 30, 500000, 140, 2],
];

test('quickTypes: only the types sold here, smallest first, with the sales the prefill uses', () => {
  const w = world(SALES, { ft: [I['4 ROOM'], I['5 ROOM']] });
  assert.deepEqual(quickTypes({ ...w.lists(0), ftOf: w.ftOf }), [
    { ft: I['4 ROOM'], n: 3, recent: true }, { ft: I['5 ROOM'], n: 2, recent: true }, { ft: I.EXECUTIVE, n: 1, recent: false }]);
});

test('Sev-1: quickRow = the direct add (handoff.add) for its type; any other type gets the same computation', () => {
  for (const sel of [[I['4 ROOM']], [I['5 ROOM']], [I['4 ROOM'], I['5 ROOM']], [I.EXECUTIVE]]) {
    const w = world(SALES, { ft: sel });
    const direct = w.ho.add(0).row;
    assert.deepEqual(w.row(0, direct.ft), direct, `selected ${sel}`);
  }
  const w = world(SALES, { ft: [I['4 ROOM']] });
  assert.deepEqual(w.row(0, I['4 ROOM']), { ft: I['4 ROOM'], storey: 2, sqm: 92, price: 601000 }, 'recent 4-room: medians, price to S$1,000');
  assert.deepEqual(w.row(0, I.EXECUTIVE), { ft: I.EXECUTIVE, storey: 2, sqm: 140, price: 500000 }, 'no recent sales → all years');
});

test('firstType: the direct add\'s type when sold here, else the first type', () => {
  const w = world(SALES, { ft: [] });
  const types = quickTypes({ ...w.lists(0), ftOf: w.ftOf });
  assert.equal(firstType(types, { ...w.lists(0), ftOf: w.ftOf, selected: [I['4 ROOM'], I['5 ROOM']] }), I['4 ROOM'], 'most sold of the selected');
  assert.equal(firstType(types, { ...w.lists(0), ftOf: w.ftOf, selected: [I['5 ROOM']] }), I['5 ROOM']);
  assert.equal(firstType(types, { ...w.lists(0), ftOf: w.ftOf, selected: [I['3 ROOM']] }), I['4 ROOM'], 'not sold here → the first type sold here');
});

test('quickChoice: without details = the direct add\'s object; details override storey / size / name / link / facing', () => {
  const row = { ft: 3, storey: 2, sqm: 92, price: 601000 };
  const direct = { id: 7, bid: 0, ...row, name: 'Blk 0', url: '', facing: '' };
  assert.deepEqual(quickChoice({ id: 7, bid: 0, label: 'Blk 0', row, price: 601000, details: { storey: '2', sqm: 92, name: '', url: '', facing: '' } }), direct);
  assert.deepEqual(quickChoice({ id: 7, bid: 0, label: 'Blk 0', row, price: 601000 }), direct);
  const c = quickChoice({ id: 8, bid: 0, label: 'Blk 0', row, price: 655000, details: { storey: '4', sqm: 95, name: ' Near school ', url: 'https://x', facing: 'NE' } });
  assert.deepEqual(c, { id: 8, bid: 0, ft: 3, storey: 4, sqm: 95, price: 655000, name: 'Near school', url: 'https://x', facing: 'NE' });
});

test('formHtml: chips with counts, price prefilled with separators and the "median here" hint; doneHtml: Compare only with 2+', () => {
  const types = [{ ft: 3, n: 3, recent: true }, { ft: 4, n: 1, recent: false }];
  const html = formHtml({ types, ft: 3, row: { ft: 3, storey: 2, sqm: 92, price: 601000 }, label: 'Blk 0', ftCode: (f) => FT[f], storeyOptions: '<option>1</option>', facingOptions: '<option value="">unknown</option>', phone: true });
  assert.equal((html.match(/class="chip qa-chip/g) || []).length, 2);
  assert.match(html, /aria-checked="true"[^>]*data-ft="3"><span>4-room<\/span><small>3 sales<\/small>/);
  assert.match(html, /<small>1 sale<\/small>/);
  assert.match(html, /value="601,000"/);
  assert.match(html, /Median 4-room here, last 2 years — change it to the asking price\./);
  assert.match(html, /More details \(optional\)/);
  assert.doesNotMatch(html, /qa-cancel/, 'phones close with the sheet\'s Back row');
  assert.match(formHtml({ types, ft: 4, row: { ft: 4, storey: 2, sqm: 140, price: 500000 }, label: 'Blk 0', ftCode: (f) => FT[f], storeyOptions: '', facingOptions: '', phone: false }), /Median 5-room here, all years/);
  assert.doesNotMatch(doneHtml({ name: 'Blk 0', ftName: '4-room', n: 1, phone: true }), /qa-compare/);
  assert.match(doneHtml({ name: 'Blk 0', ftName: '4-room', n: 1, phone: true }), /Add one more flat to compare\./);
  const two = doneHtml({ name: 'Blk 0', ftName: '4-room', n: 3, phone: true });
  assert.match(two, /Added Blk 0, 4-room · 3 flats in your choices\./);
  assert.equal((two.match(/Added Blk 0/g) || []).length, 1, 'said once (P8-06)');
  assert.match(two, /class="btn qa-undo">Undo</);
  assert.match(two, /qa-compare/);
  assert.match(two, /Or tap another block to add it\./);
});

test('中文: every quick add string has an entry with the same placeholders', () => {
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'))));
  const src = readFileSync(new URL('../../app/modules/explore/quickadd.js', import.meta.url), 'utf8');
  const used = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  for (const k of new Set([...used, ...quickAddStrings()])) {
    assert.match(zh[k] || '', /[一-鿿]/, `zh missing: ${k}`);
    assert.equal(ph(zh[k]), ph(k), `placeholders: ${k}`);
  }
});
