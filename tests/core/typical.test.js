// core/typical.js (H1): scope fallback chain, TYPICAL_MIN_N widening, medians equal to the map's median rule,
// default flat type, typical rents, and that the default is never written to the store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policy } from '../helpers.js';
import { bus } from '../../app/core/bus.js';
import {
  TYPICAL_MIN_N, lastSelection, setSelection, defaultFlatType, scopeOf, widen, typicalPrice, typicalPriceWidened,
  typicalRent, areaSummary, effectiveFlat, defaultNote, selectionKey, ftWord,
} from '../../app/core/typical.js';
import { areaRentComps, rentComps } from '../../app/engine/rent.js';

// the map's median (explore/legacy.js: even count → mean of the middle two)
const legacyMedian = (arr) => { const a = arr.slice().sort((x, y) => x - y), h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };

// 14 months; blocks 0–2 in AMK (town 0), 3–4 in BISHAN (town 1), 5 in BEDOK (town 2)
const months = Array.from({ length: 14 }, (_, i) => `20${i < 3 ? '25' : '26'}-${String(i < 3 ? 10 + i : i - 2).padStart(2, '0')}`);
const tx = { b: [], m: [], ft: [], p: [] };
const sale = (b, m, ft, p) => { tx.b.push(b); tx.m.push(m); tx.ft.push(ft); tx.p.push(p); };
// 4 ROOM (ft 1): AMK block 0 — 3 sales in the window, one too old; Bishan — 6 sales; Bedok — 1
sale(0, 13, 1, 600000); sale(0, 12, 1, 640000); sale(1, 5, 1, 620000); sale(0, 0, 1, 100000); // m 0 is outside the last 12
for (let i = 0; i < 6; i++) sale(3 + (i % 2), 4 + i, 1, 700000 + i * 10000);
sale(5, 13, 1, 500000);
sale(2, 13, 0, 400000); // 3 ROOM in AMK
globalThis.HDB_DATA = {
  months, towns: ['ANG MO KIO', 'BISHAN', 'BEDOK'], flat_types: ['3 ROOM', '4 ROOM', '5 ROOM'],
  blocks: [{ t: 0 }, { t: 0 }, { t: 0 }, { t: 1 }, { t: 1 }, { t: 2 }], tx,
};
globalThis.HDB_RENTS = {
  blocks: { 0: { '4 ROOM': [4, 3000, 3200, 3400, '2026-09'] }, 1: { '4 ROOM': [2, 3100, 3300, 3500, '2026-08'] } },
  towns: { 'ANG MO KIO': { '4 ROOM': { q: [3000, 3100], n: 40, p25: 3000, med: 3150, p75: 3300 } }, BISHAN: { '4 ROOM': { q: [3300], n: 10, p25: 3200, med: 3450, p75: 3600 } } },
  quarters: ['2026-Q1', '2026-Q2'], months: ['2025-10', '2026-09'],
};
const store = (focus = null) => { const s = { focus }; return { get: (k) => s[k], set: () => { throw new Error('the default must never be stored'); } }; };
const area = { kind: 'circle', label: '800 m circle', blockIds: [0, 1], town: 'ANG MO KIO', centre: { lat: 1.37, lon: 103.85 }, n: 2 };

test('default flat type: focus type → 4-room if selected → first selected → 4-room', () => {
  assert.equal(defaultFlatType({ flatType: '5 ROOM' }, { flatTypes: ['4 ROOM'] }), '5 ROOM');
  assert.equal(defaultFlatType(null, { flatTypes: ['3 ROOM', '4 ROOM', '5 ROOM'] }), '4 ROOM');
  assert.equal(defaultFlatType(null, { flatTypes: ['5 ROOM', 'EXECUTIVE'] }), '5 ROOM');
  assert.equal(defaultFlatType(null, { flatTypes: [] }), '4 ROOM');
  assert.equal(defaultFlatType(null, null), '4 ROOM');
});

test('scope: drawn area → town filter → island; widening area → main town → island', () => {
  assert.equal(scopeOf({ area, towns: ['BISHAN'] }).kind, 'area');
  assert.equal(scopeOf({ area, towns: null }).label, 'your 800 m circle');
  assert.deepEqual(scopeOf({ area: null, towns: ['BISHAN'] }), { kind: 'towns', towns: ['BISHAN'], label: 'Bishan' });
  assert.equal(scopeOf({ towns: ['BISHAN', 'BEDOK'] }).label, '2 towns');
  assert.equal(scopeOf({ towns: null }).kind, 'island');
  assert.equal(scopeOf(null).kind, 'island');
  const w = widen(scopeOf({ area }));
  assert.deepEqual(w, { kind: 'towns', towns: ['ANG MO KIO'], label: 'Ang Mo Kio' });
  assert.equal(widen(w).kind, 'island');
  assert.equal(widen(scopeOf(null)), null);
  assert.equal(widen(scopeOf({ area: { ...area, town: null } })).kind, 'island');
});

test('typical price = the map median of the last 12 months (all storeys / sizes), per scope', () => {
  const amk = typicalPrice({ flatType: '4 ROOM', scope: scopeOf({ towns: ['ANG MO KIO'] }) });
  assert.equal(amk.price, legacyMedian([600000, 640000, 620000]));          // the m-0 sale is outside the window
  assert.equal(amk.n, 3);
  assert.deepEqual([amk.from, amk.to], [months[2], months[13]]);
  const island = typicalPrice({ flatType: '4 ROOM', scope: scopeOf(null) });
  assert.equal(island.price, legacyMedian([600000, 640000, 620000, 700000, 710000, 720000, 730000, 740000, 750000, 500000]));
  assert.equal(island.n, 10);
  const win = typicalPrice({ flatType: '4 ROOM', scope: scopeOf(null), window: { from: months[12], to: months[13] } });
  assert.equal(win.n, 3);
  assert.equal(typicalPrice({ flatType: 'EXECUTIVE', scope: scopeOf(null) }), null);
});

