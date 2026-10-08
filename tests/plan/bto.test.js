// Phase 7 A7: BTO vs resale — honest inputs, no false verdict (P5-1…5). Both builds: project list (btoData on) and
// the typed price / date path (btoData off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURES } from '../../app/core/features.js';
import { defaults } from '../../app/core/store.js';
import { btoSection } from '../../app/modules/plan/bto.js';
import { FUTURE_WAIT_GUESS_YEARS, priceKey, typedPrice, waitChoice, flatTypeChoice, rentNowOf } from '../../app/modules/plan/btoinputs.js';
import { policy } from '../helpers.js';

const TODAY = '2026-10-07';
const withFeature = (on, fn) => { const was = FEATURES.btoData; FEATURES.btoData = on; try { return fn(); } finally { FEATURES.btoData = was; } };
const hh = (o) => ({ ...defaults().household, ...o });
const COUPLE = hh({ buyers: [{ age: 30, income: 5000, citizenship: 'SC' }, { age: 29, income: 4000, citizenship: 'SC' }] });
const SINGLE = hh({ scheme: 'single', buyers: [{ age: 36, income: 4000, citizenship: 'SC' }] });
const SINGLE_PR = hh({ scheme: 'single', buyers: [{ age: 36, income: 4000, citizenship: 'PR', prYears3Plus: true, nationality: 'other' }] });
const plan = (o) => ({ ...defaults().plan, ...o });
const selected = (html, p) => (new RegExp(`data-p="${p}"[^>]*>([\\s\\S]*?)</select>`).exec(html) || [])[1] || '';

// a small map: one HDB block with 4-room and 2-room resale sales and a town rent series, plus two BTO projects
function withData(fn) {
  const was = { d: globalThis.HDB_DATA, r: globalThis.HDB_RENTS, b: globalThis.HDB_BTO };
  globalThis.HDB_DATA = {
    blocks: [{ lat: 1.30, lon: 103.80, t: 0 }], towns: ['TOWN'], flat_types: ['2 ROOM', '4 ROOM'], months: ['2026-08', '2026-09'],
    tx: { p: [600000, 640000, 300000, 320000], m: [0, 1, 0, 1], ft: [1, 1, 0, 0], b: [0, 0, 0, 0] },
  };
  globalThis.HDB_RENTS = { blocks: {}, towns: { TOWN: { '4 ROOM': { q: [2500] }, '2 ROOM': { q: [1800] } } }, quarters: ['2026Q3'], months: ['2025-10', '2026-09'] };
  globalThis.HDB_BTO = { projects: [
    { n: 'Alpha Grove', lat: 1.301, lon: 103.801, top: 'Jun 2029', pmin: 200000, pmax: 700000 },
    { n: 'Beta Vista', lat: 1.302, lon: 103.802, top: 'To be announced', pmin: 210000, pmax: 720000 },
  ] };
  try { return fn(); } finally { globalThis.HDB_DATA = was.d; globalThis.HDB_RENTS = was.r; globalThis.HDB_BTO = was.b; }
}
const F = { bid: 0, flatType: '4 ROOM' };
const on = (h, p, f = F) => withData(() => withFeature(true, () => btoSection({ h, f, plan: p, policy, today: TODAY })));
const off = (h, p, f = F) => withData(() => withFeature(false, () => btoSection({ h, f, plan: p, policy, today: TODAY })));

test('single fixture can\'t pick 4-room: only 2-room Flexi is enabled, with the reason and the rule id', () => {
  for (const render of [on, off]) {
    const html = render(SINGLE, plan({ btoFt: '4 ROOM' }));
    const sel = selected(html, 'plan\\.btoFt');
    assert.match(sel, /<option value="2 ROOM" selected>2-room Flexi<\/option>/);
    for (const ft of ['3 ROOM', '4 ROOM', '5 ROOM']) assert.match(sel, new RegExp(`<option value="${ft}" disabled>`), ft);
    assert.match(html, /Singles can buy a new 2-room Flexi flat only\./);
    assert.match(html, /elig\.rule\.single/);
    assert.match(html, /4 ROOM is not open to your household for a new flat — showing 2-room Flexi\./);
    assert.match(html, /data-bto-key="[^"]*\|2 ROOM"/, 'the price is asked for 2-room');
  }
  // a family keeps every type, no strip
  const fam = on(COUPLE, plan({ btoFt: '4 ROOM' }));
  assert.doesNotMatch(selected(fam, 'plan\\.btoFt'), /disabled/);
  assert.doesNotMatch(fam, /Flat types for you/);
  assert.equal(flatTypeChoice(SINGLE, policy, { wanted: '4 ROOM' }).ft, '2 ROOM');
});

