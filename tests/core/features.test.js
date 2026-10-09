// Feature switches (DEC-015 part 1): the btoData switch hides every BTO-dataset feature — data file, map layer,
// compare row, future-value BTO part, Plan project list, guide target — while code and data stay in the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BUILD_FEATURES } from '../../app/config.js';
import { FEATURES, feature, parseFeatureOverrides, resolveFeatures, FEATURE_TARGETS, targetOff } from '../../app/core/features.js';
import { DATA_FILES, DATA_FILES_ALL, FEATURE_FILES, OPTIONAL_FILES, dataFilesFor } from '../../app/core/data-loader.js';
import { data } from '../../app/core/data.js';
import { query } from '../../app/core/spotlight.js';
import { btoSection } from '../../app/modules/plan/bto.js';
import { scoreSupply, RATIONALES } from '../../app/engine/futurevalue.js';
import { TIPS, howHtml, ARG_FORMATS, cellHtml } from '../../app/modules/explore/futurevalue-ui.js';
import { FUTURE_VALUE_PARAMS } from '../../app/modules/explore/futurevalue-params.js';
import { USE_CASES } from '../../app/modules/guide/steps.js';
import { defaults } from '../../app/core/store.js';
import { policy } from '../helpers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = join(ROOT, 'app');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const BTO_ROW = 'Upcoming BTO supply within 1 km';

/** Run fn with FEATURES[name] = on, then restore. */
function withFeature(name, on, fn) {
  const was = FEATURES[name];
  FEATURES[name] = on;
  try { return fn(); } finally { FEATURES[name] = was; }
}
/** Count reads of globalThis.HDB_BTO while fn runs (the global is "missing": the getter returns undefined). */
function btoReads(fn, value) {
  let reads = 0;
  Object.defineProperty(globalThis, 'HDB_BTO', { configurable: true, get() { reads += 1; return value; } });
  try { fn(); } finally { delete globalThis.HDB_BTO; }
  return reads;
}

test('switch API: private build default on; ?features=-btoData turns it off; a URL never turns a feature on', () => {
  // private default is true; the public export writes false — both builds must pass this suite
  assert.deepEqual(Object.keys(BUILD_FEATURES), ['btoData', 'floodData']);
  assert.equal(typeof BUILD_FEATURES.btoData, 'boolean');
  assert.equal(typeof BUILD_FEATURES.floodData, 'boolean');
  assert.equal(feature('floodData'), BUILD_FEATURES.floodData);
  assert.equal(feature('btoData'), BUILD_FEATURES.btoData, 'node has no ?features= → build default');
  assert.equal(feature('noSuchFeature'), false);
  assert.deepEqual(parseFeatureOverrides('?features=-btoData'), { btoData: false });
  assert.deepEqual(parseFeatureOverrides('?a=1&features=-btoData,-x'), { btoData: false, x: false });
  assert.deepEqual(parseFeatureOverrides('?features=btoData,+btoData'), {}, 'only "-name" tokens count');
  assert.deepEqual(parseFeatureOverrides(''), {});
  assert.deepEqual(resolveFeatures({ btoData: true }, '?features=-btoData'), { btoData: false });
  assert.deepEqual(resolveFeatures({ btoData: true }, '?features=-unknown'), { btoData: true }, 'unknown names ignored');
  assert.deepEqual(resolveFeatures({ btoData: false }, '?features=btoData'), { btoData: false }, 'public build: off stays off');
});

test('data loader: data/bto.js / data/flood.js are loaded only with btoData / floodData on (and nothing else changes)', () => {
  assert.deepEqual(FEATURE_FILES, { 'data/bto.js': 'btoData', 'data/flood.js': 'floodData' });
  const gone = Object.entries(FEATURE_FILES).filter(([, k]) => !BUILD_FEATURES[k]).map(([f]) => f);
  assert.deepEqual(DATA_FILES, DATA_FILES_ALL.filter((f) => !gone.includes(f)),
    'build default: every file (private) or every file but bto.js + flood.js (public), same order as before');
  assert.deepEqual(dataFilesFor((name) => name !== 'btoData'), DATA_FILES_ALL.filter((f) => f !== 'data/bto.js'));
  assert.deepEqual(dataFilesFor((name) => name !== 'floodData'), DATA_FILES_ALL.filter((f) => f !== 'data/flood.js'));
  assert.ok(OPTIONAL_FILES.has('data/flood.js'), 'flood.js is optional: a missing file never stops the app');
  assert.ok(DATA_FILES_ALL.indexOf('data/flood.js') > DATA_FILES_ALL.indexOf('data/family.js'));
});

