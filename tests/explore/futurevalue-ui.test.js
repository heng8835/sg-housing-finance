// Future-value scorecard UI: cell text (dump / TSV safe), null + market-missing handling, Simple subset,
// no best-in-row, section position, cache key + LRU, MOP-wave flag, scoring panel, 中文 coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policy } from '../helpers.js';
import { RATIONALES, DRIVERS } from '../../app/engine/futurevalue.js';
import { FUTURE_VALUE_PARAMS as P } from '../../app/modules/explore/futurevalue-params.js';
import {
  SEC, ROW_KEYS, SIMPLE_DRIVERS, TERMS, CACHE_MAX, ARG_FORMATS, formatArgs, rationale, headline, cellHtml, marketState,
  howHtml, cardListHtml, cacheKey, blockModel, createFutureValue,
} from '../../app/modules/explore/futurevalue-ui.js';

// the compare dump / "Copy table" view of a cell: tags dropped, <small> on its own line, entities decoded
const text = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const drv = (id, score, metric, rid, args, reason = null, unit = null) => ({ id, score, metric, unit, parts: [], rationale: { id: rid, args }, reason });

test('formatArgs: years 1 dp, signed %, grouped units, plain years, title-case towns, no -0.0', () => {
  assert.deepEqual(formatArgs('fv.lease', [59.333, 49.333, 10]), ['59.3', '49.3', '10']);
  assert.deepEqual(formatArgs('fv.momentum', ['ANG MO KIO', '4 ROOM', 15.859, 3, -0.04]), ['Ang Mo Kio', '4-room', '+15.9', '3', '0.0']);
  assert.deepEqual(formatArgs('fv.supply', [2933, 1, 2933, 0, 5, 2028, 23534]), ['2,933', '1', '2,933', '0', '5', '2028', '23,534']);
  assert.deepEqual(formatArgs('fv.lease.drag', [60, 50, 10, '', -8, 36]).slice(3, 5), ['—', '-8.0']);
  assert.equal(rationale({ id: 'fv.yield', args: [6.0833, 3650, 5.558, 'BISHAN', '4 ROOM'] }), 'Gross rental yield about 6.1% (median rent $3,650 a month) vs 5.6% for 4-room flats in Bishan.');
});

test('every rationale template has one format per placeholder', () => {
  for (const [id, tpl] of Object.entries(RATIONALES)) {
    const n = new Set([...tpl.matchAll(/\{(\d+)\}/g)].map((m) => m[1])).size;
    assert.equal((ARG_FORMATS[id] || []).length, n, id);
  }
});

test('cellHtml: plain "3/5 · headline" text, pips are visual only, rationale in <small>', () => {
  const d = drv('lease', 1, 49.33, 'fv.lease', [59.33, 49.33, 10]);
  const h = cellHtml(d);
  assert.match(h, /^<span class="fv-pips" aria-hidden="true">(<i( class="on")?><\/i>){5}<\/span>/);
  assert.equal((h.match(/class="on"/g) || []).length, 1);
  assert.equal(text(h), '1/5 · 49 y left in 10 y\n59.3 years of lease left now; 49.3 years in 10 years.');
  assert.equal(text(cellHtml(drv('scarcity', 1, 51.4, 'fv.scarcity', ['4 ROOM', 51.4, 'BISHAN'], null, '%'))), "1/5 · 51% of the town's sold flats\n4-room flats are 51% of the sold flats in Bishan.");
  assert.equal(text(cellHtml(drv('liquidity', 3, 6, 'fv.liquidity.no-units', [12, 24, 6], null, 'sales/year'))).split('\n')[0], '3/5 · 6 sales a year');
});

test('cellHtml: null score -> "—" + reason; measured-but-unscored keeps its headline', () => {
  assert.equal(text(cellHtml(drv('momentum', null, null, 'fv.momentum.thin', ['4 ROOM', 'BISHAN', 3], 'thin'))), '—\nNot enough 4-room sales in Bishan to measure a 3-year trend.');
  const y = cellHtml(drv('yield', null, 5, 'fv.yield.no-town', [5, 3000], 'no-town', '%'));
  assert.match(y, /^<span class="muted">— · 5\.0% gross yield<\/span>/);
  assert.doesNotMatch(y, /fv-pips/);
});

