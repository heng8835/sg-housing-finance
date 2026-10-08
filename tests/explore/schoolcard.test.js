// Phase 7b B3: primary schools in the block card (fold + linked fact) and the school card (search a school → blocks
// within 1 km with the user's flat types → tap a block). app/modules/explore/card.js, schoolcard.js, core/schools.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { schoolBands, schoolName, blocksNear } from '../../app/core/schools.js';
import { cardHtml, cardState, schoolsFold, schoolsFact, SCHOOLS_IN_CARD } from '../../app/modules/explore/card.js';
import { schoolModel, schoolCardHtml, schoolExec, blockMedian, budgetTag, sortRows, schoolStrings, SCHOOL_BLOCKS_SHOWN } from '../../app/modules/explore/schoolcard.js';
import { policy } from '../helpers.js';

const BANDS = policy.get('p1.distance.bands_km');
const AT = { lat: 1.35, lon: 103.85 };
const north = (m) => ({ lat: AT.lat + m / 111195, lon: AT.lon }); // core/geo: 1° ≈ 111.195 km
const school = (m, n) => ({ ...north(m), n, lvl: 'PRIMARY' });
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const median = (a) => { const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

// ------------------------------------------------------------------ (a) block card fold
test('school list for a block: nearest first, short names + metres, 1–2 km count, MOE note; same bands as the compare row', () => {
  const list = [school(700, 'Horizon Primary School'), school(70, 'Mee Toh School'), school(398, 'Rivervale Primary School'), school(1400, 'Far Primary School'), school(5000, 'Remote Primary School')];
  const s = schoolBands(list, AT, BANDS);
  const html = schoolsFold(s, BANDS, false);
  assert.match(html, /data-fold="schools"/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.equal(strip(html), 'Primary schools within 1 km (3) Mee Toh · 70 m Rivervale · 398 m Horizon · 700 m 1 more within 1–2 km '
    + "Straight-line from the block. MOE measures from the home address, so check MOE's tool.");
  assert.match(schoolsFold(s, BANDS, true), /<details[^>]* open/);
});

test('school list: more than SCHOOLS_IN_CARD → "+N more"; none within 1 km → "(none)" + the nearest school and its band', () => {
  const many = Array.from({ length: SCHOOLS_IN_CARD + 3 }, (_, i) => school(50 + i * 80, `S${i} Primary School`));
  const h = strip(schoolsFold(schoolBands(many, AT, BANDS), BANDS, true));
  assert.match(h, /\(11\)/);
  assert.match(h, /\+3 more within 1 km/);
  assert.equal((h.match(/ · \d+ m/g) || []).length, SCHOOLS_IN_CARD);
  const second = strip(schoolsFold(schoolBands([school(1500, 'Edge Primary School')], AT, BANDS), BANDS, false));
  assert.match(second, /^Primary schools within 1 km \(none\) Nearest: Edge · 1\.5 km \(1–2 km band\)/);
  const far = strip(schoolsFold(schoolBands([school(3200, 'Remote Primary School')], AT, BANDS), BANDS, false));
  assert.match(far, /Nearest: Remote · 3\.2 km — outside the P1 bands/);
});

test('school names: acronyms back in capitals (same rule as Plan), title case kept', () => {
  assert.equal(schoolName("Chij St. Nicholas Girls' School"), "CHIJ St. Nicholas Girls' School");
  assert.equal(schoolName('Acs (Junior)'), 'ACS (Junior)');
  assert.equal(schoolName('Rivervale Primary School'), 'Rivervale Primary School');
});

test('card: the "N primary schools within 1 km" fact becomes a link to the fold; without schools no fold, no link', () => {
  const list = [school(70, 'Mee Toh School'), school(398, 'Rivervale Primary School')];
  const s = schoolBands(list, AT, BANDS);
  const base = {
    key: 1, head: { sub: 'Punggol · North-East', facts: ['Completed 2004', schoolsFact(2)], items: [{ html: '300 m to a mall', tone: 'info' }], newYear: null },
    st: cardState({ matchN: 3, aggOk: true, periodN: 3 }), tiles: { price: 560000, psf: 560, n: 3 }, scope: 'x', period: 'y', win: '1 year',
    trend: { heading: 'h', caption: 'c', enough: false }, sales: { idx: [], cols: {}, total: 0, mine: 0, from: 2017, to: 2026, open: false },
    rent: null, rentFirst: false, folds: { rent: false, near: false, schools: false }, affordPrice: 560000,
  };
  const h = cardHtml({ ...base, schools: { bands: s, bandsKm: BANDS } });
  assert.match(h, /<li><button type="button" class="link" data-act="schools">2 primary schools within 1 km<\/button><\/li>/);
  assert.ok(h.indexOf('data-fold="schools"') > h.indexOf('data-fold="near"'), 'fold after Nearby');
  const none = cardHtml(base);
  assert.doesNotMatch(none, /data-fold="schools"|data-act="schools"/);
  assert.match(none, /<li>2 primary schools within 1 km<\/li>/);
});

// ------------------------------------------------------------------ (b) school card
// blocks: 0 = 200 m (4-room sales), 1 = 450 m (3-room only), 2 = 900 m (4-room + 5-room), 3 = 1.3 km (4-room), 4 = 600 m (no resale)
const FT = ['3 ROOM', '4 ROOM', '5 ROOM'];
const blocks = [200, 450, 900, 1300, 600].map((m, i) => ({ ...north(m), label: `Blk ${i + 1}` }));
const TX = { //   0       1       2       3       4       5       6       7
  ft: [1, 1, 1, 0, 1, 2, 1, 1],
  m: [10, 11, 3, 11, 11, 11, 11, 11],
  p: [500000, 520000, 300000, 400000, 700000, 900000, 610000, 450000],
};
const blockTx = [[0, 1, 2], [3], [4, 5], [6], []];
const base = { school: school(0, 'Rivervale Primary School'), bandsKm: BANDS, blocks, blockTx, TX, mFrom: 6, mTo: 11, median };

test('blocks near a school: within the first band, only blocks that sold one of the selected flat types, nearest first', () => {
  const four = new Set([1]);
  assert.deepEqual(blocksNear(AT, 1, { blocks, blockTx, txFt: TX.ft, ftSet: four }).map((x) => x.bi), [0, 2]);       // 1 = 3-room only, 3 = 1.3 km, 4 = no resale
  assert.deepEqual(blocksNear(AT, 1, { blocks, blockTx, txFt: TX.ft, ftSet: new Set([0]) }).map((x) => x.bi), [1]);  // flat-type filter respected
  assert.deepEqual(blocksNear(AT, 1, { blocks, blockTx, txFt: TX.ft, ftSet: new Set([0, 1, 2]) }).map((x) => x.bi), [0, 1, 2]);
  const m = schoolModel({ ...base, ftSet: four, budget: null });
  assert.equal(m.name, 'Rivervale Primary School');
  assert.equal(m.km, BANDS[0]);
  assert.deepEqual(m.rows.map((r) => [r.bi, r.n, r.price, r.tag]), [[0, 2, 510000, null], [2, 1, 700000, null]]); // tx 2 is outside the window
  assert.equal(m.nearest, null);
});

test('medians: selected types in the calculation window; budget tags = the map rule, only when "Most you can pay" is known', () => {
  assert.deepEqual(blockMedian(2, { blockTx, TX, ftSet: new Set([1, 2]), mFrom: 6, mTo: 11, median }), { n: 2, price: 800000 });
  assert.deepEqual(blockMedian(0, { blockTx, TX, ftSet: new Set([1]), mFrom: 12, mTo: 20, median }), { n: 0, price: null });
  const b = { max: 600000, stretch: 0.1 };
  assert.deepEqual([500000, 600000, 650000, 660000, 700000, null].map((p) => budgetTag(p, b)), ['within', 'within', 'near', 'near', 'over', null]);
  assert.equal(budgetTag(500000, null), null);
  const m = schoolModel({ ...base, ftSet: new Set([1]), budget: b });
  assert.deepEqual(m.rows.map((r) => r.tag), ['within', 'over']);
});

test('school card markup: rows are buttons (tap → block card), tags only with a budget, household hint without, sort, show all', () => {
  const o = { sort: 'near', all: false, label: (bi) => blocks[bi].label, win: '1 year', budgetKnown: false, ringOn: false };
  const m = schoolModel({ ...base, ftSet: new Set([1]), budget: null });
  const h = schoolCardHtml(m, o);
  assert.deepEqual([...h.matchAll(/class="sc-row" data-bi="(\d+)"/g)].map((x) => +x[1]), [0, 2]);
  assert.doesNotMatch(h, /class="tag /);
  assert.match(h, /Add your household to see which are within your budget\./);
  assert.match(strip(h), /Blk 1 · 200 m Median S\$510k · 2 sales in the last 1 year/);
  assert.match(h, /data-sc="ring" aria-pressed="false">Show the 1 km ring/);
  const withB = schoolCardHtml(schoolModel({ ...base, ftSet: new Set([1]), budget: { max: 600000, stretch: 0.1 } }), { ...o, budgetKnown: true });
  assert.match(withB, /tag good">within budget/);
  assert.match(withB, /tag serious">over budget/);
  assert.doesNotMatch(withB, /Add your household/);
  assert.equal(strip(schoolExec(m, '4-room')), 'Blocks within 1 km with your flat types (4-room): 2');
  // cheapest first; blocks without sales last
  const rows = [{ bi: 0, km: 0.2, price: 700000 }, { bi: 1, km: 0.3, price: null }, { bi: 2, km: 0.9, price: 500000 }];
  assert.deepEqual(sortRows(rows, 'cheap').map((r) => r.bi), [2, 0, 1]);
  assert.deepEqual(sortRows(rows, 'near').map((r) => r.bi), [0, 1, 2]);
  // more than SCHOOL_BLOCKS_SHOWN rows → "Show all N blocks"
  const many = Array.from({ length: SCHOOL_BLOCKS_SHOWN + 2 }, (_, i) => ({ bi: i, km: i / 20, n: 1, price: 500000, tag: null }));
  const big = schoolCardHtml({ name: 'x', km: 1, rows: many, nearest: null }, { ...o, label: (bi) => `Blk ${bi}` });
  assert.equal((big.match(/class="sc-row"/g) || []).length, SCHOOL_BLOCKS_SHOWN);
  assert.match(big, /Show all 10 blocks/);
  assert.equal((schoolCardHtml({ name: 'x', km: 1, rows: many, nearest: null }, { ...o, all: true, label: (bi) => `Blk ${bi}` }).match(/class="sc-row"/g) || []).length, 10);
});

test('school card: none within 1 km → says so and offers the nearest block with your types (still one tap)', () => {
  const far = { ...base, school: { ...north(-3000), n: 'Far Primary School', lvl: 'PRIMARY' } };
  const m = schoolModel({ ...far, ftSet: new Set([1]), budget: { max: 600000, stretch: 0.1 } });
  assert.deepEqual(m.rows, []);
  assert.equal(m.nearest.bi, 0);
  const h = schoolCardHtml(m, { sort: 'near', all: false, label: (bi) => blocks[bi].label, win: '1 year', budgetKnown: true, ringOn: false });
  assert.match(strip(h), /^No blocks with your flat types within 1 km\. Nearest: Blk 1 · 3\.2 km\./);
  assert.match(h, /class="sc-row" data-bi="0"/);
  assert.doesNotMatch(h, /class="tag /); // outside the band: no budget tag
});

test('中文: new school-card / fold strings are staged for zh-explore (integrator merges)', () => {
  const read = (n) => JSON.parse(readFileSync(new URL(`../../app/i18n/${n}.json`, import.meta.url), 'utf8'));
  const staged = existsSync(new URL('../../app/i18n/staging/EXPLORE2.zh-explore.json', import.meta.url)) ? read('staging/EXPLORE2.zh-explore') : {};
  const dict = Object.assign({}, ...['zh', 'zh-explore'].map(read), staged); // staging is deleted once merged
  assert.deepEqual(schoolStrings().filter((s) => dict[s] == null), []);
});