test(`fewer than ${TYPICAL_MIN_N} sales widens the scope one step and the result names the scope used`, () => {
  const fromArea = typicalPriceWidened({ flatType: '4 ROOM', scope: scopeOf({ area }) });  // area 3 sales → AMK 3 → island 10
  assert.equal(fromArea.scope.kind, 'island');
  assert.equal(fromArea.n, 10);
  const bishan = typicalPriceWidened({ flatType: '4 ROOM', scope: scopeOf({ towns: ['BISHAN'] }) });
  assert.equal(bishan.scope.label, 'Bishan');
  assert.equal(bishan.price, legacyMedian([700000, 710000, 720000, 730000, 740000, 750000]));
  // nothing anywhere ≥ min: the best (narrowest) result found is kept
  const three = typicalPriceWidened({ flatType: '3 ROOM', scope: scopeOf({ towns: ['ANG MO KIO'] }) });
  assert.equal(three.n, 1);
  assert.equal(three.scope.label, 'Ang Mo Kio');
});

test('effectiveFlat: the focus when it has a price; otherwise a labelled typical flat, never written to the store', () => {
  const real = { source: 'block', bid: 0, price: 650000, flatType: '4 ROOM' };
  assert.equal(effectiveFlat(store(real), null), real);
  const tf = effectiveFlat(store(null), { towns: ['BISHAN'], flatTypes: ['4 ROOM'] });
  assert.equal(tf.isDefault, true);
  assert.equal(tf.source, 'typical');
  assert.equal(tf.price, 725000);
  assert.equal(tf.label, 'Typical 4-room in Bishan');
  const keepType = effectiveFlat(store({ flatType: '3 ROOM', remainingLease: 70 }), null);   // no price: type + lease kept
  assert.equal(keepType.flatType, '3 ROOM');
  assert.equal(keepType.remainingLease, 70);
  // before the explore module has said anything: island-wide
  setSelection(null);
  assert.equal(effectiveFlat(store(null)).scope.kind, 'island');
});

test('the note names type, area, price and window, with a "Pick on the map" button', () => {
  const tf = effectiveFlat(store(null), { towns: ['BISHAN'] });
  const html = defaultNote(tf);
  assert.match(html, /class="default-note" role="note"/);
  assert.match(html, /Typical 4-room in Bishan: <b>S\$725,000<\/b> — pick a block to use a real one\./);
  assert.match(html, /Median of 6 sales, Dec 2025 – Nov 2026\./);
  assert.match(html, /data-act="pick-map"/);
  assert.equal(defaultNote({ price: 1 }), '');
  assert.equal(ftWord('EXECUTIVE'), 'Executive');
});

test('typical rent: area → n-weighted block figures; one town → town comps; several → weighted medians; island → all towns', () => {
  const a = typicalRent({ flatType: '4 ROOM', scope: scopeOf({ area }) }, policy);
  const direct = areaRentComps([HDB_RENTS.blocks[0], HDB_RENTS.blocks[1]], '4 ROOM', policy);
  if (direct) {
    assert.equal(a.tier, 'area');
    assert.equal(a.med, direct.med);
  } else assert.equal(a.tier, 'town');                                  // too few area rentals → the main town
  const one = typicalRent({ flatType: '4 ROOM', scope: scopeOf({ towns: ['BISHAN'] }) }, policy);
  assert.equal(one.med, 3450);
  const two = typicalRent({ flatType: '4 ROOM', scope: scopeOf({ towns: ['ANG MO KIO', 'BISHAN'] }) }, policy);
  assert.equal(two.med, (3150 * 40 + 3450 * 10) / 50);
  assert.equal(two.n, 50);
  assert.equal(two.label, 'average of 2 towns');
  const island = typicalRent({ flatType: '4 ROOM', scope: scopeOf(null) }, policy);
  const all = Object.keys(HDB_RENTS.towns).map((tw) => rentComps(null, '4 ROOM', policy, HDB_RENTS.towns[tw])).filter((c) => c && c.n > 0);
  assert.equal(island.n, all.reduce((s, c) => s + c.n, 0));
  assert.equal(island.med, all.reduce((s, c) => s + c.med * c.n, 0) / island.n);
  assert.equal(island.tier, 'towns');
});

test('area summary: median by flat type, main town, count', () => {
  const s = areaSummary([0, 1, 2]);
  assert.equal(s.byType['4 ROOM'].price, 620000);
  assert.equal(s.byType['4 ROOM'].n, 3);
  assert.equal(s.byType['3 ROOM'].n, 1);
  assert.equal(s.town, 'ANG MO KIO');
  assert.equal(s.n, 4);
});

test('the selection is remembered from the bus; the area event folds into it; keys change only with defaults', () => {
  bus.emit('explore:selection', { flatTypes: ['4 ROOM'], allTypes: false, towns: null, area: null, window: { from: months[2], to: months[13], months: 12 } });
  assert.deepEqual(lastSelection().flatTypes, ['4 ROOM']);
  const k0 = selectionKey(lastSelection());
  bus.emit('explore:area', area);
  assert.equal(lastSelection().area.label, '800 m circle');
  assert.notEqual(selectionKey(lastSelection()), k0);
  bus.emit('explore:area', null);
  assert.equal(selectionKey(lastSelection()), k0);
  setSelection(null);
});
