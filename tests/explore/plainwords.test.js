// Phase 7 B10 "Plain words in Simple": Simple-mode variants say the same numbers without MSR, P25–P75, n=, percentile,
// Master Plan zones, MOP or a bare "5/5"; Pro text is unchanged (default mode, and the compare fixtures dumped in Pro —
// npm run fixtures:check). Word list: app/core/plain.js; audit: hdb-data-pipeline/docs/specs/phase7a-plainwords.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, LEGACY_KEY } from '../../app/core/store.js';
import * as plain from '../../app/core/plain.js';
import * as textsize from '../../app/core/textsize.js';
import { createMoney, cells, cashParts, glanceFlags, ROW_KEYS, SIMPLE_CASH, SIMPLE_GLANCE, SIMPLE_MONEY_KEYS } from '../../app/modules/explore/money.js';
import { overpricedCell, overpricedCellSimple, SIMPLE_LABEL as COMPS_LABEL } from '../../app/modules/explore/comparables.js';
import { cellHtml as fvCell, rationale, headline, driverLabel, SIMPLE_LABELS, SIMPLE_RATIONALES, SIMPLE_BADGE, ROW_KEYS as FV_KEYS } from '../../app/modules/explore/futurevalue-ui.js';
import { cellHtml as lifeCell, SIMPLE_LABEL as LIFE_LABEL } from '../../app/modules/explore/cpflife.js';
import { pickRows, plainRow } from '../../app/modules/explore/brief.js';
import { chartLabels } from '../../app/modules/rent/chart.js';
import { rangeHtml } from '../../app/modules/plan/salerange.js';
import { policy } from '../helpers.js';

const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const mem = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; }, removeItem: (k) => { delete o[k]; } });
const seed = JSON.parse(readFileSync(new URL('../fixtures/compare-seed.json', import.meta.url), 'utf8')).state;
const seedStore = () => createStore({ storage: mem({ [LEGACY_KEY]: JSON.stringify({ profile: seed.profile, choices: seed.choices }) }) });
const strip = (h) => String(h).replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .split('\n').map((s) => s.trim()).filter(Boolean).join(' | ');
const JARGON = /\bMSR\b|\bTDSR\b|P25|P75|\bn=|percentile|Master Plan|\bMOP\b|\bCOV\b|\bBSD\b|\bCPF OA\b|\bRPI\b/;
const choice = (price, ft, o = {}) => ({ c: { id: 1, bid: 0, ft: FT.indexOf(ft), price, name: 'x' }, leaseNow: o.leaseNow ?? 80, cov: o.cov ?? 0 });

test('word list: percentile from the buyer side, ranges with a count, scores with a word, income share without "MSR"', () => {
  assert.equal(plain.percentileText(36), 'Cheaper than about 64% of similar sales');
  assert.equal(plain.percentileText(68.4), 'More expensive than about 68% of similar sales');
  assert.equal(plain.percentileText(0), 'Cheaper than almost all similar sales');
  assert.equal(plain.percentileText(100), 'More expensive than almost all similar sales');
  assert.equal(plain.percentileText(50), 'In the middle of similar sales');
  assert.equal(plain.middleHalfText('S$713k', 'S$781k', 35), 'Typical: S$713k–S$781k (middle half of 35 similar sales)');
  assert.equal(plain.tooFewText(3, 5), 'Too few similar sales to judge (3 found, 5 needed)');
  assert.deepEqual([1, 2, 3, 4, 5].map((s) => plain.scoreText(s)), ['1/5 — poor', '2/5 — below average', '3/5 — average', '4/5 — good', '5/5 — very good']);
  assert.equal(plain.scoreText(3, true), '3/5 — average (partial)');
  assert.equal(plain.incomeShareText('22%', '26%', '3%', '30%'), 'Uses 22% of your income; 26% when tested at 3% interest (limit 30%)');
  assert.equal(plain.grantName('ehg'), 'Enhanced CPF Housing Grant');
  assert.equal(plain.grantName('xyz'), 'XYZ');
  assert.equal(plain.reasonText('msr', 'over the Mortgage Servicing Ratio', 'pro'), 'over the Mortgage Servicing Ratio');
  assert.match(plain.reasonText('msr', 'over the Mortgage Servicing Ratio', 'simple'), /^The monthly payment would be over the limit/);
  assert.equal(plain.reasonText('cash-short', 'Short of S$1 for the upfront payment', 'simple'), 'Short of S$1 for the upfront payment');
  for (const m of [undefined, 'pro', 0, 1, null]) assert.equal(plain.isSimple(m), false, 'only "simple" switches the words');
});