test('cellHtml: market.js missing -> "Market data not loaded"; catalysts shown as partial (—)', () => {
  const m = { market: 'missing' };
  assert.equal(text(cellHtml(drv('momentum', null, null, 'fv.momentum.no-rpi', [], 'no-rpi'), m)), '—\nMarket data not loaded');
  assert.equal(text(cellHtml(drv('scarcity', null, null, 'fv.scarcity.no-mix', [], 'no-mix'), m)), '—\nMarket data not loaded');
  const c = text(cellHtml(drv('catalysts', 3, 2, 'fv.catalysts.no-landuse', [1, 0.8, 0], null, 'points'), m));
  assert.match(c, /^— · 2 points\n.*· Market data not loaded$/);
  // loaded market: the engine's own reason text
  assert.equal(text(cellHtml(drv('momentum', null, null, 'fv.momentum.no-rpi', [], 'no-rpi'))), '—\nResale Price Index not loaded, so the town trend cannot be compared with the market.');
  assert.equal(marketState(null, null), 'missing');
  assert.equal(marketState({ landuse: { blocks: 3 } }, { blocks: [1, 2] }), 'stale');
  assert.equal(marketState({ landuse: { blocks: 2 } }, { blocks: [1, 2] }), 'ok');
});

// ----------------------------------------------------------------------------- wiring on a tiny data set
function months(n) { const out = []; for (let i = 0; i < n; i++) { const y = 2024 + Math.floor(i / 12); out.push(`${y}-${String((i % 12) + 1).padStart(2, '0')}`); } return out; }
function data() {
  const ms = months(33); // 2024-01 .. 2026-09
  const blocks = [
    { b: '1', s: 0, t: 0, lat: 1.35, lon: 103.85, yc: 1990, u: 100, lease: 1990 },
    { b: '2', s: 0, t: 0, lat: 1.351, lon: 103.85, yc: 2021, u: 1500 },  // MOP ends 2026 (inside the wave)
  ];
  const tx = { b: [], m: [], ft: [], s: [], a: [], mo: [], ly: [], p: [] };
  ms.forEach((_, i) => { for (let k = 0; k < 2; k++) { tx.b.push(0); tx.m.push(i); tx.ft.push(0); tx.s.push(0); tx.a.push(90); tx.mo.push(k ? 1 : 0); tx.ly.push(1990); tx.p.push(500000 + i * 1000); } });
  tx.b.push(0); tx.m.push(0); tx.ft.push(0); tx.s.push(0); tx.a.push(90); tx.mo.push(1); tx.ly.push(1990); tx.p.push(500000);
  return { hdb: { months: ms, towns: ['ALPHA'], streets: ['ST A'], flat_types: ['4 ROOM'], models: ['Model A', 'Maisonette'], blocks, tx }, market: null, future: null, bto: null, rents: null };
}
const choice = (over = {}) => ({ id: 1, bid: 0, ft: 0, sqm: 90, price: 500000, ...over });
const make = (d = data(), extra = {}) => createFutureValue({ ctx: () => d, policy, asOf: () => d.hdb.months.at(-1), asOfLabel: () => 'Sep 2026', ...extra });

test('rows: one section + 8 driver rows, row shape like the other compare rows, no `v` / `best`', () => {
  const rows = make().rows();
  assert.deepEqual(rows[0], { sec: SEC });
  assert.deepEqual(rows.slice(1).map((r) => r.k), DRIVERS.map((id) => ROW_KEYS[id]));
  for (const r of rows.slice(1)) {
    assert.equal(typeof r.f, 'function'); assert.equal(typeof r.tip, 'string');
    assert.equal('v' in r, false, `${r.k} must not take part in best-in-row`); assert.equal('best' in r, false);
  }
  assert.ok(Object.values(TERMS).every((x) => ['lease-decay', 'rpi', 'mop', 'future-value'].includes(x)));
});