test('single PR: no new flat at all → strip with the reason, never a verdict', () => {
  const html = off(SINGLE_PR, plan({ btoPrices: { 'typed|4 ROOM': 300000 }, btoKeys: '2029-06', rentNow: 1200 }));
  assert.match(html, /Your household can&#39;t buy a new HDB flat now|Your household can't buy a new HDB flat now/);
  assert.match(html, /Only Singapore Citizen singles can buy HDB flats\./);
  assert.doesNotMatch(html, /costs about/);
});

test('blank wait → no verdict: a future launch is prefilled with the guess, labelled, and asks to be confirmed', () => {
  // btoData off, no key month typed: the wait is unknown
  const p = plan({ btoPrices: { 'typed|4 ROOM': 450000 }, btoFt: '4 ROOM', rentNow: 1500 });
  const html = off(COUPLE, p);
  assert.match(html, /How long do you expect to wait\?/);
  assert.match(html, /<option value="future" selected>/);
  assert.match(html, new RegExp(`data-p="plan\\.btoWaitYears" data-k="num" min="0" step="0\\.5" value="${FUTURE_WAIT_GUESS_YEARS}"`));
  assert.match(html, /Your guess — HDB shows the wait per project\./);
  assert.match(html, /data-act="bto-wait-ok"/);
  assert.doesNotMatch(html, /costs about/, 'no verdict until the wait is confirmed');
  assert.match(html, /Confirm or change the wait \(your guess\) to see a comparison\./);
  assert.match(html, /<small>Wait for the keys<\/small><b>—<\/b>/);
  // confirmed: 4 years × S$1,500 rent → 450,000 + 72,000 vs the S$620,000 resale median
  const ok = off(COUPLE, { ...p, btoWaitYears: FUTURE_WAIT_GUESS_YEARS });
  assert.match(ok, /<b>48 months<\/b><small>your guess<\/small>/);
  assert.match(ok, /<b>S\$72,000<\/b>/);
  assert.match(ok, /BTO route costs about S\$98,000 less/);
  assert.doesNotMatch(ok, /data-act="bto-wait-ok"/);
  // project with no announced completion (btoData on): same — no verdict on a typed price until the wait is set
  const tba = on(COUPLE, plan({ btoId: 'Beta Vista', btoFt: '4 ROOM', btoPrices: { 'Beta Vista|4 ROOM': 450000 }, rentNow: 1500 }));
  assert.match(tba, /expected completion: not announced/);
  assert.doesNotMatch(tba, /costs about/);
  assert.match(tba, /Confirm or change the wait/);
});

test('rent override used: "Your rent now" replaces the nearby median for the rent while waiting', () => {
  const p = plan({ btoId: 'Alpha Grove', btoFt: '4 ROOM', btoPrices: { 'Alpha Grove|4 ROOM': 450000 } });
  const median = on(COUPLE, p); // 32 months to Jun 2029 × S$2,500 town median
  assert.match(median, /<b>S\$80,000<\/b><small>S\$2,500\/month nearby median<\/small>/);
  assert.match(median, /placeholder="2,500"/); // money fields show separators (core/moneyinput.js, Q10)
  const mine = on(COUPLE, { ...p, rentNow: 1200 });
  assert.match(mine, /<b>S\$38,400<\/b><small>your rent now: S\$1,200\/month<\/small>/);
  assert.match(mine, /BTO route costs about S\$131,600 less/, '620,000 − (450,000 + 38,400)');
  assert.equal(rentNowOf({ rentNow: 0 }, 2500), 0, 'typed 0 = no rent');
  assert.equal(rentNowOf({ rentNow: null }, 2500), 2500);
});

test('typed price kept per project + flat type; the all-types launch midpoint is never a KPI', () => {
  const p = plan({ btoId: 'Alpha Grove', btoFt: '4 ROOM', btoPrices: { 'Alpha Grove|4 ROOM': 500000 }, rentNow: 1000 });
  assert.match(on(COUPLE, p), /value="500,000" data-bto-key="Alpha Grove\|4 ROOM"/);
  // other project or other flat type: no price, no BTO total, no verdict — and no S$450,000 midpoint anywhere
  for (const q of [{ ...p, btoId: 'Beta Vista' }, { ...p, btoFt: '2 ROOM' }]) {
    const html = on(COUPLE, q);
    assert.match(html, /value="" data-bto-key="[^"]+"/);
    assert.match(html, /<small>BTO: price \+ rent<\/small><b>—<\/b>/);
    assert.doesNotMatch(html, /S\$450,000|S\$465,000/, 'no launch-range midpoint');
    assert.doesNotMatch(html, /costs about/);
  }
  assert.equal(priceKey(null, '4 ROOM'), 'typed|4 ROOM');
  assert.equal(typedPrice({ btoPrices: { 'A|4 ROOM': 1 } }, 'A|4 ROOM'), 1);
  assert.equal(typedPrice({ btoPrices: { 'A|4 ROOM': null }, btoPrice: 9 }, 'A|4 ROOM'), null, 'a cleared price stays cleared');
  assert.equal(typedPrice({ btoPrices: {}, btoPrice: 9 }, 'B|3 ROOM'), 9, 'older saves: the single price until it is filed');
});

test('btoData off works: typed price + typed month → wait, rent and verdict; past month → notice, no verdict', () => {
  const p = plan({ btoPrices: { 'typed|4 ROOM': 450000 }, btoFt: '4 ROOM', btoKeys: '2029-06', rentNow: 1200 });
  const html = off(COUPLE, p);
  assert.doesNotMatch(html, /data-p="plan\.btoId"/);
  assert.match(html, /<option value="month" selected>/);
  assert.match(html, /<b>32 months<\/b><small>from today<\/small>/);
  assert.match(html, /BTO route costs about S\$131,600 less/);
  const past = off(COUPLE, { ...p, btoKeys: '2025-01' });
  assert.match(past, /That key collection month has passed/);
  assert.doesNotMatch(past, /costs about/);
  // "I know the month" with no month typed → asks for it
  assert.match(off(COUPLE, { ...p, btoKeys: null, btoWait: 'month' }), /Enter the expected key collection month to see a comparison\./);
});

test('waitChoice: modes, defaults and confirmation', () => {
  const base = defaults().plan;
  assert.deepEqual(waitChoice({ p: base, typed: true, today: TODAY }), { mode: 'future', modes: ['month', 'future'], keyDate: null, waitMonths: null, confirmed: false, done: false });
  assert.equal(waitChoice({ p: { ...base, btoWaitYears: 3.5 }, typed: true, today: TODAY }).waitMonths, 42);
  assert.equal(waitChoice({ p: base, projectKey: '2029-06', today: TODAY }).mode, 'project');
  assert.equal(waitChoice({ p: base, projectKey: '2025-01', today: TODAY }).mode, 'future', 'a past project date is not a wait');
  const chosen = waitChoice({ p: { ...base, btoWait: 'project' }, projectKey: '2025-01', today: TODAY });
  assert.equal(chosen.done, true);
  assert.equal(waitChoice({ p: { ...base, btoWait: 'project' }, projectKey: null, today: TODAY }).mode, 'future', 'unknown project date → future only');
});

test('中文: every string in plan/btoinputs.js has an entry', () => {
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'))));
  const src = readFileSync(new URL('../../app/modules/plan/btoinputs.js', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g), ...src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.match(zh[k] || '', /[一-鿿]/, `zh missing: ${k}`);
  assert.match(zh['How long do you expect to wait?'], /您/);
});
