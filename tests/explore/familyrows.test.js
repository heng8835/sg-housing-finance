// Phase 7 B2 "For the family" compare / brief section (app/modules/explore/familyrows.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createFamilyRows, familyFacts, cells, sourcesCell, sourceDate, shortSchool, hasPlace,
  SECTION, BEFORE_SECTION, ROW_KEYS, MERGED_SCHOOL_ROWS, OLD_CHILDCARE, SCHOOLS_SHOWN,
} from '../../app/modules/explore/familyrows.js';
import { primaryLike, p1Band, schoolBands } from '../../app/core/schools.js';
import { pickRows, briefSections } from '../../app/modules/explore/brief.js';
import { policy } from '../helpers.js';

const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
const BANDS = policy.get('p1.distance.bands_km');
const AT = { lat: 1.35, lon: 103.85 };
const north = (m, n = 'P') => ({ n, lat: AT.lat + m / 111195, lon: AT.lon }); // core/geo: 1° = 111.195 km
const B = { lat: AT.lat, lon: AT.lon };
const school = (m, n) => ({ ...north(m, n), lvl: 'PRIMARY' });
const SOURCES = [{ layer: 'childcare', asOf: '2026-10-07' }, { layer: 'clinics', asOf: '2024-06-06' }, { layer: 'polyclinics', asOf: '2026-01-04' }, { layer: 'flood', asOf: '2025-11' }];
const FAM = {
  sources: SOURCES,
  childcare: [{ ...north(200, 'Near Full'), vac: { n1: 'FFFFFFF' } }, { ...north(450, 'Little Ones'), vac: { n1: 'LAAAAAA', k1: 'FFFFFFF' } },
    { ...north(800, 'Big Tree'), vac: { pg: 'AAAAAAA' } }, { ...north(900, 'Quiet'), vac: { k2: '-AAAAAA' } }, { ...north(3000, 'Far Away'), vac: { k1: 'AAAAAAA' } }],
  polyclinics: [north(1234, 'Punggol Polyclinic'), north(5000, 'Other Polyclinic')],
  clinics: [north(100, 'GP A'), north(499, 'GP B'), north(510, 'GP C')],
  flood: [north(5000, 'Far Road / Junction')],
};
const facts = (fam, schools = []) => familyFacts({ fam, schools, at: AT, bandsKm: BANDS });

test('core/schools: P1 rule, band index and bands from policy (shared with Plan)', () => {
  assert.deepEqual(BANDS, [1, 2]);
  assert.ok(primaryLike({ lvl: 'PRIMARY' }) && primaryLike({ lvl: 'MIXED LEVEL (P1-S4)' }) && !primaryLike({ lvl: 'SECONDARY' }) && !primaryLike(null));
  assert.deepEqual([0.2, 1, 1.0001, 2, 2.5].map((k) => p1Band(k, BANDS)), [0, 0, 1, 1, 2]);
  const s = schoolBands([school(1500, 'B'), school(300, 'A'), school(2500, 'C')], AT, BANDS);
  assert.deepEqual([s.near.map((x) => x.item.n), s.second.map((x) => x.item.n), s.nearest.item.n], [['A'], ['B'], 'A']);
});

test('schools: count in the first band (best = max), nearest 3 with metres, band marked beyond 1 km, "+N more", 1–2 km count', () => {
  const list = [school(70, 'Mee Toh School'), school(398, 'Rivervale Primary School'), school(533, 'Greendale Primary School'), school(700, 'Horizon Primary School'), school(1400, 'Far Primary School')];
  assert.equal(strip(cells.schools(facts(null, list), BANDS)), '4 Mee Toh 70 m · Rivervale 398 m · Greendale 533 m · +1 more within 1 km 1 within 1–2 km');
  assert.equal(strip(cells.schools(facts(null, [school(830, 'Lakeside Primary School'), school(1400, 'Fuhua Primary School')]), BANDS)), '1 Lakeside 830 m · Fuhua 1.4 km (1–2 km band) 1 within 1–2 km');
  assert.equal(strip(cells.schools(facts(null, [school(2600, 'Lone School')]), BANDS)), '0 nearest: Lone 2.6 km — outside the P1 bands 0 within 1–2 km');
  assert.equal(strip(cells.schools(facts(null, []), BANDS)), 'poi.js missing'); // no data ≠ none
  assert.equal(SCHOOLS_SHOWN, 3);
  assert.equal(shortSchool('CHIJ St. Nicholas Girls\' School'), 'CHIJ St. Nicholas Girls\' School'); // only after a letter
  assert.equal(shortSchool('Kheng Cheng School'), 'Kheng Cheng');
  assert.equal(shortSchool('Maris Stella High School (Primary)'), 'Maris Stella High School (Primary)');
});

