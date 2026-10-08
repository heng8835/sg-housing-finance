import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, withinKm, nearest } from '../../app/core/geo.js';
import { close } from '../helpers.js';

const bishan = { lat: 1.3508, lon: 103.8484 };   // Bishan MRT (approx.)
const toaPayoh = { lat: 1.3327, lon: 103.8474 }; // Toa Payoh MRT (approx.)

test('distanceKm: known short distances', () => {
  assert.equal(distanceKm(bishan, bishan), 0);
  assert.ok(close(distanceKm(bishan, toaPayoh), 2.015, 0.02), String(distanceKm(bishan, toaPayoh)));
  // 0.01° of latitude ≈ 1.112 km anywhere
  assert.ok(close(distanceKm({ lat: 1.3, lon: 103.8 }, { lat: 1.31, lon: 103.8 }), 1.112, 0.002));
  assert.equal(distanceKm(bishan, toaPayoh), distanceKm(toaPayoh, bishan));
});

test('withinKm sorts by distance and skips bad points; nearest', () => {
  const pts = [{ n: 'far', lat: 1.40, lon: 103.85 }, { n: 'tp', ...toaPayoh }, { n: 'bad', lat: null, lon: 1 }, { n: 'near', lat: 1.3518, lon: 103.8484 }];
  const r = withinKm(pts, bishan, 2.1);
  assert.deepEqual(r.map((x) => x.item.n), ['near', 'tp']);
  assert.equal(nearest(pts, bishan).item.n, 'near');
  assert.equal(nearest([], bishan), null);
});
