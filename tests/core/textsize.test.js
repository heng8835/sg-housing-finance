// Phase 7 B10 text size: Normal / Large / Larger stored in sghf:v2 ui.textSize, applied as classes on <html>, offered on
// "You're set" (never switched on without a tap), and every app font size in rem so one token (--fs-base) scales it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createStore, defaults, STORE_KEY } from '../../app/core/store.js';
import { TEXT_SIZES, textSizeOf, textSizeClasses, applyTextSize, bindTextSize, textSizeSwitch, uiStrings } from '../../app/core/textsize.js';
import { doneHtml, textOfferHtml } from '../../app/modules/start/view.js';
import { routeFor } from '../../app/modules/start/answers.js';

const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const fakeRoot = () => { const set = new Set(); return { set, dataset: {}, classList: { toggle: (c, on) => (on ? set.add(c) : set.delete(c)) } }; };

test('sizes: unknown values read as Normal; classes ts-large / ts-larger, ts-big for both', () => {
  assert.deepEqual(TEXT_SIZES, ['normal', 'large', 'larger']);
  for (const v of [undefined, null, '', 'huge', 3]) assert.equal(textSizeOf(v), 'normal');
  assert.deepEqual(textSizeClasses('normal'), { 'ts-large': false, 'ts-larger': false, 'ts-big': false });
  assert.deepEqual(textSizeClasses('large'), { 'ts-large': true, 'ts-larger': false, 'ts-big': true });
  assert.deepEqual(textSizeClasses('larger'), { 'ts-large': false, 'ts-larger': true, 'ts-big': true });
  const r = fakeRoot();
  assert.equal(applyTextSize('larger', r), 'larger');
  assert.deepEqual([...r.set].sort(), ['ts-big', 'ts-larger']); assert.equal(r.dataset.textSize, 'larger');
  applyTextSize('bogus', r);
  assert.deepEqual([...r.set], []); assert.equal(r.dataset.textSize, 'normal');
});

test('persistence: default Normal; a change is saved in sghf:v2 ui.textSize and applied; older saves gain Normal', () => {
  assert.equal(defaults().ui.textSize, 'normal');
  const storage = memory({ [STORE_KEY]: JSON.stringify({ schemaVersion: 1, household: {}, ui: { mode: 'pro' } }) });
  const store = createStore({ storage }), root = fakeRoot();
  assert.equal(store.get('ui.textSize'), 'normal', 'older save without textSize');
  bindTextSize(store, root);
  assert.deepEqual([...root.set], [], 'Normal: no class — nothing switched on by itself');
  store.set('ui.textSize', 'large');
  assert.equal(JSON.parse(storage.map.get(STORE_KEY)).ui.textSize, 'large');
  assert.deepEqual([...root.set].sort(), ['ts-big', 'ts-large']);
  store.set('ui.mode', 'simple'); // other ui changes leave the size alone
  assert.deepEqual([...root.set].sort(), ['ts-big', 'ts-large']);
  const again = createStore({ storage }), root2 = fakeRoot();
  bindTextSize(again, root2);
  assert.deepEqual([...root2.set].sort(), ['ts-big', 'ts-large'], 'remembered after a reload');
});

