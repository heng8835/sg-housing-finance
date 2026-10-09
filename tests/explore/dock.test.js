import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeCards, clampSize, defaultSize, availHeight, admit, lruVictim, MAX_CARDS, GAP, TOP, CASCADE, ZOOM_CLEAR, halfTop, HALF_PCT } from '../../app/modules/explore/dock.js';
import { windowFor, migratePeriod } from '../../app/modules/explore/period.js';

test('availHeight / clampSize: W 320 … min(640, mapW − 68), H 360 … availH', () => {
  assert.equal(availHeight(900), 900 - 64 - 56);
  assert.equal(availHeight(900, 100), 900 - 100 - 56);
  const g = { mapW: 1440, availH: 780 };
  assert.deepEqual(clampSize({ w: 380, h: 720 }, g), { w: 380, h: 720 });
  assert.deepEqual(clampSize({ w: 100, h: 100 }, g), { w: 320, h: 360 });
  assert.deepEqual(clampSize({ w: 2000, h: 2000 }, g), { w: 640, h: 780 });
  assert.deepEqual(clampSize({ w: 700, h: 500 }, { mapW: 600, availH: 780 }), { w: 532, h: 500 }); // mapW − 68
  assert.deepEqual(clampSize({ w: 380, h: 720 }, { mapW: 1440, availH: 300 }), { w: 380, h: 300 }); // a short map wins over the minimum
});

test('defaultSize: 380 × min(720, availH), or the last size the user chose', () => {
  assert.deepEqual(defaultSize({ mapW: 1440, availH: 780 }), { w: 380, h: 720 });
  assert.deepEqual(defaultSize({ mapW: 1440, availH: 600 }), { w: 380, h: 600 });
  assert.deepEqual(defaultSize({ mapW: 1440, availH: 780 }, { w: 460, h: 500 }), { w: 460, h: 500 });
  assert.deepEqual(defaultSize({ mapW: 1440, availH: 780 }, { w: 0, h: 0 }), { w: 380, h: 720 });
});

test('placeCards: right-to-left packing at top 64, 12 px gaps', () => {
  const p = placeCards([{ w: 380, h: 720 }, { w: 380, h: 720 }, { w: 400, h: 600 }], { mapW: 1440, cover: 0, availH: 780 }); // panel hidden
  assert.deepEqual(p.map((x) => [x.right, x.top, x.cascade]), [[GAP, TOP, false], [GAP + 380 + GAP, TOP, false], [GAP + 380 + 380 + 2 * GAP, TOP, false]]);
  assert.equal(p[2].right, 12 + 380 + 380 + 24);   // 12 + Σ widths before + 12k
  assert.ok(1440 - p[2].right - 400 >= ZOOM_CLEAR);
  // 1440 with the 420 px panel: two fit side by side, the third cascades on the second
  const q = placeCards([{ w: 380, h: 720 }, { w: 380, h: 720 }, { w: 380, h: 720 }], { mapW: 1440, cover: 420, availH: 780 });
  assert.deepEqual(q.map((x) => [x.right, x.top, x.cascade]), [[12, 64, false], [404, 64, false], [404 + CASCADE, 64 + CASCADE, true]]);
});

test('placeCards: a card that would cross cover + 56 cascades on the left-most packed card (+28 down / +28 left)', () => {
  // 1024 wide, panel 420: room for one 380 card beside the panel (1024 − 12 − 380 = 632 ≥ 476), not two (1024 − 404 − 380 = 240)
  const p = placeCards([{ w: 380, h: 700 }, { w: 380, h: 700 }, { w: 380, h: 700 }], { mapW: 1024, cover: 420, availH: 700 });
  assert.deepEqual(p.map((x) => [x.right, x.top, x.cascade]), [[12, 64, false], [12 + CASCADE, 64 + CASCADE, true], [12 + 2 * CASCADE, 64 + 2 * CASCADE, true]]);
  assert.deepEqual(p.map((x) => x.h), [700, 700 - CASCADE, 700 - 2 * CASCADE]); // stays inside the map
  // once a card cascades, later ones cascade too (even a narrow one that would fit)
  const q = placeCards([{ w: 380, h: 500 }, { w: 640, h: 500 }, { w: 320, h: 500 }], { mapW: 1440, cover: 420 });
  assert.deepEqual(q.map((x) => x.cascade), [false, true, true]);
  // the first card never cascades, even on a cramped map
  assert.equal(placeCards([{ w: 640, h: 500 }], { mapW: 700, cover: 420 })[0].cascade, false);
});

