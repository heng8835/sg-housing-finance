// floodData switch (app/config.js): PUB's flood-prone points live in data/flood.js (private build only — PUB's website
// terms allow personal viewing only). On → unchanged (fixtures); off → compare row "Not in this version" (PUB's list named, no link —
// linking to pub.gov.sg needs PUB's written permission),
// no PUB part in the sources line, no flood priority chip, no PUB row in Learn → About, no flood data merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { FEATURES } from '../../app/core/features.js';
import { familyData, floodOn, missingLayers } from '../../app/modules/explore/family.js';
import { createFamilyRows, sourcesCell, ROW_KEYS } from '../../app/modules/explore/familyrows.js';
import { chipsHtml, cleanTicks, liveTickIds, TICK_IDS } from '../../app/modules/explore/priorities.js';
import { aboutHtml, SOURCES } from '../../app/modules/learn/about.js';
import { pickRows, briefSections } from '../../app/modules/explore/brief.js';
import { policy } from '../helpers.js';

const ROOT = new URL('../../', import.meta.url);
const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
function withFlood(on, fn) { const was = FEATURES.floodData; FEATURES.floodData = on; try { return fn(); } finally { FEATURES.floodData = was; } }

const AT = { lat: 1.35, lon: 103.85 };
const north = (m, n = 'P') => ({ n, lat: AT.lat + m / 111195, lon: AT.lon });
const FAM = {
  sources: [{ layer: 'childcare', asOf: '2026-10-07' }, { layer: 'clinics', asOf: '2024-06-06' }, { layer: 'polyclinics', asOf: '2026-01-04' }, { layer: 'geocoding', url: 'onemap' }],
  childcare: [{ ...north(450, 'Little Ones'), vac: { n1: 'LAAAAAA' } }], polyclinics: [north(1234, 'Punggol Polyclinic')], clinics: [north(100, 'GP A')],
};
const FLOOD = { sources: [{ layer: 'flood', asOf: '2025-11' }, { layer: 'geocoding (flood junctions)', url: 'osm' }], flood: [north(120, 'Upper Road / Lower Road')] };

test('familyData: on → flood points + PUB source rows merged in; off → none (even from an older family.js)', () => {
  const on = familyData(FAM, FLOOD, true);
  assert.equal(on.flood, FLOOD.flood);
  assert.deepEqual(on.sources.map((s) => s.layer), ['childcare', 'clinics', 'polyclinics', 'geocoding', 'flood', 'geocoding (flood junctions)']);
  assert.equal(FAM.flood, undefined, 'the global is not changed');
  const off = familyData(FAM, FLOOD, false);
  assert.ok(!('flood' in off));
  assert.deepEqual(off.sources.map((s) => s.layer), ['childcare', 'clinics', 'polyclinics', 'geocoding']);
  const old = { ...FAM, flood: FLOOD.flood, sources: FAM.sources.concat(FLOOD.sources) }; // single-file family.js
  assert.ok(!('flood' in familyData(old, null, false)), 'switched off: an older family.js with flood points is stripped');
  assert.ok(!familyData(old, null, false).sources.some((s) => s.layer === 'flood'));
  assert.equal(familyData(old, null, true).flood, old.flood, 'switched on without flood.js: an older family.js still works');
  assert.equal(familyData(null, null, true), null);
  assert.equal(familyData(null, FLOOD, false), null);
  assert.deepEqual(missingLayers(familyData(null, FLOOD, true)), ['childcare', 'polyclinics', 'clinics']);
  assert.equal(withFlood(false, () => floodOn()), false);
  assert.equal(withFlood(true, () => floodOn()), true);
});

test('generated data: family.js carries no flood points; flood.js (private build only) has them', () => {
  const g = {}; vm.createContext(g); g.window = g;
  const famFile = new URL('app/data/family.js', ROOT), floodFile = new URL('app/data/flood.js', ROOT);
  if (existsSync(famFile)) {
    vm.runInContext(readFileSync(famFile, 'utf8'), g);
    assert.ok(!('flood' in g.HDB_FAMILY), 'family.js has no flood key');
    assert.ok(!g.HDB_FAMILY.sources.some((s) => s.layer === 'flood' || s.layer === 'geocoding (flood junctions)'));
    assert.ok(!('flood' in (g.HDB_FAMILY.legend || {})));
  }
  if (existsSync(floodFile)) { // absent in the public export
    vm.runInContext(readFileSync(floodFile, 'utf8'), g);
    assert.ok(Array.isArray(g.HDB_FLOOD.flood) && g.HDB_FLOOD.flood.length > 0);
    assert.equal(g.HDB_FLOOD.sources.map((s) => s.layer).join(' | '), 'flood | geocoding (flood junctions)'); // vm realm: compare text
    for (const p of g.HDB_FLOOD.flood) assert.ok(p.n && Number.isFinite(p.lat) && Number.isFinite(p.lon), p.n);
  }
});