test('childcare: places now (available / limited) within 500 m / 1 km, of all centres, nearest with a place; none ≠ no data', () => {
  assert.ok(hasPlace({ vac: { a: 'L' } }) && !hasPlace({ vac: { a: 'F' } }) && !hasPlace({ vac: { a: '-A' } }));
  assert.equal(strip(cells.childcare(facts(FAM))), '1 within 500 m · 2 within 1 km of 4 centres within 1 km nearest with a place: Little Ones 450 m');
  const allFull = { ...FAM, childcare: [{ ...north(300, 'Full A'), vac: { n1: 'FAAAAAA' } }, { ...north(4000, 'Open far'), vac: { n1: 'AAAAAAA' } }] };
  assert.equal(strip(cells.childcare(facts(allFull))), 'None with a place within 1 km of 1 centre within 1 km nearest with a place: Open far 4.0 km');
  const empty = { ...FAM, childcare: [{ ...north(5000, 'Full far'), vac: { n1: 'F' } }] };
  assert.equal(strip(cells.childcare(facts(empty))), 'None with a place within 1 km no centres within 1 km no centre reports a place this month');
  for (const fam of [null, { ...FAM, childcare: [] }]) assert.equal(strip(cells.childcare(facts(fam))), 'no data ECDA vacancy list not loaded');
});

test('clinic: nearest polyclinic + CHAS within 500 m (list as of 2024); missing lists say so', () => {
  assert.equal(strip(cells.clinic(facts(FAM))), '1.2 km Punggol Polyclinic 2 CHAS clinics within 500 m (list as of 2024)');
  assert.equal(strip(cells.clinic(facts({ ...FAM, clinics: [north(10, 'GP')] }))), '1.2 km Punggol Polyclinic 1 CHAS clinic within 500 m (list as of 2024)');
  assert.equal(strip(cells.clinic(facts({ ...FAM, clinics: [] }))), '1.2 km Punggol Polyclinic CHAS clinic list not loaded');
  assert.equal(strip(cells.clinic(facts(null))), 'no data MOH polyclinic list not loaded CHAS clinic list not loaded');
});

test('flood: yes (nearest metres, PUB name, list date, count) / no (with date) / no data', () => {
  const asOf = sourceDate(FAM, 'flood');
  assert.equal(asOf, '2025-11');
  assert.equal(strip(cells.flood(facts(FAM), asOf)), 'No none within 300 m · PUB list as of 2025-11');
  const yes = { ...FAM, flood: [north(123, 'Upper Road / Lower Road'), north(290, 'Second Road'), north(310, 'Out')] };
  assert.equal(strip(cells.flood(facts(yes), asOf)), 'Yes · 120 m Upper Road / Lower Road · PUB list as of 2025-11 · 2 points within 300 m approximate road / junction position — ask the seller about past floods');
  assert.equal(strip(cells.flood(facts({ ...FAM, flood: [north(299, 'Edge')] }), asOf)), 'Yes · 300 m Edge · PUB list as of 2025-11 approximate road / junction position — ask the seller about past floods');
  assert.equal(strip(cells.flood(facts({ ...FAM, flood: [north(301, 'Just out')] }), asOf)), 'No none within 300 m · PUB list as of 2025-11');
  for (const fam of [null, { ...FAM, flood: [] }]) assert.equal(strip(cells.flood(facts(fam), null)), 'no data PUB flood-prone list not loaded');
});

