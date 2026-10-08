// Daily places search in the app's own data (core/placesearch.js) — replaces the OneMap search API (token-only now).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlaceIndex, searchPlaces, canon, matchTier, PLACE_MAX } from '../../app/core/placesearch.js';
import { setTownAliases } from '../../app/core/townalias.js';

const ZH = JSON.parse(readFileSync(new URL('../../app/i18n/towns.zh.json', import.meta.url), 'utf8'));

// small stand-ins with the generated files' shapes (tools/build_data.py, fetch_poi.py, fetch_family_health.py)
const hdb = {
  towns: ['ANG MO KIO', 'BISHAN', 'BUKIT BATOK', 'SENGKANG'],
  zones: ['North-East', 'Central', 'West', 'North-East'],
  streets: ['ANG MO KIO AVE 10', 'ANG MO KIO AVE 1', 'BISHAN ST 12', 'BT BATOK ST 21', 'RIVERVALE DR', "C'WEALTH CL"],
  blocks: [
    { b: '406', s: 0, t: 0, lat: 1.3620, lon: 103.8550 },
    { b: '407', s: 0, t: 0, lat: 1.3624, lon: 103.8554 },
    { b: '406', s: 1, t: 0, lat: 1.3610, lon: 103.8400 },
    { b: '123', s: 2, t: 1, lat: 1.3500, lon: 103.8480 },
    { b: '210', s: 3, t: 2, lat: 1.3480, lon: 103.7500 },
    { b: '101A', s: 4, t: 3, lat: 1.3830, lon: 103.9020 },
    { b: '1', s: 5, t: 1, lat: 1.3040, lon: 103.7980 },
  ],
  mrt: { stations: [
    { n: 'BISHAN MRT STATION', codes: ['NS17', 'CC15'], lat: 1.3510, lon: 103.8490 },
    { n: 'ANG MO KIO MRT STATION', codes: ['NS16'], lat: 1.3700, lon: 103.8495 },
    { n: 'RUMBIA LRT STATION', codes: ['SE2'], lat: 1.3913, lon: 103.9060 },
  ] },
};
const poi = {
  schools: [
    { n: 'Rivervale Primary School', lvl: 'PRIMARY', lat: 1.3840, lon: 103.9030 },
    { n: 'Ai Tong School', lvl: 'PRIMARY', lat: 1.3600, lon: 103.8330 },
    { n: 'Bishan Park Secondary School', lvl: 'SECONDARY', lat: 1.3540, lon: 103.8500 },
  ],
  malls: [{ n: 'Junction 8', lat: 1.3505, lon: 103.8485 }, { n: 'Northpoint City', lat: 1.4290, lon: 103.8360 }],
  hawkers: [{ n: 'Ang Mo Kio 628 Market', lat: 1.3800, lon: 103.8400 }],
  parks: [{ n: 'Bishan-Ang Mo Kio Park', lat: 1.3630, lon: 103.8440, ring: [] }],
};
const family = { polyclinics: [{ n: 'Ang Mo Kio Polyclinic', lat: 1.3740, lon: 103.8460 }] };
const index = buildPlaceIndex({ hdb, poi, family, lang: 'en' });
const labels = (q) => searchPlaces(index, q, { zhMap: setTownAliases(ZH) }).map((r) => r.label);

test('canon: street words shortened on both sides, block / punctuation dropped', () => {
  assert.equal(canon('Blk 406 Ang Mo Kio Avenue 10'), '406 ANG MO KIO AVE 10');
  assert.equal(canon('bukit batok street 21'), 'BT BATOK ST 21');
  assert.equal(canon("C'wealth Close"), 'CWEALTH CL');
  assert.equal(canon('Commonwealth Close'), 'CWEALTH CL');
});

