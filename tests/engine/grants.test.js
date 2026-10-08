import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grants, absdRate, flatSize } from '../../app/engine/grants.js';
import { policy } from '../helpers.js';

const family = (o = {}) => ({
  scheme: 'family', firstTimer: true, parents: 'none', propertiesOwned: 0,
  buyers: [{ age: 30, income: 4000, citizenship: 'SC' }, { age: 29, income: 3000, citizenship: 'SC' }], ...o,
});
const byId = (g) => Object.fromEntries(g.items.map((i) => [i.id, i.amount]));

test('flat size: 2–4 room small, 5-room / Executive / MG large', () => {
  assert.equal(flatSize('4 ROOM'), 'small');
  assert.equal(flatSize('5 ROOM'), 'large');
  assert.equal(flatSize('EXECUTIVE'), 'large');
});

test('first-timer SC couple, S$7,000/month, 4-room, living with parents: CHG + EHG + PHG', () => {
  const g = grants({ household: family({ parents: 'with' }), flatType: '4 ROOM' }, policy);
  assert.deepEqual(byId(g), { chg: 80000, ehg: 30000, phg: 30000 });
  assert.equal(g.total, 140000);
});

test('EHG band edges: S$1,500 → 120k, S$1,501 → 110k, S$9,000 → 5k, S$9,001 → none', () => {
  const at = (income) => byId(grants({ household: family({ buyers: [{ age: 30, income, citizenship: 'SC' }] }), flatType: '4 ROOM' }, policy)).ehg;
  assert.equal(at(1500), 120000);
  assert.equal(at(1501), 110000);
  assert.equal(at(9000), 5000);
  assert.equal(at(9001), undefined);
});

test('SC + PR couple gets the lower CHG; 5-room gets the large-flat amount', () => {
  const g = grants({ household: family({ buyers: [{ age: 30, income: 6000, citizenship: 'SC' }, { age: 30, income: 6000, citizenship: 'PR' }] }), flatType: '5 ROOM' }, policy);
  assert.equal(byId(g).chg, 40000);
  assert.equal(byId(g).ehg, undefined); // S$12,000 is above the EHG ceiling
});

test('income above the family ceiling → no CHG, no EHG; PHG still applies', () => {
  const g = grants({ household: family({ parents: 'near', buyers: [{ age: 30, income: 17000, citizenship: 'SC' }] }), flatType: '4 ROOM' }, policy);
  assert.deepEqual(byId(g), { phg: 20000 });
});

test('first + second-timer couple: reduced CHG and EHG from the singles table on half the income', () => {
  const g = grants({ household: family({ firstTimer: 'mixed' }), flatType: '4 ROOM' }, policy); // S$7,000 → half = 3,500
  assert.deepEqual(byId(g), { chg: 40000, ehg: 15000 });
});

test('single aged 35+ buying a 4-room alone', () => {
  const g = grants({ household: { scheme: 'single', firstTimer: true, parents: 'none', buyers: [{ age: 36, income: 3000, citizenship: 'SC' }] }, flatType: '4 ROOM' }, policy);
  assert.deepEqual(byId(g), { chg: 40000, ehg: 25000 });
});

test('single under 35 and singles buying an Executive flat get nothing', () => {
  const young = { scheme: 'single', firstTimer: true, buyers: [{ age: 30, income: 3000, citizenship: 'SC' }] };
  assert.equal(grants({ household: young, flatType: '4 ROOM' }, policy).total, 0);
  assert.equal(grants({ household: { ...young, buyers: [{ age: 40, income: 3000, citizenship: 'SC' }] }, flatType: 'EXECUTIVE' }, policy).total, 0);
});

test('no SC buyer → no grants', () => {
  const g = grants({ household: family({ buyers: [{ age: 30, income: 5000, citizenship: 'PR' }, { age: 30, income: 1000, citizenship: 'PR' }] }), flatType: '4 ROOM' }, policy);
  assert.equal(g.total, 0);
});

test('short lease: EHG shown as "up to" (not pro-rated — formula not published) with a note that HDB will pro-rate it', () => {
  const g = grants({ household: family(), flatType: '4 ROOM', coversTo95: false }, policy);
  const ehg = g.items.find((i) => i.id === 'ehg');
  assert.equal(ehg.upTo, true);
  assert.ok(g.notes.some((n) => /most you could get/.test(n) && /will pro-rate/.test(n) && /actual amount is lower/.test(n)));
  assert.ok(!g.notes.some((n) => /pro-rated(?! by)/.test(n) && /full amount is shown/.test(n)), 'never "pro-rated" beside an un-pro-rated number');
  const full = grants({ household: family(), flatType: '4 ROOM', coversTo95: true }, policy);
  assert.equal(full.items.find((i) => i.id === 'ehg').upTo, undefined);
  assert.equal(full.total, g.total); // the number itself is unchanged
});

test('ABSD: SC first home 0; SC second 20%; PR single first home 5%; married SC+PR first home remitted', () => {
  assert.equal(absdRate({ household: family() }, policy).rate, 0);
  assert.equal(absdRate({ household: family({ propertiesOwned: 1 }) }, policy).rate, 0.2);
  assert.equal(absdRate({ household: { scheme: 'single', propertiesOwned: 0, buyers: [{ age: 40, income: 5000, citizenship: 'PR' }] } }, policy).rate, 0.05);
  const mixed = absdRate({ household: family({ buyers: [{ age: 30, income: 1, citizenship: 'SC' }, { age: 30, income: 1, citizenship: 'PR' }] }) }, policy);
  assert.equal(mixed.rate, 0);
  assert.match(mixed.note, /remitted/);
});

test('ABSD: foreigners 60 %, but US / EFTA nationals pay the citizen rate', () => {
  const one = (b) => absdRate({ household: { scheme: 'single', propertiesOwned: 0, buyers: [{ age: 40, income: 9000, ...b }] } }, policy).rate;
  assert.equal(one({ citizenship: 'F', nationality: 'other' }), 0.6);
  assert.equal(one({ citizenship: 'F', nationality: 'MY' }), 0.6);
  assert.equal(one({ citizenship: 'F', nationality: 'US' }), 0);
});