test('switch: three buttons, one aria-pressed, a group name, sizes as accessible names', () => {
  const html = textSizeSwitch('large', { cls: 'ts-header' });
  assert.match(html, /^<div class="seg ts-switch ts-header" role="group" aria-label="Text size">/);
  assert.deepEqual([...html.matchAll(/data-ts="(\w+)" aria-pressed="(\w+)"/g)].map((m) => [m[1], m[2]]), [['normal', 'false'], ['large', 'true'], ['larger', 'false']]);
  assert.deepEqual([...html.matchAll(/aria-label="([^"]+)"><span/g)].map((m) => m[1]), ['Normal text', 'Large text', 'Larger text']);
  assert.equal((html.match(/<button type="button"/g) || []).length, 3, 'native buttons: Tab / Enter / Space');
});

test('"You\'re set" offers Large / Larger (pressed state from the store); nothing is switched on by the screen', () => {
  const route = routeFor({ goal: 'retire', towns: [] }, []);
  const off = doneHtml({ goal: 'retire', towns: [], buyers: null, ages: [], residency: [] }, null, route, { tourTitle: 'x' });
  assert.match(off, /Bigger text\?/);
  assert.deepEqual([...off.matchAll(/data-st-ts="(\w+)" aria-pressed="(\w+)"/g)].map((m) => [m[1], m[2]]), [['large', 'false'], ['larger', 'false']]);
  assert.match(textOfferHtml('larger'), /data-st-ts="larger" aria-pressed="true"/);
  assert.match(off, /role="group" aria-labelledby="stTsLbl"/);
  const start = read('modules/start/index.js');
  assert.match(start, /if \(d\.stTs\) \{ store\.set\('ui\.textSize'/, 'set only from the click handler');
  assert.equal((start.match(/ui\.textSize/g) || []).length, 3, 'read for the pressed state, written on a tap — nowhere else');
});

test('CSS: every app font size is rem except header chrome, map markers, the switch glyphs and the A4 brief; one --fs-base token', () => {
  const allowed = /(^|[\s,>(])header\b|\.hh-chip|#guideBtn|\.pin\b|\.work-pin|\.route-lbl|#panelToggle|#boot|\.ts-switch|\.leaflet-control-zoom|svg\[font-size/;
  const bad = [];
  for (const f of readdirSync(new URL('styles/', APP)).filter((x) => x.endsWith('.css') && x !== 'brief.css')) {
    const s = read(`styles/${f}`);
    for (const m of s.matchAll(/font-size:\s*[\d.]+px/g)) {
      const brace = s.lastIndexOf('{', m.index), start = Math.max(s.lastIndexOf('}', brace), s.lastIndexOf('{', brace - 1), s.lastIndexOf(';', brace)) + 1;
      const sel = s.slice(start, brace).trim();
      if (!allowed.test(sel)) bad.push(`${f}: ${sel} ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
  const base = read('styles/base.css'), ts = read('styles/textsize.css');
  assert.match(base, /html \{ font-size: var\(--fs-base, 14px\); \}/);
  assert.match(ts, /:root \{ --fs-base: 14px; \}/);
  assert.match(ts, /:root\.ts-large \{ --fs-base: 16px;/);
  assert.match(ts, /:root\.ts-larger \{ --fs-base: 18px;/);
  assert.match(ts, /\.ts-big \.btn, \.ts-big \.seg button[^{]*\{ min-height: 44px; \}/, 'tap targets ≥ 44 px in Large+');
  const html = read('index.html');
  assert.ok(html.indexOf('styles/textsize.css') > html.indexOf('styles/offline.css'), 'textsize.css is loaded last');
  assert.doesNotMatch(html, /style="[^"]*font-size:\s*\d+px/, 'no inline px font sizes in the page');
  assert.doesNotMatch(read('modules/shell/textsize.js') + read('core/textsize.js'), /localStorage|fetch\(/, 'the choice lives in the store only');
});

// phone overhaul: on phones the text size lives in the top bar's Aa button (and the Menu), no longer in Learn
const OFFER_LINE = 'Easier to read and tap. Change it any time with the text size switch at the top (Aa on a phone).';
test('中文: the text-size strings are translated (strings staged by parallel agents count until merged)', () => {
  const staging = new URL('i18n/staging/', APP);
  const staged = existsSync(staging) ? readdirSync(staging).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read(`i18n/staging/${f}`))) : [];
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))), ...staged);
  for (const s of [...uiStrings(), 'Bigger text?', OFFER_LINE]) assert.ok(dict[s], `missing 中文: ${s}`);
  assert.ok(textOfferHtml('normal').includes(OFFER_LINE), 'the offer names the Aa button, not Learn');
  assert.doesNotMatch(textOfferHtml('normal'), /in Learn on a phone/);
});
