// Phone overhaul Wave 0 (spec phone-overhaul.md §2.1, §2.3, §7): the pure state machine of modules/shell/phone.js —
// tap cycles up only (from full back to half), drag snaps to the nearest height or one step on a fling,
// 'phone:show-map' → Map tab + peek, 'sheet:size' compatibility — plus the Menu markup and 中文 coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIZES, MAP_TAB, HALF_SHARE, sheetHeights, stackPush, backKind, tapNext, sizeOf, stepSize, snapSize, initialState, reduce, keyboardHeight, uiStrings as phoneStrings } from '../../app/modules/shell/phone.js';
import { menuHtml, MENU_ROWS, uiStrings as menuStrings } from '../../app/modules/shell/menu.js';

const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const H = { peek: 128, half: 406, full: 700 };

test('tap on the handle cycles up only: peek → half → full, and full → half (never full → peek)', () => {
  assert.deepEqual(SIZES, ['peek', 'half', 'full']);
  assert.equal(tapNext('peek'), 'half');
  assert.equal(tapNext('half'), 'full');
  assert.equal(tapNext('full'), 'half');
  let s = initialState();
  assert.deepEqual(s, { tab: MAP_TAB, view: 'map', size: 'peek' });
  const seen = [];
  for (let i = 0; i < 5; i++) { s = reduce(s, { type: 'tap' }); seen.push(s.size); }
  assert.deepEqual(seen, ['half', 'full', 'half', 'full', 'half']);
});

test('keys on the handle step one height, clamped', () => {
  assert.equal(stepSize('peek', 1), 'half');
  assert.equal(stepSize('full', 1), 'full');
  assert.equal(stepSize('half', -1), 'peek');
  assert.equal(stepSize('peek', -1), 'peek');
  assert.equal(reduce({ ...initialState(), size: 'half' }, { type: 'step', dir: 1 }).size, 'full');
});

test('drag: a slow release snaps to the nearest height; a fling moves one height in its direction', () => {
  assert.equal(snapSize(150, H), 'peek');
  assert.equal(snapSize(300, H), 'half');
  assert.equal(snapSize(600, H), 'full');
  assert.equal(snapSize(150, H, -0.8), 'half', 'quick flick up from just above peek');
  assert.equal(snapSize(420, H, -0.8), 'full');
  assert.equal(snapSize(690, H, -0.8), 'full', 'nothing taller than full');
  assert.equal(snapSize(650, H, 0.9), 'half', 'quick flick down from near full');
  assert.equal(snapSize(390, H, 0.9), 'peek');
  assert.equal(snapSize(140, H, 0.9), 'peek');
  assert.equal(snapSize(300, H, 0.2), 'half', 'below the fling speed: nearest');
  assert.equal(reduce(initialState(), { type: 'drag', h: 640, heights: H, v: 0 }).size, 'full');
});

