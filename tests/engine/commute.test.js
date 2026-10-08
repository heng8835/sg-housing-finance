// Commute table decoding, bands from policy, household combination; consistency of the
// generated app/data/commute.js with data.js (skipped when the generated files are absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { policy } from '../helpers.js';
import { commuteMinutes, decodeMinutes, commuteBand, combinedCommute, commuteHub } from '../../app/engine/commute.js';

const enc = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');
const loadJs = (url) => { const t = readFileSync(url, 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).trim().replace(/;$/, '')); };

// 7 blocks: exercises every position inside a base64 group and both padding lengths.
const A = [12, 0, 254, 255, 45, 46, 61];
const B = [30, 31, 60, 7, 255, 100, 200];
const fixture = {
  block_count: A.length, na: 255, encoding: 'base64-uint8',
  hubs: [{ id: 'a', name: 'Hub A', cat: 'work' }, { id: 'b', name: 'Hub B', cat: 'school' }],
  minutes: { a: enc(A), b: enc(B), c: enc(A.slice(0, 5)) },
};

test('commute policy params exist, are ASSUMPTIONs, and band edges ascend', () => {
  for (const id of ['commute.band.edges_min', 'commute.walk.speed_kmh', 'commute.walk.detour_factor', 'commute.feeder.overhead_min',
    'commute.feeder.speed_kmh', 'commute.rail.board_min', 'commute.rail.mrt_speed_kmh', 'commute.rail.lrt_speed_kmh',
    'commute.rail.dwell_min', 'commute.rail.track_factor', 'commute.rail.transfer_min', 'commute.rail.link_max_km',
    'commute.access.candidate_stations']) {
    assert.equal(policy.meta(id).status, 'ASSUMPTION', id);
    assert.ok(policy.get(id) != null, id);
  }
  const e = policy.get('commute.band.edges_min');
  assert.equal(e.length, 3);
  assert.ok(e[0] < e[1] && e[1] < e[2]);
  assert.equal(e[1], 45, 'LTMP 2040 45-minute-city edge');
});

test('decodeMinutes matches the bytes for every group position and padding', () => {
  assert.deepEqual([...decodeMinutes(fixture, 'a')], A);
  assert.deepEqual([...decodeMinutes(fixture, 'b')], B);
  assert.equal(decodeMinutes(fixture, 'zzz'), null);
});

test('commuteMinutes reads one block, maps n/a and bad input to null', () => {
  A.forEach((v, i) => assert.equal(commuteMinutes(fixture, i, 'a'), v === 255 ? null : v, `block ${i}`));
  assert.equal(commuteMinutes(fixture, 3, 'a'), null);           // 255 = n/a
  assert.equal(commuteMinutes(fixture, 7, 'a'), null);           // out of range
  assert.equal(commuteMinutes(fixture, -1, 'a'), null);
  assert.equal(commuteMinutes(fixture, 1.5, 'a'), null);
  assert.equal(commuteMinutes(fixture, 0, 'nope'), null);
  assert.equal(commuteMinutes(null, 0, 'a'), null);
  assert.equal(commuteHub(fixture, 'b').cat, 'school');
  assert.equal(commuteHub(fixture, 'x'), null);
});

test('commuteBand uses the policy edges inclusively', () => {
  const [s, o, l] = policy.get('commute.band.edges_min');
  assert.equal(commuteBand(0, policy), 'short');
  assert.equal(commuteBand(s, policy), 'short');
  assert.equal(commuteBand(s + 1, policy), 'ok');
  assert.equal(commuteBand(o, policy), 'ok');
  assert.equal(commuteBand(o + 1, policy), 'long');
  assert.equal(commuteBand(l, policy), 'long');
  assert.equal(commuteBand(l + 1, policy), 'very-long');
  assert.equal(commuteBand(null, policy), null);
  assert.equal(commuteBand(NaN, policy), null);
});

test('combinedCommute gives max and sum only when every hub has a value', () => {
  const two = combinedCommute(fixture, 0, ['a', 'b']);
  assert.deepEqual(two.perHub, [{ hubId: 'a', minutes: 12 }, { hubId: 'b', minutes: 30 }]);
  assert.equal(two.max, 30);
  assert.equal(two.sum, 42);
  assert.equal(two.complete, true);
  const gap = combinedCommute(fixture, 3, ['a', 'b']);             // hub a is n/a for block 3
  assert.equal(gap.complete, false);
  assert.equal(gap.max, null);
  assert.equal(gap.sum, null);
  assert.equal(combinedCommute(fixture, 0, []).max, null);
  assert.equal(combinedCommute(fixture, 0, ['a']).max, 12);
});

const COMMUTE = new URL('../../app/data/commute.js', import.meta.url);
const DATA = new URL('../../app/data/data.js', import.meta.url);
test('generated commute.js is aligned with data.js blocks and decodes consistently', { skip: !(existsSync(COMMUTE) && existsSync(DATA)) }, () => {
  const c = loadJs(COMMUTE);
  const d = loadJs(DATA);
  assert.equal(c.block_count, d.blocks.length, 'one byte per HDB_DATA.blocks index');
  assert.ok(c.hubs.length >= 20);
  for (const h of c.hubs) {
    assert.ok(['work', 'school', 'border'].includes(h.cat), h.id);
    const engine = decodeMinutes(c, h.id);
    const ref = Buffer.from(c.minutes[h.id], 'base64');
    assert.equal(engine.length, d.blocks.length, h.id);
    assert.deepEqual([...engine], [...ref], h.id);
    for (const i of [0, 1, 2, d.blocks.length - 1]) assert.equal(commuteMinutes(c, i, h.id), ref[i] === c.na ? null : ref[i]);
  }
  // build and app read the same parameters
  for (const [id, v] of Object.entries(c.params)) assert.deepEqual(policy.get(id), v, id);
  // calibration journeys stay plausible (station-to-station within 5 min of planner times)
  for (const v of c.validation) assert.ok(Math.abs(v.rail_err) <= 5, `${v.from} -> ${v.to}: ${v.rail_err}`);
});
