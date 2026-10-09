// Phase 8 M-16 essentials first (app/modules/plan/morefold.js, sellbuy.js, btoinputs.js): the fields a first answer
// needs come first, the answer right under them, the rest in "Make it more accurate (N)" — same fields (each store path
// exactly once), same numbers (Sev-1: the KPIs below are the ones tests/plan/accrued.test.js and bto.test.js pin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sellBuySection, sellFields, moreSummary } from '../../app/modules/plan/sellbuy.js';
import { btoSection } from '../../app/modules/plan/bto.js';
import { btoFieldSplit, waitChoice } from '../../app/modules/plan/btoinputs.js';
import { moreFold, countFields, moreFoldStrings } from '../../app/modules/plan/morefold.js';
import { FEATURES } from '../../app/core/features.js';
import { defaults } from '../../app/core/store.js';
import { policy } from '../helpers.js';

const TODAY = '2026-10-07';
const planCtx = (cur, extra = {}) => ({
  h: { scheme: 'family', firstTimer: false, propertiesOwned: 1, cash: 60000, loan: 'hdb', tenure: 20, buyers: [{ age: 44, income: 7000, cpfOa: 30000, citizenship: 'SC' }] },
  tf: { source: 'price', label: 'My pick', price: 800000, flatType: '5 ROOM', remainingLease: 80 },
  plan: { current: { owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 580000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: null, ...cur }, dates: {} },
  policy, today: TODAY, ...extra,
});
const at = (html, re) => { const m = re.exec(html); assert.ok(m, `missing ${re}`); return m.index; };
const once = (html, p) => assert.equal(html.split(`data-p="${p}"`).length - 1, 1, `${p} once`);

test('morefold: title with the count, the sub line, closed by default, nothing when empty', () => {
  const html = moreFold({ key: 'k', items: ['<label>a</label>', '', '<label>b</label>'], sub: 'Using x' });
  assert.match(html, /<details class="fold p8-more" data-fold="k"><summary><span class="fold-t">Make it more accurate \(2\)<\/span><span class="fold-s">Using x<\/span>/);
  assert.match(moreFold({ key: 'k', items: ['x'], fold: () => ' open' }), /data-fold="k" open>/);
  assert.equal(moreFold({ key: 'k', items: ['', ' '] }), '');
  assert.equal(countFields(['a', '', null, 'b']), 2);
});

test('Sell then buy (HDB): 4 essentials → the answer → "Make it more accurate (6)" → "Order and timeline"', () => {
  const html = withData(() => sellBuySection(planCtx({}))); // with data.js: the floor area field is there
  const fold = at(html, /Make it more accurate \(6\)/);
  for (const p of ['plan.current.propertyType', 'plan.current.flatType', 'plan.current.salePrice']) assert.ok(at(html, new RegExp(`data-p="${p.replace(/\./g, '\\.')}"`)) < at(html, /class="verdict"/), `${p} before the answer`);
  assert.ok(at(html, /class="kpis"/) < fold, 'the answer is above the fold');
  for (const p of ['plan.current.sqm', 'plan.current.outstandingLoan', 'plan.current.cpfUsed', 'plan.current.accruedInterest', 'plan.current.boughtYear', 'plan.current.subsidised']) {
    assert.ok(at(html, new RegExp(`data-p="${p.replace(/\./g, '\\.')}"`)) > fold, `${p} in the fold`);
  }
  for (const p of ['plan.current.propertyType', 'plan.current.flatType', 'plan.current.salePrice', 'plan.current.sqm', 'plan.current.outstandingLoan', 'plan.current.cpfUsed', 'plan.current.accruedInterest', 'plan.current.boughtYear', 'plan.current.subsidised', 'plan.current.mode']) once(html, p);
  assert.ok(at(html, /Order and timeline/) > fold);
  assert.ok(at(html, /data-p="plan\.current\.mode"/) > at(html, /Order and timeline/), 'Order sits with the timeline');
  assert.ok(at(html, /id="planMoveTimeline"/) > at(html, /Order and timeline/));
  // Sev-1: the same figures as before (tests/plan/accrued.test.js pins the CPF ones)
  assert.match(html, /<b>S\$295,400 <span class="tag warn">uncertain<\/span><\/b>/);
  assert.match(html, /S\$150,000/);
});

test('Sell then buy: private home → years held is an essential (SSD); the fold has 4', () => {
  const { first, more } = sellFields({ propertyType: 'private' }, 2026);
  assert.match(first, /data-p="plan\.current\.yearsHeld"/);
  assert.doesNotMatch(first, /plan\.current\.flatType|sbBlock/);
  assert.equal(countFields(more), 4);
  assert.match(sellBuySection(planCtx({ propertyType: 'private', yearsHeld: 2 })), /Make it more accurate \(4\)/);
});

test('Sell then buy: before an answer the fields are the same, the fold is there', () => {
  const noPrice = withData(() => sellBuySection(planCtx({ salePrice: null })));
  assert.ok(at(noPrice, /Enter the expected sale price\./) < at(noPrice, /Make it more accurate \(6\)/));
  const noFlat = sellBuySection({ ...planCtx({}), tf: null });
  assert.ok(at(noFlat, /Pick the next flat on the map/) < at(noFlat, /Make it more accurate/));
  assert.doesNotMatch(sellBuySection(planCtx({ owns: false })), /Make it more accurate/);
});

