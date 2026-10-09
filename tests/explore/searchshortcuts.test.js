// M-13 map search shortcuts: rows from local data only, grouped, capped; towns only when they are a real pick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchShortcuts, groupHead, SHORTCUT_MAX } from '../../app/modules/explore/searchshortcuts.js';

const TOWNS = ['ANG MO KIO', 'BEDOK', 'BISHAN', 'TAMPINES'];
const base = { townCount: TOWNS.length, townName: (i) => TOWNS[i], choiceSub: (c) => `4-room · S$${c.price}` };

test('empty data → no rows (the list stays closed)', () => {
  assert.deepEqual(searchShortcuts(), []);
  assert.deepEqual(searchShortcuts({ ...base, towns: [0, 1, 2, 3] }), [], 'all towns = no pick');
});

test('your flats, daily places, picked towns — in that order, with the search\'s own kinds', () => {
  const rows = searchShortcuts({
    ...base,
    choices: [{ id: 1, bid: 12, name: 'Fernvale 4-room', price: 600000 }, { id: 2, bid: null, name: 'broken' }],
    places: [{ id: 1, name: 'Office', label: 'Raffles Place MRT', lat: 1.28, lon: 103.85 }, { id: 2, name: 'no coords' }],
    towns: [3, 1, 99],
  });
  assert.deepEqual(rows.map((r) => [r.group, r.kind, r.label]), [
    ['Your choices ({0})'.replace('{0}', '1'), 'block', 'Fernvale 4-room'],
    ['Your daily places', 'place', 'Office'],
    ['Your towns', 'town', 'TAMPINES'],
    ['Your towns', 'town', 'BEDOK'],
  ]);
  assert.equal(rows[0].i, 12); assert.equal(rows[0].sub, '4-room · S$600000');
  assert.deepEqual(rows[1].p, { lat: 1.28, lon: 103.85 }); assert.equal(rows[1].sub, 'Raffles Place MRT');
  assert.equal(rows[2].i, 3);
  assert.equal(searchShortcuts({ ...base, choices: [{ bid: 5, name: 'x' }], hasBlock: () => false }).length, 0, 'a block gone from the data is skipped');
});

test('capped per group; the count in the heading is the full count', () => {
  const choices = Array.from({ length: 12 }, (_, i) => ({ id: i, bid: i, name: `F${i}`, price: 1 }));
  const rows = searchShortcuts({ ...base, choices });
  assert.equal(rows.length, SHORTCUT_MAX.choices);
  assert.equal(rows[0].group, 'Your choices (12)');
});

test('groupHead: one escaped heading at the start of each group, not a div (rows are div[data-i])', () => {
  const items = [{ group: 'A <b>' }, { group: 'A <b>' }, { group: 'B' }, { kind: 'town' }];
  assert.equal(groupHead(items, 0), '<p class="ac-group">A &lt;b&gt;</p>');
  assert.equal(groupHead(items, 1), '');
  assert.equal(groupHead(items, 2), '<p class="ac-group">B</p>');
  assert.equal(groupHead(items, 3), '', 'search results have no group');
});

test('privacy: the shortcuts module sends nothing (no fetch / storage / URL)', () => {
  const src = readFileSync(new URL('../../app/modules/explore/searchshortcuts.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|location\.|history\./);
});