test('query table: first result (exact > prefix > word > inside; towns, stations, streets, schools … blocks)', () => {
  const table = [
    ['bishan mrt', 'Bishan MRT'],
    ['Bishan MRT station', 'Bishan MRT'],
    ['NS17', 'Bishan MRT'],
    ['rivervale primary', 'Rivervale Primary School'],
    ['406 ang mo kio ave 10', '406 Ang Mo Kio Ave 10'],
    ['blk 406 ang mo kio avenue 10', '406 Ang Mo Kio Ave 10'],
    ['ang mo kio ave 10', 'Ang Mo Kio Ave 10'],
    ['bukit batok street 21', 'Bt Batok St 21'],
    ['宏茂桥', 'Ang Mo Kio'],
    ['junction 8', 'Junction 8'],
    ['ang mo kio polyclinic', 'Ang Mo Kio Polyclinic'],
    ['628 market', 'Ang Mo Kio 628 Market'],
    ['northpoint', 'Northpoint City'],
    ['point', 'Northpoint City'],
    ['rumbia', 'Rumbia LRT'],
    ['commonwealth close', "C'wealth Cl"],
  ];
  for (const [q, want] of table) assert.equal(labels(q)[0], want, q);
});

test('result shape is what the Daily places list uses: { label, sub, lat, lon, kind }', () => {
  const [r] = searchPlaces(index, 'bishan mrt');
  assert.deepEqual(Object.keys(r).sort(), ['kind', 'label', 'lat', 'lon', 'sub']);
  assert.deepEqual(r, { label: 'Bishan MRT', sub: 'NS17 · CC15', lat: 1.351, lon: 103.849, kind: 'mrt' });
  const [s] = searchPlaces(index, 'ang mo kio ave 10');
  assert.equal(s.kind, 'place'); assert.equal(s.sub, 'Ang Mo Kio');
  assert.ok(Math.abs(s.lat - 1.3622) < 1e-9 && Math.abs(s.lon - 103.8552) < 1e-9, 'street = centre of its blocks');
});

test('ranking: "ang mo kio" → town, then station, then streets; blocks last', () => {
  const r = searchPlaces(index, 'ang mo kio');
  assert.deepEqual(r.slice(0, 2).map((x) => x.kind), ['town', 'mrt']);
  assert.equal(r[0].sub, 'North-East');
  assert.ok(r.findIndex((x) => x.kind === 'block') > r.findIndex((x) => x.label === 'Ang Mo Kio Ave 10'));
  assert.ok(r.length <= PLACE_MAX);
});

test('numbers match whole words only; nonsense and short text find nothing', () => {
  assert.deepEqual(labels('40 ang mo kio'), []);
  assert.deepEqual(labels('406').sort(), ['406 Ang Mo Kio Ave 1', '406 Ang Mo Kio Ave 10']);
  assert.deepEqual(labels('xqzzy plover'), []);
  assert.deepEqual(labels('a'), []);
  assert.deepEqual(labels(''), []);
  assert.deepEqual(searchPlaces(buildPlaceIndex({}), 'bishan'), [], 'no data loaded → nothing, no crash');
});

test('中文: town name alone and inside an address; 中文 town label in zh', () => {
  setTownAliases(ZH);
  assert.equal(labels('宏茂桥 ave 10')[0], 'Ang Mo Kio Ave 10');
  const zhIndex = buildPlaceIndex({ hdb, poi, family, lang: 'zh', t: (s) => (s === 'North-East' ? '东北区' : s) });
  const [town] = searchPlaces(zhIndex, '宏茂桥');
  assert.equal(town.label, '宏茂桥'); assert.equal(town.kind, 'town'); assert.match(town.sub, /Ang Mo Kio · 东北区/);
});

test('matchTier: exact 0, prefix 1, word 2, inside 3, none -1', () => {
  const [mrt] = index.entries.filter((e) => e.label === 'Bishan MRT');
  assert.equal(matchTier(mrt, 'BISHAN MRT', ['BISHAN', 'MRT']), 0);
  assert.equal(matchTier(mrt, 'BISHAN', ['BISHAN']), 0, 'base name = exact');
  assert.equal(matchTier(mrt, 'BIS', ['BIS']), 1);
  assert.equal(matchTier(mrt, 'MRT BISHAN', ['MRT', 'BISHAN']), 2);
  assert.equal(matchTier(mrt, 'SHAN', ['SHAN']), 3);
  assert.equal(matchTier(mrt, 'TAMPINES', ['TAMPINES']), -1);
});