test('sources line: ECDA date, MOH, CHAS 2024, PUB date; missing lists named', () => {
  assert.equal(strip(sourcesCell(FAM)), 'ECDA vacancies as of 2026-10-07 · MOH polyclinics · MOH CHAS clinic list as of 2024 · PUB flood-prone list as of 2025-11 · straight-line distances');
  assert.equal(strip(sourcesCell(null)), 'ECDA vacancies: not loaded · MOH polyclinics: not loaded · CHAS clinics: not loaded · PUB flood-prone list: not loaded · straight-line distances');
});

// the legacy rows the section touches (keys / sections as in legacy.js BASE_ROWS + commute)
const legacyRows = () => [
  { sec: 'Price & value' }, { k: 'Asking price', f: () => 'S$1', v: () => 1, best: 'min' },
  { sec: 'Commute' }, { k: 'Workplaces', f: () => 'add' },
  { sec: BEFORE_SECTION }, { k: 'Nearest MRT', f: () => '484 m', v: () => 484, best: 'min' }, { k: 'Nearest future MRT station', f: () => 'x' },
  { k: ROW_KEYS.schools, f: () => 'old', v: () => 3, best: 'max' }, { k: MERGED_SCHOOL_ROWS[0], f: () => '9', v: () => 9, best: 'max' },
  { k: MERGED_SCHOOL_ROWS[1], f: () => '848 m', v: () => 848, best: 'min' }, { k: 'Town / region', f: () => 'Bishan' },
  { sec: 'Environment & feng shui' }, { k: 'Park', f: () => 'p' }, { k: OLD_CHILDCARE, f: () => '8', v: () => 8, best: 'max' },
];
const SIMPLE = new Set(['Asking price', 'Nearest MRT', 'Primary schools within 1 km', 'Workplaces']);
const M = { b: B, c: { name: 'x' } };

test('insert: section before Location (after Commute); school rows merged, POI childcare replaced, MRT moved; one measure', () => {
  const fam = createFamilyRows({ policy, fam: FAM, schools: () => [school(500, 'A School')] });
  const r = fam.insert(legacyRows());
  assert.deepEqual(r.map((x) => x.sec || x.k), ['Price & value', 'Asking price', 'Commute', 'Workplaces', SECTION, ROW_KEYS.schools, ROW_KEYS.childcare, ROW_KEYS.clinic,
    ROW_KEYS.flood, 'Nearest MRT', ROW_KEYS.sources, BEFORE_SECTION, 'Nearest future MRT station', 'Town / region', 'Environment & feng shui', 'Park']);
  const sec = r.slice(r.findIndex((x) => x.sec === SECTION) + 1, r.findIndex((x) => x.sec === BEFORE_SECTION));
  assert.deepEqual(sec.filter((x) => x.v).map((x) => x.k), [ROW_KEYS.schools, 'Nearest MRT'], 'only the school count (same measure as before) and the moved MRT row are best-in-row');
  assert.equal(sec[0].v(M), 1);
  assert.equal(sec.find((x) => x.k === 'Nearest MRT').f(), '484 m', 'MRT row moved unchanged');
  assert.ok(sec.filter((x) => x.k !== 'Nearest MRT' && x.k !== ROW_KEYS.sources).every((x) => x.tip), 'tips on the new rows');
  assert.equal(r.filter((x) => x.v).length, legacyRows().filter((x) => x.v).length - 3, 'the 2 km, nearest-school and POI childcare measures leave');
  // no ECDA list: the POI childcare row stays (its meaning is not lost), the family row says "no data"
  const r2 = createFamilyRows({ policy, fam: { ...FAM, childcare: [] }, schools: () => [] }).insert(legacyRows());
  assert.ok(r2.some((x) => x.k === OLD_CHILDCARE));
  assert.equal(strip(r2.find((x) => x.k === ROW_KEYS.childcare).f(M)), 'no data ECDA vacancy list not loaded');
  assert.equal(r2.find((x) => x.k === ROW_KEYS.schools).v(M), null);
});