test('moreSummary: says what blank fields count as', () => {
  assert.equal(moreSummary({}), 'Until you fill them in: no loan left · no CPF used');
  assert.equal(moreSummary({ outstandingLoan: 1, cpfUsed: 1 }), 'Until you fill them in: CPF interest not counted');
  assert.equal(moreSummary({ outstandingLoan: 1, cpfUsed: 1, boughtYear: 2012 }), 'Until you fill them in: CPF interest estimated');
  assert.equal(moreSummary({ outstandingLoan: 0, cpfUsed: 1, accruedInterest: 5 }), 'Filled in');
});

// the same tiny map as tests/plan/bto.test.js (hoisted: Sell then buy uses it too)
function withData(fn) {
  const was = { d: globalThis.HDB_DATA, r: globalThis.HDB_RENTS, b: globalThis.HDB_BTO, f: FEATURES.btoData };
  globalThis.HDB_DATA = { blocks: [{ lat: 1.30, lon: 103.80, t: 0 }], towns: ['TOWN'], flat_types: ['2 ROOM', '4 ROOM'], months: ['2026-08', '2026-09'],
    tx: { p: [600000, 640000, 300000, 320000], m: [0, 1, 0, 1], ft: [1, 1, 0, 0], b: [0, 0, 0, 0] } };
  globalThis.HDB_RENTS = { blocks: {}, towns: { TOWN: { '4 ROOM': { q: [2500] }, '2 ROOM': { q: [1800] } } }, quarters: ['2026Q3'], months: ['2025-10', '2026-09'] };
  globalThis.HDB_BTO = { projects: [{ n: 'Alpha Grove', lat: 1.301, lon: 103.801, top: 'Jun 2029', pmin: 200000, pmax: 700000 }] };
  try { return fn(); } finally { globalThis.HDB_DATA = was.d; globalThis.HDB_RENTS = was.r; globalThis.HDB_BTO = was.b; FEATURES.btoData = was.f; }
}
const COUPLE = { ...defaults().household, buyers: [{ age: 30, income: 5000, citizenship: 'SC' }, { age: 29, income: 4000, citizenship: 'SC' }] };
const bto = (on, p) => withData(() => { FEATURES.btoData = on; return btoSection({ h: COUPLE, f: { bid: 0, flatType: '4 ROOM' }, plan: { ...defaults().plan, ...p }, policy, today: TODAY }); });

test('BTO (project list): project, type, price first → verdict + KPIs → fold with the wait and your rent (2)', () => {
  const html = bto(true, { btoId: 'Alpha Grove', btoFt: '4 ROOM', btoPrices: { 'Alpha Grove|4 ROOM': 450000 } });
  const fold = at(html, /Make it more accurate \(2\)/);
  assert.ok(at(html, /data-bto-key=/) < at(html, /class="verdict"/));
  assert.ok(at(html, /class="kpis"/) < fold);
  assert.ok(at(html, /data-p="plan\.btoWait"/) > fold && at(html, /data-p="plan\.rentNow"/) > fold);
  assert.match(html, /Using keys expected Jun 2029 · S\$2,500\/month nearby median/);
  assert.match(html, /BTO route costs about S\$90,000 less/, 'unchanged: 620,000 − (450,000 + 80,000)');
  for (const p of ['plan.btoId', 'plan.btoFt', 'plan.btoWait', 'plan.rentNow']) once(html, p);
});

test('BTO (typed, btoData off): the wait is an essential (no answer without it); rent folds (1)', () => {
  const html = bto(false, { btoFt: '4 ROOM', btoPrices: { 'typed|4 ROOM': 450000 } });
  const fold = at(html, /Make it more accurate \(1\)/);
  assert.ok(at(html, /data-p="plan\.btoWait"/) < fold);
  assert.ok(at(html, /data-act="bto-wait-ok"/) < fold, '"Use this wait" stays in view');
  assert.ok(at(html, /data-p="plan\.rentNow"/) > fold);
});

test('btoFieldSplit: no nearby median → "Your rent now" is an essential', () => {
  const p = defaults().plan, w = waitChoice({ p, projectKey: '2029-06', today: TODAY });
  const s = btoFieldSplit({ p, w, median: null, ft: '4 ROOM', projectTop: 'Jun 2029' });
  assert.match(s.first, /plan\.rentNow/);
  assert.equal(countFields(s.more), 1);
  assert.equal(s.sub, 'Using keys expected Jun 2029');
});

test('中文: the M-16 strings have entries', () => {
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'))));
  const keys = [...moreFoldStrings(), 'no loan left', 'no CPF used', 'CPF interest not counted', 'CPF interest estimated', 'Until you fill them in: {0}', 'Filled in',
    'Order and timeline', 'Suggested: {0}', 'keys expected {0}', 'Using {0}'];
  for (const k of keys) assert.match(zh[k] || '', /[一-鿿]/, `zh missing: ${k}`);
});
