// Guided tour (app/modules/guide/*): content shape, selectors that can resolve (or degrade with a note),
// 中文 coverage in i18n/zh-guide.json, and the pure coach-mark geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USE_CASES, stepsFor, contentStrings } from '../../app/modules/guide/steps.js';
import { placePop, holeRect, dockSide, intersect, isoDay, EDGE } from '../../app/modules/guide/place.js';
import { TAB_TOURS } from '../../app/modules/guide/index.js';

const APP = new URL('../../app/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, APP), 'utf8');
const TABS = ['explore', 'afford', 'rent', 'plan', 'choices'];

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}
const modulesDir = fileURLToPath(new URL('modules/', APP));
const guideDir = join(modulesDir, 'guide');
const appSource = [read('index.html'), ...jsFiles(modulesDir).filter((p) => !p.startsWith(guideDir)).map((p) => readFileSync(p, 'utf8'))].join('\n');
const guideSource = jsFiles(guideDir).map((p) => readFileSync(p, 'utf8')).join('\n');
const zhFile = JSON.parse(read('i18n/zh-guide.json'));
// 7b: parallel agents stage new strings in i18n/staging/<AGENT>.zh-guide.json until the integrator merges them
const stagingDir = new URL('i18n/staging/', APP);
const staged = (() => { try { return readdirSync(stagingDir).filter((f) => f.endsWith('.zh-guide.json')).map((f) => JSON.parse(readFileSync(new URL(f, stagingDir), 'utf8'))); } catch { return []; } })();
const zh = Object.assign({}, zhFile, ...staged);

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does the app markup / module code create something this selector can match? (ids and classes only) */
function exists(sel) {
  const ids = [...sel.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
  const classes = [...sel.replace(/\[[^\]]*\]/g, '').matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);
  const attrs = [...sel.matchAll(/\[([\w-]+)="([^"]+)"\]/g)].map((m) => `${m[1]}="${m[2]}"`);
  if (!ids.length && !classes.length && !attrs.length) return false;
  return ids.every((id) => new RegExp(`id\\s*=\\s*["'\`]${reEsc(id)}["'\`]`).test(appSource))
    && classes.every((c) => new RegExp(`class(Name)?\\s*=\\s*["'\`][^"'\`]*\\b${reEsc(c)}\\b`).test(appSource))
    && attrs.every((a) => appSource.includes(a));
}

test('seven use cases with unique ids, title + blurb, 4–7 steps each', () => {
  const ids = USE_CASES.map((u) => u.id);
  assert.deepEqual(ids, ['firstResale', 'btoVsResale', 'sellBuy', 'renting', 'retire', 'shortlist', 'map']);
  assert.equal(new Set(ids).size, ids.length);
  for (const u of USE_CASES) {
    assert.ok(u.title && u.blurb, u.id);
    assert.ok(u.steps.length >= 4 && u.steps.length <= 7, `${u.id}: ${u.steps.length} steps`);
    assert.ok(stepsFor(u, false).length >= 4, `${u.id} still has ≥ 4 steps on a phone`);
  }
});

test('every step has a selector, title and body; tab / fallback / when are well formed', () => {
  for (const u of USE_CASES) {
    for (const [i, s] of u.steps.entries()) {
      const where = `${u.id} step ${i + 1}`;
      assert.equal(typeof s.target, 'string', where); assert.ok(s.target.trim(), where);
      assert.ok(typeof s.title === 'string' && s.title.trim(), where);
      assert.ok(typeof s.body === 'string' && s.body.trim(), where);
      if (s.tab != null) assert.ok(TABS.includes(s.tab), `${where}: tab ${s.tab}`);
      if (s.fallback != null) assert.ok(Array.isArray(s.fallback) && s.fallback.every((f) => typeof f === 'string' && f.trim()), where);
      if (s.when != null) assert.equal(s.when, 'desktop', where);
      if (s.ifMissing != null) assert.ok(typeof s.ifMissing === 'string' && s.ifMissing.trim(), where);
      if (s.bodyIfMissing != null) assert.ok(typeof s.bodyIfMissing === 'string' && s.bodyIfMissing.trim() && s.fallback?.length, where);
    }
  }
});

test('each step can resolve a target or fallback that the app creates — otherwise it carries an ifMissing note', () => {
  for (const u of USE_CASES) {
    for (const [i, s] of u.steps.entries()) {
      const ok = [s.target, ...(s.fallback || [])].some(exists) || !!s.ifMissing;
      assert.ok(ok, `${u.id} step ${i + 1}: nothing in the app matches ${s.target}`);
    }
  }
});

test('desktop-only steps are dropped on narrow screens', () => {
  const map = USE_CASES.find((u) => u.id === 'map');
  assert.equal(stepsFor(map, true).length, map.steps.length);
  assert.equal(stepsFor(map, false).length, map.steps.length - 1);
  assert.ok(!stepsFor(map, false).some((s) => s.when === 'desktop'));
});

test('every tour string has a 中文 entry (zh-guide.json), keeps its {n} placeholders, uses 您 not 你', () => {
  const literals = [...guideSource.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2].replace(/\\(['"\\])/g, '$1'));
  const keys = [...new Set([...contentStrings(), ...literals])];
  assert.ok(literals.includes('Step {0} of {1}') && literals.includes('Skip tour'), 'chrome strings found');
  const missing = keys.filter((k) => !(k in zh));
  assert.deepEqual(missing, []);
  for (const k of keys) {
    const v = zh[k];
    assert.ok(typeof v === 'string' && /[\u4e00-\u9fff]/.test(v), `zh for "${k}"`);
    assert.deepEqual((v.match(/\{\d+\}/g) || []).sort(), (k.match(/\{\d+\}/g) || []).sort(), `placeholders in "${k}"`);
    assert.ok(!v.includes('你'), `use 您 in "${k}"`);
  }
  const unused = Object.keys(zhFile).filter((k) => !keys.includes(k));
  assert.deepEqual(unused, [], 'no orphan entries in zh-guide.json');
});

test('popover goes right of the target first, then below / above / left, centred without a target', () => {
  const vw = 1280, vh = 800, pw = 300, ph = 180;
  const panelTarget = { left: 20, top: 200, right: 400, bottom: 240 };
  const r = placePop(panelTarget, pw, ph, vw, vh);
  assert.equal(r.side, 'right'); assert.ok(r.left >= panelTarget.right && r.left + pw <= vw - EDGE);
  assert.ok(r.arrow >= 18 && r.arrow <= ph - 18);
  const wide = { left: 20, top: 100, right: 1200, bottom: 140 };
  assert.equal(placePop(wide, pw, ph, vw, vh).side, 'below');
  const bottomBar = { left: 20, top: 760, right: 1200, bottom: 796 };
  assert.equal(placePop(bottomBar, pw, ph, vw, vh).side, 'above');
  const rightEdge = { left: 1100, top: 0, right: 1270, bottom: 800 };
  assert.equal(placePop(rightEdge, pw, ph, vw, vh).side, 'left');
  const c = placePop(null, pw, ph, vw, vh);
  assert.equal(c.side, 'center'); assert.equal(c.left, (vw - pw) / 2); assert.equal(c.arrow, null);
  const huge = { left: 0, top: 0, right: vw, bottom: vh };
  assert.equal(placePop(huge, pw, ph, vw, vh).side, 'center');
});

test('spotlight is padded and kept inside the viewport; phone card docks away from the target', () => {
  assert.deepEqual(holeRect({ left: 100, top: 100, right: 200, bottom: 150 }, 800, 600), { left: 94, top: 94, right: 206, bottom: 156 });
  assert.deepEqual(holeRect({ left: 0, top: 0, right: 900, bottom: 50 }, 800, 600), { left: 2, top: 2, right: 798, bottom: 56 });
  assert.equal(holeRect(null, 800, 600), null);
  assert.equal(intersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 20, right: 30, bottom: 30 }), null);
  assert.equal(dockSide({ top: 500, bottom: 560 }, 800), 'top');
  assert.equal(dockSide({ top: 60, bottom: 100 }, 800), 'bottom');
  assert.equal(dockSide(null, 800), 'bottom');
});

test('completion date is the local calendar day', () => {
  assert.equal(isoDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(isoDay(new Date(2026, 9, 7)), '2026-10-07');
});

test('every side-panel tab links to a tour that exists; the Rent tab is "Rent & Buy" in the tour', () => {
  assert.deepEqual(Object.keys(TAB_TOURS), TABS);
  for (const id of Object.values(TAB_TOURS)) assert.ok(USE_CASES.some((u) => u.id === id), id);
  const rent = USE_CASES.find((u) => u.id === 'renting').steps.find((s) => s.target === '#tabbtn-rent');
  assert.equal(rent.title, 'Rent & Buy');
  assert.ok(!contentStrings().some((x) => x.includes('Rent & rules')));
});
