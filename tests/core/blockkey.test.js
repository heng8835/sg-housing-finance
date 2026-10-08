// Stable block ids (go-live F2): saved shortlist / focus / scenarios / share links survive a data.js rebuild that
// inserts a block in the middle of the sorted block list; derived per-block files built for another data.js are dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createStore, STORE_KEY, LEGACY_KEY } from '../../app/core/store.js';
import {
  normKey, blockKey, bidOf, blockSig, duplicateKeys, stampComparer, remapComparer, shareRow, readShareRow,
  stampState, remapState, checkDerived, migrateComparerStorage, attachBlockKeys,
} from '../../app/core/blockkey.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};

// data.js shape (tools/build_data.py): blocks sorted by (block, street); streets / flat_types / storeys / towns sorted lists
function build(rows, { storeys = ['01 TO 03', '04 TO 06', '07 TO 09'], flatTypes = ['3 ROOM', '4 ROOM', '5 ROOM'] } = {}) {
  const sorted = rows.slice().sort((a, b) => (a[0] + '|' + a[1]).localeCompare(b[0] + '|' + b[1]));
  const streets = [...new Set(sorted.map((r) => r[1]))].sort();
  const towns = [...new Set(sorted.map((r) => r[2]))].sort();
  return {
    streets, towns, flat_types: flatTypes, storeys,
    blocks: sorted.map(([b, s, t]) => ({ b, s: streets.indexOf(s), t: towns.indexOf(t), lat: 1.35, lon: 103.8 })),
  };
}
const ROWS = [['10', 'ANG MO KIO AVE 1', 'ANG MO KIO'], ['20', 'BISHAN ST 11', 'BISHAN'], ['30', 'PUNGGOL FIELD', 'PUNGGOL'], ['40', 'TAMPINES ST 21', 'TAMPINES']];
const OLD = build(ROWS);
// refresh: a block first sold after the last build sorts between '10' and '20'; a new town and a new storey range too
const NEW = build([...ROWS, ['15', 'ANG MO KIO AVE 1', 'ANG MO KIO'], ['16', 'TENGAH GARDEN WALK', 'TENGAH']], { storeys: ['01 TO 03', '01 TO 05', '04 TO 06', '07 TO 09'] });
const keyIn = (hdb, bid) => blockKey(hdb, bid);

test('keys are normalised block|street and the insert really shifts the later indexes', () => {
  assert.equal(normKey(' 123a ', 'ang  mo kio  AVE 3 '), '123A|ANG MO KIO AVE 3');
  assert.equal(keyIn(OLD, 1), '20|BISHAN ST 11');
  assert.equal(bidOf(OLD, '20|BISHAN ST 11'), 1);
  assert.equal(bidOf(NEW, '20|BISHAN ST 11'), 3, 'two blocks inserted before it');
  assert.equal(keyIn(NEW, 1), '15|ANG MO KIO AVE 1', 'the old bid 1 now names another block');
  assert.equal(blockKey(OLD, 99), null);
  assert.equal(blockKey(OLD, null), null);
  assert.equal(duplicateKeys(OLD), 0);
  assert.match(blockSig(OLD), /^[0-9a-f]{8}$/);
  assert.notEqual(blockSig(OLD), blockSig(NEW));
  assert.equal(blockSig(OLD), blockSig(build(ROWS)), 'deterministic');
});

test('blockSig is FNV-1a 32 over the UTF-8 keys joined by newlines (same as tools/blockkey.py)', () => {
  // reference vector: FNV-1a 32 of "a" = e40c292c, of "" = 811c9dc5
  assert.equal(blockSig({ streets: [], blocks: [] }), '811c9dc5');
  const one = { streets: ['B'], blocks: [{ b: 'A', s: 0 }] }; // key "A|B"
  let h = 0x811c9dc5; for (const x of Buffer.from('A|B')) { h ^= x; h = Math.imul(h, 0x01000193) >>> 0; }
  assert.equal(blockSig(one), h.toString(16).padStart(8, '0'));
});

