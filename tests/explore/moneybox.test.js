// Phase 7b B4 (brief money box = Afford numbers) and B12 (parents' place → PHG per flat, the same in Compare and Afford).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPurchase } from '../../app/engine/plan.js';
import { saleInput } from '../../app/engine/salefunds.js';
import { costInput } from '../../app/engine/scenario.js';
import { monthlyCost } from '../../app/engine/monthly-cost.js';
import { money as fmtMoney } from '../../app/core/dom.js';
import { parentsKm, parentsKmFor, withParents } from '../../app/core/parents.js';
import { createMoney, PHG_KEY, PHG_MARGIN_M, phgCell } from '../../app/modules/explore/money.js';
import { moneyModel, moneyBoxHtml, trueMonthly, householdEmpty } from '../../app/modules/explore/briefmoney.js';
import { briefHtml, fitLevels, dropMoney, briefSections } from '../../app/modules/explore/brief.js';
import { parentsPlace, placeSmall } from '../../app/modules/explore/places.js';
import { phgNear } from '../../app/engine/grants.js';
import { policy } from '../helpers.js';

const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const D = { flat_types: FT };
const strip = (h) => h.replace(/<small>/g, ' (').replace(/<\/small>/g, ')').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const LIMIT = policy.get('grant.phg.near_km');
// a block and points due north of it: 1 km of latitude ≈ 1 / 111.195 degrees
const BLOCK = { lat: 1.35, lon: 103.85 };
const north = (km) => ({ lat: BLOCK.lat + km / 111.195, lon: BLOCK.lon });
const household = (o = {}) => ({ scheme: 'family', buyers: [{ age: 32, income: 5000, citizenship: 'SC', cpfOa: 60000 }, { age: 31, income: 4000, citizenship: 'SC', cpfOa: 40000 }], cash: 80000, otherDebts: 0, firstTimer: true, propertiesOwned: 0, parents: 'none', loan: 'hdb', tenure: 25, grantsOverride: null, ...o });
const storeOf = (state) => ({ get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), state), subscribe: () => () => {} });
const choice = { c: { id: 7, bid: 0, ft: 3, price: 560000, sqm: 93, name: 'Test flat' }, b: BLOCK, leaseNow: 80, cov: 0 };

/** Afford for the same flat with the B12 hook (focus from My choices → Afford; core/parents parentsKmFor on its block). */
function affordPlan(state) {
  const tf = { source: 'choice', choiceId: 7, bid: 0, price: 560000, flatType: '4 ROOM', remainingLease: 80, cov: 0 };
  const h = state.household;
  return planPurchase({ household: h, flat: withParents({ price: tf.price, flatType: tf.flatType, remainingLease: tf.remainingLease, cov: tf.cov }, parentsKmFor(h, tf)), sale: saleInput(state.plan, 2026) }, policy);
}

test('B12: tagging the parents\' place changes grants per flat — the same in Compare (money.js) and Afford; untagging = today', () => {
  globalThis.HDB_DATA = { blocks: [BLOCK] }; // core/data block(bid) for Afford's focus
  try {
    for (const km of [1.9, LIMIT - 0.1, LIMIT + 1.2]) {
      const state = { household: household({ parentsPlace: { ...north(km), name: 'Mum and Dad' } }), plan: {} };
      const mon = createMoney({ policy, store: storeOf(state), D, year: () => 2026 });
      const p = mon.planFor(choice);
      assert.deepEqual(p, affordPlan(state), `Compare = Afford at ${km} km`);
      assert.ok(Math.abs(parentsKm(state.household, BLOCK) - km) < 0.01);
      const phg = (p.grants.items.find((i) => i.id === 'phg') || {}).amount ?? 0;
      assert.equal(phg, km <= LIMIT ? policy.get('grant.phg').family.near : 0);
      assert.ok(mon.rows().some((r) => r.k === PHG_KEY), 'PHG row while a place is tagged');
    }
    const plain = { household: household(), plan: {} };
    const mon = createMoney({ policy, store: storeOf(plain), D, year: () => 2026 });
    assert.deepEqual(mon.planFor(choice), planPurchase({ household: plain.household, flat: { price: 560000, flatType: '4 ROOM', remainingLease: 80, cov: 0 }, sale: null }, policy), 'untagged = the numbers as before');
    assert.ok(!mon.rows().some((r) => r.k === PHG_KEY), 'no PHG row without a tagged place');
    assert.equal(parentsKmFor(plain.household, { bid: 0 }), null);
    assert.equal(parentsKmFor(household({ parentsPlace: north(1) }), { source: 'typical' }), null, 'typical flat: no block → household setting');
  } finally { delete globalThis.HDB_DATA; }
});

