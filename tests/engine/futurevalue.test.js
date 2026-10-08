// Future-value scorecard: band edges per driver, nulls -> null score + reason, facts from a tiny
// synthetic data set (HDB_DATA / HDB_MARKET / HDB_FUTURE / HDB_BTO / HDB_RENTS shapes), determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policy, close } from '../helpers.js';
import {
  DRIVERS, RATIONALES, band, fillTemplate, rationaleText, futureValue, scorecard,
  scoreLease, scoreMomentum, scoreValue, scoreCatalysts, scoreSupply, scoreYield, scoreLiquidity, scoreScarcity,
} from '../../app/engine/futurevalue.js';
import { futureValueFacts, addMonths, quarterEnd, firstYear, leaseLeft, rpiMean, median } from '../../app/engine/futurevalue-facts.js';
import { FUTURE_VALUE_PARAMS as P } from '../../app/modules/explore/futurevalue-params.js';

const TERM = policy.get('lease.term.years');
const MOP = policy.get('rentbuy.mop.years').standard;

// ----------------------------------------------------------------------------- helpers
test('band: higher / lower is better, edges inclusive, null in -> null out', () => {
  const cuts = [10, 20, 30, 40];
  assert.deepEqual([5, 10, 19.9, 20, 40, 99].map((v) => band(v, cuts, true)), [1, 2, 2, 3, 5, 5]);
  assert.deepEqual([5, 10, 10.1, 30, 40, 41].map((v) => band(v, cuts, false)), [5, 5, 4, 3, 2, 1]);
  assert.equal(band(null, cuts), null);
  assert.equal(band(NaN, cuts), null);
});