test('saved shortlist points at the same block, flat type and storey after the insert', () => {
  const S = {
    choices: [
      { id: 1, bid: 1, ft: 1, storey: 2, sqm: 93, price: 720000, name: 'Bishan', url: '', facing: 'N' },
      { id: 2, bid: 3, ft: 2, storey: 1, sqm: 112, price: 650000, name: 'Tampines', url: '', facing: '' },
      { id: 3, bid: 0, ft: 0, storey: 0, sqm: 67, price: 380000, name: 'AMK', url: '', facing: '' },
    ],
    towns: [1, 3], ft: [1, 2],
  };
  const before = S.choices.map((c) => [keyIn(OLD, c.bid), OLD.flat_types[c.ft], OLD.storeys[c.storey]]);
  const saved = JSON.parse(JSON.stringify(stampComparer(S, OLD))); // what legacy.js save() writes
  const { saved: next, changed, dropped } = remapComparer(saved, NEW);
  assert.equal(changed, true); assert.equal(dropped, 0);
  assert.deepEqual(next.choices.map((c) => [keyIn(NEW, c.bid), NEW.flat_types[c.ft], NEW.storeys[c.storey]]), before);
  assert.deepEqual(next.choices.map((c) => c.bid), [3, 5, 0]);
  assert.deepEqual(next.choices.map((c) => c.storey), [3, 2, 0], 'storey index moved by the new 01 TO 05 range');
  assert.deepEqual(next.towns.map((i) => NEW.towns[i]), ['BISHAN', 'TAMPINES'], 'town filter by name');
  assert.deepEqual(next.ft, [1, 2]);
  // same data again → nothing to change
  assert.equal(remapComparer(stampComparer(next, NEW), NEW).changed, false);
});

test('"all towns" stays all towns (a new town is included); unknown blocks are dropped, not re-pointed', () => {
  const S = { towns: OLD.towns.map((_, i) => i), choices: [{ id: 1, bid: 2, ft: 1, storey: 0, price: 1 }] };
  const saved = stampComparer(S, OLD);
  assert.deepEqual(remapComparer(saved, NEW).saved.towns, NEW.towns.map((_, i) => i));
  const gone = build(ROWS.filter((r) => r[0] !== '30'));
  const r = remapComparer(saved, gone);
  assert.equal(r.dropped, 1); assert.deepEqual(r.saved.choices, []);
});

test('items saved before stable keys keep their bid (assumed current) and get stamped on the next save', () => {
  const legacy = { choices: [{ id: 1, bid: 2, ft: 1, storey: 0, price: 500000 }] };
  const r = remapComparer(legacy, OLD);
  assert.equal(r.changed, false);
  assert.equal(r.saved.choices[0].bid, 2);
  const out = remapComparer({ choices: [{ id: 1, bid: 99, ft: 1, storey: 0, price: 1 }] }, OLD);
  assert.equal(out.dropped, 1, 'an index past the end is dropped');
  const stamped = stampComparer(r.saved, OLD).choices[0];
  assert.deepEqual([stamped.bk, stamped.ftl, stamped.stl], ['30|PUNGGOL FIELD', '4 ROOM', '01 TO 03']);
});

test('migrateComparerStorage rewrites hdb-comparer before the map code reads it', () => {
  const S = { profile: { income: 9000 }, choices: [{ id: 1, bid: 1, ft: 1, storey: 2, price: 720000, name: 'x' }], nextId: 2 };
  const storage = memory({ [LEGACY_KEY]: JSON.stringify(stampComparer(S, OLD)) });
  assert.deepEqual(migrateComparerStorage(storage, NEW), { changed: true, dropped: 0 });
  const after = JSON.parse(storage.getItem(LEGACY_KEY));
  assert.equal(keyIn(NEW, after.choices[0].bid), '20|BISHAN ST 11');
  assert.equal(after.profile.income, 9000);
  // unreadable / missing → untouched
  const bad = memory({ [LEGACY_KEY]: '{oops' });
  migrateComparerStorage(bad, NEW); assert.equal(bad.getItem(LEGACY_KEY), '{oops');
  assert.deepEqual(migrateComparerStorage(memory(), NEW), { changed: false, dropped: 0 });
});

