import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS_SHOWN, ftShort, storeyShort, kTile, typesText, scopeText, cardState, sortSales, salesRows, salesScope, cardHtml, execSummary, warnShort } from '../../app/modules/explore/card.js';

const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const MONTHS = ['Oct 2025', 'Nov 2025', 'Sep 2026'];
const fmtMonth = (i) => MONTHS[i] ?? `M${i}`;

test('short names: flat types and storey ranges', () => {
  assert.deepEqual(FT.map(ftShort), ['1-room', '2-room', '3-room', '4-room', '5-room', 'Exec.', 'Multi-gen']);
  assert.equal(storeyShort('10 TO 12'), '10–12');
  assert.equal(storeyShort('01 TO 03'), '1–3');
  assert.equal(storeyShort('40 TO 42'), '40–42');
});

test('scopeText: all types, up to 4 short names, "{0} flat types", more filters', () => {
  const base = { flatTypes: FT, mFrom: 0, mTo: 2, fmtMonth, filtOn: false };
  assert.equal(scopeText({ ...base, ft: [0, 1, 2, 3, 4, 5, 6] }), 'All flat types · Oct 2025 – Sep 2026');
  assert.equal(scopeText({ ...base, ft: [6, 3, 4, 5] }), '4-room, 5-room, Exec., Multi-gen · Oct 2025 – Sep 2026');
  assert.equal(scopeText({ ...base, ft: [1, 2, 3, 4, 5] }), '5 flat types · Oct 2025 – Sep 2026');
  assert.equal(scopeText({ ...base, ft: [3], filtOn: true }), '4-room · Oct 2025 – Sep 2026 · more filters on');
});

test('cardState: match / fallback / outside filters / none', () => {
  assert.deepEqual(cardState({ matchN: 3, aggOk: true, periodN: 3 }), { state: 'match', outside: false });
  assert.deepEqual(cardState({ matchN: 0, aggOk: false, periodN: 2 }), { state: 'fallback', outside: false });
  assert.deepEqual(cardState({ matchN: 3, aggOk: false, periodN: 5 }), { state: 'fallback', outside: true });
  assert.deepEqual(cardState({ matchN: 0, aggOk: false, periodN: 0 }), { state: 'none', outside: false });
});

test('sortSales: month descending, then transaction index descending', () => {
  const m = [5, 7, 7, 2, 9];
  assert.deepEqual(sortSales([0, 1, 2, 3, 4], m), [4, 2, 1, 0, 3]);
});

// a block with 12 sales: index = tx id
const TX = { m: [0, 0, 1, 1, 2, 2, 2, 0, 1, 2, 0, 1], ft: [3, 3, 4, 3, 3, 5, 3, 4, 3, 3, 3, 4], s: [3, 3, 4, 3, 3, 5, 3, 4, 3, 3, 3, 4], a: [93, 92, 110, 93, 94, 121, 93, 110, 93, 92, 93, 111], p: [612000, 598000, 655000, 1050000, 605500, 720000, 612400, 640000, 601000, 590000, 615000, 660000] };
const STOREYS = ['01 TO 03', '04 TO 06', '07 TO 09', '10 TO 12', '13 TO 15', '16 TO 18'];
const cols = { month: (i) => fmtMonth(TX.m[i]), type: (i) => ftShort(FT[TX.ft[i]]), storey: (i) => storeyShort(STOREYS[TX.s[i]]), sqm: (i) => TX.a[i], price: (i) => TX.p[i], psf: (i) => TX.p[i] / (TX.a[i] * 10.7639) };

test('salesRows: exact price (display change: was S$612k), rounded $psf, short type and storey', () => {
  assert.equal(salesRows([0], cols, 0, 1), '<tr><td>Oct 2025</td><td>4-room</td><td>10–12</td><td class="r">93</td><td class="r">612,000</td><td class="r">611</td></tr>');
  assert.match(salesRows([3], cols, 0, 1), /<td class="r">1,050,000<\/td>/);
  assert.match(salesRows([6], cols, 0, 1), /<td class="r">612,400<\/td>/);
  assert.equal(salesRows([0, 1, 2], cols, 1, 3).split('<tr>').length - 1, 2);
});

// card sales list: every sale of every type in the slider years (here: all 12), newest first, selected types (4-room) marked
const colsSel = { ...cols, sel: (i) => TX.ft[i] === 3 };
function model(over = {}) {
  const idx = sortSales(TX.p.map((_, i) => i), TX.m);
  const st = cardState({ matchN: 8, aggOk: true, periodN: 8 });
  return {
    key: 4711,
    head: { sub: 'Ang Mo Kio · North-East', facts: ['Completed 1978', '52 y lease left'], items: [{ html: '350 m to Northpoint', tone: 'info' }, { html: '420 m to Funeral parlour', tone: 'warn' }], newYear: null },
    st, tiles: { price: 612000, psf: 611.4, n: 8 }, scope: '4-room · Oct 2025 – Sep 2026', period: 'Oct 2025 – Sep 2026', win: '1 year',
    trend: { heading: 'Median price by year', caption: 'Selected flat types · 2017–2026', enough: true },
    sales: { idx, cols: colsSel, total: idx.length, mine: idx.filter((i) => TX.ft[i] === 3).length, from: 2017, to: 2026, open: false },
    rent: [{ ft: '4 ROOM', med: 3100, n: 12 }], rentFirst: false, folds: { rent: false, near: false }, affordPrice: 612000, ...over,
  };
}

