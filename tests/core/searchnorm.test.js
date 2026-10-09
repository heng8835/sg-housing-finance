// 7c C3 search tolerance: one normaliser (core/searchnorm.js) behind the block pickers, Daily places and the map search.
// Table test: punctuation ignored, abbreviations both ways, title case for display.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon, tokens, hits, prep, titleCase, startsWithTok, tidyName, rankOf } from '../../app/core/searchnorm.js';
import { searchBlocks, blockName } from '../../app/core/blocksearch.js';
import { searchBlocks as saleSearch } from '../../app/modules/plan/salerange.js';
import { buildPlaceIndex, searchPlaces } from '../../app/core/placesearch.js';

// small stand-in with data.js street spellings (HDB writes the short forms)
const hdb = {
  towns: ['BUKIT MERAH', 'QUEENSTOWN', 'TOA PAYOH', 'ANG MO KIO', 'GEYLANG', 'YISHUN', 'KALLANG/WHAMPOA'],
  streets: ["C'WEALTH CRES", 'JLN BT MERAH', 'LOR 1 TOA PAYOH', 'ANG MO KIO AVE 10', 'UPP BOON KENG RD', 'YISHUN CTRL', "ST. GEORGE'S RD", 'KG BAHRU HILL', 'TOA PAYOH NTH', 'COMMONWEALTH AVE'],
  blocks: [
    { b: '101', s: 0, t: 1, lat: 1.30, lon: 103.80 },
    { b: '112', s: 1, t: 0, lat: 1.28, lon: 103.82 },
    { b: '157', s: 2, t: 2, lat: 1.33, lon: 103.85 },
    { b: '406', s: 3, t: 3, lat: 1.36, lon: 103.85 },
    { b: '7', s: 4, t: 6, lat: 1.31, lon: 103.87 },
    { b: '920', s: 5, t: 5, lat: 1.43, lon: 103.84 },
    { b: '22', s: 6, t: 6, lat: 1.32, lon: 103.86 },
    { b: '57', s: 7, t: 0, lat: 1.27, lon: 103.83 },
    { b: '190', s: 8, t: 2, lat: 1.34, lon: 103.85 },
    { b: '2', s: 9, t: 1, lat: 1.30, lon: 103.80 },
  ],
};
const poi = { schools: [{ n: "ST. HILDA'S PRIMARY SCHOOL", lvl: 'PRIMARY', lat: 1.35, lon: 103.94 }], malls: [], hawkers: [], parks: [] };
const names = (ids) => ids.map((i) => blockName(hdb, i));

const TABLE = [
  // [typed, expected first block (blockName)]
  ['Commonwealth Crescent', '101 C\'wealth Cres'],
  ["c'wealth cres", '101 C\'wealth Cres'],
  ['cwealth', '101 C\'wealth Cres'],
  ['commonw', '101 C\'wealth Cres'],            // prefix of the long form
  ['Jalan Bukit Merah', '112 Jln Bt Merah'],
  ['jln bt merah', '112 Jln Bt Merah'],
  ['Lorong 1 Toa Payoh', '157 Lor 1 Toa Payoh'],
  ['Blk 406, Ang Mo Kio Avenue 10', '406 Ang Mo Kio Ave 10'],
  ['upper boon keng road', '7 Upp Boon Keng Rd'],
  ['Yishun Central', '920 Yishun Ctrl'],
  ['Saint George\'s Road', "22 St. George's Rd"],
  ['st. georges rd', "22 St. George's Rd"],
  ['kampong bahru', '57 Kg Bahru Hill'],
  ['toa payoh north', '190 Toa Payoh Nth'],
];

for (const [q, want] of TABLE) {
  test(`block search: "${q}" → ${want}`, () => {
    const got = names(searchBlocks(hdb, q));
    assert.ok(got.length > 0, `no result for ${q}`);
    assert.equal(got[0], want);
    assert.deepEqual(names(saleSearch(hdb, q)), got); // Plan → Sell then buy = the same search
  });
}

test('both Commonwealth spellings are found by either spelling', () => {
  assert.deepEqual(new Set(names(searchBlocks(hdb, 'commonwealth'))), new Set(['101 C\'wealth Cres', '2 Commonwealth Ave']));
  assert.deepEqual(new Set(names(searchBlocks(hdb, "c'wealth"))), new Set(['101 C\'wealth Cres', '2 Commonwealth Ave']));
});

test('canon: punctuation out, long words shortened, Blk dropped', () => {
  assert.equal(canon("St. Hilda's"), 'ST HILDAS');
  assert.equal(canon('Saint Hilda'), 'ST HILDA');
  assert.equal(canon('Blk 406, Ang-Mo-Kio Avenue 10'), '406 ANG MO KIO AVE 10');
  assert.equal(canon('Bukit Timah / Upper'), 'BT TIMAH UPP');
  assert.equal(canon('Kampong · Lorong'), 'KG LOR');
  assert.deepEqual(tokens('  '), []);
  assert.equal(hits('ANY', []), false);
  assert.ok(prep("C'WEALTH CRES").words.includes('COMMONWEALTH'));
  assert.ok(prep('ST. GEORGE\'S RD').words.includes('SAINT') && prep('BISHAN ST 12').words.includes('STREET'));
  assert.ok(startsWithTok('BT BATOK ST 21', tokens('bukit')));
});

test('words in order rank first; upstream title case is tidied', () => {
  const h2 = { towns: ['TOA PAYOH'], streets: ['LOR 7 TOA PAYOH', 'LOR 1 TOA PAYOH'], blocks: [{ b: '1', s: 0, t: 0 }, { b: '100', s: 1, t: 0 }] };
  assert.deepEqual(names2(h2, searchBlocks(h2, 'lorong 1 toa payoh')), ['100 Lor 1 Toa Payoh', '1 Lor 7 Toa Payoh']);
  assert.ok(rankOf('100 LOR 1 TOA PAYOH', tokens('lor 1 toa payoh')) < rankOf('1 LOR 7 TOA PAYOH', tokens('lor 1 toa payoh')));
  assert.equal(tidyName("St. Hilda'S Primary School"), "St. Hilda's Primary School");
  assert.equal(tidyName("D'SOUZA St"), "D'SOUZA St");
});
const names2 = (h, ids) => ids.map((i) => blockName(h, i));

test('numbers stay whole words', () => {
  assert.deepEqual(searchBlocks(hdb, '40'), []);
  assert.deepEqual(names(searchBlocks(hdb, '406')), ['406 Ang Mo Kio Ave 10']);
});

test('Daily places: "St Hilda" and "Saint Hilda\'s" find the school; title case for display', () => {
  const idx = buildPlaceIndex({ hdb, poi });
  for (const q of ['st hilda', "Saint Hilda's", 'st. hildas primary']) assert.equal(searchPlaces(idx, q)[0].label, "ST. HILDA'S PRIMARY SCHOOL", q);
  assert.equal(searchPlaces(idx, 'commonwealth cres')[0].label, "C'wealth Cres");
  assert.equal(titleCase("ST. HILDA'S PRIMARY SCHOOL"), "St. Hilda's Primary School");
  assert.equal(titleCase("C'WEALTH CRES"), "C'wealth Cres");
  assert.equal(titleCase('KALLANG/WHAMPOA'), 'Kallang/Whampoa');
});
