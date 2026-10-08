// Phase 7b B1 "What matters most to you?" (app/modules/explore/priorities.js): ranking by ticks relative to the flats
// on the list (O1), factual sentences, money problems always shown, "You decide" note, header / bar text only with ticks (O2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankFlats, blockHtml, sentenceHtml, phrase, moneyTag, cleanTicks, createPriorities, walkMin, MAX_TICKS, FOOT, TICK_IDS, STORE_PATH } from '../../app/modules/explore/priorities.js';

const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// three flats in the mockup's spirit (sample values)
const facts = () => [
  { i: 0, name: 'Punggol Fld 104A', vals: { price: 0.01, cash: 38000, mrt: 380, commute: null, schools: 6, childcare: 3, clinic: 1.1, flood: true, lease: 77, size: 93 }, cashShort: 0, money: { status: 'ok', cashShort: 0 }, bad: 0 },
  { i: 1, name: 'Hougang Ave 8 512', vals: { price: -0.02, cash: 31000, mrt: 1100, commute: null, schools: 4, childcare: 1, clinic: 0.8, flood: false, lease: 63, size: 104 }, cashShort: 0, money: { status: 'tight', cashShort: 0 }, bad: 1 },
  { i: 2, name: 'Sengkang E Way 220C', vals: { price: 0.05, cash: 94000, mrt: 700, commute: null, schools: 5, childcare: 3, clinic: null, flood: null, lease: 88, size: 92 }, cashShort: 24000, money: { status: 'no', cashShort: 24000 }, bad: 2 },
];
const sentences = (ticks, f = facts()) => { const res = rankFlats(f, ticks); return res.order.map((r, k) => strip(sentenceHtml(r, k, res))); };

test('3 flats: the first sentence names the flat and (at least) two reasons, "fits your ticks best"', () => {
  const s = sentences(['schools', 'childcare', 'mrt']);
  assert.equal(s.length, 3);
  assert.match(s[0], /^1\. Punggol Fld 104A: fits your ticks best\. /);
  assert.match(s[0], /6 primary schools within 1 km/);
  assert.match(s[0], /3 childcare centres with places \(tied\)/);
  assert.match(s[0], /6 min walk to MRT/);
  assert.equal(walkMin(380), 6); // the At-a-glance MRT walk formula
});

test('changing the ticks changes the order', () => {
  const a = rankFlats(facts(), ['schools', 'mrt']).order.map((r) => r.i);
  const b = rankFlats(facts(), ['cash', 'size', 'clinic']).order.map((r) => r.i);
  assert.deepEqual(a, [0, 1, 2]); // 2 and 3 meet none: fewer serious flags first
  assert.deepEqual(b, [1, 0, 2]);
  assert.notDeepEqual(a, b);
  const s = sentences(['cash', 'size', 'clinic']);
  assert.match(s[0], /^2\. Hougang Ave 8 512: fits your ticks best\. Lowest cash you must pay \(S\$31,000\) · biggest \(104 sqm\) · polyclinic 800 m away\./);
});

test('relative "meets" (O1): ties all meet, all-equal all meet; cash needs "not short"; no data never meets; flood is yes / no', () => {
  const f = facts();
  f.forEach((x) => { x.vals.lease = 70; });
  const r = rankFlats(f, ['lease', 'cash', 'clinic', 'flood']);
  assert.equal(r.meetN.lease, 3);
  const by = Object.fromEntries(r.order.map((x) => [x.i, x]));
  assert.ok(by[1].met.includes('cash') && !by[2].met.includes('cash'));
  assert.ok(!by[2].met.includes('clinic') && !by[2].met.includes('flood'));
  assert.ok(by[0].met.includes('flood') && !by[1].met.includes('flood'));
  // a cash-short flat that happens to be the cheapest still does not meet the cash tick
  const g = facts(); g[2].vals.cash = 1000;
  assert.equal(rankFlats(g, ['cash']).meetN.cash, 0);
  assert.match(strip(phrase('flood', g[2], {})), /no flood data/);
  assert.match(strip(phrase('childcare', { vals: { childcare: null } }, {})), /no childcare data/);
});

test('ties on ticks → fewer serious / critical flags first, then list order; "tied on your ticks"', () => {
  const f = facts();
  const res = rankFlats(f, ['childcare']); // flats 1 and 3 both have 3
  assert.deepEqual(res.order.map((r) => r.i), [0, 2, 1]);
  assert.ok(res.tied && !res.lead);
  assert.match(strip(sentenceHtml(res.order[0], 0, res)), /tied on your ticks\./);
  f[0].bad = 5;
  assert.deepEqual(rankFlats(f, ['childcare']).order.map((r) => r.i), [2, 0, 1]);
});