test('Simple shows lease runway, catalysts and supply only', () => {
  const simple = make().rows().filter((r) => r.simple).map((r) => r.k);
  assert.deepEqual(simple, [ROW_KEYS.lease, ROW_KEYS.catalysts, ROW_KEYS.supply]);
  assert.deepEqual([...SIMPLE_DRIVERS], ['lease', 'catalysts', 'supply']);
});

test('insert: right after "Lease & future value", before the next section; best-in-row count unchanged', () => {
  const base = [{ sec: 'Price & value' }, { k: 'Asking price', v: () => 1 }, { sec: 'Lease & future value' }, { k: 'Remaining lease today', v: () => 1 }, { sec: 'Commute' }, { k: 'Workplaces' }];
  const measures = (rs) => rs.filter((r) => r.v).length;
  const before = measures(base), r = make().insert(base.slice());
  assert.equal(r.findIndex((x) => x.sec === SEC), 4);
  assert.equal(r[13].sec, 'Commute');
  assert.equal(measures(r), before);
  const tail = make().insert([{ sec: 'Other' }, { k: 'x' }]);
  assert.equal(tail[2].sec, SEC);
});

test('cells for a shortlisted flat; deterministic; scores 1-5 or "—"', () => {
  const fv = make(), m = { c: choice() };
  const cells = fv.rows().slice(1).map((r) => text(r.f(m)));
  assert.deepEqual(cells, fv.rows().slice(1).map((r) => text(r.f(m))));
  for (const c of cells) assert.match(c, /^([1-5]\/5 · |—)/);
  assert.match(cells[0], /^[1-5]\/5 · \d+ y left in 10 y\n/);
  assert.equal(cells[1], '—\nMarket data not loaded');          // market.js missing
  assert.ok(!cells.some((c) => /undefined|NaN|\{\d\}/.test(c)), cells.join(' | '));
});

test('cache: key = block, type, data month, lease, area, price, market build; hits reuse, LRU bounded', () => {
  assert.equal(cacheKey({ bid: 3, flatType: '4 ROOM', asOf: '2026-09', leaseYear: 1990, area: 90, price: 5e5 }, 'm1'), '3|4 ROOM|2026-09|1990|90|500000|m1');
  assert.equal(cacheKey({ bid: 3, flatType: '4 ROOM', asOf: '2026-09' }), '3|4 ROOM|2026-09||||');
  const d = data(), fv = make(d), m = { c: choice() };
  const a = fv.of({ bid: 0, flatType: '4 ROOM', asOf: '2026-09', leaseYear: 1990, area: 90, price: 500000 });
  fv.rows().forEach((r) => r.f && r.f(m)); fv.badges(m);
  assert.equal(fv.size(), 1, 'rows + flag for one flat = one computation');
  assert.equal(fv.of({ bid: 0, flatType: '4 ROOM', asOf: '2026-09', leaseYear: 1990, area: 90, price: 500000 }), a);
  fv.rows()[1].f({ c: choice({ price: 520000 }) });
  assert.equal(fv.size(), 2, 'a new asking price is a new entry');
  d.market = { generated_at: 'x', landuse: null };
  fv.rows()[1].f(m);
  assert.equal(fv.size(), 3, 'a market build changes the key');
  for (let i = 0; i < CACHE_MAX + 5; i++) fv.of({ bid: 0, flatType: '4 ROOM', asOf: '2026-09', price: 400000 + i });
  assert.equal(fv.size(), CACHE_MAX);
});

test('blockModel: most common model of that type in the block; used for the rare-model bonus', () => {
  const d = data();
  assert.equal(blockModel(d.hdb, 0, '4 ROOM'), 'Maisonette');
  assert.equal(blockModel(d.hdb, 1, '4 ROOM'), null);
  assert.equal(blockModel(d.hdb, 0, '5 ROOM'), null);
});