test('date / text helpers', () => {
  assert.equal(addMonths('2026-09', -12), '2025-09');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(quarterEnd('2026-Q2'), '2026-06');
  assert.equal(quarterEnd('2026-Q5'), null);
  assert.equal(firstYear('Dec 2028'), 2028);
  assert.equal(firstYear('To be announced'), null);
  assert.equal(firstYear(null), null);
  assert.ok(close(leaseLeft(1985, '2026-01', TERM), TERM - 41));
  assert.ok(close(leaseLeft(1985, '2026-07', TERM), TERM - 41.5));
  assert.equal(leaseLeft(null, '2026-01', TERM), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
  const rpi = { quarters: ['2025-Q3', '2025-Q4', '2026-Q1'], index: [100, 110, 120] };
  assert.equal(rpiMean(rpi, '2025-06', '2025-12'), 105);
  assert.equal(rpiMean(rpi, '2027-01', '2027-12'), null);
});

test('templates: fill placeholders, keep unknown ones', () => {
  assert.equal(fillTemplate('{0} and {1}', ['a', 2]), 'a and 2');
  assert.equal(fillTemplate('{0} and {3}', ['a']), 'a and {3}');
  assert.equal(rationaleText({ id: 'fv.lease', args: [70, 60, 10] }), '70 years of lease left now; 60 years in 10 years.');
});

test('default params: every band has 4 ascending cut-offs', () => {
  const bands = [P.lease.bands, P.momentum.bands, P.value.bands, P.catalysts.bands, P.supply.bands, P.yield.bands,
    P.liquidity.turnoverBands, P.liquidity.salesBands, P.scarcity.shareBands];
  for (const b of bands) {
    assert.equal(b.length, 4);
    assert.ok(b.every((x, i) => i === 0 || x > b[i - 1]), String(b));
  }
  assert.ok(P.momentum.years.includes(P.momentum.scoreYears));
});

// ----------------------------------------------------------------------------- drivers on hand-made facts
const leaseF = (later) => ({ start: 1990, now: later + 10, later, horizon: 10, drag: null, town: 'T' });

test('1 lease: score on lease left at the horizon; drag variant; unknown -> null', () => {
  assert.deepEqual([49.9, 50, 59.9, 60, 70, 79.9, 80].map((l) => scoreLease(leaseF(l), P.lease, 36).score), [1, 2, 2, 3, 4, 4, 5]);
  const d = scoreLease({ ...leaseF(55), drag: { pct: -8 } }, P.lease, 36);
  assert.equal(d.rationale.id, 'fv.lease.drag');
  assert.equal(d.rationale.args[4], -8);
  const n = scoreLease({ now: null }, P.lease, 36);
  assert.equal(n.score, null);
  assert.equal(n.reason, 'no-lease');
  assert.equal(n.metric, null);
});

const momF = (excess, rpi = true) => ({ rpi, town: 'T', series: [{ years: 3, town: excess == null ? null : 10 + excess, rpi: 10, excess, n: [9, 9] }] });

test('2 momentum: excess vs RPI bands; no RPI / thin -> null with reason', () => {
  assert.deepEqual([-10.1, -10, -3, 0, 3, 10].map((e) => scoreMomentum(momF(e), P.momentum, '4 ROOM').score), [1, 2, 3, 3, 4, 5]);
  assert.equal(scoreMomentum(momF(5, false), P.momentum, '4 ROOM').reason, 'no-rpi');
  const thin = scoreMomentum(momF(null), P.momentum, '4 ROOM');
  assert.equal(thin.score, null);
  assert.equal(thin.reason, 'thin');
  assert.equal(thin.rationale.id, 'fv.momentum.thin');
});

const valF = (gap, ask = null) => ({ blockPsm: 100 + gap, askPsm: ask, peerPsm: 100, nPeer: 20, town: 'T', minN: 5 });

test('3 relative value: cheaper than peers scores higher; asking price wins over block median', () => {
  assert.deepEqual([-10.5, -9.5, -3.5, 0, 2.5, 9.5, 10.5].map((g) => scoreValue(valF(g), P.value, true, 24).score), [5, 4, 4, 3, 3, 2, 1]);
  const ask = scoreValue(valF(0, 80), P.value, true, 24);
  assert.equal(ask.rationale.id, 'fv.value.ask');
  assert.ok(close(ask.metric, -20));
  assert.equal(scoreValue({ ...valF(0), blockPsm: null }, P.value, true, 24).rationale.id, 'fv.value.thin-block');
  assert.equal(scoreValue({ ...valF(0), peerPsm: null }, P.value, true, 24).reason, 'thin');
  assert.equal(scoreValue(valF(0), P.value, false, 24).reason, 'no-lease');
});

test('4 catalysts: MRT + projects + capped land-use points; no data -> null', () => {
  const base = { mrt: null, stations: 0, projects: [], landuse: {}, landuseYear: 2025, radiusM: 800, hasFuture: true };
  assert.equal(scoreCatalysts(base, P.catalysts).score, 1);
  const mrt = scoreCatalysts({ ...base, mrt: { name: 'X', km: 0.3, year: 2030 }, stations: 1 }, P.catalysts);
  assert.equal(mrt.metric, P.catalysts.points.mrt);
  const lu = { WHITE: { n: 9, ha: 3 }, 'NOT TRACKED': { n: 50, ha: 9 } };
  const capped = scoreCatalysts({ ...base, landuse: lu }, P.catalysts);
  assert.equal(capped.metric, P.catalysts.landuse.weights.WHITE * P.catalysts.landuse.cap);   // cap + unknown category weight 0
  const all = scoreCatalysts({ ...base, mrt: { name: 'X', km: 0.3, year: 2030 }, stations: 1, projects: [{ name: 'P' }, { name: 'Q' }], landuse: lu }, P.catalysts);
  assert.equal(all.score, 5);
  assert.equal(scoreCatalysts({ ...base, landuse: null }, P.catalysts).rationale.id, 'fv.catalysts.no-landuse');
  const none = scoreCatalysts({ ...base, hasFuture: false, landuse: null }, P.catalysts);
  assert.equal(none.score, null);
  assert.equal(none.rationale.id, 'fv.catalysts.none');
});

test('5 supply: fewer upcoming units scores higher; BTO missing -> variant text', () => {
  const f = (bto, mop, hasBto = true) => ({ btoUnits: bto, mopUnits: mop, stock: 5000, hasBto, mopYears: MOP });
  assert.deepEqual([[0, 0], [300, 0], [300, 1], [500, 500], [2000, 0], [2000, 2001]].map(([a, b]) => scoreSupply(f(a, b), P.supply, 2026).score), [5, 5, 4, 4, 3, 1]);
  const nb = scoreSupply(f(0, 1200, false), P.supply, 2026);
  assert.equal(nb.rationale.id, 'fv.supply.no-bto');
  assert.equal(nb.score, 3);
  assert.equal(nb.rationale.args[3], 2026 + P.supply.mopWindowYears);
});

test('6 yield: relative to town; missing rent / price / town -> null with reason', () => {
  const f = (pct, townPct, extra = {}) => ({ rent: 3000, rentTier: 'block12', price: 500000, priceSource: 'block', pct, townPct, town: 'T', ...extra });
  assert.deepEqual([[4, 5], [4.75, 5], [5, 5], [5.25, 5], [6, 5]].map(([a, b]) => scoreYield(f(a, b), P.yield, '4 ROOM').score), [1, 2, 3, 4, 5]);
  assert.equal(scoreYield(f(5, 5, { rent: null }), P.yield).reason, 'no-rent');
  assert.equal(scoreYield(f(null, 5), P.yield).reason, 'no-price');
  const nt = scoreYield(f(5, null), P.yield);
  assert.equal(nt.score, null);
  assert.equal(nt.metric, 5);
  assert.equal(nt.reason, 'no-town');
  assert.equal(scoreYield(f(5, 5, { rentTier: 'town', priceSource: 'town' }), P.yield).reason, 'town-only');
});

test('7 liquidity: turnover bands; unit count unknown -> sales-per-year bands', () => {
  const f = (perYear, units) => ({ sales: perYear * 2, months: 24, perYear, units, turnoverPct: units ? (perYear / units) * 100 : null });
  assert.deepEqual([[0, 100], [1, 100], [2.5, 100], [5, 100]].map(([s, u]) => scoreLiquidity(f(s, u), P.liquidity).score), [1, 2, 3, 5]);
  const nu = scoreLiquidity(f(6, null), P.liquidity);
  assert.equal(nu.rationale.id, 'fv.liquidity.no-units');
  assert.equal(nu.score, 3);
});

test('8 scarcity: rarer type scores higher, size / model bonuses capped at 5; no mix -> null', () => {
  const f = (sharePct, sizePct = 0, rare = false) => ({ sharePct, sizePct, rare, model: rare ? 'Maisonette' : 'Model A', flatType: '5 ROOM', town: 'T' });
  assert.deepEqual([4, 5, 10, 20, 35, 36].map((s) => scoreScarcity(f(s), P.scarcity).score), [5, 5, 4, 3, 2, 1]);
  assert.equal(scoreScarcity(f(30, 12), P.scarcity).score, 3);
  assert.equal(scoreScarcity(f(30, 12, true), P.scarcity).rationale.id, 'fv.scarcity.big-rare');
  assert.equal(scoreScarcity(f(4, 50, true), P.scarcity).score, 5);
  assert.equal(scoreScarcity({ sharePct: null }, P.scarcity).reason, 'no-mix');
});

// ----------------------------------------------------------------------------- facts from a synthetic data set
function months(from, to) { const out = []; for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m); return out; }
function fixture() {
  const ms = months('2019-01', '2026-09');
  const blocks = [
    { b: '1', s: 0, t: 0, lat: 1.35, lon: 103.85, yc: 1985, u: 100 },      // 0 subject
    { b: '2', s: 0, t: 0, lat: 1.351, lon: 103.85, yc: 1986, u: 200 },     // 1 similar-lease peer
    { b: '3', s: 0, t: 0, lat: 1.352, lon: 103.85, yc: 2022, u: 500 },     // 2 MOP ends 2027
    { b: '4', s: 0, t: 0, lat: 1.3495, lon: 103.85, yc: 1972, u: 150 },    // 3 old lease (drag band)
    { b: '5', s: 0, t: 1, lat: 1.45, lon: 103.70, yc: 1990, u: 100 },      // 4 other town, far
  ];
  const tx = { b: [], m: [], ft: [], s: [], a: [], mo: [], ly: [], p: [] };
  const add = (b, mi, ft, ly, p) => { tx.b.push(b); tx.m.push(mi); tx.ft.push(ft); tx.s.push(0); tx.a.push(90); tx.mo.push(0); tx.ly.push(ly); tx.p.push(p); };
  ms.forEach((m, i) => {
    const g = 1 + i / 200;                         // steady growth
    add(0, i, 1, 1985, Math.round(450000 * g));
    add(1, i, 1, 1986, Math.round(500000 * g));
    add(1, i, 1, 1986, Math.round(500000 * g));
    add(3, i, 1, 1972, Math.round(400000 * g));
    add(3, i, 1, 1972, Math.round(400000 * g));
    add(4, i, 1, 1990, 600000);
    if (i % 2) add(0, i, 0, 1985, 350000);
  });
  const quarters = [], index = [];
  for (let y = 2019; y <= 2026; y++) for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) { if (`${y}-${q}` > '2026-Q2') break; quarters.push(`${y}-${q}`); index.push(150 + quarters.length); }
  return {
    hdb: { months: ms, towns: ['ALPHA', 'BETA'], streets: ['ST A'], flat_types: ['3 ROOM', '4 ROOM'], models: ['Model A'], blocks, tx },
    market: {
      rpi: { base: '2009-Q1', quarters, index },
      landuse: { year: 2025, radius_m: 800, blocks: 5, cats: ['COMMERCIAL', 'WHITE'], n: [[3, 0, 0, 0, 0], [1, 0, 0, 0, 0]], ha: [[2, 0, 0, 0, 0], [5, 0, 0, 0, 0]] },
      town_mix: { ALPHA: { 1: 0, 2: 0, 3: 300, 4: 600, 5: 100, E: 0, M: 0 } },
      catalysts: [{ id: 'near', name: 'Near hub', lat: 1.355, lon: 103.85, km: 1, year: 2030 }, { id: 'old', name: 'Opened long ago', lat: 1.35, lon: 103.85, km: 1, year: 2010 }],
    },
    future: { stations: [{ n: 'New Stn', lat: 1.3505, lon: 103.85, future: true, year: 2030 }, { n: 'Old Stn', lat: 1.35, lon: 103.851, future: false }] },
    bto: { projects: [{ n: 'BTO A', lat: 1.353, lon: 103.85, top: 'Dec 2028', units: 800 }, { n: 'BTO done', lat: 1.353, lon: 103.85, top: 'Jun 2020', units: 900 }, { n: 'BTO far', lat: 1.45, lon: 103.70, top: '2029', units: 700 }] },
    rents: { blocks: { 0: { '4 ROOM': [6, 2900, 3000, 3100, '2026-09'] } }, towns: { ALPHA: { '4 ROOM': { q: [2700, 2800], n: 50, med: 2800 } } } },
  };
}
const FLAT = { bid: 0, flatType: '4 ROOM', asOf: '2026-09' };