test('money problem always shown, whatever is ticked (DEC-016 Q1)', () => {
  const s = sentences(['schools']);
  const seng = s.find((x) => x.startsWith('3. Sengkang'));
  assert.match(seng, /Cash short S\$24,000$/);
  assert.match(moneyTag({ status: 'no', cashShort: 0 }), /tag critical.*Not affordable as it stands/);
  assert.match(moneyTag({ status: 'tight', cashShort: null }), /tag warn.*Possible, but tight/);
  assert.equal(moneyTag({ status: 'ok', cashShort: 0 }), '');
  assert.match(sentenceHtml(rankFlats(facts(), ['schools']).order.find((r) => r.i === 1), 1, rankFlats(facts(), ['schools'])), /tag warn/);
});

test('block: disclaimer, chips, fold after use, states (no ticks / 1 flat / overflow / hub)', () => {
  const html = blockHtml({ ticks: ['schools', 'mrt'], facts: facts(), commuteLabel: null, overflow: false, foldOpen: false, bandKm: 1, hubHint: 'set a hub' });
  assert.ok(html.includes(FOOT), 'foot note');
  assert.match(html, /<details class="fold-inline prio-fold"><summary>Change what matters \(2 ticked\)<\/summary>/);
  assert.match(html, /data-prio="schools" aria-pressed="true"/);
  assert.doesNotMatch(html, /data-prio="commute"/, 'no commute chip without a hub');
  assert.match(html, /set a hub/);
  assert.match(blockHtml({ ticks: [], facts: facts(), commuteLabel: 'Commute to Raffles Place', bandKm: 1 }), /Tick what matters and your flats are sorted by it\..*/);
  assert.match(blockHtml({ ticks: [], facts: facts(), commuteLabel: 'Commute to Raffles Place', bandKm: 1 }), /data-prio="commute" aria-pressed="false">Commute to Raffles Place/);
  assert.doesNotMatch(blockHtml({ ticks: [], facts: facts(), bandKm: 1 }), /You decide/);
  const one = blockHtml({ ticks: ['schools'], facts: facts().slice(2), bandKm: 1 });
  assert.match(one, /Add another flat to sort them by your ticks\./);
  assert.match(strip(one), /3\. Sengkang E Way 220C: 5 primary schools within 1 km\. Cash short S\$24,000/);
  assert.match(blockHtml({ ticks: ['schools'], facts: facts(), overflow: true, foldOpen: true, bandKm: 1 }), /Up to 5 — untick one first\./);
  assert.equal(blockHtml({ ticks: ['schools'], facts: [], bandKm: 1 }), '');
});

test('cleanTicks: known ids, no repeats, at most 5', () => {
  assert.deepEqual(cleanTicks(['size', 'x', 'size', 'mrt', 'lease', 'price', 'cash', 'flood']), ['size', 'mrt', 'lease', 'price', 'cash']);
  assert.equal(MAX_TICKS, 5);
  assert.equal(TICK_IDS.length, 10);
  assert.deepEqual(cleanTicks(null), []);
});

test('createPriorities: header note "meets X of your Y ticks" and the bar text only while ticks exist (O2); brief "why"', () => {
  const st = { ui: { priorities: [] } };
  const store = { get: (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), st), set: (k, v) => { st.ui.priorities = v; } };
  const F = facts();
  const ms = F.map((f) => ({ c: { id: f.i + 1, name: f.name, sqm: f.vals.size }, b: { i: f.i }, premium: f.vals.price, mrt: { d: f.vals.mrt }, leaseNow: f.vals.lease, f }));
  const money = { planFor: (m) => ({ chosen: { funding: { cashNeeded: m.f.vals.cash } }, cashShort: m.f.cashShort, verdict: { status: m.f.money.status } }) };
  const family = { facts: (b) => { const v = F[b.i].vals; return { schools: { near: Array(v.schools).fill(0) }, childcare: v.childcare == null ? null : { far: v.childcare }, poly: v.clinic == null ? null : { km: v.clinic }, flood: v.flood == null ? null : { near: v.flood ? null : { m: 120 } } }; } };
  const verdict = (m) => Array(m.f.bad).fill(['serious', '▲', 'x']);
  const p = createPriorities({ store, money, family, rows: () => [], verdict, metrics: (c) => ms[c.id - 1], choices: () => ms.map((m) => m.c), bandKm: 1 });
  p.html(ms);
  assert.equal(p.hint(ms), null);
  assert.equal(p.headerNote(0), null);
  assert.equal(p.why(ms[0].c), null);
  st.ui.priorities = ['schools', 'childcare', 'mrt'];
  const html = p.html(ms);
  assert.match(strip(html), /1\. Punggol Fld 104A: fits your ticks best\./);
  assert.equal(p.hint(ms), '3 flats · fits your ticks best: 1. Punggol Fld 104A');
  assert.equal(p.headerNote(0), 'meets 3 of your 3 ticks');
  assert.equal(p.headerNote(1), 'meets 0 of your 3 ticks');
  assert.equal(p.why(ms[0].c), '6 primary schools within 1 km · 3 childcare centres with places (tied) · 6 min walk to MRT');
  assert.equal(STORE_PATH, 'ui.priorities');
});