test('switch off: nothing reads HDB_BTO (global missing) — core/data, Plan BTO card, guide targets', () => {
  // the trap works: with the switch on, core/data reads the global
  assert.equal(btoReads(() => withFeature('btoData', true, () => data.bto)), 1);
  const plan = { ...defaults().plan, btoPrice: 450000, btoKeys: '2029-06', btoFt: '4 ROOM' };
  const h = defaults().household;
  let html = '';
  const reads = btoReads(() => withFeature('btoData', false, () => {
    assert.equal(data.bto, null);
    html = btoSection({ h, f: null, plan, policy, today: '2026-10-07' });
  }), { projects: [{ n: 'Should Not Show', lat: 1.35, lon: 103.85, top: 'Dec 2029', units: 999 }] });
  assert.equal(reads, 0, 'HDB_BTO never read with btoData off');
  assert.match(html, /id="planBto"/, 'the card stays (Start here / guides scroll to it)');
  assert.doesNotMatch(html, /data-p="plan\.btoId"|Should Not Show/, 'no project list');
  assert.match(html, /data-bto-key="typed\|4 ROOM"/, 'typed price, kept per flat type (Phase 7 A7)');
  assert.match(html, /data-p="plan\.btoKeys"/, 'typed key collection month');
  assert.match(html, /BTO project details are not included in this version/);
  assert.match(html, /Pick a flat on the map/, 'no focus flat → hint, no resale comparison');
  assert.match(html, /data-fold="btoPay"/, 'payment stages from the typed price');
  assert.match(html, /expected Jun 2029/, 'key collection stage dated from the typed month');
  // key date → wait months
  assert.match(html, /32 months/);
  // a past month → notice, no payment fold
  const past = withFeature('btoData', false, () => btoSection({ h, f: null, plan: { ...plan, btoKeys: '2025-01' }, policy, today: '2026-10-07' }));
  assert.match(past, /That key collection month has passed/);
  assert.doesNotMatch(past, /data-fold="btoPay"/);
});

test('switch off: Plan card compares with resale + rent around the focus flat', () => {
  const was = globalThis.HDB_DATA;
  globalThis.HDB_DATA = {
    blocks: [{ lat: 1.35, lon: 103.85, t: 0 }], towns: ['TOWN'], flat_types: ['4 ROOM'], months: ['2026-08', '2026-09'],
    tx: { p: [600000, 640000], m: [0, 1], ft: [0, 0], b: [0, 0] },
  };
  try {
    const plan = { ...defaults().plan, btoPrice: 450000, btoKeys: '2029-06', btoFt: '4 ROOM' };
    const html = withFeature('btoData', false, () => btoSection({ h: defaults().household, f: { bid: 0, flatType: '4 ROOM' }, plan, policy, today: '2026-10-07' }));
    assert.match(html, /Resale within 1 km of your flat/);
    assert.match(html, /S\$620,000/, 'median of the two nearby sales');
    // no rent data and no rent typed: the rent while waiting is unknown → no verdict (Phase 7 A7: never a silent S$0)
    assert.doesNotMatch(html, /costs about/);
    assert.match(html, /Enter your rent now to see a comparison/);
    const free = withFeature('btoData', false, () => btoSection({ h: defaults().household, f: { bid: 0, flatType: '4 ROOM' }, plan: { ...plan, rentNow: 0 }, policy, today: '2026-10-07' }));
    assert.match(free, /BTO route costs about S\$170,000 less/, 'typed rent 0 (living rent-free) → price only');
  } finally { globalThis.HDB_DATA = was; }
});