test('B12: PHG row wording — within, over, close to the limit (± 300 m), living with, own grant figure', () => {
  const cell = (km, h = household()) => { const p = planPurchase({ household: h, flat: { price: 560000, flatType: '4 ROOM', remainingLease: 80, parentsKm: km } }, policy); return strip(phgCell(phgNear({ household: h, parentsKm: km }, policy), p, h.grantsOverride != null)); };
  assert.match(cell(1.9), new RegExp(`^✓ 1\\.9 km \\(within ${LIMIT} km\\) \\(PHG S\\$20,000 in the grants\\)$`));
  assert.match(cell(LIMIT + 1.2), new RegExp(`over ${LIMIT} km\\) \\(no PHG in the grants\\)$`));
  const close = cell(LIMIT - (PHG_MARGIN_M - 100) / 1000);
  assert.match(close, /^≈ .* km \(close to the .* km limit; HDB checks the exact distance\)/);
  assert.match(cell(LIMIT + 0.2), /^≈ /, 'just over the limit is also "close"');
  assert.match(cell(9, household({ parents: 'with' })), /^✓ living with your parents/);
  assert.match(cell(1, household({ grantsOverride: 30000 })), /your own grant figure in Household is used\)$/);
});

test('B12: daily places — the parents\' place, the card line', () => {
  const ps = [{ id: 1, name: 'Office', label: 'Raffles Pl', lat: 1.28, lon: 103.85, kind: 'work' }, { id: 2, name: 'Mum', label: 'Blk 220', ...north(2), kind: 'parents' }];
  assert.deepEqual(parentsPlace(ps), { ...north(2), name: 'Mum' });
  assert.equal(parentsPlace([ps[0]]), null);
  assert.equal(placeSmall({ label: 'Old place' }), 'Old place', 'places saved before 7b unchanged');
  assert.equal(placeSmall(ps[0]), 'Work or study · Raffles Pl');
  assert.equal(placeSmall(ps[1], BLOCK), "Parents' home · 2.0 km from the flat in Afford");
});

test('B4: the money box shows the Afford numbers (planPurchase + true monthly cost)', () => {
  const h = household({ parentsPlace: north(1.9) });
  const p = planPurchase({ household: h, flat: { price: 560000, flatType: '4 ROOM', remainingLease: 80, cov: 0, parentsKm: 1.9 } }, policy);
  const flat = { flatType: '4 ROOM', bid: 0 }, market = { rent: 3200, flatType: '4 ROOM' };
  const cost = trueMonthly(p, { flat, household: h, policy, market });
  assert.equal(cost.total, monthlyCost(costInput({ plan: p, focus: flat, household: h, market, policy }), policy).total, 'same as Afford "True monthly cost"');
  const md = moneyModel({ p, household: h, cost, why: '6 primary schools within 1 km', date: '7 Oct 2026' });
  const html = strip(moneyBoxHtml(md));
  const c = p.chosen, f = c.funding;
  for (const v of [c.monthly, f.cashNeeded, f.cpfUsed, p.grants.total, p.budget.maxPrice, cost.total]) assert.ok(html.includes(fmtMoney(v)), `box shows ${fmtMoney(v)}`);
  assert.match(html, /PHG S\$20,000/);
  assert.match(html, /Why this flat \(your ticks\): 6 primary schools within 1 km/);
  assert.match(html, /From your details on this device, 7 Oct 2026\. Educational estimate — not financial advice\./);
  assert.match(html, /HDB loan · 25 years/);
});

