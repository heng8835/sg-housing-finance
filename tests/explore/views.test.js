// Saved map views (PA-09): capture → save → apply round trip, whitelist (no household data), validation, the cap of
// ten, list operations, partial views from Start here, markup + 中文.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_VIEWS, captureView, cleanView, applyView, cleanArea, cleanViews, addView, renameView, deleteView, isFull,
  viewSummary, viewsHtml, viewStrings,
} from '../../app/modules/explore/views.js';

const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const TOWNS = ['ANG MO KIO', 'BEDOK', 'BISHAN', 'TAMPINES', 'YISHUN'];
const D = { flatTypes: FT, towns: TOWNS };
const freshS = () => ({
  colorBy: 'price', chipLabel: 'block', ft: [3, 4, 5, 6], calcM: 12, hist: { from: 2017, to: 2026 },
  filt: { pmin: null, pmax: null, lmin: null, lmax: null, amin: null, amax: null, smin: null, smax: null, ymin: null, ymax: null },
  towns: [0, 1, 2, 3, 4], layers: { blocks: true, mrt: true, schools: true, parks: false, work: true, choices: true }, area: null, commuteHubs: [],
  profile: { income: 8800, cash: 120000, age: 33 }, choices: [{ id: 1, bid: 5, price: 650000, name: 'Our flat' }],
  workplaces: [{ id: 2, name: 'Office', lat: 1.3, lon: 103.8 }], views: [],
});
const busyS = () => ({
  ...freshS(), colorBy: 'psf', chipLabel: 'value', ft: [2, 3], calcM: 36, hist: { from: 2020, to: 2025 },
  filt: { ...freshS().filt, pmax: 700000, lmin: 70 }, towns: [1, 3], layers: { ...freshS().layers, mrt: false, parks: true },
  area: { type: 'circle', lat: 1.3521234, lon: 103.9441234, r: 1234.4 }, commuteHubs: ['raffles-place'],
});
const at = { center: { lat: 1.35, lng: 103.94 }, zoom: 15 };

test('capture keeps map settings only — never the household, shortlist or daily places', () => {
  const v = captureView(busyS(), { ...D, ...at });
  assert.deepEqual(Object.keys(v).sort(), ['area', 'calcM', 'center', 'chipLabel', 'colorBy', 'commuteMax', 'filt', 'ft', 'hist', 'hubs', 'layers', 'towns', 'v', 'zoom']); // commuteMax: B8
  const json = JSON.stringify(v);
  for (const secret of ['8800', '120000', 'Our flat', 'Office', '650000', 'profile', 'income', 'cash']) assert.ok(!json.includes(secret), secret);
  assert.deepEqual(v.ft, ['3 ROOM', '4 ROOM']);
  assert.deepEqual(v.towns, ['BEDOK', 'TAMPINES']);
  assert.deepEqual(v.center, [1.35, 103.94]);
  assert.deepEqual(v.area, { type: 'circle', lat: 1.35212, lon: 103.94412, r: 1234 });
  assert.equal(captureView(freshS(), { ...D, ...at }).towns, null); // all towns → null (new towns stay included)
});

test('round trip: capture → save (JSON) → apply on a fresh state → capture again is identical', () => {
  const src = busyS();
  const saved = addView([], captureView(src, { ...D, ...at }), 'East side', '2026-10-07T00:00:00.000Z');
  const stored = JSON.parse(JSON.stringify(saved.list));
  const dst = freshS();
  const to = applyView(dst, cleanViews(stored)[0].view, D);
  assert.deepEqual(to, { center: [1.35, 103.94], zoom: 15 });
  const again = captureView(dst, { ...D, center: { lat: to.center[0], lng: to.center[1] }, zoom: to.zoom });
  assert.deepEqual(cleanView(again), cleanView(captureView(src, { ...D, ...at })));
  assert.equal(again.v, 1);
  assert.deepEqual(dst.ft, [2, 3]); assert.deepEqual(dst.towns, [1, 3]); assert.equal(dst.filt.pmax, 700000);
  assert.equal(dst.profile.income, 8800); // untouched
  assert.equal(dst.choices.length, 1);
  // a view of all towns applies as all towns, even when the data has gained one
  const all = freshS(); all.towns = [0];
  applyView(all, { towns: null }, { ...D, towns: [...TOWNS, 'TENGAH'] });
  assert.deepEqual(all.towns, [0, 1, 2, 3, 4, 5]);
});

