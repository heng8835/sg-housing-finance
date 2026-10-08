// Phase 7b B15 — 中文 complete: Chinese town names in the map search (i18n/towns.zh.json → core/townalias.js →
// legacy.js mSearch), "点按" (tap) never "鼠标" / "点击" in the 中文 files, abbreviations glossed on first use, new
// glossary terms in EN + 中文.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setTownAliases, loadTownAliases, zhTownSearch, zhTownRow, zhTownName } from '../../app/core/townalias.js';

const read = (p) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8');
const FILE = JSON.parse(read('i18n/towns.zh.json'));
// the 26 towns of the HDB resale data (HDB_DATA.towns labels) + Tengah
const RESALE_TOWNS = ['ANG MO KIO', 'BEDOK', 'BISHAN', 'BUKIT BATOK', 'BUKIT MERAH', 'BUKIT PANJANG', 'BUKIT TIMAH',
  'CENTRAL AREA', 'CHOA CHU KANG', 'CLEMENTI', 'GEYLANG', 'HOUGANG', 'JURONG EAST', 'JURONG WEST', 'KALLANG/WHAMPOA',
  'MARINE PARADE', 'PASIR RIS', 'PUNGGOL', 'QUEENSTOWN', 'SEMBAWANG', 'SENGKANG', 'SERANGOON', 'TAMPINES', 'TOA PAYOH',
  'WOODLANDS', 'YISHUN'];
const TOWNS = [...RESALE_TOWNS]; // stands in for D.towns (same labels, same order idea)
const idx = (name) => TOWNS.indexOf(name);

test('towns.zh.json: every resale town has a Chinese name; names are unique', () => {
  assert.equal(RESALE_TOWNS.length, 26);
  for (const tn of RESALE_TOWNS) assert.ok(FILE.towns[tn]?.length, `${tn} has a 中文 name`);
  const all = Object.values(FILE.towns).flat();
  for (const n of all) assert.match(n, /^[一-鿿/]+$/, n);
  assert.equal(new Set(all).size, all.length, 'no alias names two towns');
});

test('search "宏茂桥" finds Ang Mo Kio (and its blocks: the query becomes the English name)', () => {
  setTownAliases(FILE);
  assert.deepEqual(zhTownSearch('宏茂桥', TOWNS), { rest: 'ANG MO KIO', towns: [idx('ANG MO KIO')] });
  assert.deepEqual(zhTownSearch('宏茂桥 Ave 10', TOWNS), { rest: 'ANG MO KIO Ave 10', towns: [idx('ANG MO KIO')] });
  assert.deepEqual(zhTownSearch('裕廊', TOWNS).towns, [idx('JURONG EAST'), idx('JURONG WEST')], 'partial name → both Jurong towns');
  assert.equal(zhTownSearch('裕廊', TOWNS).rest, '', 'no English left: legacy.js returns the town rows only');
  assert.deepEqual(zhTownSearch('中区', TOWNS).towns, [idx('CENTRAL AREA')]);
  assert.deepEqual(zhTownSearch('黄埔', TOWNS).towns, [idx('KALLANG/WHAMPOA')]);
  assert.deepEqual(zhTownSearch('宏茂桥 · Ang Mo Kio', TOWNS).rest, 'ANG MO KIO Ang Mo Kio', 'punctuation dropped');
  assert.deepEqual(zhTownSearch('Ang Mo Kio', TOWNS), { rest: 'Ang Mo Kio', towns: [] }, 'English queries unchanged');
  assert.deepEqual(zhTownSearch('宏', TOWNS).towns, [], 'one character is too short');
  assert.deepEqual(zhTownRow('Ang Mo Kio', 'ANG MO KIO', '中区', 'zh'), { label: '宏茂桥', sub: 'Ang Mo Kio · 中区' }, 'row: 宏茂桥 · Ang Mo Kio');
  assert.deepEqual(zhTownRow('Ang Mo Kio', 'ANG MO KIO', 'Central', 'en'), { label: 'Ang Mo Kio', sub: 'Central' });
  assert.equal(zhTownName('Kallang/Whampoa'), '加冷/黄埔');
});

