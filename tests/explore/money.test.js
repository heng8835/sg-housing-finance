// Phase 7a A1 "one numbers engine": every money cell of the compare table (and the At-a-glance money lines) equals
// what Afford shows for the same flat — both come from one planPurchase() call (app/modules/explore/money.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { planPurchase } from '../../app/engine/plan.js';
import { saleInput } from '../../app/engine/salefunds.js';
import { createStore, LEGACY_KEY } from '../../app/core/store.js';
import { money } from '../../app/core/dom.js';
import { cashShortLine } from '../../app/modules/afford/verdict.js';
import { createMoney, ROW_KEYS, SECTION, VERDICT, REASON_ORDER, flatInput, cashParts, CACHE_MAX } from '../../app/modules/explore/money.js';
import { policy } from '../helpers.js';

const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const D = { flat_types: FT };
const mem = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; }, removeItem: (k) => { delete o[k]; } });
const seed = JSON.parse(readFileSync(new URL('../fixtures/compare-seed.json', import.meta.url), 'utf8')).state;
const seedStore = () => createStore({ storage: mem({ [LEGACY_KEY]: JSON.stringify({ profile: seed.profile, choices: seed.choices }) }) });
const fakeStore = (state) => ({ get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state), subscribe: () => () => {} });
const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
const head = (cell) => { const x = strip(cell).match(/S\$([\d,]+)/); return x ? +x[1].replace(/,/g, '') : null; };
const ftIdx = (ft) => FT.indexOf(ft);
const choice = (price, ft, o = {}) => ({ c: { id: 1, bid: 0, ft: ftIdx(ft), price, name: 'x', ...o.c }, leaseNow: o.leaseNow ?? 80, cov: o.cov ?? 0 });

/** What the Afford tab computes for a flat opened from My choices → Afford (legacy focus: price, type, lease, cov). */
function affordPlan(store, m, year = 2026) {
  const focus = { price: m.c.price, flatType: FT[m.c.ft], remainingLease: m.leaseNow, cov: m.cov || 0 }; // legacy.js data-a="afford"
  const tf = focus; // core/typical effectiveFlat: a focus with a price is used as is
  const sale = saleInput(store.get('plan'), year);
  return planPurchase({ household: store.get('household'), flat: { price: tf.price, flatType: tf.flatType || '4 ROOM', remainingLease: tf.remainingLease ?? null, cov: tf.cov || 0 }, sale }, policy);
}
const rowsBy = (mon) => Object.fromEntries(mon.rows().map((r) => [r.k, r]));

function assertSame(store, m, mon) {
  const p = affordPlan(store, m), c = p.chosen, f = c.funding, R = rowsBy(mon);
  assert.deepEqual(mon.planFor(m), p, 'same planPurchase result');
  assert.equal(head(R[ROW_KEYS.loan].f(m)), Math.round(c.loan));
  assert.equal(head(R[ROW_KEYS.monthly].f(m)), Math.round(c.monthly), 'Afford KPI "Monthly instalment"');
  assert.equal(R[ROW_KEYS.monthly].v(m), c.monthly);
  assert.ok(strip(R[ROW_KEYS.verdict].f(m)).startsWith(`${VERDICT[p.verdict.status][1]} ${VERDICT[p.verdict.status][2]}`), 'Afford verdict tag');
  assert.equal(head(R[ROW_KEYS.cash].f(m)), Math.round(f.cashNeeded), 'Afford "cash X"');
  assert.equal(R[ROW_KEYS.cash].v(m), f.cashNeeded);
  assert.equal(head(R[ROW_KEYS.upfront].f(m)), Math.round(f.net), 'Afford KPI "Upfront after grants"');
  assert.equal(R[ROW_KEYS.upfront].v(m), f.net);
  assert.equal(head(R[ROW_KEYS.most].f(m)), p.budget.maxPrice == null ? null : Math.round(p.budget.maxPrice), 'Afford KPI "Most you can pay"');
  return p;
}

test('rows: six money rows, right after the "Can we afford it?" header, in the 7a order', () => {
  const mon = createMoney({ policy, store: seedStore(), D, year: () => 2026 });
  const r = mon.insert([{ sec: 'Price & value' }, { k: 'Asking price' }, { sec: SECTION }, { sec: 'Lease & future value' }]);
  assert.deepEqual(r.map((x) => x.k || x.sec), ['Price & value', 'Asking price', SECTION, 'Loan', 'Monthly instalment', 'Can you afford it?', 'Cash you must pay', 'Upfront incl. fees (cash + CPF)', 'Most you can pay', 'Lease & future value']);
  const by = rowsBy(mon);
  assert.equal(by['Most you can pay'].best, 'max');
  for (const k of ['Monthly instalment', 'Cash you must pay', 'Upfront incl. fees (cash + CPF)']) assert.equal(by[k].best, 'min', k);
  assert.ok(!by.Loan.v && !by['Can you afford it?'].v, 'no best-in-row for the loan and the verdict');
  assert.ok(Object.values(by).every((x) => x.tip), 'every row has a tip');
  assert.equal(REASON_ORDER.length, new Set(REASON_ORDER).size);
});