test('facts: each driver measured from the synthetic data', () => {
  const f = futureValueFacts(fixture(), FLAT, P, policy);
  assert.equal(f.town, 'ALPHA');
  assert.equal(f.lease.start, 1985);
  assert.ok(close(f.lease.now, leaseLeft(1985, '2026-09', TERM)));
  assert.ok(f.lease.drag.pct < 0, 'older-lease band sells for less');
  // the whole curve (block card "Lease and value"): ascending bands, the drag's two bands are on it
  const cv = f.lease.curve, band = (lo) => cv.find((c) => c.from === lo);
  assert.ok(cv.length >= 2 && cv.every((c, i) => !i || c.from > cv[i - 1].from));
  assert.ok(close(f.lease.drag.pct, (band(f.lease.drag.to[0]).psm / band(f.lease.drag.from[0]).psm - 1) * 100));
  assert.equal(f.lease.windowMonths, P.lease.dragWindowMonths);
  assert.equal(f.momentum.end, '2026-06');                          // aligned to the last RPI quarter
  assert.ok(f.momentum.series.every((s) => s.excess != null));
  assert.ok(f.value.blockPsm < f.value.peerPsm);                     // subject cheaper than the 1986 peer
  assert.equal(f.value.nPeer, 2 * P.longWindowMonths);               // peer block only (1972 lease is out of band)
  assert.equal(f.catalysts.mrt.name, 'New Stn');
  assert.deepEqual(f.catalysts.projects.map((p) => p.id), ['near']);  // opened long ago -> not a catalyst
  assert.deepEqual(f.catalysts.landuse, { COMMERCIAL: { n: 3, ha: 2 }, WHITE: { n: 1, ha: 5 } });
  assert.equal(f.supply.btoUnits, 800);                              // completed + far projects excluded
  assert.equal(f.supply.mopUnits, 500);                              // 2022 + 5 = 2027 within 2 years
  assert.equal(f.supply.stock, 950);
  assert.equal(f.yield.rent, 3000);
  assert.equal(f.yield.rentTier, 'block12');
  assert.equal(f.yield.priceSource, 'block');
  assert.equal(f.liquidity.sales, P.longWindowMonths * 3 / 2);       // 4-room every month + 3-room every other month
  assert.ok(close(f.liquidity.turnoverPct, (f.liquidity.perYear / 100) * 100));
  assert.equal(f.scarcity.sharePct, 60);
});