test('Simple mode and the brief: every family row is kept (Simple rows first), Location drops out of Simple', () => {
  const fam = createFamilyRows({ policy, fam: FAM, schools: () => [school(500, 'A School')] });
  const r = fam.insert(legacyRows());
  const simple = pickRows(r, SIMPLE, 'simple');
  assert.deepEqual(simple.map((x) => x.sec || x.k), ['Price & value', 'Asking price', 'Commute', 'Workplaces', SECTION, ROW_KEYS.schools, ROW_KEYS.childcare, ROW_KEYS.clinic, ROW_KEYS.flood, 'Nearest MRT', ROW_KEYS.sources]);
  const brief = briefSections(simple, M, { label: (x) => x.lbl ?? x.k });
  const sec = brief.find((s) => s.sec === SECTION);
  assert.deepEqual(sec.rows.map((x) => x.label), [ROW_KEYS.schools, ROW_KEYS.childcare, ROW_KEYS.clinic, 'Flood-prone point within 300 m', 'Nearest MRT', 'Sources']);
  // "no data" rows still print (never read as "none")
  const nd = createFamilyRows({ policy, fam: null, schools: () => [] }).insert(legacyRows());
  const ndSec = briefSections(pickRows(nd, SIMPLE, 'simple'), M).find((s) => s.sec === SECTION);
  assert.deepEqual(ndSec.rows.map((x) => x.k), [ROW_KEYS.childcare, ROW_KEYS.clinic, ROW_KEYS.flood, 'Nearest MRT', ROW_KEYS.sources], 'only the muted "poi.js missing" school cell is skipped, as before');
});