test('guide / tour targets of a switched-off feature count as missing → fallback + note as written', () => {
  // 7b B5 (K6 / O7): only the BTO project picker is switched off — the BTO card (#planBto) exists in both builds
  const PICKER = '[data-p="plan.btoId"]';
  assert.deepEqual(FEATURE_TARGETS, { [PICKER]: 'btoData' });
  assert.equal(targetOff(PICKER), !BUILD_FEATURES.btoData);
  withFeature('btoData', false, () => {
    assert.equal(targetOff(PICKER), true);
    assert.equal(query(PICKER), null, 'no DOM lookup at all (node has no document)');
    assert.equal(targetOff('#planBto'), false, 'the typed BTO card is a valid target with btoData off');
    assert.equal(targetOff('#tabbtn-plan'), false);
  });
  const guides = JSON.parse(read('app/content/guides.json')).guides;
  const steps = [...Object.values(guides).flatMap((g) => g.steps.map((s) => ({ ...s, where: g.id }))),
    ...USE_CASES.flatMap((u) => u.steps.map((s) => ({ ...s, if_missing: s.ifMissing || s.bodyIfMissing, where: `tour ${u.id}` })))];
  const gated = steps.filter((s) => FEATURE_TARGETS[s.target]);
  assert.ok(gated.some((s) => s.where === 'bto-vs-resale'), 'bto-vs-resale guide targets the project picker');
  assert.ok(gated.some((s) => s.where === 'tour btoVsResale'), 'the BTO tour targets the project picker');
  for (const s of gated) {
    assert.ok(s.fallback?.includes('#planBto'), `${s.where}: ${s.target} falls back to the BTO card`);
    assert.ok(s.if_missing, `${s.where}: ${s.target} has a missing note`);
  }
  // with btoData off every BTO tour step still finds the card (no step depends on the project list alone)
  const bto = USE_CASES.find((u) => u.id === 'btoVsResale');
  for (const s of bto.steps) assert.ok(!FEATURE_TARGETS[s.target] || s.fallback.some((f) => !targetOff(f)), s.title);
  // no tour step points at the BTO map layer (layer rows live in #layers)
  assert.ok(!USE_CASES.some((u) => u.steps.some((s) => /#layers|lyr|layer/i.test(`${s.target} ${(s.fallback || []).join(' ')}`) && /bto/i.test(s.body))));
});

test('future value, switch off: supply = MOP wave only, says so; no BTO part, no external BTO listing source', () => {
  const p = FUTURE_VALUE_PARAMS.supply;
  const f = { btoUnits: 0, btoProjects: 0, btoUnknown: 0, mopUnits: 2107, mopBlocks: 3, stock: 40064, hasBto: false, btoOff: true, mopYears: 5 };
  const d = scoreSupply(f, p, 2026);
  assert.equal(d.rationale.id, 'fv.supply.bto-off');
  assert.equal(d.metric, 2107);
  assert.deepEqual(d.parts.map((x) => x.label), ['MOP-wave units', 'Existing units']);
  assert.equal(d.partial, true);
  assert.equal(p.capWhenPartial, 4);
  const none = scoreSupply({ ...f, mopUnits: 0 }, p, 2026);
  assert.equal(none.score, 4, '~0 flats without BTO data is not the top score');
  assert.equal(scoreSupply({ ...f, btoOff: false, hasBto: true, mopUnits: 0 }, p, 2026).score, 5, 'switch on: unchanged');
  assert.equal(scoreSupply({ ...f, btoOff: false, hasBto: true }, p, 2026).partial, undefined);
  assert.match(cellHtml(none), /4\/5 \(partial\) · ~0 flats within 1 km/);
  assert.doesNotMatch(cellHtml({ ...none, partial: undefined }), /partial/);
  assert.match(RATIONALES['fv.supply.bto-off'], /BTO supply not included in this version\./);
  assert.equal(ARG_FORMATS['fv.supply.bto-off'].length, 5);
  // switch on, BTO missing → unchanged old path
  assert.equal(scoreSupply({ ...f, btoOff: false }, p, 2026).rationale.id, 'fv.supply.no-bto');
  assert.match(TIPS.supply(FUTURE_VALUE_PARAMS, policy, true), /BTO supply not included in this version, so the score is at most 4\/5 and marked partial/);
  assert.match(TIPS.supply(FUTURE_VALUE_PARAMS, policy), /upcoming BTO projects/);
  const off = howHtml({ policy, market: null, hdb: null, btoOff: true }), on = howHtml({ policy, market: null, hdb: null });
  assert.doesNotMatch(off, /external BTO listing|external BTO listing|BTO and curated/);
  assert.match(on, /external BTO listing/);
});

test('every HDB_BTO read in app/ is behind the switch (legacy.js, core/data.js); the compare row is removed by key', () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'data') walk(p); } else if (/\.js$/.test(n)) files.push(p); } };
  walk(APP);
  const reads = files.flatMap((p) => readFileSync(p, 'utf8').split('\n').map((l, i) => ({ p, i, l })))
    .filter(({ l }) => /\b(window|globalThis|g\(\))\.HDB_BTO\b/.test(l) && !/^\s*(\/\/|\/?\*)/.test(l)); // reads, not comments
  assert.equal(reads.length, 3, 'core/data.js bto + legacy.js BTOP + future-value ctx');
  for (const { p, i, l } of reads) assert.match(l, /BTO_ON \?|feature\('btoData'\)/, `${p}:${i + 1} reads HDB_BTO without the switch`);
  const legacy = read('app/modules/explore/legacy.js');
  assert.ok(legacy.includes(`{ k: '${BTO_ROW}',`), 'row key still defined');
  assert.ok(legacy.includes(`if (!BTO_ON) BASE_ROWS.splice(BASE_ROWS.findIndex((x) => x.k === '${BTO_ROW}'), 1);`));
  assert.match(legacy, /if \(!BTO_ON\) \{ delete layers\.bto; document\.querySelector\('#layers input\[data-l="bto"\]'\)/, 'layer + legend row removed');
});

