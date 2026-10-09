// Phone "Area prices" (spec phone-topbar-area-household.md §2, A1–A5): the pure helpers in
// app/modules/explore/areasheet.js — point thinning, the finger-stroke state machine, the desktop "too small" rule,
// the view model — plus "one copy of the maths" (legacy.js imports it) and 中文 for every new string.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { thinPoints, MAX_PTS, strokeStep, STROKE0, MIN_STEP_PX, tooSmall, MIN_PTS, MIN_KM2, polyAreaKm2, inPoly, roundPts, areaView, uiStrings } from '../../app/modules/explore/areasheet.js';
import { uiStrings as mapStrings } from '../../app/modules/explore/mapsheet.js';

const tr = (s, v) => (v ? s.replace(/\{(\d+)\}/g, (m, k) => v[k]) : s);
const fmt = { k: (v) => v == null ? '—' : 'S$' + (v / 1000).toFixed(0) + 'k', pct: (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' }; // legacy fmt.k / fmt.pct

test('thinning: at most 200 points, first and last kept, order kept; short strokes untouched', () => {
  for (const n of [1, 8, 199, 200, 201, 333, 399, 400, 401, 1000, 4567]) {
    const pts = Array.from({ length: n }, (_, i) => [i, -i]);
    const out = thinPoints(pts);
    assert.ok(out.length <= MAX_PTS, `${n} → ${out.length}`);
    assert.deepEqual(out[0], pts[0]); assert.deepEqual(out[out.length - 1], pts[n - 1]);
    for (let i = 1; i < out.length; i++) assert.ok(out[i][0] > out[i - 1][0], 'order kept, no duplicates');
    if (n <= MAX_PTS) assert.deepEqual(out, pts);
    else assert.ok(out.length >= MAX_PTS / 2, `${n} → ${out.length}: not over-thinned`);
  }
  const pts = [[1, 1], [2, 2]]; assert.notEqual(thinPoints(pts), pts, 'a copy');
});

const run = (evs) => evs.reduce((acc, ev) => { const r = strokeStep(acc.s, ev); acc.s = r.s; acc.acts.push(r.act); return acc; }, { s: STROKE0, acts: [] });

test('stroke: one finger begins, adds points ≥ 4 px apart, lifting ends it', () => {
  const { s, acts } = run([
    { type: 'down', id: 1, x: 0, y: 0, primary: true },
    { type: 'move', id: 1, x: 2, y: 2 },              // < 4 px: skipped
    { type: 'move', id: 1, x: MIN_STEP_PX, y: 0 },    // 4 px: kept
    { type: 'move', id: 1, x: 20, y: 0 },
    { type: 'up', id: 1, x: 20, y: 0 },
  ]);
  assert.deepEqual(acts, ['begin', null, 'add', 'add', 'end']);
  assert.equal(s.mode, 'idle'); assert.deepEqual(s.down, []);
});

test('stroke: a second finger drops the stroke (pinch); nothing is drawn until every finger is up', () => {
  const { s, acts } = run([
    { type: 'down', id: 1, x: 0, y: 0, primary: true },
    { type: 'move', id: 1, x: 10, y: 0 },
    { type: 'down', id: 2, x: 50, y: 50, primary: false },  // pinch starts
    { type: 'move', id: 1, x: 30, y: 0 },                  // pinch moves: no points
    { type: 'up', id: 1 },                                 // first finger up: no 'end'
    { type: 'move', id: 2, x: 60, y: 60 },
    { type: 'up', id: 2 },
  ]);
  assert.deepEqual(acts, ['begin', 'add', 'drop', null, null, null, null]);
  assert.equal(s.mode, 'idle');
  const again = strokeStep(s, { type: 'down', id: 3, x: 0, y: 0, primary: true });
  assert.equal(again.act, 'begin', 'can draw again after the pinch');
});

test('stroke: the browser cancelling the pointer drops it; a lost "up" never leaves it stuck', () => {
  assert.deepEqual(run([{ type: 'down', id: 1, x: 0, y: 0, primary: true }, { type: 'move', id: 1, x: 9, y: 0 }, { type: 'cancel', id: 1 }]).acts, ['begin', 'add', 'drop']);
  const stuck = run([{ type: 'down', id: 1, x: 0, y: 0, primary: true }, { type: 'down', id: 2, x: 0, y: 0, primary: false }]).s; // ups lost
  assert.equal(stuck.mode, 'pinch');
  assert.equal(strokeStep(stuck, { type: 'down', id: 7, x: 0, y: 0, primary: true }).act, 'begin');
  assert.equal(strokeStep(STROKE0, { type: 'move', id: 1, x: 5, y: 5 }).act, null, 'moves without a finger down do nothing');
});

test('too small = the desktop rule (fewer than 8 points or under 0.005 km²); points saved at 5 decimals', () => {
  assert.equal(MIN_PTS, 8); assert.equal(MIN_KM2, 0.005);
  const square = (d, n = 12) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [1.35 + d * Math.sin(a), 103.8 + d * Math.cos(a)]; });
  assert.equal(tooSmall(square(0.01, 7)), true, '7 points');
  assert.equal(tooSmall(square(0.0003)), true, '≈ 0.003 km²');
  assert.equal(tooSmall(square(0.01)), false, '≈ 3.8 km²');
  assert.equal(tooSmall([]), true);
  const big = square(0.01, 40);
  assert.ok(polyAreaKm2(big) > 3 && polyAreaKm2(big) < 4.5);
  assert.equal(inPoly(1.35, 103.8, big), true); assert.equal(inPoly(1.40, 103.8, big), false);
  assert.deepEqual(roundPts([[1.3521234, 103.8198765]]), [[1.35212, 103.81988]]);
});