test('characterisation: compare-phase7a-family*.txt = 7a + the family section; header N − 3; nothing else changes', () => {
  const read = (f) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8').split(/\r?\n/);
  const key = (l) => l.split(' | ')[0];
  const GONE = [`${ROW_KEYS.schools}i`, `${MERGED_SCHOOL_ROWS[0]}i`, MERGED_SCHOOL_ROWS[1], `${OLD_CHILDCARE}i`, 'Nearest MRTi'];
  const NEW = ['FOR THE FAMILY |', `${ROW_KEYS.schools}i`, `${ROW_KEYS.childcare}i`, `${ROW_KEYS.clinic}i`, 'Flood-prone point within 300 mi', 'Nearest MRTi', 'Sources'];
  for (const [a, b] of [['compare-phase7a.txt', 'compare-phase7a-family.txt'], ['compare-phase7a-fv.txt', 'compare-phase7a-family-fv.txt'], ['compare-phase7a-nobto.txt', 'compare-phase7a-family-nobto.txt']]) {
    const o = read(a), n = read(b);
    const fs = n.findIndex((l) => l === NEW[0]);
    assert.deepEqual(n.slice(fs, fs + NEW.length).map(key), NEW, `${b}: section rows in order`);
    assert.equal(n[fs + NEW.length], 'LOCATION & CONVENIENCE |', `${b}: right before Location`);
    assert.ok(n[fs - 1].startsWith('Workplaces') && n[fs - 2] === 'COMMUTE |', `${b}: right after Commute`);
    assert.equal(n[fs + 5], o.find((l) => key(l) === 'Nearest MRTi'), 'MRT row moved verbatim');
    const os = o.filter((l) => !GONE.includes(key(l))), ns = n.filter((l, i) => i < fs || i >= fs + NEW.length);
    assert.equal(os.length, ns.length, b);
    os.forEach((l, i) => {
      if (i === 0) assert.equal(ns[i].replace(/best in \d+ of \d+/g, ''), l.replace(/best in \d+ of \d+/g, ''), `${b}: header names`);
      else assert.equal(ns[i], l, `${b}: unchanged ${key(l)}`);
    });
    const counts = (l) => [...l.matchAll(/best in (\d+) of (\d+)/g)].map((x) => [+x[1], +x[2]]);
    const co = counts(o[0]), cn = counts(n[0]);
    cn.forEach(([, N], i) => assert.equal(N, co[i][1] - 3, `${b}: N − 3`));
    // only Punggol (column 2) won the dropped measures (2 km schools, nearest school, childcare ≤ 500 m)
    assert.deepEqual(cn.map(([w]) => w), co.map(([w], i) => (i === 1 ? w - 3 : w)), `${b}: wins`);
    // the school count (the kept measure) is unchanged
    const head = (l) => l.split(' | ').slice(1).map((c) => parseInt(c, 10));
    assert.deepEqual(head(n[fs + 1]), head(o.find((l) => key(l) === `${ROW_KEYS.schools}i`)));
  }
  // the seed flats' family rows (data to Sep 2026, ECDA list of 7 Oct 2026)
  const n = read('compare-phase7a-family.txt'), row = (k) => n.find((l) => key(l) === k).split(' | ').slice(1);
  assert.deepEqual(row(`${ROW_KEYS.schools}i`), ['3 Kheng Cheng 848 m · Kuo Chuan Presbyterian 892 m · First Toa Payoh 939 m 6 within 1–2 km',
    '6 Mee Toh 70 m · Rivervale 398 m · Greendale 533 m · +3 more within 1 km 9 within 1–2 km',
    '1 Lakeside 830 m · Fuhua 1.4 km (1–2 km band) · Shuqun 1.6 km (1–2 km band) 5 within 1–2 km']);
  assert.ok(row('Flood-prone point within 300 mi').every((c) => c === 'No none within 300 m · PUB list as of 2025-11'));
  assert.ok(row(`${ROW_KEYS.clinic}i`).every((c) => / Polyclinic \d+ CHAS clinics within 500 m \(list as of 2024\)$/.test(c)));
  assert.ok(row(`${ROW_KEYS.childcare}i`).every((c) => /^\d+ within 500 m · \d+ within 1 km of \d+ centres within 1 km nearest with a place: .+ \d+ m$/.test(c)));
});

test('中文: every string familyrows.js shows has an entry with the same placeholders; zh-explore.json valid, no duplicate keys', () => {
  const raw = (f) => readFileSync(new URL(`../../app/i18n/${f}`, import.meta.url), 'utf8');
  const dict = Object.assign({}, ...['zh-guide.json', 'zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(raw(f))));
  const ph = (s) => (s.match(/\{\d\}/g) || []).sort().join();
  const src = readFileSync(new URL('../../app/modules/explore/familyrows.js', import.meta.url), 'utf8');
  const lit = [...src.matchAll(/\bt\('([^']*)'/g), ...src.matchAll(/\bt\("([^"]*)"/g)].map((x) => x[1]);
  const labels = [...src.matchAll(/'([^']*\{0\}[^']*)'/g)].map((x) => x[1]);
  const nd = [...src.matchAll(/noData\('([^']*)'\)/g)].map((x) => x[1]);
  const keys = [...new Set([...lit, ...labels, ...nd, SECTION, ROW_KEYS.schools, ROW_KEYS.childcare, ROW_KEYS.clinic, ROW_KEYS.mrt])].filter((k) => /[A-Za-z]/.test(k));
  assert.ok(keys.length > 35, String(keys.length));
  for (const k of keys) { assert.ok(dict[k], `missing 中文: ${k}`); assert.equal(ph(dict[k]), ph(k), k); }
  for (const k of keys) if (dict[k] && /[您你]/.test(dict[k])) assert.ok(!/你/.test(dict[k]), `use 您: ${k}`);
  const ks = [...raw('zh-explore.json').matchAll(/^\s*"(.*?)": "/gm)].map((x) => x[1]);
  assert.equal(ks.length, new Set(ks).size, 'zh-explore.json: duplicate keys');
});