test('R-03: half = 55 % of the map area (not the viewport); peek = handle + 3 rem; nothing taller than the map', () => {
  assert.equal(HALF_SHARE, 0.55);
  assert.deepEqual(sheetHeights({ full: 480, rem: 20 }), { peek: 108, half: 264, full: 480 }, '360 x 640 Larger');
  assert.deepEqual(sheetHeights({ full: 700 }), { peek: 96, half: 385, full: 700 });
  assert.deepEqual(sheetHeights({ full: 80, rem: 20 }), { peek: 80, half: 44, full: 80 }, 'a tiny map area: peek clamps to it');
  const css = read('styles/base.css') + read('styles/phone.css');
  assert.match(css, /--sheet-half: 55%/);
  assert.match(css, /#mapSheet\[data-size="half"\] \{ height: 55%; height: var\(--sheet-half, 55%\); \}/);
  assert.match(css, /#mapwrap \.leaflet-bottom \{ bottom: calc\(var\(--sheet-peek\) \+ 8px\); \}/, 'R-02: + / − above the peek');
  assert.match(css, /#mapwrap\[data-sheet="half"\] \.leaflet-bottom \{ bottom: calc\(var\(--sheet-half\) \+ 8px\); \}/, 'R-02: and above half');
});

test('R-14: a view opened from the map takes the one map slot; a drill-down stacks; same id replaces', () => {
  const S = 'settings';
  assert.deepEqual(stackPush([S], 'area'), { stack: [S, 'area'], drop: [] });
  assert.deepEqual(stackPush([S, 'area'], 'blocks-here'), { stack: [S, 'blocks-here'], drop: ['area'] }, 'from the map: replaces');
  assert.deepEqual(stackPush([S, 'card', 'school'], 'map-pop'), { stack: [S, 'map-pop'], drop: ['school', 'card'] }, 'top first');
  assert.deepEqual(stackPush([S, 'blocks-here'], 'card', true), { stack: [S, 'blocks-here', 'card'], drop: [] }, 'drill-down');
  assert.deepEqual(stackPush([S, 'card', 'school'], 'card', true), { stack: [S, 'school', 'card'], drop: ['card'] });
  assert.deepEqual(stackPush([S, 'map-pop'], 'map-pop'), { stack: [S, 'map-pop'], drop: ['map-pop'] }, 'same id replaces');
  assert.equal(backKind([S]), null);
  assert.equal(backKind([S, 'area']), 'close', 'straight over Map settings: Close, not "Back to Map settings"');
  assert.equal(backKind([S, 'card', 'school']), 'back');
});

test('tabs: Map is the map view; every other tab is a full-screen page; the sheet height is kept', () => {
  let s = reduce(initialState(), { type: 'size', size: 'half' });
  for (const tab of ['afford', 'rent', 'plan', 'choices']) {
    const p = reduce(s, { type: 'tab', tab });
    assert.equal(p.view, 'page'); assert.equal(p.tab, tab); assert.equal(p.size, 'half');
  }
  s = reduce(reduce(s, { type: 'tab', tab: 'plan' }), { type: 'tab', tab: 'explore' });
  assert.deepEqual(s, { tab: 'explore', view: 'map', size: 'half' });
  assert.equal(reduce(s, { type: 'tab' }).view, 'map', 'no tab → Map');
});

test("'phone:show-map' → Map tab at peek (or the size asked for), from any page and sheet height", () => {
  const onPage = { tab: 'afford', view: 'page', size: 'full' };
  assert.deepEqual(reduce(onPage, { type: 'show-map' }), { tab: 'explore', view: 'map', size: 'peek' });
  assert.deepEqual(reduce(onPage, { type: 'show-map', size: 'half' }), { tab: 'explore', view: 'map', size: 'half' });
  assert.equal(reduce(onPage, { type: 'show-map', size: 'huge' }).size, 'peek');
});

test("'sheet:size' compatibility: 'peek' | { size } set the height; anything else is ignored", () => {
  assert.equal(sizeOf('full'), 'full');
  assert.equal(sizeOf({ size: 'half' }), 'half');
  for (const bad of [undefined, null, '', 'max', { size: 'x' }, 3]) assert.equal(sizeOf(bad), null);
  const s = initialState();
  assert.equal(reduce(s, { type: 'size', size: 'full' }).size, 'full');
  assert.equal(reduce(s, { type: 'size', size: { size: 'half' } }).size, 'half');
  assert.equal(reduce(s, { type: 'size', size: 'bogus' }), s, 'same state object');
  assert.equal(reduce(s, { type: 'nope' }), s);
});

test('keyboard height = layout viewport minus the visual viewport (never negative)', () => {
  assert.equal(keyboardHeight({ innerHeight: 812, vvHeight: 812 }), 0);
  assert.equal(keyboardHeight({ innerHeight: 812, vvHeight: 476, vvTop: 0 }), 336);
  assert.equal(keyboardHeight({ innerHeight: 812, vvHeight: 476, vvTop: 36 }), 300);
  assert.equal(keyboardHeight({ innerHeight: 500, vvHeight: 520 }), 0);
});

test('Menu: text size first (language and Simple / Pro are on the top bar), then the rows; sample rows follow the sample state; About uses [data-about]', () => {
  const off = menuHtml({ inSample: false }), on = menuHtml({ inSample: true });
  for (const slot of ['ts', 'menu-extra']) assert.match(off, new RegExp(`data-slot="${slot}"`));
  for (const slot of ['lang', 'mode']) assert.doesNotMatch(off, new RegExp(`data-slot="${slot}"`));
  assert.ok(off.indexOf('data-slot="ts"') < off.indexOf('class="pm-go"'), 'text size is the first row');
  const acts = (h) => [...h.matchAll(/class="pm-go" data-act="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(acts(off), ['guides', 'learn', 'sample', 'start', 'about']);
  assert.deepEqual(acts(on), ['guides', 'learn', 'samples', 'exit', 'start', 'about']);
  assert.match(off, /data-act="about" data-about>/);
  assert.match(off, /<h2 id="menuTitle">SG Housing &amp; Finance<\/h2>/);
  assert.equal(MENU_ROWS.length, 7);
  assert.doesNotMatch(off, /pm-ext/, 'no Support row without a donate URL');
  const kofi = menuHtml({ donate: 'https://ko-fi.com/someone' });
  assert.match(kofi, /<a class="pm-go pm-ext" href="https:\/\/ko-fi\.com\/someone" target="_blank" rel="noopener">Support this project ☕<\/a><\/li>\s*<\/ul>/, 'Support is the last row, opens Ko-fi in a new tab');
  assert.deepEqual(acts(kofi), ['guides', 'learn', 'sample', 'start', 'about'], 'not a [data-act] row');
});

test('phone shell markup: viewport, tab bar ids, sheet host, page slots, phone.css last; mobile.js is gone', () => {
  const html = read('index.html');
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"/);
  assert.ok(html.lastIndexOf('styles/phone.css') > html.lastIndexOf('styles/textsize.css'), 'phone.css is loaded last');
  for (const tab of ['explore', 'afford', 'rent', 'plan', 'choices']) assert.equal((html.match(new RegExp(`id="tabbtn-${tab}"`, 'g')) || []).length, 1, `one #tabbtn-${tab}`);
  assert.doesNotMatch(html, /id="phoneAa"|tsPop/, 'no Aa button: text size lives in the Menu');
  for (const id of ['mapSheet', 'tabbar', 'phoneMenu', 'choicesView']) assert.match(html, new RegExp(`id="${id}"[^>]* hidden|id="${id}"[^>]*hidden`), `#${id} hidden until phone.css shows it`);
  assert.equal((html.match(/class="page-head" hidden/g) || []).length, 4, 'a title slot on each page tab');
  assert.equal((html.match(/class="page-ctx" hidden/g) || []).length, 4, 'an empty context-line slot under each title');
  assert.equal((html.match(/class="tl-short" hidden data-i18n="[^"]+ \(phone tab\)"/g) || []).length, 5, 'short phone labels');
  const main = read('main.js');
  assert.match(main, /mountPhone\(\{ bus \}\)/); assert.match(main, /mountMenu\(\{ store, bus \}\)/);
  assert.doesNotMatch(main, /mobile\.js/);
});

test('中文: every phone shell string is translated', () => {
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))));
  const html = read('index.html');
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  const statics = ['Menu', 'List', 'Compare', 'Tour', 'Map sheet', 'Pages', 'Show my choices as', 'Text size'];
  for (const s of [...phoneStrings(), ...menuStrings(), ...keys, ...statics]) assert.ok(dict[s], `missing 中文: ${s}`);
});