test('one copy of the maths: legacy.js imports inPoly / polyAreaKm2 / tooSmall / roundPts and saves through commitPoly', () => {
  const src = readFileSync(new URL('../../app/modules/explore/legacy.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ inPoly, polyAreaKm2, tooSmall, roundPts \} from '\.\/areasheet\.js'/);
  assert.doesNotMatch(src, /const (inPoly|polyAreaKm2) = /, 'no second copy');
  assert.doesNotMatch(src, /pts\.length < 8/, 'the too-small rule lives in areasheet.js');
  assert.match(src, /function commitPoly\(pts\) \{ if \(tooSmall\(pts\)\) return false; S\.area = \{ type: 'poly', pts: roundPts\(pts\) \}/);
  assert.match(src, /if \(!commitPoly\(pts\)\) showBanner/, 'desktop release uses the same save');
});

const ST = { blocks: 31, n: 214, medP: 612000, avgP: 628400, medPsf: 598.4, avgPsf: 604.2, yoy: -0.012 };
test('view: drawn area → "Inside your shape", km² · flat types · period, the desktop figures in a 2×2 grid + More numbers', () => {
  const v = areaView({ kind: 'poly', km2: 0.8412, st: ST, types: '4 ROOM, 5 ROOM', period: '1 year' }, { tr, ...fmt });
  assert.equal(v.title, 'Inside your shape');
  assert.equal(v.sub, '0.84 km² · 4 ROOM, 5 ROOM · last 1 year');
  assert.deepEqual(v.cells, [['Median price', 'S$612k'], ['Price per sq ft', 'S$598'], ['Sales', '214'], ['Blocks', '31']]);
  assert.deepEqual(v.more, [['Average price', 'S$628k'], ['Average per sq ft', 'S$604'], ['Price per sq ft vs a year ago', '-1%']]);
  assert.deepEqual(v.acts, ['again', 'clear']); assert.equal(v.note, '');
});

test('view: circle keeps its desktop title; no area → Prices in view + [Draw an area]; zoomed out / no sales → one note', () => {
  assert.equal(areaView({ kind: 'circle', title: 'Within 800 m of the circle centre', st: ST, types: 'All flat types', period: '1 year' }, { tr, ...fmt }).sub, 'All flat types · last 1 year');
  const view = areaView({ kind: 'view', st: ST, types: 'All flat types', period: '2 years' }, { tr, ...fmt });
  assert.equal(view.title, 'Prices in view'); assert.deepEqual(view.acts, ['draw']);
  const out = areaView({ kind: 'out', types: 'x', period: '1 year' }, { tr, ...fmt });
  assert.equal(out.note, 'Zoom in, or draw an area, to see prices.'); assert.equal(out.sub, ''); assert.deepEqual(out.cells, []);
  const none = areaView({ kind: 'poly', km2: 1, st: { ...ST, n: 0 }, types: 'x', period: '1 year' }, { tr, ...fmt });
  assert.equal(none.note, 'No sales here for the flat types and period you picked.'); assert.deepEqual(none.acts, ['again', 'clear']);
  assert.equal(areaView({ kind: 'poly', km2: 1, st: { ...ST, yoy: null }, types: 'x', period: 'y' }, { tr, ...fmt }).more[2][1], '—');
});

test('view: flat types by name (two + "+N"); circle title rounded to 10 m (review nice-to-haves 4, 5)', () => {
  const sub = (x) => areaView({ kind: 'poly', km2: 1, st: ST, period: '1 year', types: '4 flat types', ...x }, { tr, ...fmt }).sub;
  assert.equal(sub({ names: ['4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'] }), '1.00 km² · 4 ROOM, 5 ROOM +2 · last 1 year');
  assert.equal(sub({ names: ['4 ROOM', '5 ROOM'] }), '1.00 km² · 4 ROOM, 5 ROOM · last 1 year');
  assert.equal(sub({ names: ['1 ROOM', '2 ROOM', '3 ROOM'], all: true, types: 'All flat types' }), '1.00 km² · All flat types · last 1 year');
  assert.equal(sub({}), '1.00 km² · 4 flat types · last 1 year', 'no names → the old text');
  const title = (r) => areaView({ kind: 'circle', title: 'desktop', r, st: ST, types: 'x', period: 'y' }, { tr, ...fmt }).title;
  assert.equal(title(741), 'Within 740 m of the centre');
  assert.equal(title(745), 'Within 750 m of the centre');
  assert.equal(title(1234), 'Within 1.2 km of the centre');
  assert.equal(title(undefined), 'desktop');
});

test('中文: every Area prices string has an entry, placeholders kept; mapsheet lists them too', () => {
  const read = (f) => { const u = new URL(`../../app/i18n/${f}`, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : {}; };
  const zh = Object.assign({}, read('zh.json'), read('zh-explore.json'));
  assert.deepEqual(uiStrings().filter((s) => !zh[s]), []);
  for (const s of uiStrings()) for (const m of s.match(/\{\d\}/g) || []) assert.ok(zh[s].includes(m), `${s}: ${m}`);
  for (const s of uiStrings()) assert.doesNotMatch(s, /click|hover/i, 'phones say tap');
  for (const s of uiStrings()) assert.ok(mapStrings().includes(s), `mapsheet uiStrings has ${s}`);
});