test('salesRows: selected types get the "sel" row (blue bar + bold type), others plain', () => {
  assert.equal(salesRows([0], colsSel, 0, 1), '<tr class="sel"><td>Oct 2025</td><td>4-room</td><td>10–12</td><td class="r">93</td><td class="r">612,000</td><td class="r">611</td></tr>');
  assert.match(salesRows([2], colsSel, 0, 1), /^<tr><td>/);   // 5-room: not one of the selected types
});

test('cardHtml: all sales in the slider years, newest first, 8 rows then "Show all", warnings stay visible, no duplicate ids', () => {
  const m = model(), html = cardHtml(m);
  assert.equal(ROWS_SHOWN, 8);
  assert.doesNotMatch(html, /all-time/i);
  assert.doesNotMatch(html, /role="radiogroup"/);                            // the Matching / All seg is gone
  assert.equal((html.match(/<tbody>.*<\/tbody>/s)[0].match(/<tr[ >]/g) || []).length, ROWS_SHOWN);
  assert.match(html, /Show all 12</);
  assert.match(html, /12 sales · 2017–2026 · all flat types \(8 of your types\)/);
  assert.equal(salesScope(m.sales), '12 sales · 2017–2026 · all flat types (8 of your types)');
  assert.match(html, /Blue bar = your flat types\./);
  const rows = html.match(/<tbody>.*<\/tbody>/s)[0].match(/<tr[^>]*>/g);
  assert.deepEqual(rows.map((r) => r.includes('sel')), m.sales.idx.slice(0, ROWS_SHOWN).map((i) => TX.ft[i] === 3));
  assert.ok(m.sales.idx.slice(1).every((i, k) => TX.m[i] <= TX.m[m.sales.idx[k]]));   // newest first
  assert.match(html, /<span class="tag serious">420 m to Funeral parlour<\/span>/);
  assert.match(html, /data-fold="near"><summary class="bc-h">Nearby<\/summary><ul class="bc-list"><li>350 m to Northpoint<\/li>/);
  assert.match(html, /4-room S\$3,100 \(12 rentals\)/);
  assert.match(html, /<h5 class="bc-h">Prices · last 1 year<\/h5>/);
  assert.match(html, /<b>S\$612k<\/b>/);                                   // tile: unchanged format and value
  assert.match(html, /8 matching sales · 4-room · Oct 2025 – Sep 2026/);
  assert.match(html, /data-act="afford">/);                                // enabled
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(ids, ['bc-4711-sales']);                                  // per-block id only (cards open side by side)
  assert.doesNotMatch(html, /popAdd|popAfford|popRent|bcSalesH/);
  assert.match(html, /data-act="add"/); assert.match(html, /data-act="rent"/);
});

test('cardHtml: the Afford price is the tile (l.491) value; fallback / none labels; new block', () => {
  const fb = model({ st: cardState({ matchN: 3, aggOk: false, periodN: 8 }), tiles: { price: 640000, psf: 600, n: 8 }, affordPrice: 640000 });
  const h = cardHtml(fb);
  assert.match(h, /<b>S\$640k<\/b>/);
  assert.match(h, /All flat types in your period · Oct 2025 – Sep 2026/);
  assert.match(h, /outside your town or lease filters/);
  assert.equal(fb.affordPrice, fb.tiles.price);
  const none = cardHtml(model({ st: cardState({ matchN: 0, aggOk: false, periodN: 0 }), tiles: { price: null, psf: null, n: 0 }, affordPrice: null }));
  assert.match(none, /No sales in your period\./);
  assert.equal((none.match(/<b>—<\/b>/g) || []).length, 3);
  assert.match(none, /data-act="afford" disabled/);
  // sales outside the slider years only: scope line, no table
  const old = cardHtml(model({ sales: { idx: [], cols: colsSel, total: 12, mine: 0, from: 2025, to: 2026, open: false } }));
  assert.match(old, /0 sales · 2025–2026 · all flat types \(0 of your types\)/);
  assert.doesNotMatch(old, /<table>/);
  const nb = cardHtml(model({ head: { sub: 'Y', facts: [], items: [], newYear: 2029 }, st: cardState({ matchN: 0, aggOk: false, periodN: 0 }), tiles: { price: null, psf: null, n: 0 },
    sales: { idx: [], cols, total: 0, mine: 0, from: 2017, to: 2026, open: false }, rent: null, trend: { heading: 'Median price by year', caption: '', enough: false }, affordPrice: null }));
  // never resold: one note replaces the empty prices / trend / sales sections (owner, 2026-10-07)
  assert.match(nb, /<span class="tag info">No resale yet — first resales from ~2029 \(5-yr MOP\)<\/span>/);
  assert.match(nb, /No resales yet, so there are no prices for this block\./);
  assert.doesNotMatch(nb, /Not enough sales for a trend\.|No sales in this block yet\.|bc-tiles|bc-chart/);
  assert.match(nb, /data-act="afford" disabled/);
});

