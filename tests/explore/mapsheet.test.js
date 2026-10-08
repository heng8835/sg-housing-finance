// Phone map sheet (phone overhaul §2.3, §3.2; F4, F5; P-20, P-21, P-22, P-23): the pure helpers in
// app/modules/explore/mapsheet.js, the tap wording in blocks.js legendHtml, and 中文 for every new string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { peekSummary, peekLegend, collapseOnMap, blocksNear, groupLayers, LAYER_GROUPS, TAP_NOTES, tipLine, kindLabel, NEAR_PX, NEAR_MORE_THAN, uiStrings } from '../../app/modules/explore/mapsheet.js';
import { legendHtml, quantileScale } from '../../app/modules/explore/blocks.js';

const tr = (s, v) => (v ? s.replace(/\{(\d+)\}/g, (m, k) => v[k]) : s);

test('F4 peek line: colour · period · flat types (two by name, more as a count); rent / commute have no price window', () => {
  assert.equal(peekSummary({ mode: 'price', period: '1 year', types: ['4 ROOM', '5 ROOM'], tr }), 'Price · last 1 year · 4 ROOM, 5 ROOM');
  assert.equal(peekSummary({ mode: 'psf', period: '2 years', types: ['3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE'], tr }), '$ per sqft · last 2 years · 4 flat types');
  assert.equal(peekSummary({ mode: 'price', period: '1 year', types: ['1 ROOM'], allTypes: true, tr }), 'Price · last 1 year · All flat types');
  assert.equal(peekSummary({ mode: 'rent', period: '1 year', types: ['4 ROOM'], tr }), 'Median rent · 4 ROOM');
  assert.equal(peekSummary({ mode: 'commute', period: '1 year', types: [], tr }), 'Commute time · No flat types picked');
  assert.equal(peekSummary({ mode: 'nope', period: '1 year', types: ['4 ROOM'], tr }), 'Price · last 1 year · 4 ROOM');
});

test('peek colour key: the ramp as one inline strip (no second line); budget = 3 swatches; nothing without a scale', () => {
  const s = quantileScale([300000, 400000, 500000, 600000, 1500000]);
  const html = peekLegend({ mode: 'price', scale: s });
  assert.equal((html.match(/<i style/g) || []).length, 5); assert.match(html, /^<span class="ms-ramp" aria-hidden="true">/);
  assert.doesNotMatch(html, /<div|<p/);
  const b = peekLegend({ mode: 'budget', scale: s, budget: { colors: { within: '#1', near: '#2', over: '#3' } } });
  assert.equal((b.match(/<i style/g) || []).length, 3);
  assert.equal(peekLegend({ mode: 'price', scale: null }), '');
});

test('map first: a map tap collapses the sheet unless that tap changed the sheet or a circle / pick is running', () => {
  assert.equal(collapseOnMap({ changedSince: false, busy: false }), true);
  assert.equal(collapseOnMap({ changedSince: true, busy: false }), false);
  assert.equal(collapseOnMap({ changedSince: false, busy: true }), false);
  assert.equal(collapseOnMap({ changedSince: false, busy: false, sincePush: 120 }), false, 'R-04: the tap that pushed a view');
  assert.equal(collapseOnMap({ changedSince: false, busy: false, sincePush: 400 }), true);
});

test('P-20 "Blocks here": ids within 30 px of the tap, nearest first; the list shows only above 3', () => {
  const items = [{ id: 1, x: 100, y: 100 }, { id: 2, x: 110, y: 100 }, { id: 3, x: 100, y: 129 }, { id: 4, x: 131, y: 100 }, { id: 5, x: 95, y: 104 }];
  assert.deepEqual(blocksNear(items, { x: 100, y: 100 }), [1, 5, 2, 3]); // 4 is 31 px away
  assert.equal(NEAR_PX, 30); assert.equal(NEAR_MORE_THAN, 3);
  assert.deepEqual(blocksNear(items, { x: 0, y: 0 }), []);
  assert.deepEqual(blocksNear([{ id: 9, x: 0, y: 0 }, { id: 7, x: 0, y: 0 }], { x: 0, y: 0 }), [7, 9]); // ties: stable by id
});