test('admit / lruVictim: up to 3; the 4th replaces the least recently used and takes its slot', () => {
  assert.equal(MAX_CARDS, 3);
  assert.deepEqual(admit([]), { evict: null, slot: 0 });
  assert.deepEqual(admit([{ key: 5, slot: 0, used: 1 }, { key: 9, slot: 2, used: 2 }]), { evict: null, slot: 1 }); // lowest free slot
  const open = [{ key: 5, slot: 0, used: 4 }, { key: 9, slot: 1, used: 2 }, { key: 7, slot: 2, used: 6 }];
  assert.equal(lruVictim(open), 9);
  assert.deepEqual(admit(open), { evict: 9, slot: 1 });
  assert.deepEqual(admit([{ key: 5, slot: 0, used: 4 }], 1), { evict: 5, slot: 0 }); // ≤ 900 px: one at a time
  assert.equal(lruVictim([]), null);
});

// the data's months: Jan 2017 … Sep 2026 (NM = 117), like data.js today
const months = []; for (let y = 2017; y <= 2026; y++) for (let m = 1; m <= 12; m++) if (y < 2026 || m <= 9) months.push(`${y}-${String(m).padStart(2, '0')}`);
const NM = months.length;

test('windowFor: defaults (1 year, last 10 years) = today\'s period [NM − 12, NM − 1]', () => {
  assert.equal(NM, 117);
  const w = windowFor({ months, calcM: 12, hist: { from: 2017, to: 2026 } });
  assert.deepEqual(w, { mFrom: NM - 12, mTo: NM - 1, months: 12, clipped: false });
  assert.deepEqual([months[w.mFrom], months[w.mTo]], ['2025-10', '2026-09']);
  assert.deepEqual(windowFor({ months, calcM: 24, hist: { from: 2017, to: 2026 } }), { mFrom: NM - 24, mTo: NM - 1, months: 24, clipped: false });
});

test('windowFor: ends at Dec of the slider end; clipped by the slider start', () => {
  const w = windowFor({ months, calcM: 12, hist: { from: 2017, to: 2022 } });
  assert.deepEqual([months[w.mFrom], months[w.mTo], w.months], ['2022-01', '2022-12', 12]);
  const c = windowFor({ months, calcM: 60, hist: { from: 2024, to: 2026 } });
  assert.deepEqual([months[c.mFrom], months[c.mTo], c.months, c.clipped], ['2024-01', '2026-09', 33, true]);
  const one = windowFor({ months, calcM: 36, hist: { from: 2020, to: 2020 } });
  assert.deepEqual([months[one.mFrom], months[one.mTo], one.clipped], ['2020-01', '2020-12', true]);
});

test('migratePeriod: defaults stay identical; a saved 24-month window stays 24; custom periods → nearest window', () => {
  const d = migratePeriod({ mFrom: NM - 12, mTo: NM - 1 }, months);
  assert.deepEqual([d.calcM, d.hist], [12, { from: 2017, to: 2026 }]);
  assert.deepEqual(windowFor({ months, calcM: d.calcM, hist: d.hist }), { mFrom: NM - 12, mTo: NM - 1, months: 12, clipped: false });
  const s24 = migratePeriod({ mFrom: NM - 24, mTo: NM - 1 }, months);
  assert.equal(s24.calcM, 24);
  assert.deepEqual(windowFor({ months, calcM: s24.calcM, hist: s24.hist }), { mFrom: NM - 24, mTo: NM - 1, months: 24, clipped: false });
  const all = migratePeriod({ mFrom: 0, mTo: NM - 1 }, months);           // "All" → 5 years, last 10 years of history
  assert.deepEqual([all.calcM, all.hist], [60, { from: 2017, to: 2026 }]);
  const old = migratePeriod({ mFrom: months.indexOf('2019-01'), mTo: months.indexOf('2019-12') }, months);
  assert.deepEqual([old.calcM, old.hist], [12, { from: 2017, to: 2019 }]); // hist.from = max(first, to − 9)
  const kept = migratePeriod({ calcM: 36, hist: { from: 2010, to: 2030 } }, months); // already migrated: clamped to the data
  assert.deepEqual([kept.calcM, kept.hist], [36, { from: 2017, to: 2026 }]);
  assert.equal(migratePeriod({ calcM: 7, hist: { from: 2018, to: 2020 } }, months).calcM, 12); // unknown option → default
});

test('halfTop (S1a): the half sheet is 55 % of #mapwrap (not 50 % of the viewport), so the pin sits just above it', () => {
  const wrap = { top: 56, bottom: 756, height: 700 };            // map area under a 56 px top bar
  assert.equal(halfTop(wrap, 55), 756 - 385);                    // 55 % of 700 = 385 px tall
  assert.equal(halfTop(wrap, NaN), 756 - Math.round(700 * HALF_PCT / 100));
  assert.equal(HALF_PCT, 55);
  const css = readFileSync(new URL('../../app/styles/base.css', import.meta.url), 'utf8');
  assert.match(css, /--sheet-half: 55%/);
});