test('money rows (seed household): Simple says the same numbers in plain words; Pro text unchanged', () => {
  const store = seedStore(), mon = createMoney({ policy, store, D: { flat_types: FT }, year: () => 2026 });
  const m = choice(600000, '4 ROOM', { cov: 20000 }), p = mon.planFor(m);
  const R = Object.fromEntries(mon.rows().map((r) => [r.k, r]));
  for (const key of Object.values(ROW_KEYS)) {
    assert.equal(R[key].f(m), cells[Object.keys(ROW_KEYS).find((x) => ROW_KEYS[x] === key)](p), `${key}: f = Pro cell`);
    assert.equal(typeof R[key].fs, 'function', `${key}: has a Simple cell`);
    const nums = (h) => (strip(h).match(/S\$[\d,]+/g) || []);
    assert.deepEqual(nums(R[key].fs(m)), nums(R[key].f(m)), `${key}: same money amounts in Simple`);
    if (SIMPLE_MONEY_KEYS.includes(key)) assert.doesNotMatch(strip(R[key].fs(m)), JARGON, `${key}: no jargon in Simple`); // loan / upfront rows are Pro-only
  }
  // key rows, Simple text (characterisation; policy as of 6 Oct 2026, the seed household)
  assert.equal(strip(R[ROW_KEYS.monthly].f(m)), 'S$2,042 | 23% of income · MSR test 24% at 3% (cap 30%)');
  assert.equal(strip(R[ROW_KEYS.monthly].fs(m)), 'S$2,042 | Uses 23% of your income; 24% when tested at 3% interest (limit 30%)');
  assert.match(strip(R[ROW_KEYS.cash].f(m)), /COV S\$20,000/);
  assert.match(strip(R[ROW_KEYS.cash].fs(m)), /cash over valuation S\$20,000/);
  // At a glance
  const pro = glanceFlags(p, policy).map((f) => f[2]), simple = glanceFlags(p, policy, 'simple').map((f) => f[2]);
  assert.deepEqual(mon.glance(m), glanceFlags(p, policy), 'glance default = Pro');
  assert.equal(pro.length, simple.length);
  assert.ok(simple.every((s) => !JARGON.test(s)), simple.join(' / '));
  assert.ok(pro.some((s) => /instalment/.test(s)));
  assert.ok(simple.some((s) => /^monthly payment \d+% of your income/.test(s)), simple.join(' / '));
});

test('cash parts: Simple names the items (no COV / BSD / ABSD / CPF OA); the amounts are the same', () => {
  const f = { items: [{ id: 'down-cash', amount: 5000 }, { id: 'cov', amount: 20000 }, { id: 'bsd', amount: 9600, cpf: true }, { id: 'absd', amount: 30000 }], cashNeeded: 60000 };
  assert.deepEqual(cashParts(f, 'hdb'), ['option fee S$5,000', 'COV S$20,000', 'ABSD S$30,000', 'S$5,000 not covered by CPF OA + grants']);
  assert.deepEqual(cashParts(f, 'hdb', 'simple'), ['option fee S$5,000', 'cash over valuation S$20,000', 'additional stamp duty S$30,000', 'S$5,000 not covered by your CPF and grants']);
  assert.ok(Object.values(SIMPLE_GLANCE).every((s) => !JARGON.test(s)));
  assert.ok(Object.values(SIMPLE_CASH).every((s) => !JARGON.test(s)));
});

test('comparables row: Simple = "Cheaper than about 64% · Typical: S$713k–S$781k (middle half of 35 similar sales)"', () => {
  const fv = { n: 35, enough: true, percentile: 36, verdict: 'Within the usual range', price: { p25: 713000, p75: 781000 } };
  assert.equal(strip(overpricedCell(fv)), '36th percentile | Within the usual range · P25–P75 S$713k–S$781k · n=35');
  assert.equal(strip(overpricedCellSimple(fv)), 'Cheaper than about 64% of similar sales | Within the usual range · Typical: S$713k–S$781k (middle half of 35 similar sales)');
  assert.equal(strip(overpricedCellSimple(fv, { scope: 'nearby blocks, similar lease' })).endsWith('· nearby blocks, similar lease'), true);
  const thin = { n: 3, enough: false, verdict: 'not enough sales', price: {} };
  assert.equal(strip(overpricedCellSimple(thin)), 'not enough sales | Too few similar sales to judge (3 found, 5 needed)');
  assert.match(overpricedCellSimple(fv, { id: 7 }), /data-comps="7"/, 'the "Show comparables" button stays');
  assert.equal(COMPS_LABEL, 'Compared with similar sales');
});

