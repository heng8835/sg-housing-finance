// Phase 7b B7 — renting path: one rent figure (store plan.rent, = Plan's "Your rent now") that survives a reload;
// "Room" can be chosen and its rent is the user's figure — never estimated, never judged fair (DEC-016 Q3); a room
// renter can run Rent or buy; the rent place (town / block) is saved with the rent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createStore, STORE_KEY } from '../../app/core/store.js';
import { sharedRent, rentAmount, bindSharedRent, rentBlock } from '../../app/core/rentshare.js';
import { rentTypeField, amountField, roomBody, rentToCompare, rentCompared, windowLine, ROOM_NOTE, roomStrings } from '../../app/modules/rent/room.js';
import { placeStrings } from '../../app/modules/rent/place.js';
import { planPurchase } from '../../app/engine/plan.js';
import { rentVsBuy, scenarios } from '../../app/engine/rentbuy.js';
import { buyGate, rbVerdict } from '../../app/modules/rent/buygate.js';
import { policy } from '../helpers.js';

const lsStaging = (u) => (existsSync(u) ? readdirSync(u) : []); // staging is empty once the integrator merged it
const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m }; };

test('the rent, its type and its place survive a reload (store plan.rent)', () => {
  const storage = memory();
  const st = createStore({ storage });
  assert.deepEqual(sharedRent(st.get('plan')), { type: 'whole', amount: null, town: null, bid: null, label: null });
  st.set('plan.rent', { ...st.get('plan.rent'), type: 'room', amount: 1100, town: 'QUEENSTOWN', bid: 7, label: '9 Dawson Rd' });
  const again = createStore({ storage });
  assert.deepEqual(sharedRent(again.get('plan')), { type: 'room', amount: 1100, town: 'QUEENSTOWN', bid: 7, label: '9 Dawson Rd' });
  assert.ok(storage.map.get(STORE_KEY).includes('"rent"'), 'kept in the store key only (localStorage)');
});

test('one figure: plan.rent.amount and Plan\'s plan.rentNow stay equal both ways', () => {
  const st = createStore({ storage: memory() });
  bindSharedRent(st);
  st.set('plan.rent', { ...st.get('plan.rent'), amount: 2400 });
  assert.equal(st.get('plan.rentNow'), 2400, 'Rent tab → Plan BTO "Your rent now"');
  st.set('plan.rentNow', 2600);
  assert.equal(st.get('plan.rent.amount'), 2600, 'Plan BTO → Rent tab');
  st.set('plan.rentNow', 0);
  assert.equal(st.get('plan.rent.amount'), 0, 'rent-free (0) is a figure, not blank');
  st.set('plan.rent', { ...st.get('plan.rent'), amount: null });
  assert.equal(st.get('plan.rentNow'), null);
  // an older save with only rentNow: it becomes the shared figure at start
  const old = createStore({ storage: memory({ [STORE_KEY]: JSON.stringify({ schemaVersion: 1, plan: { rentNow: 1900 } }) }) });
  bindSharedRent(old);
  assert.equal(old.get('plan.rent.amount'), 1900);
  assert.equal(rentAmount(''), null); assert.equal(rentAmount(-5), null); assert.equal(rentAmount('2500'), 2500);
});

test('rent block: kept only while the saved label still names the same block', () => {
  const hdb = { blocks: [{ b: '1' }, { b: '2' }] }, name = (h, i) => `Blk ${h.blocks[i].b}`;
  assert.equal(rentBlock({ bid: 1, label: 'Blk 2' }, hdb, name), 1);
  assert.equal(rentBlock({ bid: 1, label: 'Blk 9' }, hdb, name), null);
  assert.equal(rentBlock({ bid: 5, label: 'x' }, hdb, name), null);
});