test('facts: asking price + area switch value and yield to the asking basis', () => {
  const f = futureValueFacts(fixture(), { ...FLAT, price: 450000, area: 100, leaseYear: 1985 }, P, policy);
  assert.equal(f.value.askPsm, 4500);
  assert.equal(f.yield.priceSource, 'asking');
  assert.ok(close(f.yield.pct, (3000 * 12 / 450000) * 100));
  assert.ok(f.scarcity.sizePct > 0);
});

test('scorecard: 8 drivers in order, no overall score, scores 1-5 or null, deterministic', () => {
  const ctx = fixture();
  const a = futureValue(ctx, FLAT, P, policy), b = futureValue(ctx, FLAT, P, policy);
  assert.deepEqual(a, b);
  assert.deepEqual(a.drivers.map((d) => d.id), DRIVERS);
  assert.equal('overall' in a, false);
  for (const d of a.drivers) {
    assert.ok(d.score === null || (Number.isInteger(d.score) && d.score >= 1 && d.score <= 5), `${d.id}: ${d.score}`);
    assert.ok(RATIONALES[d.rationale.id], `template for ${d.rationale.id}`);
    assert.ok(!rationaleText(d.rationale).includes('undefined'), d.id);
    assert.ok(Array.isArray(d.parts));
  }
  assert.ok(a.drivers.every((d) => d.score != null), 'all measurable in the full fixture');
});