test('future-value cells: Simple adds a word to the score and drops "MOP" / "Master Plan" / "points"; Pro unchanged', () => {
  const supply = { id: 'supply', metric: 1200, score: 2, rationale: { id: 'fv.supply', args: [1200, 1, 300, 900, 5, 2029, 8000] } };
  const pro = fvCell(supply), simple = fvCell(supply, { mode: 'simple' });
  assert.equal(fvCell(supply, { mode: 'pro' }), pro);
  assert.match(strip(pro), /^2\/5 · ~1,200 flats within 1 km \| About 1,200 units .*MOP ends by 2029/);
  assert.equal(strip(simple), '2/5 — below average · ~1,200 flats within 1 km | About 1,200 flats within 1 km may come up for sale soon: 300 in new flats being built and 900 in blocks whose 5-year minimum stay ends by 2029 (8,000 flats nearby now).');
  const cat = { id: 'catalysts', metric: 6, score: 5, rationale: { id: 'fv.catalysts', args: [1, 1, 2, 3, 2025, 800] } };
  assert.match(strip(fvCell(cat)), /^5\/5 · 6 points \| .*Master Plan/);
  assert.equal(strip(fvCell(cat, { mode: 'simple' })), '5/5 — very good | Within reach: 1 future MRT station(s) (≤ 1 km), 2 major project(s) and 3 planned amenity area(s) within 800 m.');
  assert.equal(headline(cat), '6 points');
  assert.equal(headline({ id: 'momentum', metric: 4.2 }, undefined, 'simple'), '+4.2 percentage points vs all HDB resale over 3 y');
  assert.equal(rationale(supply.rationale, 0), rationale(supply.rationale), 'a stray index (Array.map) keeps Pro');
  for (const id of Object.keys(SIMPLE_RATIONALES)) assert.doesNotMatch(SIMPLE_RATIONALES[id], JARGON, id);
  assert.doesNotMatch(SIMPLE_BADGE, JARGON);
  for (const id of Object.keys(FV_KEYS)) { assert.equal(driverLabel(id), FV_KEYS[id]); assert.equal(driverLabel(id, 'simple'), SIMPLE_LABELS[id]); assert.doesNotMatch(SIMPLE_LABELS[id], /MOP|zoning|RPI/); }
});

test('CPF LIFE row: Simple "about S$310 less a month than if you don\'t buy"; Pro unchanged', () => {
  const ok = { ok: true, delta: -310, without: { monthly: 1450 }, withBuy: { monthly: 1140 } };
  assert.equal(strip(lifeCell(ok)), '≈ −S$310/mo vs not buying | S$1,450 → S$1,140/mo (estimate)');
  assert.equal(strip(lifeCell(ok, 'simple')), "about S$310 less a month than if you don't buy | S$1,450 a month without this flat, S$1,140 with it (estimate)");
  assert.equal(strip(lifeCell({ ...ok, delta: 20, withBuy: { monthly: 1470 } }, 'simple')).split(' | ')[0], "about S$20 more a month than if you don't buy");
  assert.equal(LIFE_LABEL, 'Monthly CPF payout from {0} (est.)');
});

test('pickRows: Simple swaps in fs / slbl (same key, v, tip); words "pro" keeps Pro text; Pro mode returns the rows as they are', () => {
  const rows = [{ sec: 'S' }, { k: 'A', f: () => 'pro A', fs: () => 'plain A', slbl: 'Plain A', v: () => 1, tip: 'tip' }, { k: 'B', f: () => 'pro B' }, { k: 'C', f: () => 'pro C', simple: true }];
  const keys = new Set(['A', 'B']);
  assert.equal(pickRows(rows, keys, 'pro'), rows);
  const s = pickRows(rows, keys, 'simple');
  assert.deepEqual(s.map((r) => r.sec || r.k), ['S', 'A', 'B', 'C']);
  assert.equal(s[1].f(), 'plain A'); assert.equal(s[1].lbl, 'Plain A'); assert.equal(s[1].k, 'A'); assert.equal(s[1].v(), 1); assert.equal(s[1].tip, 'tip');
  assert.equal(s[2], rows[2], 'rows without a Simple variant are passed through');
  const pw = pickRows(rows, keys, 'simple', 'pro');
  assert.equal(pw[1], rows[1], 'a Pro user\'s shortened brief keeps Pro words');
  assert.equal(plainRow(rows[2]), rows[2]);
});