test('the aliases load from the data file once, and a failed load just means no Chinese search', async () => {
  const seen = [];
  const doc = await loadTownAliases(async (u) => { seen.push(u); return { ok: true, json: async () => FILE }; });
  assert.deepEqual(seen, ['i18n/towns.zh.json']);
  assert.equal(doc['ANG MO KIO'][0], '宏茂桥');
  await loadTownAliases(async () => { throw new Error('x'); });
  assert.deepEqual(seen, ['i18n/towns.zh.json'], 'cached');
});

test('legacy.js map search is wired to the town names (small hook)', () => {
  const src = read('modules/explore/legacy.js');
  assert.match(src, /import \{ loadTownAliases, zhTownSearch, zhTownRow \} from '\.\.\/\.\.\/core\/townalias\.js';/);
  assert.match(src, /const zh = zhTownSearch\(q, D\.towns\)[^\n]*q = zh\.rest;/);
  assert.match(src, /if \(nq\.length < 2\) return zh\.towns\.map\(town\);/);
  assert.match(src, /if \(hit\(tn\) \|\| zh\.towns\.includes\(i\)\) res\.push\(town\(i\)\);/);
});

const zhFiles = () => [
  ...readdirSync(new URL('../../app/i18n/', import.meta.url)).filter((f) => /^zh.*\.json$|\.zh\.json$/.test(f)).map((f) => `i18n/${f}`),
  'content/content.zh.json', 'content/guides.zh.json',
  ...readdirSync(new URL('../../app/content/glossary/zh/', import.meta.url)).map((f) => `content/glossary/zh/${f}`),
  ...readdirSync(new URL('../../app/content/guides/zh/', import.meta.url)).map((f) => `content/guides/zh/${f}`),
];

test('中文 says 点按 (tap): no 鼠标 (mouse), 点击 (click) or 悬停 (hover) in any 中文 file', () => {
  const files = zhFiles();
  assert.ok(files.length > 50);
  for (const f of files) assert.doesNotMatch(read(f), /鼠标|点击|悬停/, f);
});

test('abbreviations are glossed in 中文 where they stand alone (drafts, O16)', () => {
  const zh = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))));
  assert.equal(zh['TDSR {0}'], 'TDSR（总债务偿还率）{0}');
  assert.match(zh['{0} of income · MSR test {1} at {2} (cap {3})'], /MSR（抵押偿还率）/);
  assert.match(zh['MSR test'], /抵押偿还率/);
  assert.match(zh['COV {0}'], /COV/);
  assert.match(zh['COV {0}'], /超出估价/);
  const GLOSS = { MSR: '抵押偿还率', TDSR: '总债务偿还率', COV: '超出估价' }; // = the glossary's 中文 terms
  for (const [k, v] of Object.entries(zh)) {
    for (const [ab, word] of Object.entries(GLOSS)) {
      if (!new RegExp(`(^|[^A-Za-z])${ab}([^A-Za-z]|$)`).test(v) || k === 'e.g. MSR, grant, lease') continue;
      assert.ok(v.includes(word), `${ab} glossed in: ${v.slice(0, 60)}`);
    }
  }
});

test('new glossary terms exist in EN and 中文: LBS, SHB, CPF LIFE, RA, BRS, FRS, Flexi', () => {
  const en = JSON.parse(read('content/content.json')).terms;
  const zh = JSON.parse(read('content/content.zh.json')).terms;
  for (const id of ['lbs', 'shb', 'cpf-life', 'ra', 'brs', 'frs', 'flexi']) {
    assert.ok(en[id] && zh[id], id);
    assert.match(zh[id].term, /[一-鿿]/, `${id} 中文 term`);
    assert.deepEqual(zh[id].policy_keys, en[id].policy_keys, `${id}: same rules in both languages`);
  }
  assert.ok(en.frs.body.includes('<p>{policy:cpf.retirement_sums}</p>'), 'FRS shows the sums table from policy');
});