test('B4: empty household → one line; cash unknown → "add your savings"; sale line', () => {
  const empty = household({ buyers: [{ age: null, income: null, citizenship: 'SC', cpfOa: null }], cash: null });
  const p0 = planPurchase({ household: empty, flat: { price: 500000, flatType: '4 ROOM', remainingLease: 80 } }, policy);
  assert.ok(householdEmpty(p0));
  assert.match(strip(moneyBoxHtml(moneyModel({ p: p0, household: empty, date: 'd' }))), /Add your household in the app to see your money numbers here\./);
  const noCash = household({ cash: null });
  const p1 = planPurchase({ household: noCash, flat: { price: 500000, flatType: '4 ROOM', remainingLease: 80 } }, policy);
  assert.match(strip(moneyBoxHtml(moneyModel({ p: p1, household: noCash, date: 'd' }))), /add your savings to check the cash part/);
  const fake = { ...p1, sale: { usable: true, cash: 120000, cpf: 90000 } };
  assert.match(strip(moneyBoxHtml(moneyModel({ p: fake, household: noCash, saleHome: '12 Bedok Nth St 3', date: 'd' }))), /Includes selling 12 Bedok Nth St 3: S\$120,000 cash, S\$90,000 back to CPF\./);
});

test('B4: no duplicates, "Include my numbers" off = no household money on the page; the box is kept at every fit level', () => {
  const rows = [{ sec: 'Price & value' }, { k: 'Asking price', f: () => 'S$560,000' }, { sec: 'Can we afford it?' }, { k: 'Monthly instalment', f: () => 'S$2,034' }, { k: 'CPF LIFE at 65 (est.)', f: () => 'S$1' }, { sec: 'Lease & future value' }, { k: 'Remaining lease today', f: () => '80 y' }];
  const flags = [['good', '≈', 'priced in line with recent sales'], ['warn', '!', 'instalment 27% of income'], ['good', '✓', 'upfront S$150k within funds']];
  const on = dropMoney(rows, flags, { include: true, moneyFlags: [flags[1][2], flags[2][2]] });
  assert.deepEqual(on.rows.map((r) => r.k || r.sec), ['Price & value', 'Asking price', 'Lease & future value', 'Remaining lease today']);
  assert.equal(on.flags.length, 3, 'flags kept while the box shows');
  const off = dropMoney(rows, flags, { include: false, moneyFlags: [flags[1][2], flags[2][2]] });
  assert.deepEqual(off.flags.map((f) => f[2]), ['priced in line with recent sales']);
  const h = household();
  const p = planPurchase({ household: h, flat: { price: 560000, flatType: '4 ROOM', remainingLease: 80 } }, policy);
  const base = { name: 'X', address: 'a', town: 't', flatType: '4 ROOM', storey: 's', sqm: 93, price: 'S$560,000', listing: '', facts: [], printed: 'd', notes: [], mapSvg: '', mapLegend: '', sources: '', title: 'T' };
  const md = { ...base, flags: on.flags, pro: briefSections(on.rows, {}), simple: briefSections(on.rows, {}), money: moneyModel({ p, household: h, date: 'd' }) };
  for (const lv of [...fitLevels('pro'), ...fitLevels('simple')]) {
    const html = briefHtml(md, lv);
    assert.match(html, /<section class="bf-money"><h2>Money for your household<\/h2>/, 'box at every level');
    assert.ok(html.indexOf('bf-money') < html.indexOf('bf-kh') && html.indexOf('bf-top') < html.indexOf('bf-money'), 'between the top and Key numbers');
    assert.doesNotMatch(html, /S\$2,034/, 'the "Can we afford it?" rows are not repeated');
  }
  const offHtml = briefHtml({ ...md, money: null, flags: off.flags }, fitLevels('pro')[0]);
  assert.doesNotMatch(offHtml, /bf-money/);
  for (const v of [p.chosen.monthly, p.chosen.funding.cashNeeded, p.budget.maxPrice]) assert.ok(!offHtml.includes(fmtMoney(v)), 'no household number');
});
