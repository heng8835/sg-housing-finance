// "Commute to…" colour mode (app/modules/explore/commute.js): bins, hub cleaning, two-worker
// combination, compare-row text, legend label, and zh coverage of the generated hub names / notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RAMP } from '../../app/modules/explore/blocks.js';
import { COMMUTE_BINS, MAX_HUBS, commuteScale, cleanHubs, combineMinutes, minutesCell, commuteRows, legendLabel, hoverPart, rowTip, createCommute } from '../../app/modules/explore/commute.js';

const enc = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');
// 5 blocks; 255 = no estimate
const A = [12, 35, 255, 61, 20];
const B = [40, 30, 50, 255, 21];
const fixture = {
  block_count: A.length, na: 255, encoding: 'base64-uint8',
  hubs: [{ id: 'cbd', name: 'Raffles Place (CBD)', cat: 'work' }, { id: 'nus', name: 'NUS (Kent Ridge campus)', cat: 'school', note: 'Campus is big.' }, { id: 'jb', name: 'Checkpoint', cat: 'border' }],
  minutes: { cbd: enc(A), nus: enc(B), jb: enc(A) },
};
const m = (bid) => ({ c: { bid } });

test('fixed bins ≤20 / 21–30 / 31–45 / 46–60 / >60 on the shared ramp, darker = longer', () => {
  assert.deepEqual(COMMUTE_BINS, [20, 30, 45, 60]);
  const s = commuteScale();
  assert.equal(s.fixed, true);
  assert.deepEqual([0, 20, 21, 30, 31, 45, 46, 60, 61, 254].map((x) => RAMP.indexOf(s.color(x))), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('cleanHubs keeps at most two distinct known ids, in order', () => {
  const known = new Set(['cbd', 'nus', 'jb']);
  assert.equal(MAX_HUBS, 2);
  assert.deepEqual(cleanHubs(['nus', 'cbd', 'jb'], known), ['nus', 'cbd']);
  assert.deepEqual(cleanHubs(['cbd', 'cbd'], known), ['cbd']);
  assert.deepEqual(cleanHubs(['', 'nope', 'jb', 7, null], known), ['jb']);
  assert.deepEqual(cleanHubs(undefined, known), []);
  assert.deepEqual(cleanHubs('cbd', known), []);
});

test('combineMinutes: the longer trip per block; any missing → null (grey "no data")', () => {
  const a = Uint8Array.from(A), b = Uint8Array.from(B);
  assert.deepEqual(combineMinutes([a], 255), [12, 35, null, 61, 20]);
  assert.deepEqual(combineMinutes([a, b], 255), [40, 35, null, null, 21]);
  assert.equal(combineMinutes([], 255), null);
  assert.equal(combineMinutes([null], 255), null);
  assert.deepEqual(combineMinutes([Uint8Array.from([0])], 255), [0]);
});

test('compare cells and rows: none chosen → no rows (table unchanged); one row per hub; combined row with two', () => {
  assert.equal(minutesCell(35), '~35 min<small>model estimate</small>');
  assert.equal(minutesCell(null), '<span class="muted">no estimate</span>');
  const at = (id, bi) => ({ cbd: A, nus: B }[id][bi] === 255 ? null : { cbd: A, nus: B }[id][bi]);
  assert.deepEqual(commuteRows([], at), []);
  assert.deepEqual(commuteRows(null, at), []);
  const one = commuteRows([fixture.hubs[0]], at);
  assert.deepEqual(one.map((r) => r.sec || r.k), ['Public transport (model estimate)', 'Public transport to Raffles Place (CBD)']);
  assert.equal(one[1].lbl, 'Public transport to Raffles Place (CBD)');
  assert.equal(one[1].simple, true);
  assert.equal(one[1].best, 'min');
  assert.equal(one[1].v(m(1)), 35);
  assert.equal(one[1].f(m(2)), minutesCell(null));
  const two = commuteRows(fixture.hubs.slice(0, 2), at);
  assert.equal(two.length, 4);
  assert.equal(two[3].k, 'Longer of the two trips');
  assert.equal(two[3].simple, undefined, 'combined row is Pro only');
  assert.deepEqual([0, 1, 2, 3, 4].map((bi) => two[3].v(m(bi))), [40, 35, null, null, 21]);
  assert.match(two[2].tip, /not a journey planner/);
  assert.match(two[2].tip, /Campus is big\.$/);
  assert.doesNotMatch(rowTip(fixture.hubs[0]), /undefined/);
});

test('legend label and hover text name the hubs (escaped)', () => {
  const [cbd, nus] = fixture.hubs;
  assert.equal(legendLabel([cbd]), 'Public transport to Raffles Place (CBD)');
  assert.equal(legendLabel([cbd, nus]), 'Public transport to Raffles Place (CBD) or NUS (Kent Ridge campus), whichever is longer');
  assert.equal(legendLabel([{ name: 'A & <B>' }]), 'Public transport to A &amp; &lt;B&gt;');
  const at = (id, bi) => (bi === 2 ? null : 30);
  assert.equal(hoverPart([cbd], 0, at), ' · ~30 min to Raffles Place (CBD)');
  assert.equal(hoverPart([cbd], 2, at), ' · no estimate to Raffles Place (CBD)');
  assert.equal(hoverPart([], 0, at), '');
});

test('createCommute (no DOM): fills, rows and legend from the saved hubs; missing data → unavailable', () => {
  let saved = ['nus', 'cbd'];
  const c = createCommute({ data: fixture, getHubs: () => saved, setHubs: (ids) => { saved = ids; }, onChange: () => {}, doc: null });
  assert.equal(c.available, true);
  assert.deepEqual(c.hubs().map((h) => h.id), ['nus', 'cbd']);
  const s = commuteScale();
  assert.equal(c.fill(0), s.color(40));
  assert.equal(c.fill(2), null);
  assert.equal(c.fill(3), null);
  assert.equal(c.minutesAt('cbd', 3), 61);
  assert.equal(c.minutesAt('cbd', 2), null);
  assert.equal(c.minutesAt('cbd', 99), null);
  assert.equal(c.rows().length, 4);
  assert.match(c.legend({ simple: false, zoomedIn: false }), /whichever is longer/);
  saved = ['cbd'];                                   // choice changed → recombined
  assert.equal(c.fill(3), s.color(61));
  saved = [];
  assert.equal(c.fill(0), null);
  assert.deepEqual(c.rows(), []);
  assert.match(c.legend({ simple: true }), /Choose where you travel to/);
  c.show(true);                                       // no DOM: no-op
  const none = createCommute({ data: null, getHubs: () => ['cbd'], setHubs: () => {}, onChange: () => {}, doc: null });
  assert.equal(none.available, false);
  assert.deepEqual(none.hubs(), []);
  assert.equal(none.fill(0), null);
  assert.deepEqual(none.rows(), []);
});

test('every t() string in commute.js and the new radio label has a 中文 entry', () => {
  const src = readFileSync(new URL('../../app/modules/explore/commute.js', import.meta.url), 'utf8');
  const staged = new URL('../../app/i18n/staging/EXPLORE2.zh-explore.json', import.meta.url); // 7b B8 strings until the integrator merges them
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json'].map((f) => JSON.parse(readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8'))), existsSync(staged) ? JSON.parse(readFileSync(staged, 'utf8')) : {});
  const keys = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
  keys.push(src.match(/const MODEL_NOTE = '([^']*)'/)[1], 'Commute time (public transport)', '— choose a place —', '— nobody else —');
  assert.ok(keys.length > 15);
  assert.deepEqual(keys.filter((k) => !zh[k]), []);
});

const COMMUTE = new URL('../../app/data/commute.js', import.meta.url);
test('every generated hub name, note and category label has a 中文 entry', { skip: !existsSync(COMMUTE) }, () => {
  const txt = readFileSync(COMMUTE, 'utf8');
  const c = JSON.parse(txt.slice(txt.indexOf('=') + 1).trim().replace(/;$/, ''));
  const zh = JSON.parse(readFileSync(new URL('../../app/i18n/zh-explore.json', import.meta.url), 'utf8'));
  const need = [...c.hubs.map((h) => h.name), ...c.hubs.filter((h) => h.note).map((h) => h.note), 'Work areas', 'Universities & schools', 'Border crossing'];
  assert.deepEqual(need.filter((k) => !zh[k]), []);
  assert.ok(c.hubs.length >= 20);
});