test('scorecard: missing market / future / bto / rents -> affected drivers null or partial, never throws', () => {
  const ctx = fixture();
  const r = futureValue({ hdb: ctx.hdb }, FLAT, P, policy);
  const by = Object.fromEntries(r.drivers.map((d) => [d.id, d]));
  assert.equal(by.momentum.reason, 'no-rpi');
  assert.equal(by.catalysts.score, null);
  assert.equal(by.supply.rationale.id, 'fv.supply.no-bto');
  assert.equal(by.yield.reason, 'no-rent');
  assert.equal(by.scarcity.reason, 'no-mix');
  assert.ok(by.lease.score != null && by.value.score != null && by.liquidity.score != null);
});

test('facts: land use built for another data.js (block count differs) is ignored', () => {
  const ctx = fixture();
  ctx.market.landuse.blocks = 4;
  const f = futureValueFacts(ctx, FLAT, P, policy);
  assert.equal(f.catalysts.landuse, null);
  assert.equal(scoreCatalysts(f.catalysts, P.catalysts).rationale.id, 'fv.catalysts.no-landuse');
});

test('scorecard: unknown block -> every driver null', () => {
  const r = futureValue(fixture(), { ...FLAT, bid: 99 }, P, policy);
  assert.deepEqual(r.drivers.map((d) => d.score), DRIVERS.map(() => null));
  assert.deepEqual(scorecard(null, P).drivers.map((d) => d.reason), DRIVERS.map(() => 'no-data'));
});
