// Phone overhaul slice B (hdb-data-pipeline/docs/specs/phone-overhaul.md §3.3; P-27 to P-31, P-63; owner feedback
// 2026-10-09 "neat, calm, scannable"): on phones the block card is the map sheet's content — four key tiles, two 48 px
// buttons, then one-line collapsed rows (app/modules/explore/cardphone.js). Also dock.js sheet lanes (admitPhone /
// sheetIdOf) and the pan that keeps the pin above the sheet. Desktop markup: card.test.js / schoolcard.test.js unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { cardHtml, cardState, schoolsFold, schoolsBody, schoolsFact } from '../../app/modules/explore/card.js';
import { phoneCardHtml, phoneSalesTable, phoneStrings } from '../../app/modules/explore/cardphone.js';
import { admitPhone, sheetIdOf, panDelta, PIN_H } from '../../app/modules/explore/dock.js';
import { schoolBands } from '../../app/core/schools.js';
import { policy } from '../helpers.js';

const BANDS = policy.get('p1.distance.bands_km');
const AT = { lat: 1.35, lon: 103.85 };
const north = (m) => ({ lat: AT.lat + m / 111195, lon: AT.lon });
const SCHOOLS = [{ ...north(70), n: 'Mee Toh School', lvl: 'PRIMARY' }, { ...north(398), n: 'Rivervale Primary School', lvl: 'PRIMARY' }];
const bands = schoolBands(SCHOOLS, AT, BANDS);
const TX = { m: [2, 2, 1, 0], ft: [3, 4, 3, 3], p: [612000, 655000, 598000, 1050000], s: ['10–12', '4–6', '1–3', '40–42'] };
const cols = { month: (i) => `M${TX.m[i]}`, type: (i) => (TX.ft[i] === 3 ? '4-room' : '5-room'), storey: (i) => TX.s[i], sqm: () => 93, price: (i) => TX.p[i], psf: () => 611, sel: (i) => TX.ft[i] === 3 };
const IDX = [0, 1, 2, 3];

function model(over = {}) {
  return {
    key: 42, phone: true, schoolPick: (it) => SCHOOLS.indexOf(it), lease: 84.4, mrt: { d: '193 m', name: 'Fernvale' },
    head: { sub: 'Sengkang · North-East', facts: ['Completed 2011', schoolsFact(2)], items: [{ html: '350 m to Seletar Mall', tone: 'info' }, { html: '420 m to Clinic', tone: 'info' }, { html: 'Flood-prone point 120 m away (PUB)', tone: 'warn' }], newYear: null },
    st: cardState({ matchN: 2, aggOk: true, periodN: 2 }), tiles: { price: 690000, psf: 671.4, n: 2 }, scope: '4-room · Oct 2025 – Sep 2026', period: 'p', win: '1 year',
    trend: { heading: 'Median price by year', caption: 'c', enough: true }, sales: { idx: IDX, cols, total: 4, mine: 3, from: 2017, to: 2026, open: false },
    rent: [{ ft: '4 ROOM', med: 3300, n: 12 }], rentFirst: false, folds: {}, affordPrice: 690000, commute: '≈ 35 min to one-north',
    ho: { ft: '4 ROOM', price: 690000 }, schools: { bands, bandsKm: BANDS }, ...over,
  };
}
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rows = (h) => [...h.matchAll(/<summary><span class="pc-l">([^<]*)<\/span><span class="pc-s">(.*?)<\/span><\/summary>/g)].map((m) => `${m[1]} | ${strip(m[2])}`);