test('the BTO source is never named in app code; its neutral wording is only in the removed row tip and the gated source line', () => {
  const hits = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (!['data', 'i18n'].includes(n)) walk(p); } else if (/\.(js|html|json)$/.test(n)) readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (/external BTO listing/i.test(l) && !/^\s*(\/\/|\/?\*)/.test(l)) hits.push({ p: p.slice(APP.length + 1).replace(/\\/g, '/'), l }); }); } };
  walk(APP);
  assert.deepEqual(hits, [], 'no source name in app code (the public export used to rewrite it, which broke the 中文 key)');
  const neutral = []; const walk2 = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (!['data', 'i18n'].includes(n)) walk2(p); } else if (/\.js$/.test(n)) readFileSync(p, 'utf8').split('\n').forEach((l) => { if (/external BTO listing/.test(l)) neutral.push({ p: p.slice(APP.length + 1).replace(/\\/g, '/'), l }); }); } };
  walk2(APP);
  assert.deepEqual(neutral.map((h) => h.p).sort(), ['modules/explore/futurevalue-ui.js', 'modules/explore/legacy.js']);
  assert.ok(neutral.find((h) => h.p.endsWith('legacy.js')).l.includes(`{ k: '${BTO_ROW}',`), 'legacy: only the BTO row tip (row spliced out when off)');
  assert.match(neutral.find((h) => h.p.endsWith('futurevalue-ui.js')).l, /btoOff \? null : 'Upcoming BTO projects: an external BTO listing/, 'fv source line gated');
  assert.doesNotMatch(withFeature('btoData', false, () => btoSection({ h: defaults().household, f: null, plan: defaults().plan, policy, today: '2026-10-07' })), /external BTO listing/i);
});