test('F5: every index.html layer sits in exactly one group; 5 headings in order; unknown keys stay in the first group', () => {
  const html = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-l="([a-z]+)"/g)].map((m) => m[1]);
  const all = LAYER_GROUPS.flatMap((g) => g.keys);
  assert.equal(new Set(all).size, all.length, 'no key in two groups');
  for (const k of keys) assert.ok(all.includes(k), `layer ${k} has no group`);
  assert.deepEqual(LAYER_GROUPS.map((g) => g.h).filter(Boolean), ['Transport', 'Schools and children', 'Shops and food', 'Health and care', 'Places some avoid']);
  const g = groupLayers([...keys.filter((k) => k !== 'bto'), 'newlayer']);
  assert.equal(g[0].h, null); assert.ok(g[0].keys.includes('newlayer')); assert.ok(!g[0].keys.includes('bto'));
  assert.equal(g.flatMap((x) => x.keys).length, keys.length); // bto out, newlayer in
  assert.deepEqual(groupLayers(['mrt']), [{ h: 'Transport', keys: ['mrt'] }]); // empty groups dropped
});

test('P-22 / P-21: tap notes match index.html; search kinds are plain words; POI tooltip → one line', () => {
  const html = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8').replace(/&amp;/g, '&');
  for (const [k, [desk, tap]] of Object.entries(TAP_NOTES)) {
    assert.ok(html.includes(desk), `index.html note for ${k} changed`);
    assert.doesNotMatch(tap, /click|hover/i);
  }
  assert.equal(kindLabel('mrt'), 'MRT'); assert.equal(kindLabel('block'), 'Block'); assert.equal(kindLabel('other'), 'other');
  assert.equal(tipLine('<div class="poi-tip"><b>Fernvale Primary</b><br>Government school</div>'), '<b>Fernvale Primary</b> · Government school');
});

test('legend: "Click any block." on desktop, "Tap any block." on phones (no hover wording)', () => {
  const base = { scale: quantileScale([1, 2, 3, 4, 5]), mode: 'price', label: 'x', fmt: String, t: tr, simple: true, zoomedIn: true, chipLabel: 'Price' };
  const desk = legendHtml(base), phone = legendHtml({ ...base, tap: true });
  assert.match(desk, /Click any block\./); assert.match(desk, /Hover for the exact value\./);
  assert.match(phone, /Tap any block\./); assert.doesNotMatch(phone, /click|hover/i);
});

test('中文: every new map-sheet / legacy phone string has an entry (zh files or slice A staging)', () => {
  const read = (f) => { const u = new URL(`../../app/i18n/${f}`, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : {}; };
  const zh = Object.assign({}, read('zh.json'), read('zh-explore.json'), read('staging/A.zh-explore.json'));
  const legacyPhone = ['tap a service to draw its whole route', 'position from URA Master Plan 2025 · tap a line to draw it', 'tap a line to draw all its stations',
    'Tap the map where this place is', 'tap a nearby blue block to add a flat', 'Zoom in close, or circle an area, to see prices for it. Uses the flat types, period and More filters.',
    'Tap the centre of the area, then tap again where the edge should be', 'median {0} · {1} sales', 'Tap any block.', 'Box labels show {0}, rounded. Tap a block for the exact value.'];
  const missing = [...uiStrings(), ...legacyPhone].filter((s) => !zh[s]);
  assert.deepEqual(missing, []);
  for (const s of [...uiStrings(), ...legacyPhone]) for (const m of s.match(/\{\d\}/g) || []) assert.ok(zh[s].includes(m), `${s}: ${m}`);
  for (const s of legacyPhone) assert.doesNotMatch(zh[s], /点击/, 'phones say 点按');
});