test('cardHtml: "Show all" state survives a refresh (open → every row, scroller class)', () => {
  const h = cardHtml(model({ sales: { ...model().sales, open: true } }));
  assert.equal((h.match(/<tbody>.*<\/tbody>/s)[0].match(/<tr[ >]/g) || []).length, 12);
  assert.match(h, /class="bc-table open"/);
  assert.match(h, /Show fewer</);
});

test('cardHtml: rent mode puts the open rent section right after the prices', () => {
  const h = cardHtml(model({ rentFirst: true, folds: { rent: true, near: false } }));
  assert.ok(h.indexOf('data-fold="rent" open') < h.indexOf('Median price by year'));
  assert.ok(cardHtml(model()).indexOf('data-fold="rent"') > cardHtml(model()).indexOf('Sales in this block'));
});

test('cardHtml: future-value fold only with model.fv, closed by default, empty until opened, before the actions', () => {
  assert.doesNotMatch(cardHtml(model()), /data-fold="fv"/);
  const h = cardHtml(model({ fv: '4 ROOM', folds: { rent: false, near: false, fv: false } }));
  assert.match(h, /<details class="bc-sec bc-fold" data-fold="fv"><summary class="bc-h">Future-value outlook<\/summary><div class="bc-fv-body" data-fv><\/div><\/details>/);
  assert.ok(h.indexOf('data-fold="fv"') < h.indexOf('bc-actions'));
  assert.match(cardHtml(model({ fv: '4 ROOM', folds: { rent: false, near: false, fv: true } })), /data-fold="fv" open>/);
});

const X = { types: '4-room, 5-room', win: '1 year', lease: 52.4, mrt: { d: '450 m', name: 'Yio Chu Kang' }, warn: '' };
test('execSummary: match / fallback / outside / none / new block / warning', () => {
  assert.equal(execSummary({ ...X, state: 'match', price: 612000, n: 12 }),
    '<b>S$612k</b> median for 4-room, 5-room · <b>12</b> sales in the last 1 year · <b>52 y</b> lease left · <b>450 m</b> to Yio Chu Kang MRT');
  assert.match(execSummary({ ...X, state: 'match', price: 612000, n: 1 }), /<b>1<\/b> sale in the last 1 year/);
  assert.equal(execSummary({ ...X, state: 'fallback', price: 480000, n: 3 }),
    'No 4-room, 5-room sales in the last 1 year — all types: <b>S$480k</b> (<b>3</b> sales) · <b>52 y</b> lease left · <b>450 m</b> to Yio Chu Kang MRT');
  assert.match(execSummary({ ...X, state: 'fallback', outside: true, price: 480000, n: 3 }), /^<b>S\$480k<\/b> median for all flat types · <b>3<\/b> sales in the last 1 year/);
  assert.equal(execSummary({ ...X, state: 'none', last: { month: 'Mar 2024', price: 455000 }, win: '2 years', mrt: null }),
    'No sales in the last 2 years · last sale <b>Mar 2024</b>, <b>S$455k</b> · <b>52 y</b> lease left');
  assert.equal(execSummary({ ...X, state: 'new', newYear: 2029, lease: 99, mrt: null }), 'New block — first resales from ~<b>2029</b> · <b>99 y</b> lease left');
  const w = execSummary({ ...X, state: 'match', price: 612000, n: 12, warn: warnShort('<span style="color:#56677a">Flood-prone point 120 m away (Ang Mo Kio Ave 6, PUB)</span>') });
  assert.match(w, / <span class="bc-exec-warn">· ⚠ Flood-prone point 120 m away<\/span>$/);
  assert.equal(warnShort('within former Bidadari Cemetery (approx.)'), 'within former Bidadari Cemetery');
  assert.equal(execSummary({ ...X, state: 'match', price: 612000, n: 2, lease: null, mrt: null }), '<b>S$612k</b> median for 4-room, 5-room · <b>2</b> sales in the last 1 year');
});

test('kTile / typesText: tile format unchanged; type names as in the scope line', () => {
  assert.equal(kTile(612400), 'S$612k'); assert.equal(kTile(null), '—');
  assert.equal(typesText([4, 3], FT), '4-room, 5-room');
  assert.equal(typesText([0, 1, 2, 3, 4, 5, 6], FT), 'All flat types');
});