test('characterisation: the BTO-off compare table = the BTO-on one minus one row (supply values MOP-only)', () => {
  const lines = (f) => read(`tests/fixtures/${f}`).split(/\r?\n/);
  const on = lines('compare-phase7a-fv.txt'), off = lines('compare-phase7a-nobto.txt');
  const key = (l) => l.split(' | ')[0];
  assert.deepEqual(off.map(key), on.map(key).filter((k) => k !== `${BTO_ROW}i`), 'same rows, same order, one fewer');
  assert.equal(on.length - off.length, 1);
  const SUPPLY = 'Supply risk (BTO + MOP wave)i';
  const onBy = new Map(on.slice(1).map((l) => [key(l), l]));
  for (const l of off.slice(1)) if (key(l) !== SUPPLY) assert.equal(l, onBy.get(key(l)), `unchanged: ${key(l)}`);
  // header: the BTO row (v = units, best = max) no longer counts — one measure fewer; flat 1 had the most BTO units
  assert.match(on[0], /best in 4 of 30 measures .* best in 15 of 30 measures .* best in 11 of 30 measures$/);
  assert.match(off[0], /best in 3 of 29 measures .* best in 15 of 29 measures .* best in 11 of 29 measures$/);
  assert.equal(off[0].replace(/best in \d+ of \d+/g, ''), on[0].replace(/best in \d+ of \d+/g, ''));
  const sup = off.find((l) => key(l) === SUPPLY).split(' | ').slice(1);
  assert.equal(sup.length, 3);
  for (const c of sup) {
    assert.match(c, /^[1-4]\/5 \(partial\) · /, 'capped at capWhenPartial (4) and marked partial');
    assert.match(c, /BTO supply not included in this version\.$/);
    assert.doesNotMatch(c, /upcoming BTO/);
  }
});

const PYTHON = ['python3', 'python'].find((cmd) => {
  try { return spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0; } catch { return false; }
});

test('offline copy: build_sw_manifest.py leaves data/bto.js out when app/config.js has btoData: false', (t) => {
  if (!PYTHON) return t.skip('python not found');
  const dir = mkdtempSync(join(tmpdir(), 'sghf-feat-'));
  const put = (p, text) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); };
  try {
    put('index.html', '<script type="module" src="main.js"></script>\n');
    put('main.js', "import './core/data-loader.js';\n");
    put('core/data-loader.js', "export const DATA_FILES_ALL = ['data/data.js', 'data/bto.js'];\n"
      + "export const FEATURE_FILES = { 'data/bto.js': 'btoData' };\nexport const DATA_FILES = DATA_FILES_ALL;\n");
    put('data/data.js', 'window.HDB_DATA = {};\n');
    put('data/bto.js', 'window.HDB_BTO = {};\n');
    const build = (cfg) => {
      put('config.js', `// e.g. export const BUILD_FEATURES = { btoData: ${!cfg} };\nexport const BUILD_FEATURES = { btoData: ${cfg} };\n`);
      const r = spawnSync(PYTHON, [join(ROOT, 'tools', 'build_sw_manifest.py'), '--app', dir], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(readFileSync(join(dir, 'sw-manifest.json'), 'utf8'));
    };
    const on = build(true);
    assert.deepEqual(on.data, ['data/data.js', 'data/bto.js']);
    assert.ok(on.shell.includes('config.js'), 'config.js is part of the offline shell');
    assert.deepEqual(build(false).data, ['data/data.js'], 'public build: bto.js not precached (comment line ignored)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('中文: every new string in plan/bto.js has an entry; the dictionaries stay valid with no duplicate keys', () => {
  const raw = (f) => read(`app/i18n/${f}`);
  for (const f of ['zh.json', 'zh-explore.json', 'zh-engine.json']) {
    const text = raw(f);
    JSON.parse(text);
    const keys = [...text.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)].map((m) => m[1]);
    assert.equal(new Set(keys).size, keys.length, `${f}: duplicate keys`);
  }
  const zh = Object.assign({}, ...['zh.json', 'zh-explore.json', 'zh-engine.json'].map((f) => JSON.parse(raw(f))));
  const src = read('app/modules/plan/bto.js');
  const keys = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(keys.length > 20);
  for (const k of keys) assert.ok(zh[k], `zh missing: ${k}`);
  assert.ok(zh[RATIONALES['fv.supply.bto-off']]);
  for (const v of ['Expected key collection (month)', 'Resale within {0} km of your flat']) assert.match(zh[v], /[一-鿿]/);
  assert.match(zh["BTO project details are not included in this version. Type the price for your flat type and the expected completion from HDB's sales brochure."], /您/);
});