const DATA = existsSync(new URL('../../app/data/data.js', import.meta.url));
test('seed household + the 3 seed flats: every compare money cell = Afford for the same flat', { skip: !DATA }, async () => {
  const { seedMetrics } = await import('../fixtures/gen/money_fixture.mjs');
  const store = seedStore(), mon = createMoney({ policy, store, D, year: () => 2026 });
  const ms = seedMetrics().map((m) => ({ ...m, c: { ...m.c } }));
  const ps = ms.map((m) => assertSame(store, m, mon));
  // the reviewed values (compare-phase7a.txt)
  assert.deepEqual(ps.map((p) => [Math.round(p.chosen.monthly), Math.round(p.chosen.funding.cashNeeded), Math.round(p.chosen.funding.net), p.budget.maxPrice, p.cashShort, p.verdict.status]),
    [[2450, 169400, 169400, 650716, 19400, 'no'], [2212, 149800, 149800, 650716, 0, 'tight'], [1373, 144200, 144200, 650716, 0, 'tight']]);
  assert.match(strip(cashShortLine(ps[0])), /Short of S\$19,400 in cash\./, 'Afford says short');
  assert.match(strip(rowsBy(mon)['Cash you must pay'].f(ms[0])), /short S\$19k · your cash S\$150k/, 'Compare says short');
  assert.deepEqual(mon.glance(ms[0]).map((x) => x[2]), ['instalment 27% of income (28% at the 3% test rate) — near the 30% cap', 'upfront S$169k — short S$19k in cash']);
  assert.deepEqual(mon.glance(ms[2]).map((x) => x[2]), ['instalment 15% of income', 'upfront S$144k within funds even with est. COV']);
  // the 3-room has a 70k COV scenario: it is in Afford's upfront and cash (cash-only), so in Compare's too
  assert.ok(ms[2].cov > 69000);
  assert.match(strip(rowsBy(mon)['Cash you must pay'].f(ms[2])), /COV S\$70,000/);
});

test('P1-like household (cash S$30k, OA S$83k, COV S$48,857): "cash short S$24k" in Compare and in Afford', () => {
  const household = { scheme: 'family', firstTimer: true, propertiesOwned: 0, parents: 'none', loan: 'hdb', tenure: 25, otherDebts: 0, cash: 30000, grantsOverride: null,
    buyers: [{ age: 30, income: 7000, citizenship: 'SC', cpfOa: 83000 }] };
  const store = fakeStore({ household, plan: {} }), mon = createMoney({ policy, store, D, year: () => 2026 });
  const m = choice(600000, '4 ROOM', { leaseNow: 70, cov: 48857 });
  const p = assertSame(store, m, mon);
  assert.equal(Math.round(p.cashShort), 24057);
  assert.match(strip(cashShortLine(p)), /Short of S\$24,057 in cash\./, 'Afford');
  const cash = strip(rowsBy(mon)['Cash you must pay'].f(m));
  assert.match(cash, /short S\$24k · your cash S\$30k/, 'Compare cell');
  assert.match(cash, /COV S\$48,857/, 'COV is cash-only');
  assert.ok(mon.glance(m).some(([cls, , txt]) => cls === 'critical' && /short S\$24k in cash/.test(txt)), 'At a glance');
  // COV is never checked against cash + CPF: funds (113k) would cover it, cash (30k) does not
  assert.ok(30000 + 83000 > p.chosen.funding.cashNeeded);
});

test('cash not known: no "short", ask for the savings (A11) — Compare as Afford', () => {
  const household = { scheme: 'family', firstTimer: true, propertiesOwned: 0, loan: 'hdb', tenure: 25, cash: null, grantsOverride: null, buyers: [{ age: 30, income: 7000, citizenship: 'SC', cpfOa: 20000 }] };
  const store = fakeStore({ household, plan: {} }), mon = createMoney({ policy, store, D, year: () => 2026 });
  const m = choice(600000, '4 ROOM', { cov: 30000 });
  const p = assertSame(store, m, mon);
  assert.equal(p.cashShort, null);
  const cash = strip(rowsBy(mon)['Cash you must pay'].f(m));
  assert.doesNotMatch(cash, /short/i);
  assert.match(cash, /Add your savings to check the cash part\./);
  assert.equal(strip(cashShortLine(p)), 'Add your savings to check the cash part.');
  assert.ok(!mon.glance(m).some(([, , txt]) => /short/.test(txt)));
  // nothing known at all: no cash line in At a glance (as before 7a)
  const none = createMoney({ policy, store: fakeStore({ household: { ...household, buyers: [{ age: 30, income: 7000, citizenship: 'SC' }] }, plan: {} }), D });
  assert.equal(none.glance(m).length, 1);
});