test('Room can be chosen; its rent is "your figure" with no median, verdict or estimate', () => {
  const seg = rentTypeField('room');
  assert.doesNotMatch(seg, /is-off|aria-disabled/, 'Room is no longer greyed');
  assert.match(seg, /data-rt="room" aria-checked="true"/);
  assert.match(amountField('room', 1100), /Your room rent \(S\$ a month\)/);
  assert.doesNotMatch(amountField('room', null, 2800), /2800/, 'no median placeholder for a room');
  const body = roomBody(1100, 6800, '');
  assert.match(body, /Your figure\. There&#39;s no public data on room rents|Your figure\. There's no public data on room rents/);
  assert.doesNotMatch(body, /Median|Verdict|usual|yield|<b>Fair/i); // only "we can't say if it's fair"
  assert.match(body, /16\.2%|16%/, 'share of income from your figure');
  // the rent compared: a room never falls back to a median
  const comps = { med: 2800 };
  assert.deepEqual(rentToCompare({ type: 'room', amount: 1100 }, comps), { rent: 1100, typed: true });
  assert.deepEqual(rentToCompare({ type: 'room', amount: null }, comps), { rent: null, typed: true });
  assert.deepEqual(rentToCompare({ type: 'whole', amount: null }, comps), { rent: 2800, typed: false });
  assert.deepEqual(rentToCompare({ type: 'whole', amount: 3000 }, comps), { rent: 3000, typed: true });
  assert.equal(rentCompared('room', 1100, true), 'Rent: S$1,100 a month (your figure)');
  assert.match(windowLine({ months: 12 }, ['2025-10', '2026-09']), /Last 12 months · to Sep/);
});

test('room renter (single PR) runs Rent or buy: no winner for a flat she cannot buy, her rent labelled "your figure"', () => {
  const h = { scheme: 'single', firstTimer: true, propertiesOwned: 0, parents: 'none', loan: 'hdb', tenure: 25, grantsOverride: null, otherDebts: null, cash: 60000,
    buyers: [{ age: 35, income: 6800, citizenship: 'PR', prYears3Plus: true, nationality: 'other', cpfOa: 40000 }] };
  const { rent } = rentToCompare({ type: 'room', amount: 1100 }, { med: 2800 });
  const plan = planPurchase({ household: h, flat: { price: 520000, flatType: '3 ROOM', remainingLease: 70 } }, policy);
  const gate = buyGate(plan, policy, { household: h, price: 520000, rent, rentIsAsking: true, room: true });
  assert.equal(gate.blocked, true);
  assert.match(gate.html, /Keep renting<\/b> — S\$1,100\/month \(your figure\)/);
  assert.equal(rbVerdict(1, gate), '');
  // an eligible room renter gets the comparison on her own figure
  const sc = { ...h, buyers: [{ ...h.buyers[0], citizenship: 'SC', age: 36 }], loan: 'hdb' };
  const p2 = planPurchase({ household: sc, flat: { price: 420000, flatType: '3 ROOM', remainingLease: 70 } }, policy);
  const o = p2.chosen;
  const res = rentVsBuy({ horizonYears: 10, buy: { price: 420000, flatType: '3 ROOM', loanType: o.loanType, loanAmount: o.loan, rate: o.rate, tenure: o.tenure, upfrontCash: o.funding.cashNeeded, upfrontCpf: o.funding.cpfUsed, monthlyOwnerCosts: 300 }, rent: { monthlyRent: rent }, assumptions: scenarios(policy).base }, policy);
  assert.equal(res.series.length, 11);
  assert.ok(res.series.every((s) => Number.isFinite(s.rentNetWorth) && Number.isFinite(s.buyNetWorth)));
});

test('no room estimate anywhere: the Rent tab never derives a room rent from data', () => {
  const src = ['modules/rent/index.js', 'modules/rent/room.js', 'modules/rent/place.js'].map(read).join('\n');
  assert.doesNotMatch(src, /estimated room|room rent estimate|roomEstimate|estimateRoom/i);
  assert.doesNotMatch(src, /No public data source available for room rental/, 'the old greyed-Room note is gone');
  const idx = read('modules/rent/index.js');
  const roomBranch = idx.slice(idx.indexOf('if (room) {'), idx.indexOf('const fair ='));
  assert.doesNotMatch(roomBranch, /comps|fairRent|grossYield|trend =\s*\{/, 'the room branch uses no rent data');
  assert.ok(ROOM_NOTE.includes('your figure') || ROOM_NOTE.startsWith('Your figure'));
});

test('中文: every new Rent string has an entry (i18n or staging)', () => {
  const staged = lsStaging(new URL('i18n/staging/', APP)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read(`i18n/staging/${f}`)));
  const dict = Object.assign({}, ...['zh', 'zh-explore', 'zh-engine', 'zh-guide'].map((n) => JSON.parse(read(`i18n/${n}.json`))), ...staged);
  const missing = [...roomStrings(), ...placeStrings(), 'Enter your room rent above to compare.', '{0}/month (your figure)'].filter((k) => !dict[k]);
  assert.deepEqual(missing, []);
});