test('Rent chart and Plan range: no "MOP" / "n=" in Simple; Pro unchanged', () => {
  const pro = chartLabels(), simple = chartLabels('simple');
  assert.equal(pro.mopBand, "Before MOP: can't sell"); assert.equal(pro.mopTick(5), 'MOP · yr 5');
  assert.equal(simple.mopBand, "Minimum stay: can't sell"); assert.equal(simple.mopTick(5), 'Can sell · yr 5');
  const r = { enough: true, low: 700000, high: 760000, n: 12, mid: 730000, sqm: 93, tier: 'block', months: 24 };
  const a = rangeHtml(r, true), b = rangeHtml(r, true, 'simple');
  assert.match(a, /middle half, n=12/);
  assert.match(b, /middle half of 12 sales/); assert.doesNotMatch(b, /\bn=\d/);
});

test('中文: every Simple-mode and text-size string has an entry with the same placeholders; dictionaries valid, no duplicate keys', () => {
  const read = (f) => readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8');
  const files = ['zh-guide.json', 'zh.json', 'zh-explore.json', 'zh-engine.json'];
  const dict = Object.assign({}, ...files.map((f) => JSON.parse(read(f))));
  for (const f of files) {
    const ks = [...read(f).matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)].map((x) => x[1]);
    assert.equal(ks.length, new Set(ks).size, `${f}: duplicate keys`);
  }
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const keys = [
    ...plain.uiStrings(), ...textsize.uiStrings(), ...Object.values(SIMPLE_CASH), ...Object.values(SIMPLE_GLANCE), COMPS_LABEL, LIFE_LABEL,
    ...Object.values(SIMPLE_LABELS), ...new Set(Object.values(SIMPLE_RATIONALES)), SIMPLE_BADGE, '{0} percentage points vs all HDB resale over {1} y',
    "about {0} less a month than if you don't buy", "about {0} more a month than if you don't buy", '{0} a month without this flat, {1} with it (estimate)',
    // legacy.js, card.js, afford, rent, plan (strings without an exported constant)
    '{0} per sq ft', 'Price vs recent sales', 'similar flats sold for about {0}', 'in 10 years only buyers aged {0}+ can use their CPF in full — fewer buyers when you sell',
    'No resale yet — first resales from ~{0} (after the 5-year minimum stay)', 'From CPF + grants',
    'Option fees and any cash over valuation must be paid in cash; your CPF can pay the rest of the downpayment, stamp duty and legal fees.',
    'Your rate is already at or above the highest recent bank rate.', 'HDB loan rates follow the CPF interest rate, not bank rates; this shows the same loan at floating bank rates.',
    'Includes the sale of {0}: {1} cash and {2} back to your CPF.', 'middle half of {0} rentals: {1}–{2}', '{0} rentals',
    'Monthly owner costs (property tax, town council fees, utilities, insurance)', "Minimum stay: can't sell", 'Can sell · yr {0}',
    'Similar recent sales: {0}–{1} (middle half of {2} sales)', 'CPF back to your CPF account',
    'Additional stamp duty (ABSD) of {0} is refundable only if you sell the first home within {1} months of buying ({2}).',
    "This flat uses about {0} of this buyer's CPF Ordinary Account upfront; that does not change a CPF LIFE payout that has started.",
    "This flat uses about {0} of this buyer's CPF Ordinary Account upfront and {1} a month for {2} years.",
    'The CPF Ordinary Account runs short by {0} in total — that part is paid in cash.', 'Retirement Account at 55 if you buy this flat',
    // 7b B6: the three seniors-table top-up strings went with the table (retirement option cards)
  ];
  for (const k of keys) { assert.ok(dict[k], `missing 中文: ${k}`); assert.equal(ph(dict[k]), ph(k), k); }
  // the strings are really used where the list says (a renamed string must not leave a stale key)
  const src = ['modules/explore/legacy.js', 'modules/explore/card.js', 'modules/afford/index.js', 'modules/afford/monthly.js', 'modules/afford/verdict.js',
    'modules/rent/index.js', 'modules/rent/chart.js', 'modules/plan/salerange.js', 'modules/plan/sellbuy.js', 'modules/plan/cpf.js', 'modules/plan/seniors.js',
    'modules/explore/cpflife.js', 'modules/explore/futurevalue-ui.js'].map((p) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8')).join('\n');
  for (const k of keys.slice(keys.indexOf("about {0} less a month than if you don't buy"))) assert.ok(src.includes(k), `not used: ${k}`);
});