test('smaller loan (A3): the compare verdict uses Afford\'s smaller-loan wording', () => {
  const household = { scheme: 'family', firstTimer: true, propertiesOwned: 0, loan: 'hdb', tenure: 25, cash: 400000, grantsOverride: null, buyers: [{ age: 35, income: 5000, citizenship: 'SC', cpfOa: 100000 }] };
  const store = fakeStore({ household, plan: {} }), mon = createMoney({ policy, store, D, year: () => 2026 });
  const m = choice(800000, '4 ROOM', { leaseNow: 85 });
  const p = assertSame(store, m, mon);
  assert.ok(p.verdict.codes.includes('smaller-loan'));
  const cell = strip(rowsBy(mon)['Can you afford it?'].f(m));
  assert.match(cell, /^! Possible, but tight Possible with a smaller loan: borrow S\$[\d,]+ \(not S\$600,000\)/);
  assert.ok(mon.glance(m).some(([cls, , txt]) => cls === 'warn' && /possible with a smaller loan of S\$\d+k/.test(txt)), 'glance agrees');
  assert.ok(!mon.glance(m).some(([cls]) => cls === 'critical'), 'no red "over the MSR" next to a "possible" verdict');
});

test('short lease (A4): the loan is "up to" with a note; long lease: plain', () => {
  const household = { scheme: 'family', firstTimer: true, propertiesOwned: 0, loan: 'hdb', tenure: 25, cash: 200000, grantsOverride: null, buyers: [{ age: 35, income: 9000, citizenship: 'SC', cpfOa: 100000 }] };
  const store = fakeStore({ household, plan: {} }), mon = createMoney({ policy, store, D, year: () => 2026 });
  const short = choice(400000, '3 ROOM', { leaseNow: 50 }), long = choice(400000, '3 ROOM', { leaseNow: 80 });
  assertSame(store, short, mon); assertSame(store, long, mon);
  assert.match(strip(rowsBy(mon).Loan.f(short)), /^up to S\$300,000 .*lease doesn't reach 95 — HDB will lower it$/);
  assert.match(strip(rowsBy(mon).Loan.f(long)), /^S\$300,000 75% LTV/);
});

test('sale ticked in Plan (A2): Compare counts the same sale as Afford; unticked = no sale', () => {
  const household = { scheme: 'family', firstTimer: false, propertiesOwned: 1, parents: 'none', loan: 'hdb', tenure: 25, cash: 80000, grantsOverride: null,
    buyers: [{ age: 44, income: 7000, citizenship: 'SC', cpfOa: 60000 }, { age: 42, income: 5500, citizenship: 'SC', cpfOa: 40000 }] };
  const current = { owns: true, propertyType: 'hdb', flatType: '4 ROOM', salePrice: 527000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: 38000, mode: null };
  const m = choice(800000, '5 ROOM', { leaseNow: 80 });
  const on = fakeStore({ household, plan: { current } }), off = fakeStore({ household, plan: { current: { ...current, owns: false } } });
  const mOn = createMoney({ policy, store: on, D, year: () => 2026 }), mOff = createMoney({ policy, store: off, D, year: () => 2026 });
  const pOn = assertSame(on, m, mOn), pOff = assertSame(off, m, mOff);
  assert.ok(pOn.sale && pOn.sale.usable);
  assert.equal(pOff.sale, null);
  assert.ok(pOn.funds.cash > pOff.funds.cash, 'sale cash counted');
  assert.deepEqual(mOff.planFor(m), planPurchase({ household, flat: flatInput(m, FT) }, policy), 'no sale = numbers without a sale');
});

test('bank loan households: TDSR shown, loan marked; cash parts add up to the cash needed', () => {
  const household = { scheme: 'family', firstTimer: true, propertiesOwned: 0, loan: 'bank', tenure: 25, cash: 150000, otherDebts: 500, grantsOverride: null, buyers: [{ age: 35, income: 10000, citizenship: 'SC', cpfOa: 100000 }] };
  const store = fakeStore({ household, plan: {} }), mon = createMoney({ policy, store, D, year: () => 2026 });
  const m = choice(700000, '4 ROOM', { cov: 10000 });
  const p = assertSame(store, m, mon);
  assert.match(strip(rowsBy(mon)['Monthly instalment'].f(m)), /TDSR \d+%/);
  assert.match(strip(rowsBy(mon).Loan.f(m)), /bank loan/);
  const f = p.chosen.funding, nums = cashParts(f, 'bank').map((s) => +s.match(/S\$([\d,]+)/)[1].replace(/,/g, ''));
  assert.equal(nums.reduce((a, b) => a + b, 0), Math.round(f.cashNeeded));
});

test('cache: one planPurchase per inputs; a household change gives a new plan; LRU bounded', () => {
  const state = { household: { ...seedStore().get('household') }, plan: {} };
  const mon = createMoney({ policy, store: fakeStore(state), D, year: () => 2026 });
  const m = choice(500000, '4 ROOM');
  const a = mon.planFor(m);
  assert.equal(mon.planFor(m), a, 'same object from the cache');
  state.household = { ...state.household, cash: 10000 };
  assert.notEqual(mon.planFor(m), a);
  for (let i = 0; i < CACHE_MAX + 10; i++) mon.planFor(choice(300000 + i * 1000, '4 ROOM'));
  assert.equal(mon.size(), CACHE_MAX);
});

test('characterisation: compare-phase7a*.txt differ from 6d only in the header counts, At a glance and the money rows', () => {
  const read = (f) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8').split(/\r?\n/);
  const OLD = ['Loani', 'Monthly instalmenti', 'Affordabilityi', 'Upfront cash + CPF neededi', 'Upfront if COV materialisesi', 'Max price your income supportsi'];
  const NEW = Object.values(ROW_KEYS).map((k) => `${k}i`);
  for (const [a, b] of [['compare-phase6d.txt', 'compare-phase7a.txt'], ['compare-phase6d-fv.txt', 'compare-phase7a-fv.txt'], ['compare-phase6d-nobto.txt', 'compare-phase7a-nobto.txt']]) {
    const o = read(a), n = read(b), key = (l) => l.split(' | ')[0];
    const os = o.filter((l) => !OLD.includes(key(l))), ns = n.filter((l) => !NEW.includes(key(l)));
    assert.equal(os.length, ns.length, b);
    os.forEach((l, i) => {
      if (i === 0) assert.equal(ns[i].replace(/best in \d+ of \d+/g, ''), l.replace(/best in \d+ of \d+/g, ''), `${b}: header names`);
      else if (key(l) === 'At a glance') return;
      else assert.equal(ns[i], l, `${b}: unchanged ${key(l)}`);
    });
    assert.deepEqual(n.map(key).filter((k) => NEW.includes(k)), NEW, `${b}: new money rows in order`);
    assert.equal(n.findIndex((l) => key(l) === NEW[0]) - 1, n.findIndex((l) => l.startsWith('CAN WE AFFORD IT?')));
    assert.ok(n.some((l) => key(l).startsWith('CPF LIFE')) && key(n[n.findIndex((l) => key(l) === NEW[5]) + 1]).startsWith('CPF LIFE'), 'CPF LIFE row stays last in the section');
  }
});

test('中文: every string money.js shows has an entry (zh-explore, or an existing zh / zh-engine one) with the same placeholders; JSON has no duplicate keys', () => {
  const raw = (f) => readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8');
  const dict = Object.assign({}, ...['zh-guide.json', 'zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(raw(f))));
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const src = readFileSync(new URL('../../app/modules/explore/money.js', import.meta.url), 'utf8');
  const lit = [...src.matchAll(/\bt\('([^']*)'/g), ...src.matchAll(/\bt\("([^"]*)"/g)].map((x) => x[1]);
  const labels = [...src.matchAll(/'([^']*\{0\}[^']*)'/g)].map((x) => x[1]);
  const keys = [...new Set([...lit, ...labels, ...Object.values(ROW_KEYS), ...Object.values(VERDICT).map((v) => v[2]), SECTION])].filter((k) => /[A-Za-z]/.test(k));
  assert.ok(keys.length > 30);
  for (const k of keys) { assert.ok(dict[k], `missing 中文: ${k}`); assert.equal(ph(dict[k]), ph(k), k); }
  for (const f of ['zh-explore.json']) {
    const ks = [...raw(f).matchAll(/^\s*"(.*?)": "/gm)].map((x) => x[1]);
    assert.ok(ks.length > 800, f);
    assert.equal(ks.length, new Set(ks).size, `${f}: duplicate keys`);
  }
});