test('share links carry block keys + labels; old index links are still read', () => {
  const c = { bid: 1, ft: 1, storey: 2, sqm: 93, price: 720000, facing: 'N' };
  const row = shareRow(c, OLD);
  assert.deepEqual(row, ['20|BISHAN ST 11', '4 ROOM', '07 TO 09', 93, 720000, 'N']);
  const back = readShareRow(JSON.parse(JSON.stringify(row)), NEW);
  assert.deepEqual(back, { bid: 3, ft: 1, storey: 3, sqm: 93, price: 720000, facing: 'N' });
  assert.equal(keyIn(NEW, back.bid), '20|BISHAN ST 11');
  assert.deepEqual(readShareRow([1, 1, 2, 93, 720000, 'N'], OLD), { bid: 1, ft: 1, storey: 2, sqm: 93, price: 720000, facing: 'N' });
  assert.equal(readShareRow(['99|NOWHERE', '4 ROOM', '07 TO 09', 93, 720000, ''], NEW), null);
  assert.equal(readShareRow(['20|BISHAN ST 11', '4 ROOM', '07 TO 09', 93, 0, ''], NEW), null, 'needs a price');
  assert.equal(readShareRow('x', NEW), null);
});

test('store: focus and scenarios point at the same block after a reload on the new data', () => {
  const storage = memory();
  const a = createStore({ storage });
  attachBlockKeys({ hdb: OLD, store: a, storage, g: {} });
  a.set('focus', { source: 'block', bid: 1, label: '20 Bishan St 11', price: 600000, flatType: '4 ROOM' });
  a.set('scenarios', [{ id: 'A', name: 'Tampines', focus: { source: 'choice', bid: 3, price: 650000, flatType: '5 ROOM' }, household: {} }]);
  const raw = JSON.parse(storage.getItem(STORE_KEY));
  assert.equal(raw.focus.bk, '20|BISHAN ST 11', 'bk written on save');
  assert.equal(raw.scenarios[0].focus.bk, '40|TAMPINES ST 21');
  assert.equal(a.export().focus.bk, '20|BISHAN ST 11', 'export carries the key too');

  const b = createStore({ storage }); // next visit, refreshed data.js
  const heard = [];
  b.subscribe('focus', () => heard.push('focus'));
  attachBlockKeys({ hdb: NEW, store: b, storage, g: {} });
  assert.equal(keyIn(NEW, b.get('focus').bid), '20|BISHAN ST 11');
  assert.equal(b.get('focus').bid, 3);
  assert.equal(keyIn(NEW, b.get('scenarios')[0].focus.bid), '40|TAMPINES ST 21');
  assert.deepEqual(heard, ['focus']);
  assert.equal(JSON.parse(storage.getItem(STORE_KEY)).focus.bid, 3, 'persisted');

  // import of an export made on the old data is re-pointed too
  const c = createStore({ storage: memory() });
  attachBlockKeys({ hdb: NEW, store: c, storage: memory(), g: {} });
  c.import(a.export());
  assert.equal(keyIn(NEW, c.get('focus').bid), '20|BISHAN ST 11');
});

test('store: a focus block missing from the new data loses its bid but keeps the price; no-bid focus untouched', () => {
  const gone = build(ROWS.filter((r) => r[0] !== '20'));
  const st = stampState({ focus: { source: 'block', bid: 1, price: 600000 }, scenarios: [] }, OLD);
  const r = remapState(st, gone);
  assert.equal(r.focus.bid, null); assert.equal(r.focus.price, 600000); assert.equal(r.focus.bk, undefined);
  const priceOnly = { focus: { source: 'price', price: 500000 }, scenarios: [] };
  assert.equal(remapState(priceOnly, NEW), priceOnly);
  assert.deepEqual(stampState(priceOnly, NEW).focus, { source: 'price', price: 500000 });
  // a store that never saw block keys behaves exactly as before
  const s = createStore({ storage: memory() });
  s.set('focus', { source: 'block', bid: 1, price: 1 });
  assert.equal(s.export().focus.bk, undefined);
});