test('compare row, switch off: "Not in this version — see PUB\'s list …" as plain text (no link); sources without PUB', () => {
  const fam = familyData(FAM, FLOOD, false);
  const rows = createFamilyRows({ policy, fam, flood: false }).rows();
  const row = rows.find((r) => r.k === ROW_KEYS.flood);
  const m = { b: { lat: AT.lat, lon: AT.lon } };
  const html = row.f(m);
  assert.equal(html, "Not in this version — see PUB's list of flood-prone areas (pub.gov.sg)");
  assert.doesNotMatch(html, /<a\b|https?:/, 'no link to pub.gov.sg (PUB terms: linking needs written permission)');
  assert.match(row.tip, /not included in this version/);
  assert.equal(row.v, undefined, 'never a "best in" measure');
  const src = strip(rows.find((r) => r.k === ROW_KEYS.sources).f(m));
  assert.equal(src, 'ECDA vacancies as of 2026-10-07 · MOH polyclinics · MOH CHAS clinic list as of 2024 · straight-line distances');
  assert.equal(strip(sourcesCell(null, false)), 'ECDA vacancies: not loaded · MOH polyclinics: not loaded · CHAS clinics: not loaded · straight-line distances');
  // the brief follows the row (built from the same rows): same text, in Simple and Pro
  const sec = briefSections(pickRows(rows, new Set(), 'simple'), m).find((s) => s.rows.some((r) => r.k === ROW_KEYS.flood));
  assert.equal(strip(sec.rows.find((r) => r.k === ROW_KEYS.flood).html), "Not in this version — see PUB's list of flood-prone areas (pub.gov.sg)");
  assert.ok(!/PUB/.test(strip(sec.rows.find((r) => r.k === ROW_KEYS.sources).html)));
});

test('compare row, switch on: unchanged (yes / metres / PUB date, PUB in the sources line)', () => {
  const fam = familyData(FAM, FLOOD, true);
  const rows = createFamilyRows({ policy, fam, flood: true }).rows();
  const m = { b: { lat: AT.lat, lon: AT.lon } };
  assert.match(strip(rows.find((r) => r.k === ROW_KEYS.flood).f(m)), /^Yes · 120 m Upper Road \/ Lower Road · PUB list as of 2025-11/);
  assert.match(strip(rows.find((r) => r.k === ROW_KEYS.sources).f(m)), /PUB flood-prone list as of 2025-11/);
});

test('priorities: no "No flood-prone point" chip and no saved flood tick with the switch off', () => {
  withFlood(false, () => {
    assert.ok(!chipsHtml([]).includes('data-prio="flood"'));
    assert.deepEqual(cleanTicks(['flood', 'mrt']), ['mrt']);
    assert.deepEqual(liveTickIds(), TICK_IDS.filter((id) => id !== 'flood'));
  });
  withFlood(true, () => {
    assert.ok(chipsHtml([]).includes('data-prio="flood"'));
    assert.deepEqual(cleanTicks(['flood', 'mrt']), ['flood', 'mrt']);
  });
});

test('Learn → About: the PUB row only with the switch on; off says so', () => {
  const on = aboutHtml({ floodOn: true }), off = aboutHtml({ floodOn: false });
  assert.ok(on.includes('Flood-prone areas (approximate)'));
  assert.ok(!off.includes('Flood-prone areas (approximate)'));
  assert.equal((off.match(/<tr>/g) || []).length, SOURCES.length, 'one row fewer (+ header)');
  assert.ok(off.includes(`Data sources and licences (${SOURCES.length - 1})`));
  assert.match(off, /Not in this version.*PUB&#39;s flood-prone areas are not included in this version\.|Not in this version.*PUB's flood-prone areas are not included in this version\./s);
  assert.doesNotMatch(on, /flood-prone areas are not included/);
});

test('中文: the new About / flood strings have entries', () => {
  const dict = Object.assign({}, ...['zh.json', 'zh-explore.json'].map((f) => JSON.parse(readFileSync(new URL(`app/i18n/${f}`, ROOT), 'utf8'))));
  for (const k of ["Not in this version — see PUB's list of flood-prone areas (pub.gov.sg)", "PUB's flood-prone areas are not included in this version.",
    "PUB's list of flood-prone areas is not included in this version. Check the streets near the flat on PUB's list, and ask the seller or neighbours about past floods."]) {
    assert.ok(dict[k], k);
  }
});
