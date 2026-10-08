import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centreStatus, isFaded, nextOpening, roundMetres, nearestFlood, missingLayers, sourcesFor, floodAreas, FLOOD_NEAR_M, FAMILY_KEYS, FLOOD_RING_ZOOM, FLOOD_AREA_ZOOM_MAX, FLOOD_AREA } from '../../app/modules/explore/family.js';
import { distanceKm } from '../../app/core/geo.js';

test('floodAreas: single-linkage clusters ≤ 400 m, circle at the centroid, r = clamp(far + 200, 250, 1200)', () => {
  assert.deepEqual([FLOOD_AREA_ZOOM_MAX, FLOOD_RING_ZOOM], [13, 14]);
  assert.deepEqual(FLOOD_AREA, { linkM: 400, padM: 200, minR: 250, maxR: 1200 });
  const at = { lat: 1.35, lon: 103.85 }, north = (m, lon = at.lon) => ({ lat: at.lat + m / 111195, lon });
  // chain 0 – 350 – 700 m links (each step ≤ 400 m) although the ends are 700 m apart; 2 km away is its own area
  const a = floodAreas([north(0), north(350), north(700), north(2000)]);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map((x) => x.n), [3, 1]);
  assert.ok(Math.abs(a[0].lat - north(350).lat) < 1e-9);                     // centroid
  const far = distanceKm({ lat: a[0].lat, lon: a[0].lon }, north(0)) * 1000;   // ≈ 350 m
  assert.equal(a[0].r, Math.round(far + 200));
  assert.equal(a[1].r, 250);                                                   // lone point: the minimum
  // a long chain is capped at 1200 m
  const chain = Array.from({ length: 12 }, (_, i) => north(i * 390));
  const c = floodAreas(chain);
  assert.equal(c.length, 1); assert.equal(c[0].r, 1200);
  // 401 m apart → two areas
  assert.equal(floodAreas([north(0), north(401)]).length, 2);
  assert.deepEqual(floodAreas([]), []);
  assert.deepEqual(floodAreas(undefined), []);
  assert.equal(floodAreas([{ lat: NaN, lon: 1 }, north(0)]).length, 1);
});

test('centre status from this month (first char) over the levels it offers', () => {
  assert.equal(centreStatus({ inf: 'FFFFFFF', n1: 'AAAAAAA' }), 'available');
  assert.equal(centreStatus({ inf: 'FFFFFFF', n1: 'LFFFFFF' }), 'limited');
  assert.equal(centreStatus({ inf: 'FAAAAAA', k1: 'F------' }), 'full');
  assert.equal(centreStatus({ k2: '-AAAAAA' }), 'unknown'); // not offered this month
  assert.equal(centreStatus({ k2: '???????' }), 'unknown');
  assert.equal(centreStatus({}), 'unknown');
  assert.equal(centreStatus(undefined), 'unknown');
});

test('only full centres are faded', () => {
  assert.equal(isFaded({ vac: { inf: 'FFFFFFF', pg: 'F-----A' } }), true);
  assert.equal(isFaded({ vac: { inf: 'FFFFFFF', pg: 'LFFFFFF' } }), false);
  assert.equal(isFaded({ vac: {} }), false); // unknown is not "full"
  assert.equal(isFaded(null), false);
});

test('next opening counts months after the current one', () => {
  assert.equal(nextOpening('FFAFFFF'), 2);
  assert.equal(nextOpening('FLFFFFF'), 1);
  assert.equal(nextOpening('AFFFFFF'), -1); // the current month does not count
  assert.equal(nextOpening('FFFFFFF'), -1);
  assert.equal(nextOpening(''), -1);
});

test('distances round to 10 m, never below 10 m', () => {
  assert.equal(roundMetres(0), 10);
  assert.equal(roundMetres(4), 10);
  assert.equal(roundMetres(144), 140);
  assert.equal(roundMetres(145), 150);
});

test('nearest flood-prone point within the popup radius', () => {
  const at = { lat: 1.35, lon: 103.85 };
  const north = (m) => ({ n: `${m} m north`, lat: at.lat + m / 111195, lon: at.lon }); // ~111.2 km per degree of latitude
  const near = nearestFlood([north(900), north(120), north(250)], at);
  assert.equal(near.p.n, '120 m north');
  assert.equal(near.m, 120);
  assert.equal(nearestFlood([north(FLOOD_NEAR_M + 20)], at), null);
  assert.ok(nearestFlood([north(FLOOD_NEAR_M - 5)], at));
  assert.equal(nearestFlood([north(400)], at, 500).m, 400);
  assert.equal(nearestFlood([], at), null);
  assert.equal(nearestFlood(undefined, at), null);
});

test('missing family data hides the layers that have none', () => {
  assert.deepEqual(missingLayers(null), FAMILY_KEYS);
  assert.deepEqual(missingLayers({ childcare: [{}], polyclinics: [{}], clinics: [], flood: [{}] }), ['clinics']);
  assert.deepEqual(missingLayers({ childcare: [{}], polyclinics: [{}], clinics: [{}], flood: [{}] }), []);
});

test('sources for the layers that are on, positions deduplicated', () => {
  const S = [
    { layer: 'childcare', url: 'a', publisher: 'ECDA' }, { layer: 'childcare (positions)', url: 'b' }, { layer: 'clinics', url: 'c' },
    { layer: 'polyclinics', url: 'd' }, { layer: 'flood', url: 'e' }, { layer: 'geocoding', url: 'om' }, { layer: 'geocoding (flood junctions)', url: 'osm' },
  ];
  const r = sourcesFor(S, ['childcare', 'flood']);
  assert.deepEqual(r.main.map((x) => [x.key, x.s.url]), [['childcare', 'a'], ['flood', 'e']]);
  assert.deepEqual(r.pos.map((s) => s.url), ['b', 'om', 'osm']);
  const c = sourcesFor(S, ['clinics']);
  assert.deepEqual(c.main.map((x) => x.s.url), ['c']);
  assert.deepEqual(c.pos, []);
  assert.deepEqual(sourcesFor(undefined, ['flood']), { main: [], pos: [] });
});
