// Phase 8 wave 8c — Map settings (mobile-revamp-ideas.md §3 M-03, M-04, M-10): the pure helpers in
// app/modules/explore/mapsettings.js, the peek line with filters, the "Prices from the last" seg, and 中文.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupLine, groupToggle, shortMoney, filterParts, filterWords, flatsLine, uiStrings } from '../../app/modules/explore/mapsettings.js';
import { peekSummary, LAYER_GROUPS } from '../../app/modules/explore/mapsheet.js';
import { CALC_OPTIONS } from '../../app/modules/explore/period.js';

const tr = (s, v) => (v ? s.replace(/\{(\d+)\}/g, (m, k) => v[k]) : s);
const html = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8');

test('M-03 group line: mixed state in words, never an icon', () => {
  assert.equal(groupLine(3, 3, tr), 'All on');
  assert.equal(groupLine(0, 4, tr), 'Off');
  assert.equal(groupLine(2, 3, tr), '2 of 3 on');
  assert.equal(groupLine(0, 0, tr), ''); // a group with no rows (data missing) shows nothing
});

test('M-03 group switch: all on → all off; part on or off → all on; only the members change', () => {
  assert.deepEqual(groupToggle(['mrt', 'futmrt', 'bus'], { mrt: true, futmrt: true, bus: true, blocks: true }), { mrt: false, futmrt: false, bus: false });
  assert.deepEqual(groupToggle(['mrt', 'futmrt', 'bus'], { mrt: true, futmrt: true, bus: false }), { mrt: true, futmrt: true, bus: true });
  assert.deepEqual(groupToggle(['malls', 'food'], {}), { malls: true, food: true });
  assert.deepEqual(groupToggle([], {}), {});
});

test('M-03: the sensitive group is "Places some avoid" (Q4); groups never use data-l, so saved views keep the same keys', () => {
  assert.equal(LAYER_GROUPS.at(-1).h, 'Places some avoid');
  assert.deepEqual(LAYER_GROUPS.at(-1).keys, ['funeral', 'sites', 'flood']);
  const src = readFileSync(new URL('../../app/modules/explore/mapsettings.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /<input[^>]*data-l=/, 'group rows must not carry a data-l attribute');
  assert.match(src, /data-lg=/);
  assert.match(src, /stopPropagation\(\)/, 'the group switch never reaches legacy\'s #layers change listener');
});

test('M-04 filter words: price as ≤ / ≥ / range, lease floor, then area, storey, built', () => {
  assert.equal(shortMoney(700000), 'S$700k'); assert.equal(shortMoney(1200000), 'S$1.2M'); assert.equal(shortMoney(1000000), 'S$1M');
  assert.deepEqual(filterParts({}, tr), []);
  assert.deepEqual(filterParts({ pmax: 700000, lmin: 70 }, tr), ['≤ S$700k', 'lease ≥ 70 y']);
  assert.deepEqual(filterParts({ pmin: 300000, pmax: 1200000 }, tr), ['S$300k–S$1.2M']);
  assert.deepEqual(filterParts({ pmin: 300000, lmax: 90, amin: 90, smax: 10, ymin: 1990 }, tr), ['≥ S$300k', 'lease ≤ 90 y', '≥ 90 sqm', 'storey ≤ 10', 'built from 1990']);
  assert.deepEqual(filterParts({ pmin: null, pmax: null, lmin: null }, tr), []);
});

test('M-04 summary: two parts by name, the rest as "N more filters" (no count badge)', () => {
  assert.deepEqual(filterWords({ pmax: 700000, lmin: 70 }, tr), ['≤ S$700k', 'lease ≥ 70 y']);
  assert.deepEqual(filterWords({ pmax: 700000, lmin: 70, amin: 90 }, tr), ['≤ S$700k', 'lease ≥ 70 y', '1 more filter']);
  assert.deepEqual(filterWords({ pmax: 700000, lmin: 70, amin: 90, smin: 5 }, tr), ['≤ S$700k', 'lease ≥ 70 y', '2 more filters']);
  assert.equal(flatsLine({ types: ['4-room', '5-room'], filt: { pmax: 700000, lmin: 70 }, towns: [26, 26], tr }), '4-room, 5-room · ≤ S$700k · lease ≥ 70 y');
  assert.equal(flatsLine({ types: ['4-room'], filt: {}, towns: [3, 26], tr }), '4-room · 3 of 26 towns');
  assert.equal(flatsLine({ types: ['a', 'b', 'c'], allTypes: true, tr }), 'All flat types');
  assert.equal(flatsLine({ types: [], tr }), 'No flat types picked');
  assert.equal(flatsLine({ types: ['a', 'b', 'c'], tr }), '3 flat types');
});

test('M-04 peek line: filters in words after the flat types; unchanged without filters', () => {
  assert.equal(peekSummary({ mode: 'price', period: '1 year', types: ['4-room'], tr }), 'Price · last 1 year · 4-room');
  assert.equal(peekSummary({ mode: 'price', period: '1 year', types: ['4-room'], filt: {}, tr }), 'Price · last 1 year · 4-room');
  assert.equal(peekSummary({ mode: 'price', period: '1 year', types: ['4-room'], filt: { pmax: 700000 }, tr }), 'Price · last 1 year · 4-room · ≤ S$700k');
});

test('M-10: "Prices from the last" is a seg of the 4 window options (radiogroup, one checked), no select', () => {
  const m = html.match(/<div class="seg" id="calcWin"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(m, '#calcWin is a .seg');
  assert.match(m[0], /role="radiogroup"/);
  const vals = [...m[1].matchAll(/data-v="(\d+)"/g)].map((x) => +x[1]);
  assert.deepEqual(vals, CALC_OPTIONS);
  assert.equal((m[1].match(/aria-checked="true"/g) || []).length, 1);
  assert.doesNotMatch(html, /<select id="calcWin"/);
});

test('M-03 / M-04 / M-10: no new transitions or animations in the 8c CSS block', () => {
  const css = readFileSync(new URL('../../app/styles/base.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* P8 8c'));
  assert.ok(block.length > 100);
  assert.doesNotMatch(block, /transition|animation/);
  assert.doesNotMatch(block, /#[0-9a-f]{3,6}\b/i, 'colours only through tokens');
});

test('中文: every new string has an entry, placeholders kept; phones never say click', () => {
  const zh = JSON.parse(readFileSync(new URL('../../app/i18n/zh-explore.json', import.meta.url), 'utf8'));
  assert.deepEqual(uiStrings().filter((s) => !zh[s]), []);
  for (const s of uiStrings()) for (const m of s.match(/\{\d\}/g) || []) assert.ok(zh[s].includes(m), `${s}: ${m}`);
  assert.doesNotMatch(uiStrings().join(' '), /click|hover/i);
});