test('MOP-wave flag only above params.badges.mopUnits', () => {
  const d = data(), fv = make(d), m = { c: choice() };
  const f = fv.badges(m);
  assert.deepEqual(f, [['warn', '!', '~1,500 flats within 1 km reach their 5-year MOP by 2028 — more resale supply nearby']]);
  d.hdb.blocks[1].u = P.badges.mopUnits; // not above the threshold
  assert.deepEqual(make(d).badges(m), []);
});

test('how-scored panel: drivers, sources, caveats, market status; no overall score', () => {
  const h = howHtml({ policy, market: null, hdb: data().hdb, asOfLabel: 'Sep 2026' });
  assert.match(h, /^<details class="cmp-fv-how" data-fv-how>/);
  for (const k of Object.values(ROW_KEYS)) assert.ok(h.includes(k), k);
  for (const c of ['No driver predicts prices', 'there is deliberately no overall score', 'Master Plan zoning is not a committed project', 'cannot tell a built plot from an empty one', 'Rents are declared rents', 'Past momentum is not a guide to future returns']) assert.ok(h.includes(c), c);
  assert.match(h, /Market data not loaded \(data\/market\.js\)/);
  assert.match(h, /sales to Sep 2026/);
  assert.doesNotMatch(h, /overall score:|out of 100/i);
  const market = { generated_at: '2026-10-07T10:00+08:00', sources: [{ name: 'HDB Resale Price Index', url: 'https://data.gov.sg/x', asOf: '2026-07-01' }], landuse: { year: 2025, radius_m: 800, blocks: 2 }, catalysts: [{ name: 'Hub & Park', year: null }] };
  const ok = howHtml({ open: true, policy, market, hdb: data().hdb });
  assert.match(ok, /data-fv-how open>/);
  assert.match(ok, /Market data built 2026-10-07\./);
  assert.match(ok, /<a href="https:\/\/data\.gov\.sg\/x" target="_blank" rel="noopener">HDB Resale Price Index<\/a> \(2026-07-01\)/);
  assert.match(ok, /Master Plan 2025 land use: zones of the tracked kinds within 800 m/);
  assert.match(ok, /Hub &amp; Park \(long-term\)/);
  assert.match(howHtml({ policy, market: { ...market, landuse: { ...market.landuse, blocks: 9 } }, hdb: data().hdb }), /built for a different data\.js/);
  assert.equal(make().panel([]), '');
});

test('block-card fold: the 8 drivers compactly for one flat type', () => {
  const fv = make(), h = fv.cardHtml(0, '4 ROOM');
  assert.equal((h.match(/<li>/g) || []).length, 8);
  assert.match(h, /4-room in this block · sales to Sep 2026/);
  const card = { drivers: DRIVERS.map((id) => drv(id, null, null, 'fv.nodata', [], 'no-data')) };
  assert.equal((text(cardListHtml(card, { ftName: '3 ROOM' })).match(/Not enough data for this flat\./g) || []).length, 8);
});

test('中文: every rationale template (zh-engine) and every row label / UI string (zh-explore)', () => {
  const engine = JSON.parse(readFileSync(new URL('../../app/i18n/zh-engine.json', import.meta.url), 'utf8'));
  const explore = JSON.parse(readFileSync(new URL('../../app/i18n/zh-explore.json', import.meta.url), 'utf8'));
  for (const tpl of Object.values(RATIONALES)) assert.ok(engine[tpl], tpl);
  for (const k of [SEC, ...Object.values(ROW_KEYS)]) assert.ok(explore[k], k);
  const src = readFileSync(new URL('../../app/modules/explore/futurevalue-ui.js', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/\bt\('((?:\\'|[^'\n])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(keys.length > 30);
  for (const k of keys) assert.ok(explore[k] || engine[k], `zh missing: ${k}`);
  for (const [en, zh] of Object.entries(explore).filter(([en]) => keys.includes(en))) {
    const ph = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(ph(zh), ph(en), en);
  }
});