test('checkDerived drops per-block parts built for another data.js and keeps matching files', () => {
  const ok = blockSig(NEW);
  const g = {
    HDB_RENTS: { block_sig: blockSig(OLD), blocks: { 1: { '4 ROOM': [5] } }, towns: { BISHAN: {} } },
    HDB_COMMUTE: { block_sig: blockSig(OLD), block_count: NEW.blocks.length, minutes: {} },
    HDB_MARKET: { block_sig: blockSig(OLD), landuse: { blocks: NEW.blocks.length, n: [], ha: [] }, rpi: {} },
  };
  const out = checkDerived(NEW, g);
  assert.deepEqual(out.map((x) => x.file), ['rents.js', 'commute.js', 'market.js']);
  assert.deepEqual(g.HDB_RENTS.blocks, {}); assert.ok(g.HDB_RENTS.towns.BISHAN, 'town series kept');
  assert.equal(g.HDB_COMMUTE, null);
  assert.equal(g.HDB_MARKET.landuse.blocks, null, 'futurevalue-facts treats it as stale'); assert.ok(g.HDB_MARKET.rpi);
  const fine = { HDB_RENTS: { block_sig: ok, blocks: { 1: {} } }, HDB_COMMUTE: { block_sig: ok, block_count: NEW.blocks.length }, HDB_MARKET: { block_sig: ok, landuse: { blocks: 6 } } };
  assert.deepEqual(checkDerived(NEW, fine), []);
  assert.ok(fine.HDB_COMMUTE && fine.HDB_RENTS.blocks[1] && fine.HDB_MARKET.landuse.blocks === 6);
  const oldCommute = { HDB_COMMUTE: { block_count: OLD.blocks.length } }; // no block_sig: count check only
  assert.deepEqual(checkDerived(NEW, oldCommute), [{ file: 'commute.js', reason: 'block_count' }]);
});

// ---------------------------------------------------------------- the real generated files
const url = (f) => new URL(`../../app/data/${f}`, import.meta.url);
const loadJs = (u) => { const t = readFileSync(u, 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).trim().replace(/;$/, '')); };
const HAVE = existsSync(url('data.js'));

test('real data.js: keys unique; derived files carry the same block_sig; seed shortlist survives an insert', { skip: !HAVE }, () => {
  const d = loadJs(url('data.js'));
  assert.equal(duplicateKeys(d), 0, 'block|street must identify one data.js block');
  const sig = blockSig(d);
  for (const f of ['rents.js', 'commute.js', 'market.js']) {
    if (!existsSync(url(f))) continue;
    const x = loadJs(url(f));
    assert.equal(x.block_sig, sig, `${f} built for another data.js — re-run its generator after build_data.py`);
  }
  // simulate the next refresh: one new block sorted into the middle
  const seed = JSON.parse(readFileSync(new URL('../fixtures/compare-seed.json', import.meta.url), 'utf8')).state;
  const mid = 300, b = d.blocks[mid];
  const next = { ...d, blocks: [...d.blocks.slice(0, mid), { ...b, b: `${b.b}Z` }, ...d.blocks.slice(mid)] };
  const keys = seed.choices.map((c) => blockKey(d, c.bid));
  const { saved } = remapComparer(stampComparer(seed, d), next);
  assert.deepEqual(saved.choices.map((c) => blockKey(next, c.bid)), keys);
  assert.deepEqual(saved.choices.map((c) => c.bid), seed.choices.map((c) => (c.bid >= mid ? c.bid + 1 : c.bid)));
  // unchanged data → seed stays byte-identical in what matters for the compare table
  const same = remapComparer(stampComparer(seed, d), d).saved.choices;
  assert.deepEqual(same.map(({ bid, ft, storey, sqm, price }) => [bid, ft, storey, sqm, price]), seed.choices.map(({ bid, ft, storey, sqm, price }) => [bid, ft, storey, sqm, price]));
});
