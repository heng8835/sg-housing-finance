// S1b lazy data (hdb-data-pipeline/docs/specs/lazy-data.md): the first map screen loads MAP_FILES, the rest follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_FILES, dataFilesFor, MAP_FILES, LATE_FILES, MAP_FILES_ALL, LATE_ORDER, mapFilesFor, lateFilesFor, OPTIONAL_FILES } from '../../app/core/data-loader.js';

test('map + late files = every data file, once, for any switch combination', () => {
  for (const on of [() => true, () => false, (n) => n !== 'btoData', (n) => n !== 'floodData']) {
    const map = mapFilesFor(on), late = lateFilesFor(on), all = dataFilesFor(on);
    assert.deepEqual([...map, ...late].sort(), all.slice().sort());
    assert.equal(map.filter((f) => late.includes(f)).length, 0, 'no file in both lists');
  }
  assert.deepEqual([...MAP_FILES, ...LATE_FILES].sort(), DATA_FILES.slice().sort());
});

test('data.js blocks the map; the big extras do not', () => {
  assert.equal(MAP_FILES[0], 'data/data.js');
  for (const f of ['data/poi.js', 'data/bus_routes.js', 'data/rents.js', 'data/commute.js', 'data/market.js']) {
    assert.ok(LATE_FILES.includes(f), `${f} loads after the first paint`);
  }
  assert.equal(LATE_FILES[0], 'data/poi.js', 'primary schools (a default layer) first');
  assert.equal(LATE_FILES.at(-1), 'data/bus_routes.js', 'bus routes (only for bus stop popups / compare) last');
});

test('switched-off feature files are in neither list', () => {
  const off = () => false;
  assert.ok(!mapFilesFor(off).includes('data/bto.js') && !lateFilesFor(off).includes('data/bto.js'));
  assert.ok(!mapFilesFor(off).includes('data/flood.js') && !lateFilesFor(off).includes('data/flood.js'));
});

test('lists only name known files; optional files stay optional', () => {
  for (const f of [...MAP_FILES_ALL, ...LATE_ORDER]) assert.match(f, /^data\/[a-z_]+\.js$/);
  assert.ok(OPTIONAL_FILES.has('data/commute.js') && OPTIONAL_FILES.has('data/market.js'));
});