test('first view: four key tiles (same figures as desktop), then rows, then the two 48 px buttons (sticky footer, R-06)', () => {
  const h = cardHtml(model());
  assert.equal(h, phoneCardHtml(model()));
  const tiles = h.match(/<div class="pc-tiles">(.*?)<\/div><div class="pc-rows">/s)[1];
  assert.equal(strip(tiles), 'Median price S$690k Per sq ft S$671 Lease left 84 y Nearest MRT 193 m');
  assert.match(cardHtml(model({ phone: false })), /<b>S\$690k<\/b>.*<b>S\$671<\/b>/s); // desktop shows the same price / $psf
  assert.match(h, /<div class="pc-acts"><button type="button" class="btn primary" data-act="add">Add to my choices<\/button><button type="button" class="btn" data-act="afford">Afford this<\/button><\/div><\/div>$/);
  assert.ok(h.indexOf('pc-tiles') < h.indexOf('pc-rows') && h.indexOf('pc-rows') < h.indexOf('pc-acts'));
  assert.doesNotMatch(h, /bc-sec|bc-facts|data-act="schools"|Add a flat from this block/); // no boxes, no pills, no 16 px link (P-63)
  assert.match(cardHtml(model({ affordPrice: null })), /data-act="afford" disabled>Afford this</);
  const none = strip(cardHtml(model({ st: cardState({ matchN: 0, aggOk: false, periodN: 0 }), tiles: { price: null, psf: null, n: 0 }, lease: null, mrt: null })).match(/<div class="pc-tiles">.*?<div class="pc-rows">/s)[0]);
  assert.equal(none, 'Median price — Per sq ft — Lease left — Nearest MRT —');
  // a long figure (S$1050k) gets the smaller one-line class so four tiles still fit 360 px
  assert.match(cardHtml(model({ tiles: { price: 1050000, psf: 671, n: 2 } })), /<b class="pc-long">S\$1050k<\/b>/);
  assert.doesNotMatch(h, /pc-long/);
});