test('partial views (Start here hand-off) change only what they hold; unknown names and layers are skipped', () => {
  const S = busyS();
  assert.equal(applyView(S, { ft: ['4 ROOM', '5 ROOM', 'PENTHOUSE'], towns: ['BISHAN', 'NOWHERE'], colorBy: 'rent' }, D), null);
  assert.deepEqual(S.ft, [3, 4]);
  assert.deepEqual(S.towns, [2]);
  assert.equal(S.colorBy, 'rent');
  assert.equal(S.calcM, 36); assert.equal(S.filt.pmax, 700000); assert.equal(S.area.type, 'circle'); // kept
  applyView(S, { layers: { parks: false, bogus: true } }, D);
  assert.equal(S.layers.parks, false); assert.ok(!('bogus' in S.layers));
  applyView(S, { area: null }, D);
  assert.equal(S.area, null);
});

test('validation drops malformed fields', () => {
  assert.equal(cleanView(null), null);
  assert.deepEqual(cleanView({ center: [40, 2], zoom: 12 }), {});           // not Singapore
  assert.deepEqual(cleanView({ center: [1.35, 103.8], zoom: 99 }), {});     // zoom out of range
  assert.deepEqual(cleanView({ calcM: 7, colorBy: 'magic', chipLabel: 'x' }), {});
  assert.deepEqual(cleanView({ hist: { from: 2026, to: 2020 } }), {});
  assert.deepEqual(cleanView({ filt: { pmax: 'lots', lmin: 60 } }).filt.lmin, 60);
  assert.equal(cleanView({ filt: { pmax: 'lots' } }).filt.pmax, null);
  assert.equal(cleanArea({ type: 'circle', lat: 1.3, lon: 103.8, r: -5 }), null);
  assert.equal(cleanArea({ type: 'poly', pts: [[1.3, 103.8], [1.31, 103.8]] }), null);
  assert.deepEqual(cleanArea({ type: 'poly', pts: [[1.3, 103.8], [1.31, 103.8], [1.31, 103.81]] }).pts.length, 3);
  assert.deepEqual(cleanView({ hubs: ['a', 'b', 'c', 7] }).hubs, ['a', 'b']);
});

test(`at most ${MAX_VIEWS} views; rename / delete; blank names get a default`, () => {
  let list = [];
  for (let i = 0; i < MAX_VIEWS; i++) list = addView(list, captureView(freshS(), { ...D, ...at }), i ? `V${i}` : '  ', 'x').list;
  assert.equal(list.length, MAX_VIEWS);
  assert.equal(list[0].name, 'View 1');
  assert.equal(new Set(list.map((x) => x.id)).size, MAX_VIEWS);
  assert.ok(isFull(list));
  assert.equal(addView(list, {}, 'one more', 'x'), null);
  list = renameView(list, list[1].id, '  Near   parents  ');
  assert.equal(list[1].name, 'Near parents');
  assert.equal(renameView(list, list[1].id, '   ')[1].name, 'Near parents');
  list = deleteView(list, list[0].id);
  assert.equal(list.length, MAX_VIEWS - 1);
  const r = addView(list, {}, 'again', 'x');
  assert.equal(r.id, `v${MAX_VIEWS + 1}`); // ids are never reused
  assert.equal(cleanViews([...r.list, { id: 'bad' }, null, { id: 'v99', view: {} }]).length, MAX_VIEWS);
  assert.equal(addView([], {}, 'x'.repeat(80), 'x').list[0].name.length, 40);
});

test('markup: list with Apply / Rename / Delete, full state disables Save; summary line', () => {
  const v = captureView(busyS(), { ...D, ...at });
  assert.equal(viewSummary(cleanView(v)), '$ per sqft · 3 ROOM, 4 ROOM · 2 towns · circle · filters');
  const one = addView([], v, 'East <b>', 'x').list;
  const html = viewsHtml(one);
  assert.match(html, /data-v="apply" data-id="v1"/);
  assert.match(html, /data-v="rename"/);
  assert.match(html, /data-v="del"/);
  assert.match(html, /East &lt;b&gt;/);
  assert.match(viewsHtml(one, { editing: 'v1' }), /data-vform="rename:v1"/);
  assert.match(viewsHtml([], { saving: true }), /data-vform="save"/);
  let full = [];
  for (let i = 0; i < MAX_VIEWS; i++) full = addView(full, v, `n${i}`, 'x').list;
  assert.match(viewsHtml(full), /data-v="save" disabled/);
  assert.match(viewsHtml(full), /Up to 10 views/);
});

test('中文: every saved-view string is translated; new keys appear once in zh-explore.json', () => {
  const read = (n) => readFileSync(new URL(`../../app/i18n/${n}.json`, import.meta.url), 'utf8');
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(n))));
  assert.deepEqual(viewStrings().filter((s) => dict[s] == null), []);
  const raw = read('zh-explore');
  for (const s of ['Saved views', 'Save this view', 'Apply', 'View {0}']) assert.equal(raw.split(`\n  "${s}":`).length - 1, 1, s);
});
