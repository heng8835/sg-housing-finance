// Phase 7b B8: commute first-class — the "Only show blocks within N min" filter (Simple + Pro, under the Commute
// picker), the block card header line (same minutes as the compare row) and the saved-view round trip.
// app/modules/explore/commute.js, views.js; legacy.js calls commute.keep(block) in its per-block filter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMUTE_MAX_OPTIONS, cleanMax, keepBlock, cardLine, filterNote, filterChips, createCommute } from '../../app/modules/explore/commute.js';
import { captureView, applyView, cleanView } from '../../app/modules/explore/views.js';

const enc = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');
const A = [12, 35, 255, 61, 44, 45]; // 255 = no estimate
const B = [40, 30, 50, 255, 21, 46];
const data = {
  block_count: A.length, na: 255, encoding: 'base64-uint8',
  hubs: [{ id: 'cbd', name: 'Raffles Place (CBD)', cat: 'work' }, { id: 'nus', name: 'NUS (Kent Ridge campus)', cat: 'school' }],
  minutes: { cbd: enc(A), nus: enc(B) },
};
const blocks = A.map((_, i) => ({ id: i }));
function make({ hubs = ['cbd'], max = 45, active = true } = {}) {
  const st = { hubs, max };
  const c = createCommute({ data, getHubs: () => st.hubs, setHubs: (x) => { st.hubs = x; }, onChange: () => {}, doc: null, getMax: () => st.max, setMax: (v) => { st.max = v; }, active: () => active, blocks });
  return { c, st };
}
const kept = (c) => blocks.map((b, i) => (c.keep(b) ? i : null)).filter((x) => x != null);
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('options and cleaning: Any · 30 · 40 · 45 · 60 min; anything else → Any (null)', () => {
  assert.deepEqual(COMMUTE_MAX_OPTIONS, [30, 40, 45, 60]);
  assert.deepEqual([30, 45, 60, 40, 35, '45', null, undefined, -1].map(cleanMax), [30, 45, 60, 40, null, null, null, null, null]);
  assert.deepEqual([[10, 45], [45, 45], [46, 45], [null, 45], [null, null], [99, null]].map(([m, x]) => keepBlock(m, x)), [true, true, false, false, true, true]);
});

test('filter hides blocks over N (no estimate hidden too); two places → the longer trip decides', () => {
  const { c, st } = make({ max: 45 });
  assert.equal(c.filterOn(), true);
  assert.deepEqual(kept(c), [0, 1, 4, 5]);            // 61 over, 255 = no estimate
  st.max = 30; assert.deepEqual(kept(c), [0]);
  st.max = 60; assert.deepEqual(kept(c), [0, 1, 4, 5]);
  const two = make({ hubs: ['cbd', 'nus'], max: 45 }).c;
  assert.deepEqual(kept(two), [0, 1, 4]);              // longer: 40, 35, –, –, 44, 46
  assert.equal(two.keep({ id: 'not a data block' }), false);
});

test('filter off: Any, colour mode not Commute, or no place chosen → every block kept', () => {
  for (const o of [{ max: null }, { active: false }, { hubs: [] }]) {
    const { c } = make(o);
    assert.equal(c.filterOn(), false, JSON.stringify(o));
    assert.deepEqual(kept(c), [0, 1, 2, 3, 4, 5]);
  }
  const none = createCommute({ data: null, getHubs: () => ['cbd'], setHubs: () => {}, onChange: () => {}, doc: null, getMax: () => 45, blocks });
  assert.equal(none.filterOn(), false);
  assert.equal(none.keep(blocks[3]), true);
});

test('legend line + chips: "Showing blocks within 45 min of …" with "Show all"; chips single-select with aria-pressed', () => {
  const { c } = make({ max: 45 });
  assert.equal(strip(filterNote(c.hubs(), 45)), 'Showing blocks within 45 min of Raffles Place (CBD) · Show all');
  assert.match(filterNote(c.hubs(), 45), /data-commute-max=""/);
  assert.equal(filterNote(c.hubs(), null), '');
  assert.match(strip(filterNote(make({ hubs: ['cbd', 'nus'] }).c.hubs(), 30)), /within 30 min of both Raffles Place \(CBD\) and NUS/);
  const chips = filterChips(45);
  assert.deepEqual([...chips.matchAll(/data-commute-max="(\d*)"/g)].map((x) => x[1]), ['', '30', '40', '45', '60']);
  assert.deepEqual([...chips.matchAll(/aria-pressed="(\w+)"/g)].map((x) => x[1]), ['false', 'false', 'false', 'true', 'false']);
  assert.match(filterChips(null), /class="chip on" data-commute-max="" aria-pressed="true">Any/);
  assert.match(strip(c.legend({ simple: true, zoomedIn: false })), /Showing blocks within 45 min of Raffles Place \(CBD\)/);
  assert.doesNotMatch(make({ active: false }).c.legend({ simple: true, zoomedIn: false }), /Showing blocks within/);
});

test('card minutes = compare row value, for every block, one and two places', () => {
  for (const hubs of [['cbd'], ['nus'], ['cbd', 'nus']]) {
    const { c } = make({ hubs });
    const rows = c.rows().filter((r) => r.k && r.k.startsWith('Public transport to '));
    assert.equal(rows.length, hubs.length);
    for (let bi = 0; bi < A.length; bi++) {
      const line = c.cardLine(bi), vals = rows.map((r) => r.v({ c: { bid: bi } }));
      if (vals.every((v) => v == null)) { assert.equal(line, 'No commute estimate for this block'); continue; }
      const found = [...line.matchAll(/(\d+) min to/g)].map((x) => +x[1]);
      assert.deepEqual(found, vals.filter((v) => v != null), `${hubs} block ${bi}: ${line}`);
    }
  }
  assert.equal(make().c.cardLine(0), '≈ 12 min to Raffles Place (CBD) by public transport (estimate)');
  assert.equal(make({ hubs: ['cbd', 'nus'] }).c.cardLine(0), '≈ 12 min to Raffles Place (CBD) · 40 min to NUS (Kent Ridge campus) (estimates)');
  assert.equal(make({ hubs: ['cbd', 'nus'] }).c.cardLine(2), '≈ no estimate to Raffles Place (CBD) · 50 min to NUS (Kent Ridge campus) (estimates)');
  assert.equal(make({ hubs: [] }).c.cardLine(0), null); // no place → no line
  assert.equal(cardLine([], 0, () => 1), null);
});

test('saved views keep and restore the filter (bad values → Any); old views without it leave it alone', () => {
  const D = { flatTypes: ['4 ROOM'], towns: ['BEDOK'] };
  const S = { colorBy: 'commute', ft: [0], towns: [0], filt: {}, layers: {}, commuteHubs: ['cbd'], commuteMax: 40 };
  const v = captureView(S, { ...D, center: null, zoom: null });
  assert.equal(v.commuteMax, 40);
  const dst = { ft: [], towns: [], filt: {}, layers: {}, commuteMax: null };
  applyView(dst, JSON.parse(JSON.stringify(v)), D);
  assert.equal(dst.commuteMax, 40);
  assert.equal(cleanView({ commuteMax: 41 }).commuteMax, null);
  const keep = { commuteMax: 60 }; applyView(keep, { colorBy: 'price' }, D);
  assert.equal(keep.commuteMax, 60);
});

// 中文 coverage of commute.js (incl. the B8 strings, staged until merged) stays in tests/explore/commute.test.js.