test('rows: one line each — label and a short summary — in a calm fixed order; all closed by default (F6 data-fold)', () => {
  const h = cardHtml(model());
  assert.deepEqual(rows(h), [
    'Good to know | ⚠ Flood-prone point 120 m away',
    'Prices · last 1 year | 2 matching sales',
    'Recent sales | 4 in 2017–2026',
    'Rent | 4-room S$3,300',
    'Primary schools | 2 within 1 km',
    'Nearby | 350 m to Seletar Mall, 420 m to Clinic',
  ]);
  assert.match(h, /<div class="pc-row pc-plain pc-wrap"><span class="pc-l">Commute<\/span><span class="pc-s">≈ 35 min to one-north<\/span><\/div>/);
  assert.doesNotMatch(h, /<details[^>]* open/);
  assert.deepEqual([...h.matchAll(/data-fold="([^"]+)"/g)].map((m) => m[1]), ['pc-warn', 'pc-prices', 'pc-sales', 'pc-rent', 'pc-schools', 'pc-near']);
  // remembered state (keepFolds) and rent colour mode open their rows
  const open = cardHtml(model({ pfold: (k, d) => k === 'pc-sales' || d, rentFirst: true }));
  assert.match(open, /data-fold="pc-sales" open/); assert.match(open, /data-fold="pc-rent" open/);
});

test('rows hold what the desktop card holds: hand-off note + trend in Prices, Rent check first in Rent, schools as rows', () => {
  const h = cardHtml(model());
  assert.match(h, /<p class="pc-note">Afford this and Rent check use the 4-room median: S\$690k\.<\/p><h4 class="pc-h">Median price by year<\/h4><div class="bc-chart"><\/div>/);
  assert.match(h, /data-fold="pc-rent">.*?<div class="pc-body"><p class="pc-line"><button type="button" class="btn" data-act="rent">Rent check →<\/button><\/p><ul class="pc-list"><li>4-room S\$3,300 \(12 rentals\)<\/li>/s);
  assert.equal((h.match(/data-act="rent"/g) || []).length, 1);
  assert.match(cardHtml(model({ rent: null })), /<div class="pc-row pc-plain"><span class="pc-l">Rent<\/span><button type="button" class="btn" data-act="rent">Rent check →<\/button><\/div>/);
  assert.match(h, /<button type="button" class="bc-row" data-school="0">Mee Toh · 70 m<\/button>/);
  assert.match(h, /data-fold="pc-warn">.*<li class="pc-warn">Flood-prone point 120 m away \(PUB\)<\/li>/s);
  assert.match(cardHtml(model({ schools: { bands: schoolBands([], AT, BANDS), bandsKm: BANDS } })), /Primary schools<\/span><span class="pc-s">none within 1 km/);
});

test('sales on phone: 3 columns (month · storey · price), same prices, blue bar kept, 8 rows then "Show all"', () => {
  const t3 = phoneSalesTable(IDX, cols, false);
  assert.equal((t3.match(/<th[ >]/g) || []).length, 3);
  assert.match(t3, /<tr class="sel"><td>M2<\/td><td>10–12<\/td><td class="r">612,000<\/td><\/tr><tr><td>M2<\/td><td>4–6<\/td><td class="r">655,000<\/td><\/tr>/);
  assert.match(t3, /1,050,000/);
  const many = Array.from({ length: 12 }, (_, i) => i % 4);
  assert.equal((phoneSalesTable(many, cols, false).match(/<tr[ >]/g) || []).length - 1, 8);
  assert.equal((phoneSalesTable(many, cols, true).match(/<tr[ >]/g) || []).length - 1, 12);
  assert.match(cardHtml(model({ sales: { ...model().sales, idx: many } })), /<button type="button" class="link bc-more">Show all 12<\/button>/);
});

test('new block, no sales: "—" tiles, one Prices note, no sales row; desktop schools fold unchanged', () => {
  const nb = cardHtml(model({ head: { sub: 'Y', facts: [], items: [], newYear: 2029 }, st: cardState({ matchN: 0, aggOk: false, periodN: 0 }), tiles: { price: null, psf: null, n: 0 },
    sales: { idx: [], cols, total: 0, mine: 0, from: 2017, to: 2026, open: false }, affordPrice: null }));
  assert.deepEqual(rows(nb).slice(0, 2), ['Good to know | No resale yet — first resales from ~2029 (5-yr MOP)', 'Prices | —']);
  assert.doesNotMatch(nb, /pc-sales/);
  assert.match(schoolsFold(bands, BANDS, false), /^<details class="bc-sec bc-fold" data-fold="schools"><summary class="bc-h">Primary schools within 1 km \(2\)<\/summary><ul class="bc-list"><li>Mee Toh · 70 m<\/li>/);
  assert.match(schoolsBody(bands, BANDS, () => -1), /^<ul class="bc-list bc-rows"><li>Mee Toh · 70 m<\/li>/); // not on the list → plain text
});

test('dock sheet lanes: one block card and one school card at a time; the block card is always number 1', () => {
  assert.equal(sheetIdOf(42), 'card'); assert.equal(sheetIdOf('s:3'), 'school');
  assert.deepEqual(admitPhone([], 42), { evict: null, slot: 0 });
  assert.deepEqual(admitPhone([{ key: 7 }], 42), { evict: 7, slot: 0 });               // another block replaces it
  assert.deepEqual(admitPhone([{ key: 's:1' }], 42), { evict: null, slot: 0 });        // stacks on a school card
  assert.deepEqual(admitPhone([{ key: 7 }, { key: 's:1' }], 's:4'), { evict: 's:1', slot: 0 });
});

test('panDelta: the pin stays put when it is in the map above the sheet; else it is centred in that band', () => {
  const band = { top: 60, bottom: 380 };
  assert.equal(panDelta(200, band), 0);
  assert.equal(panDelta(60 + PIN_H + 8, band), 0);
  assert.equal(panDelta(600, band), Math.round(600 - (60 + 380 + PIN_H) / 2));         // under the sheet → pan the map up
  assert.ok(panDelta(70, band) < 0);                                                   // under the search bar → pan down
  const y = 600 - panDelta(600, band);
  assert.ok(y - PIN_H >= band.top + 8 && y <= band.bottom - 8);
});

test('中文: the new phone strings are staged for zh-explore (integrator merges)', () => {
  const read = (u) => JSON.parse(readFileSync(u, 'utf8'));
  const I = new URL('../../app/i18n/', import.meta.url), staged = new URL('staging/B.zh-explore.json', I);
  const dict = Object.assign({}, read(new URL('zh.json', I)), read(new URL('zh-explore.json', I)), existsSync(staged) ? read(staged) : {});
  const used = [...phoneStrings(), 'Close card', 'Rent check →', 'Median price', 'Lease left', 'Nearest MRT', 'Rent', 'Prices', 'Primary schools', 'Commute', 'Nearby', 'Date', 'Storey', 'Price (S$)'];
  assert.deepEqual(used.filter((s) => !dict[s]), []);
});
